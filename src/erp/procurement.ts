import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import { hash, now } from '../platform/crypto';
import { canonical } from '../finance/service';
import { sumMinor } from '../finance/money';
import { requireServices, entitlement } from '../marketplace/engine';
import { record } from '../platform/payments';
import { product, warehouse, planIncoming, postMovement } from '../inventory/service';
import {
  currentMember,
  read,
  insert,
  update,
  decode,
  operation,
  history,
  type ERPKind,
  type ERPObject,
} from './store';
import {
  purchaseSave,
  purchaseAction,
  purchaseReceipt,
  purchasePayment,
  purchaseAmend,
  lineAmount,
} from './procurement-contracts';
export const purchaseKinds = {
  supplier: 'supplier_profile',
  request: 'purchase_request',
  rfq: 'purchase_rfq',
  order: 'purchase_order',
  receipt: 'purchase_receipt',
  bill: 'supplier_bill',
  payment: 'supplier_payment',
  credit: 'supplier_credit',
  price: 'supplier_price',
  agreement: 'purchase_agreement',
  template: 'purchase_template',
} as const;
type PurchaseType = keyof typeof purchaseKinds;
const financeTypes = new Set(['bill', 'payment', 'credit']);
export async function procurementAccess(a: Access, write = false, financial = false) {
  const role = await currentMember(a, write);
  await requireServices(a, ['procurement'], !write);
  if (financial && !permitted(role, 'finance')) fail(403, 'Separate financial authority required');
  return role;
}
export async function purchaseRead(a: Access, id: string, type: PurchaseType) {
  await procurementAccess(a, false, financeTypes.has(type));
  return read(a, id, purchaseKinds[type]);
}
async function objects(a: Access, type: PurchaseType, parent?: string) {
  const rows = await dbAll(
    'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=?' +
      (parent ? ' AND parent_id=?' : '') +
      ' ORDER BY created_at DESC,id DESC',
    [a.org, a.environment, purchaseKinds[type], ...(parent ? [parent] : [])],
  );
  return rows.map((r) => decode(a, r));
}
const searchValue = (record: any) => {
  const d = record.data || {};
  return [
    d.reference,
    d.title,
    d.vendor_reference,
    d.supplier_snapshot?.name,
    d.contact_snapshot?.name,
    d.supplier_id,
    d.product_id,
    d.vendor_sku,
    d.currency,
    record.status,
    d.prepared_by,
    ...(d.lines || []).flatMap((line: any) => [
      line.product_snapshot?.name,
      line.product_snapshot?.sku,
      line.product_id,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
};
function filterPurchaseRows(rows: any[], q: any) {
  let result = rows.filter((row) => {
    const d = row.data || {};
    if (q.status && q.status !== 'all' && row.status !== q.status) return false;
    if (q.search && !searchValue(row).includes(q.search.toLocaleLowerCase())) return false;
    if (q.buyer && d.prepared_by !== q.buyer) return false;
    if (q.currency && d.currency !== q.currency) return false;
    if (q.supplier && d.supplier_id !== q.supplier) return false;
    const date = d.deadline_on || d.delivery_on || d.needed_on || d.issued_on || d.valid_from || row.created_at?.slice(0, 10) || '';
    if (q.date_from && date < q.date_from)
      return false;
    if (q.date_to && date > q.date_to)
      return false;
    if (q.warehouse && !(d.lines || []).some((line: any) => line.warehouse_id === q.warehouse))
      return false;
    return true;
  });
  const value = (row: any) => {
    const d = row.data || {};
    return q.sort === 'amount'
      ? Number(d.total_minor || d.unit_price_minor || d.budget_minor || 0)
      : String(d.delivery_on || d.needed_on || d.issued_on || row.created_at || '');
  };
  result.sort((a, b) => {
    const comparison = value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0;
    return (q.direction === 'asc' ? 1 : -1) * comparison;
  });
  return result;
}
const fingerprint = (d: unknown) => hash(canonical(JSON.parse(JSON.stringify(d))));
function refHash(value: string) {
  const key = process.env.ID_HASH_SALT;
  if (!key && process.env.NODE_ENV === 'production')
    fail(503, 'Private purchase reference key unavailable');
  return createHmac('sha256', key || 'local-only-purchase-reference')
    .update(JSON.stringify(['purchase-reference-v1', value.trim().normalize('NFKC').toLowerCase()]))
    .digest('hex');
}
async function existingReference(
  a: Access,
  type: PurchaseType,
  scope: string,
  reference: string,
  input: unknown,
) {
  const row = await dbGet(
    'SELECT resource_id,fingerprint FROM ac_purchase_references WHERE org_id=? AND environment=? AND kind=? AND scope_id=? AND reference_hash=?',
    [a.org, a.environment, type, scope, refHash(reference)],
  );
  if (!row) return null;
  if (row.fingerprint !== fingerprint(input))
    fail(409, 'This source reference already has different purchase facts');
  return read(a, row.resource_id, purchaseKinds[type]);
}
async function reserveReference(
  a: Access,
  type: PurchaseType,
  scope: string,
  reference: string,
  input: unknown,
  id: string,
) {
  await dbRun(
    'INSERT INTO ac_purchase_references(org_id,environment,kind,scope_id,reference_hash,resource_id,fingerprint) VALUES (?,?,?,?,?,?,?)',
    [a.org, a.environment, type, scope, refHash(reference), id, fingerprint(input)],
  );
}
async function checkedLines(a: Access, lines: any[], currency: string) {
  await requireServices(a, ['products'], true);
  const result = [];
  for (const line of lines) {
    const p = await product(a, line.product_id);
    if (p.status !== 'active' || p.currency !== currency)
      fail(409, 'Choose active products in the purchase currency');
    if (['unit', 'box'].includes(p.unit) && line.quantity_milli % 1000)
      fail(400, 'This unit requires whole quantities');
    if (p.track_inventory) {
      if (!line.warehouse_id) fail(400, 'Tracked purchases require a receiving warehouse');
      const w = await warehouse(a, line.warehouse_id);
      if (w.status !== 'active') fail(409, 'Warehouse is archived');
    } else if (line.warehouse_id) fail(400, 'Untracked services do not receive physical stock');
    const amount = lineAmount(line);
    if (amount > 100000000000) fail(400, 'Purchase amount exceeds supported precision');
    result.push({
      ...line,
      amount_minor: amount,
      product_snapshot: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category || '',
        unit: p.unit,
        track_inventory: p.track_inventory,
      },
    });
  }
  return result;
}
function compareLines(lines: any[], source: any[], allowPriceVariance = false) {
  for (const l of lines) {
    const s = source.find((v) => v.id === l.id);
    if (
      !s ||
      s.product_id !== l.product_id ||
      s.warehouse_id !== l.warehouse_id ||
      (l.product_snapshot &&
        s.product_snapshot &&
        l.product_snapshot.unit !== s.product_snapshot.unit) ||
      l.quantity_milli > s.quantity_milli ||
      (!allowPriceVariance && l.unit_price_minor !== s.unit_price_minor)
    )
      fail(409, 'Purchase lines must match their approved source');
  }
}
async function received(a: Access, order: string) {
  const receipts = await objects(a, 'receipt', order),
    counts = new Map<string, number>();
  for (const r of receipts)
    for (const l of r.data.lines)
      counts.set(l.line_id, (counts.get(l.line_id) || 0) + l.accepted_milli);
  return counts;
}
async function validateBill(a: Access, bill: any, exclude?: string) {
  const order = await read(a, bill.order_id, 'purchase_order');
  if (!['issued', 'confirmed', 'cancelled'].includes(order.status))
    fail(409, 'Supplier bills require an issued purchase order');
  compareLines(bill.lines, order.data.lines, true);
  if (bill.currency !== order.data.currency) fail(409, 'Purchase currency changed');
  const variance =
    bill.lines.some(
      (l: any) =>
        l.unit_price_minor !== order.data.lines.find((s: any) => s.id === l.id)?.unit_price_minor,
    ) ||
    bill.tax_minor !==
      (order.data.subtotal_minor
        ? Number(
            (BigInt(order.data.tax_minor) * BigInt(bill.subtotal_minor) +
              BigInt(order.data.subtotal_minor) / 2n) /
              BigInt(order.data.subtotal_minor),
          )
        : 0);
  if (variance && bill.variance_reason.length < 8)
    fail(409, 'Price or tax variance requires an explicit review reason');
  const counts = await received(a, order.id),
    bills = (await objects(a, 'bill', order.id)).filter(
      (b) => b.id !== exclude && b.status === 'approved',
    );
  for (const l of bill.lines) {
    const source = order.data.lines.find((s: any) => s.id === l.id),
      used = sumMinor(
        bills.flatMap((b) =>
          b.data.lines.filter((v: any) => v.id === l.id).map((v: any) => v.quantity_milli),
        ),
      ),
      cap = source.product_snapshot.track_inventory ? counts.get(l.id) || 0 : source.quantity_milli;
    if (used + l.quantity_milli > cap)
      fail(
        409,
        source.product_snapshot.track_inventory
          ? 'Three-way match requires unbilled accepted goods'
          : 'Two-way service bill exceeds the issued purchase order',
      );
  }
  return order;
}
export async function purchaseList(a: Access, input: unknown) {
  const q = z
      .object({
        type: z
          .enum([
            'supplier', 'request', 'rfq', 'order', 'receipt', 'bill', 'payment', 'credit',
            'price', 'agreement', 'template',
          ])
          .default('request'),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        parent_id: z.string().uuid().optional(),
        search: z.string().trim().max(200).default(''),
        status: z.string().trim().max(40).default('all'),
        buyer: z.string().uuid().optional(),
        supplier: z.string().uuid().optional(),
        warehouse: z.string().uuid().optional(),
        currency: z.string().length(3).optional(),
        date_from: z.string().date().optional(),
        date_to: z.string().date().optional(),
        sort: z.enum(['date', 'amount']).default('date'),
        direction: z.enum(['asc', 'desc']).default('desc'),
        group_by: z.enum(['supplier', 'buyer', 'status']).optional(),
      })
      .strict()
      .parse(input),
    role = await procurementAccess(a, false, financeTypes.has(q.type)),
    all = await objects(a, q.type, q.parent_id),
    filtered = filterPurchaseRows(all, q),
    active = (await entitlement(a, 'procurement'))?.status === 'active';
  const status_counts: Record<string, number> = {};
  for (const row of all) status_counts[row.status] = (status_counts[row.status] || 0) + 1;
  const groups: Record<string, number> = {};
  if (q.group_by)
    for (const row of filtered) {
      const d = row.data || {};
      const key = q.group_by === 'supplier'
        ? d.supplier_snapshot?.name || d.contact_snapshot?.name || d.supplier_id || 'Unassigned'
        : q.group_by === 'buyer' ? d.prepared_by || 'Unassigned' : row.status;
      groups[key] = (groups[key] || 0) + 1;
    }
  return {
    data: filtered.slice(q.offset, q.offset + q.limit),
    total: filtered.length,
    offset: q.offset,
    limit: q.limit,
    has_more: q.offset + q.limit < filtered.length,
    status_counts,
    groups,
    permissions: {
      write: active && permitted(role, 'operations'),
      finance: active && permitted(role, 'finance'),
      review: active && ['owner', 'admin'].includes(role),
    },
    notice:
      'Recorded supplier offers and payments are manual business records. Receipts update accepted physical quantities only. No orders, emails, bank payments or statutory filings are sent automatically.',
  };
}
export async function procurementApprovals(a: Access, input: unknown) {
  const q = z
    .object({
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      search: z.string().trim().max(200).default(''),
      type: z.enum(['all', 'request', 'order', 'bill', 'credit', 'agreement']).default('all'),
    })
    .strict()
    .parse(input);
  const role = await procurementAccess(a, false);
  if (!['owner', 'admin'].includes(role)) fail(403, 'Separate reviewer authority required');
  const selected = q.type === 'all'
    ? permitted(role, 'finance')
      ? ['request', 'order', 'bill', 'credit', 'agreement'] as const
      : ['request', 'order', 'agreement'] as const
    : [q.type] as const;
  if (selected.some((type) => financeTypes.has(type)) && !permitted(role, 'finance'))
    fail(403, 'Separate financial authority required');
  const pending: { type: string; record: ERPObject }[] = [];
  for (const type of selected) {
    const expectedStatus = type === 'request' ? 'submitted' : 'draft';
    for (const record of await objects(a, type)) {
      if (record.status !== expectedStatus || a.actor === (record.data.prepared_by || record.owner_id))
        continue;
      if (q.search && !searchValue(record).includes(q.search.toLocaleLowerCase())) continue;
      pending.push({ type, record });
    }
  }
  pending.sort((left, right) =>
    String(right.record.created_at || '').localeCompare(String(left.record.created_at || '')) ||
    left.record.id.localeCompare(right.record.id),
  );
  return {
    data: pending.slice(q.offset, q.offset + q.limit),
    total: pending.length,
    offset: q.offset,
    limit: q.limit,
    has_more: q.offset + q.limit < pending.length,
    permissions: { review: true },
  };
}
export async function purchaseDetails(a: Access, id: string, type: PurchaseType) {
  const o = await purchaseRead(a, id, type);
  let matching: any = null;
  if (type === 'bill') {
    try {
      await validateBill(a, o.data, o.id);
      matching = {
        eligible: true,
        reason:
          'Current issued-order and accepted-quantity checks pass; separate approval is still required.',
      };
    } catch (e) {
      if ([400, 404, 409].includes((e as any).status))
        matching = { eligible: false, reason: (e as Error).message };
      else throw e;
    }
  }
  return {
    record: o,
    matching,
    award:
      type === 'rfq'
        ? await dbGet(
            'SELECT request_id,rfq_id,reason,actor,awarded_at FROM ac_purchase_awards WHERE org_id=? AND environment=? AND rfq_id=?',
            [a.org, a.environment, o.id],
          )
        : type === 'request'
          ? await dbGet(
              'SELECT request_id,rfq_id,reason,actor,awarded_at FROM ac_purchase_awards WHERE org_id=? AND environment=? AND request_id=?',
              [a.org, a.environment, o.id],
            )
          : null,
    can_review:
      ['owner', 'admin'].includes(await currentMember(a)) &&
      a.actor !== (o.data.prepared_by || o.owner_id) &&
      (await entitlement(a, 'procurement'))?.status === 'active',
    history: await history(a, o, 100),
    offers:
      type === 'request'
        ? await objects(a, 'rfq', id)
        : type === 'agreement'
          ? (await objects(a, 'rfq')).filter((r) => r.data.agreement_id === id)
          : [],
    linked_orders:
      type === 'agreement'
        ? (await objects(a, 'order')).filter((r) => r.data.agreement_id === id)
        : [],
    receipts: type === 'order' ? await objects(a, 'receipt', id) : [],
    received: type === 'order' ? Object.fromEntries(await received(a, id)) : null,
  };
}
export async function savePurchase(a: Access, id: string | null, input: unknown, key: string) {
  const d = purchaseSave.parse(input),
    type = d.record.type;
  return operation(
    a,
    'procurement.save.' + type + (id ? ':' + id : ''),
    key,
    d,
    () => procurementAccess(a, true, financeTypes.has(type)),
    async () => {
        const old = id ? await read(a, id, purchaseKinds[type]) : null;
      const editableStatuses =
        type === 'supplier' || type === 'price' || type === 'template'
          ? ['draft', 'rejected', 'active', 'archived']
          : ['draft', 'rejected'];
      if (
        old
          ? old.version !== d.expected_version ||
            !editableStatuses.includes(old.status) ||
            type === 'order'
          : d.expected_version !== 0
      )
        fail(409, 'Purchase changed or is locked; use a retained correction');
      let data: any = { ...d.record };
      let parent: string | null = null;
      if (type === 'supplier') {
        if (old && old.data.contact_id !== d.record.contact_id)
          fail(
            409,
            'Retain the original supplier contact identity; create a separate supplier profile for another contact',
          );
        const contact = await record(a, d.record.contact_id, 'customers');
        data.contact_snapshot = {
          id: d.record.contact_id,
          name: contact.name,
          email: contact.email || '',
        };
        const duplicate = (await objects(a, 'supplier')).find(
          (s) => s.data.contact_id === data.contact_id && s.id !== id,
        );
        if (duplicate) fail(409, 'This shared contact already has a supplier profile');
      }
      if (type === 'price') {
        const supplier = await read(a, d.record.supplier_id, 'supplier_profile');
        const p = await product(a, d.record.product_id);
        if (supplier.status !== 'active' || p.status !== 'active' || p.currency !== d.record.currency)
          fail(409, 'Choose an active shared vendor and product with matching currency');
        if (d.record.valid_from && d.record.valid_to && d.record.valid_to < d.record.valid_from)
          fail(400, 'Vendor price end date precedes its start date');
        data.supplier_snapshot = supplier.data.contact_snapshot;
        data.product_snapshot = { id: p.id, name: p.name, sku: p.sku, unit: p.unit };
        data.active = true;
      }
      if (type === 'template' || type === 'agreement') {
        data.lines = await checkedLines(a, d.record.lines, d.record.currency);
        if (type === 'template' && d.record.supplier_id) {
          const supplier = await read(a, d.record.supplier_id, 'supplier_profile');
          if (supplier.status !== 'active') fail(409, 'Choose an active shared vendor');
          data.supplier_snapshot = supplier.data.contact_snapshot;
        }
        if (type === 'agreement') {
          const supplier = await read(a, d.record.supplier_id, 'supplier_profile');
          if (supplier.status !== 'active') fail(409, 'Choose an active shared vendor');
          if (d.record.valid_to < d.record.valid_from)
            fail(400, 'Agreement end date precedes its start date');
          data.supplier_snapshot = supplier.data.contact_snapshot;
          data.prepared_by = a.actor;
        }
      }
      if (type === 'request') {
        data.lines = await checkedLines(a, d.record.lines, d.record.currency);
        if (d.record.suggestion_id) {
          const s = await dbGet(
            "SELECT id FROM ac2_objects WHERE org_id=? AND environment=? AND id=? AND kind='replenishment_suggestions'",
            [a.org, a.environment, d.record.suggestion_id],
          );
          if (!s) fail(404, 'Replenishment suggestion not found');
        }
      }
      if (type === 'rfq') {
        const request = await read(a, d.record.request_id, 'purchase_request'),
          supplier = await read(a, d.record.supplier_id, 'supplier_profile');
        if (
          request.status !== 'approved' ||
          supplier.status !== 'active' ||
          request.data.currency !== d.record.currency
        )
          fail(409, 'Approved request and active supplier in the same currency required');
        data.lines = await checkedLines(a, d.record.lines, d.record.currency);
        compareLines(data.lines, request.data.lines, true);
        if (d.record.template_id) {
          const template = await read(a, d.record.template_id, 'purchase_template');
          if (
            template.status !== 'active' ||
            template.data.currency !== d.record.currency ||
            (template.data.supplier_id && template.data.supplier_id !== supplier.id)
          )
            fail(409, 'Choose an active purchase template for this supplier and currency');
          if (data.lines.some((line: any) => !template.data.lines.some((v: any) => v.product_id === line.product_id)))
            fail(409, 'Offer products must match the selected purchase template');
          data.template_snapshot = { id: template.id, title: template.data.title };
        }
        if (d.record.agreement_id) {
          const agreement = await read(a, d.record.agreement_id, 'purchase_agreement');
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
          if (
            agreement.status !== 'confirmed' ||
            agreement.data.supplier_id !== supplier.id ||
            agreement.data.currency !== d.record.currency ||
            today < agreement.data.valid_from || today > agreement.data.valid_to
          ) fail(409, 'Choose a confirmed, current agreement for this supplier and currency');
          for (const line of data.lines) {
            const agreed = agreement.data.lines.find((v: any) => v.product_id === line.product_id);
            if (
              !agreed ||
              line.warehouse_id !== agreed.warehouse_id ||
              line.quantity_milli > agreed.quantity_milli ||
              line.unit_price_minor !== agreed.unit_price_minor
            )
              fail(409, 'Offer must use the agreement product, price, destination and quantity limit');
          }
          data.agreement_snapshot = { id: agreement.id, title: agreement.data.title };
        }
        data.request_version = request.version;
        data.supplier_snapshot = supplier.data.contact_snapshot;
        parent = request.id;
      }
      if (type === 'order') {
        const offer = await read(a, d.record.rfq_id, 'purchase_rfq'),
          request = await read(a, offer.data.request_id, 'purchase_request'),
          supplier = await read(a, offer.data.supplier_id, 'supplier_profile');
        if (
          offer.status !== 'accepted' ||
          request.status !== 'approved' ||
          supplier.status !== 'active'
        )
          fail(409, 'Choose an accepted offer from an approved request');
        if (
          (await objects(a, 'order')).some(
            (o) => o.data.rfq_id === offer.id && o.status !== 'cancelled',
          )
        )
          fail(409, 'An order already uses this accepted offer');
        data = {
          ...offer.data,
          type: 'order',
          rfq_id: offer.id,
          rfq_version: offer.version,
          reference: d.record.reference,
          request_version: request.version,
        };
        parent = request.id;
      }
      if (type === 'bill') {
        const order = await read(a, d.record.order_id, 'purchase_order');
        compareLines(d.record.lines, order.data.lines, true);
        data.lines = d.record.lines.map((l) => {
          const snapshot = order.data.lines.find((s: any) => s.id === l.id).product_snapshot;
          if (['unit', 'box'].includes(snapshot.unit) && l.quantity_milli % 1000)
            fail(400, 'This supplier-bill unit requires whole quantities');
          return { ...l, amount_minor: lineAmount(l), product_snapshot: snapshot };
        });
        data.currency = order.data.currency;
        data.supplier_id = order.data.supplier_id;
        data.supplier_snapshot = order.data.supplier_snapshot;
        data.subtotal_minor = sumMinor(data.lines.map((l: any) => l.amount_minor));
        if (d.record.due_on < d.record.issued_on) fail(400, 'Bill due date precedes issue date');
        parent = order.id;
        compareLines(data.lines, order.data.lines, true);
      }
      if (type === 'credit') {
        const bill = await read(a, d.record.bill_id, 'supplier_bill');
        if (bill.status !== 'approved') fail(409, 'Credit requires an approved supplier bill');
        if (d.record.issued_on < bill.data.issued_on)
          fail(400, 'Credit predates the supplier bill');
        data.currency = bill.data.currency;
        data.supplier_id = bill.data.supplier_id;
        parent = bill.id;
      }
      if (data.lines) {
        data.subtotal_minor = sumMinor(data.lines.map((l: any) => l.amount_minor));
        data.total_minor = sumMinor([data.subtotal_minor, data.tax_minor || 0]);
        if (type === 'bill' && data.total_minor <= 0)
          fail(400, 'Supplier bill must have a positive total');
        if (data.total_minor > 100000000000)
          fail(400, 'Purchase total exceeds supported precision');
      }
      if (type === 'bill' || type === 'credit') {
        const scope = data.supplier_id,
          reference = data.reference,
          duplicate = await dbGet(
            'SELECT resource_id FROM ac_purchase_references WHERE org_id=? AND environment=? AND kind=? AND scope_id=? AND reference_hash=?',
            [a.org, a.environment, type, scope, refHash(reference)],
          );
        if (duplicate && duplicate.resource_id !== id)
          fail(409, 'Supplier document reference already exists');
        if (
          old &&
          (old.data.reference !== reference ||
            old.data.supplier_id !== scope ||
            old.parent_id !== parent)
        )
          fail(409, 'Retain the supplier, parent and reference on a revised document');
      }
      data.prepared_by = a.actor;
      const state =
        ['supplier', 'price', 'template'].includes(type)
          ? data.active === false
            ? 'archived'
            : 'active'
          : 'draft';
      const result = old
        ? await update(a, old, data, { status: state, parent_id: parent }, 'revised')
        : await insert(a, purchaseKinds[type], data, { status: state, parent });
      if (!old && (type === 'bill' || type === 'credit'))
        await reserveReference(a, type, data.supplier_id, data.reference, d.record, result.id);
      return result;
    },
  );
}
export async function purchaseDecision(
  a: Access,
  id: string,
  type: PurchaseType,
  input: unknown,
  key: string,
) {
  const d = purchaseAction.parse(input);
  if (!['request', 'rfq', 'order', 'bill', 'credit', 'agreement'].includes(type))
    fail(400, 'This record has no decision action');
  return operation(
    a,
    'procurement.decision:' + id,
    key,
    d,
    async () => {
      const role = await procurementAccess(a, true, financeTypes.has(type));
      if (
        type !== 'rfq' &&
        ['approve', 'reject'].includes(d.action) &&
        !['owner', 'admin'].includes(role)
      )
        fail(403, 'Current separate reviewer authority required');
    },
    async () => {
      const o = await read(a, id, purchaseKinds[type]);
      if (o.version !== d.expected_version) fail(409, 'Purchase changed; reload the exact version');
      const role = await currentMember(a);
      let status: string;
      if (type === 'request' && d.action === 'submit') {
        if (!['draft', 'rejected'].includes(o.status))
          fail(409, 'Only a draft or rejected request can be submitted');
        status = 'submitted';
      } else if (type === 'agreement' && d.action === 'confirm') {
        if (!['owner', 'admin'].includes(role) || a.actor === (o.data.prepared_by || o.owner_id))
          fail(403, 'A different current owner or administrator must confirm this agreement');
        if (o.status !== 'draft') fail(409, 'Only a draft agreement can be confirmed');
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
        if (today > o.data.valid_to) fail(409, 'Expired agreement cannot be confirmed');
        status = 'confirmed';
      } else if (type === 'agreement' && d.action === 'close') {
        if (!['owner', 'admin'].includes(role)) fail(403, 'Administrator authority required to close agreements');
        if (o.status !== 'confirmed') fail(409, 'Only a confirmed agreement can be closed');
        const agreementsOffers = (await objects(a, 'rfq')).filter((offer) => offer.data.agreement_id === id),
          agreementOrders = (await objects(a, 'order')).filter((order) => order.data.agreement_id === id);
        const unresolvedOffers = agreementsOffers.some((offer) => offer.status === 'draft' ||
          (offer.status === 'accepted' && !agreementOrders.some((order) => order.data.rfq_id === offer.id && ['issued', 'confirmed', 'cancelled'].includes(order.status))));
        const unissuedOrders = agreementOrders.some((order) => ['draft', 'approved'].includes(order.status));
        if (unresolvedOffers || unissuedOrders)
          fail(409, 'Resolve draft or awarded supplier quotations and unissued orders before closing this agreement');
        status = 'closed';
      } else if (type === 'rfq' && d.action === 'reject') {
        if (o.status !== 'draft') fail(409, 'Only a draft offer can be rejected');
        status = 'rejected';
      } else if (['approve', 'reject'].includes(d.action)) {
        if (!['owner', 'admin'].includes(role) || a.actor === (o.data.prepared_by || o.owner_id))
          fail(403, 'A different current owner or administrator must review this exact version');
        if (!(type === 'request' ? o.status === 'submitted' : o.status === 'draft') || type === 'rfq')
          fail(409, 'Only a submitted draft can be reviewed');
        status = d.action === 'reject' ? 'rejected' : 'approved';
        if (status === 'approved' && type === 'bill') await validateBill(a, o.data, id);
        if (status === 'approved' && type === 'credit') {
          const bill = await read(a, o.data.bill_id, 'supplier_bill'),
            credits = (await objects(a, 'credit', bill.id)).filter((c) => c.status === 'approved');
          if (
            sumMinor([...credits.map((c) => c.data.amount_minor), o.data.amount_minor]) >
            bill.data.total_minor
          )
            fail(409, 'Supplier credits exceed the original approved bill');
        }
      } else if (d.action === 'accept') {
        if (type !== 'rfq' || o.status !== 'draft') fail(409, 'Only a draft offer can be accepted');
        const request = await read(a, o.data.request_id, 'purchase_request');
        if (request.status !== 'approved' || request.version !== o.data.request_version)
          fail(409, 'Request changed after the offer');
        const awarded = await dbGet(
          'SELECT rfq_id FROM ac_purchase_awards WHERE org_id=? AND environment=? AND request_id=?',
          [a.org, a.environment, request.id],
        );
        if (awarded) fail(409, 'This request already has an awarded supplier offer');
        await dbRun(
          'INSERT INTO ac_purchase_awards(org_id,environment,request_id,rfq_id,reason,actor,awarded_at) VALUES (?,?,?,?,?,?,?)',
          [a.org, a.environment, request.id, o.id, d.reason, a.actor, now()],
        );
        status = 'accepted';
      } else if (d.action === 'issue') {
        if (type !== 'order' || o.status !== 'approved')
          fail(409, 'Review this order with a separate administrator before issuing');
        const request = await read(a, o.data.request_id, 'purchase_request');
        if (request.status !== 'approved' || request.version !== o.data.request_version)
          fail(409, 'The approved request changed');
        const offer = await read(a, o.data.rfq_id, 'purchase_rfq');
        if (offer.status !== 'accepted' || offer.version !== o.data.rfq_version)
          fail(409, 'Supplier offer changed after order preparation');
        const committed = (await objects(a, 'order', request.id)).filter(
          (v) => v.id !== id && ['issued', 'confirmed', 'cancelled'].includes(v.status),
        );
        if (
          sumMinor([o.data.total_minor, ...committed.map((v) => v.data.total_minor)]) >
          request.data.budget_minor
        )
          fail(409, 'Issued purchases exceed the approved request budget');
        for (const line of o.data.lines) {
          const requested = request.data.lines.find((l: any) => l.id === line.id);
          const used = sumMinor(
            committed.flatMap((v) =>
              v.data.lines.filter((l: any) => l.id === line.id).map((l: any) => l.quantity_milli),
            ),
          );
          if (!requested || used + line.quantity_milli > requested.quantity_milli)
            fail(409, 'Issued quantities exceed the approved request');
        }
        const supplier = await read(a, o.data.supplier_id, 'supplier_profile');
        if (supplier.status !== 'active') fail(409, 'Supplier is archived');
        if (o.data.agreement_id) {
          const agreement = await read(a, o.data.agreement_id, 'purchase_agreement');
          if (agreement.status !== 'confirmed') fail(409, 'Purchase agreement is no longer open');
          const linked = (await objects(a, 'order')).filter(
            (v) => v.id !== id && v.data.agreement_id === agreement.id && ['issued', 'confirmed'].includes(v.status),
          );
          for (const line of o.data.lines) {
            const cap = agreement.data.lines.find((l: any) => l.product_id === line.product_id);
            const used = linked
              .flatMap((v) => v.data.lines)
              .filter((l: any) => l.product_id === line.product_id)
              .reduce((n: number, l: any) => n + Number(l.quantity_milli || 0), 0);
            if (!cap || used + line.quantity_milli > cap.quantity_milli)
              fail(409, 'Agreement committed quantities would be exceeded');
          }
        }
        for (const line of o.data.lines) {
          if (!line.product_snapshot.track_inventory) continue;
          const incoming = await planIncoming(
            a,
            {
              product_id: line.product_id,
              warehouse_id: line.warehouse_id,
              quantity_milli: line.quantity_milli,
              due_on: o.data.delivery_on,
              reason: 'Issued purchase order ' + o.data.reference,
            },
            'purchase.incoming:' + o.id + ':' + line.id + ':' + o.version,
          );
          await dbRun(
            'INSERT INTO ac_purchase_incoming(incoming_id,org_id,environment,order_id,line_id) VALUES (?,?,?,?,?)',
            [incoming.id, a.org, a.environment, o.id, line.id],
          );
        }
        status = 'issued';
      } else if (d.action === 'confirm') {
        if (type !== 'order' || o.status !== 'issued')
          fail(409, 'Only an issued order accepts a recorded supplier confirmation');
        status = 'confirmed';
      } else {
        if (type === 'order' && ['issued', 'confirmed'].includes(o.status)) {
          await dbRun(
            "UPDATE ac_stock_incoming SET status='cancelled',updated_at=? WHERE org_id=? AND environment=? AND status='planned' AND id IN (SELECT incoming_id FROM ac_purchase_incoming WHERE org_id=? AND environment=? AND order_id=?)",
            [now(), a.org, a.environment, a.org, a.environment, id],
          );
        } else if (!['draft', 'approved', 'accepted', 'rejected', 'submitted', 'confirmed'].includes(o.status))
          fail(409, 'This record cannot be cancelled');
        if (['bill', 'credit'].includes(type) && o.status === 'approved')
          fail(409, 'Use an append-only supplier credit to correct approved liabilities');
        status = 'cancelled';
      }
      return update(
        a,
        o,
        {
          ...o.data,
          last_decision: {
            action: d.action,
            reason: d.reason,
            actor: a.actor,
            at: now(),
            reviewed_version: o.version,
          },
        },
        { status },
        d.action,
      );
    },
  );
}
export async function receivePurchase(a: Access, id: string, input: unknown, key: string) {
  const d = purchaseReceipt.parse(input);
  if (
    d.received_on >
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  )
    fail(400, 'Physical receipt cannot be recorded in the future');
  return operation(
    a,
    'procurement.receive:' + id,
    key,
    d,
    () => procurementAccess(a, true),
    async () => {
      const order = await read(a, id, 'purchase_order'),
        identity = { ...d, expected_version: undefined },
        old = await existingReference(a, 'receipt', id, d.reference, identity);
      if (old) return old;
      if (order.version !== d.expected_version || !['issued', 'confirmed'].includes(order.status))
        fail(409, 'Order changed or is not open for receiving');
      const counts = await received(a, id),
        lines = [];
      for (const line of d.lines) {
        const source = order.data.lines.find((s: any) => s.id === line.line_id);
        if (!source?.product_snapshot.track_inventory)
          fail(400, 'Only tracked purchase lines receive physical stock');
        if (
          (counts.get(line.line_id) || 0) + line.accepted_milli + line.rejected_milli >
          source.quantity_milli
        )
          fail(409, 'Inspection exceeds the remaining ordered quantity');
        if (
          ['unit', 'box'].includes(source.product_snapshot.unit) &&
          (line.accepted_milli % 1000 || line.rejected_milli % 1000)
        )
          fail(400, 'This unit requires whole quantities');
        lines.push({
          ...line,
          product_id: source.product_id,
          warehouse_id: source.warehouse_id,
          movement_id: null,
        });
      }
      const receipt = await insert(
        a,
        'purchase_receipt',
        { ...d, lines },
        { parent: id, status: 'posting' },
      );
      for (const line of lines) {
        if (!line.accepted_milli) continue;
        const movement = await postMovement(
          a,
          {
            product_id: line.product_id,
            warehouse_id: line.warehouse_id,
            kind: 'receipt',
            quantity_milli: line.accepted_milli,
            reason: d.inspection,
            source_id: receipt.id,
          },
          'purchase.receipt:' + receipt.id + ':' + line.line_id,
          { receipt_id: receipt.id, line_id: line.line_id },
        );
        line.movement_id = movement.id as any;
        const mapping = await dbGet(
          "SELECT p.incoming_id FROM ac_purchase_incoming p JOIN ac_stock_incoming s ON s.id=p.incoming_id WHERE p.org_id=? AND p.environment=? AND p.order_id=? AND p.line_id=? AND s.status='planned'",
          [a.org, a.environment, id, line.line_id],
        );
        if (!mapping) fail(409, 'Issued purchase stock plan is missing');
        const total = (counts.get(line.line_id) || 0) + line.accepted_milli;
        await dbRun(
          "UPDATE ac_stock_incoming SET received_milli=?,status=CASE WHEN quantity_milli=? THEN 'received' ELSE 'planned' END,updated_at=? WHERE id=? AND org_id=? AND environment=?",
          [total, total, now(), mapping.incoming_id, a.org, a.environment],
        );
      }
      const result = await update(
        a,
        receipt,
        { ...receipt.data, lines },
        { status: 'posted' },
        'posted',
      );
      await update(a, order, { ...order.data, last_receipt_id: result.id }, {}, 'goods_received');
      await reserveReference(a, 'receipt', id, d.reference, identity, result.id);
      return result;
    },
  );
}
export async function supplierBalance(a: Access, id: string) {
  const bill = await purchaseRead(a, id, 'bill'),
    payments = await objects(a, 'payment', id),
    credits = (await objects(a, 'credit', id)).filter((c) => c.status === 'approved'),
    paid = sumMinor(payments.map((p) => p.data.amount_minor)),
    credited = sumMinor(credits.map((c) => c.data.amount_minor));
  return {
    bill,
    payments,
    credits,
    paid_minor: paid,
    credited_minor: credited,
    outstanding_minor: Math.max(0, bill.data.total_minor - credited - paid),
    supplier_credit_due_minor: Math.max(0, paid + credited - bill.data.total_minor),
    assurance: 'Manual business records; no bank or provider confirmation',
  };
}
export async function recordSupplierPayment(a: Access, id: string, input: unknown, key: string) {
  const d = purchasePayment.parse(input);
  return operation(
    a,
    'procurement.payment:' + id,
    key,
    d,
    () => procurementAccess(a, true, true),
    async () => {
      const balance = await supplierBalance(a, id),
        identity = { ...d, expected_version: undefined },
        old = await existingReference(a, 'payment', balance.bill.data.supplier_id, d.reference, {
          ...identity,
          bill_id: id,
        });
      if (old) return old;
      if (
        balance.bill.version !== d.expected_version ||
        balance.bill.status !== 'approved' ||
        d.amount_minor > balance.outstanding_minor
      )
        fail(409, 'Reload the approved bill and remaining payable');
      if (
        d.paid_on >
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Nairobi',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
      )
        fail(400, 'A manual payment observation cannot be dated in the future');
      if (d.paid_on < balance.bill.data.issued_on)
        fail(400, 'Payment observation predates this bill');
      const result = await insert(
        a,
        'supplier_payment',
        {
          ...d,
          type: 'payment',
          bill_id: id,
          supplier_id: balance.bill.data.supplier_id,
          currency: balance.bill.data.currency,
          assurance: 'manual_unverified_payment_observation',
        },
        { parent: id, status: 'recorded' },
      );
      await reserveReference(
        a,
        'payment',
        balance.bill.data.supplier_id,
        d.reference,
        { ...identity, bill_id: id },
        result.id,
      );
      await update(
        a,
        balance.bill,
        { ...balance.bill.data, last_payment_id: result.id },
        {},
        'manual_payment_recorded',
      );
      return result;
    },
  );
}
export async function amendPurchaseOrder(a: Access, id: string, input: unknown, key: string) {
  const d = purchaseAmend.parse(input);
  return operation(
    a,
    'procurement.amend:' + id,
    key,
    d,
    () => procurementAccess(a, true),
    async () => {
      const o = await read(a, id, 'purchase_order');
      if (
        o.version !== d.expected_version ||
        !['draft', 'rejected', 'approved', 'issued', 'confirmed'].includes(o.status)
      )
        fail(409, 'Order changed or cannot be amended');
      if ((await objects(a, 'receipt', id)).length || (await objects(a, 'bill', id)).length)
        fail(
          409,
          'Retain inspected or billed orders. Cancel remaining quantities and create a separately reviewed purchase request instead of rewriting their terms',
        );
      const request = await read(a, o.data.request_id, 'purchase_request'),
        lines = await checkedLines(a, d.lines, o.data.currency);
      compareLines(lines, request.data.lines, true);
      const subtotal = sumMinor(lines.map((l) => l.amount_minor)),
        total = sumMinor([subtotal, d.tax_minor]);
      if (total > request.data.budget_minor)
        fail(409, 'Amendment exceeds the approved spending ceiling');
      await dbRun(
        "UPDATE ac_stock_incoming SET status='cancelled',updated_at=? WHERE org_id=? AND environment=? AND status='planned' AND id IN (SELECT incoming_id FROM ac_purchase_incoming WHERE org_id=? AND environment=? AND order_id=?)",
        [now(), a.org, a.environment, a.org, a.environment, id],
      );
      return update(
        a,
        o,
        {
          ...o.data,
          lines,
          subtotal_minor: subtotal,
          total_minor: total,
          tax_minor: d.tax_minor,
          delivery_on: d.delivery_on,
          prepared_by: a.actor,
          amendment: { reason: d.reason, from_version: o.version, at: now() },
        },
        { status: 'draft' },
        'amended_requires_new_review',
      );
    },
  );
}
export async function procurementReport(a: Access, input: unknown = {}) {
  const q = z
    .object({
      date_from: z.string().date().optional(),
      date_to: z.string().date().optional(),
      supplier: z.string().uuid().optional(),
      buyer: z.string().uuid().optional(),
      currency: z.string().length(3).optional(),
      category: z.string().max(100).optional(),
      uncategorized: z.literal('true').optional(),
    })
    .strict()
    .refine((query) => !(query.category && query.uncategorized), 'Choose one product category filter')
    .parse(input);
  const role = await procurementAccess(a),
    matchesCategory = (line: any) =>
      q.uncategorized === 'true'
        ? !line.product_snapshot?.category
        : !q.category || String(line.product_snapshot?.category || '') === q.category,
    matchesPeriodAndDimensions = (record: any, includeCategory = true) => {
      const date = String(record.created_at || '').slice(0, 10), d = record.data || {};
      return (!q.date_from || date >= q.date_from) && (!q.date_to || date <= q.date_to) &&
        (!q.supplier || d.supplier_id === q.supplier) &&
        (!q.buyer || d.prepared_by === q.buyer) &&
        (!q.currency || d.currency === q.currency) &&
        (!includeCategory || (!q.category && !q.uncategorized) || (d.lines || []).some(matchesCategory));
    },
    allOrders = await objects(a, 'order'),
    orders = allOrders.filter((record) => matchesPeriodAndDimensions(record)),
    requests = (await objects(a, 'request')).filter((record) => matchesPeriodAndDimensions(record)),
    offers = (await objects(a, 'rfq')).filter((record) => matchesPeriodAndDimensions(record)),
    currencies: any = {};
  const by_vendor: Record<string, any> = {},
    by_product: Record<string, any> = {},
    by_month: Record<string, any> = {};
  for (const o of orders) {
    const matchingLines = (o.data.lines || []).filter(matchesCategory),
      matchingValue = q.category
        ? sumMinor(matchingLines.map((line: any) => line.amount_minor || 0))
        : Number(o.data.total_minor || 0);
    const totals = currencies[o.data.currency] || {
      issued_minor: 0,
      orders: 0,
      cancelled_minor: 0,
      cancelled_orders: 0,
      open_receipt_lines: 0,
    };
    if (['issued', 'confirmed'].includes(o.status)) {
      totals.issued_minor = sumMinor([totals.issued_minor, matchingValue]);
      totals.orders++;
      const counts = await received(a, o.id);
      totals.open_receipt_lines += matchingLines.filter(
        (l: any) =>
          l.product_snapshot.track_inventory && (counts.get(l.id) || 0) < l.quantity_milli,
      ).length;
    } else if (o.status === 'cancelled') {
      totals.cancelled_minor = sumMinor([totals.cancelled_minor, matchingValue]);
      totals.cancelled_orders++;
    }
    currencies[o.data.currency] = totals;
    if (['issued', 'confirmed'].includes(o.status)) {
      const vendor = o.data.supplier_snapshot?.name || 'Unknown vendor';
      const vendorKey = vendor + '|' + o.data.currency;
      by_vendor[vendorKey] ||= {
        supplier_id: o.data.supplier_id,
        vendor,
        currency: o.data.currency,
        order_count: 0,
        value_minor: 0,
        open_orders: 0,
      };
      by_vendor[vendorKey].order_count += 1;
      by_vendor[vendorKey].value_minor = sumMinor([by_vendor[vendorKey].value_minor, matchingValue]);
      if (o.status !== 'cancelled') by_vendor[vendorKey].open_orders += 1;
      for (const line of matchingLines) {
        const name = line.product_snapshot?.name || 'Unknown product';
        const key = line.product_id + '|' + o.data.currency;
        by_product[key] ||= {
          product: name,
          sku: line.product_snapshot?.sku || '',
          category: line.product_snapshot?.category || 'Uncategorised',
          unit: line.product_snapshot?.unit || 'unit',
          currency: o.data.currency,
          quantity_milli: 0,
          value_minor: 0,
          orders: 0,
        };
        by_product[key].quantity_milli += Number(line.quantity_milli || 0);
        by_product[key].value_minor = sumMinor([by_product[key].value_minor, line.amount_minor || 0]);
        by_product[key].orders += 1;
      }
      const month = String(o.created_at || '').slice(0, 7) || 'Unknown date';
      const monthKey = month + '|' + o.data.currency;
      by_month[monthKey] ||= { month, currency: o.data.currency, orders: 0, value_minor: 0 };
      by_month[monthKey].orders++;
      by_month[monthKey].value_minor = sumMinor([by_month[monthKey].value_minor, matchingValue]);
    }
  }
  let payables: any[] = [],
    aging: any = {};
  if (permitted(role, 'finance')) {
    const bills = (await objects(a, 'bill')).filter((b) =>
      b.status === 'approved' && matchesPeriodAndDimensions(b, false),
    );
    for (const b of bills) {
      const s = await supplierBalance(a, b.id),
        days = Math.floor((Date.now() - Date.parse(b.data.due_on + 'T00:00:00Z')) / 86400000),
        bucket =
          days <= 0
            ? 'current'
            : days <= 30
              ? '1_30'
              : days <= 60
                ? '31_60'
                : days <= 90
                  ? '61_90'
                  : 'over_90';
      payables.push({
        id: b.id,
        issued_on: b.data.issued_on,
        reference: b.data.reference,
        supplier: b.data.supplier_snapshot?.name,
        currency: b.data.currency,
        due_on: b.data.due_on,
        outstanding_minor: s.outstanding_minor,
        credit_due_minor: s.supplier_credit_due_minor,
        bucket,
      });
      aging[b.data.currency] ??= { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, over_90: 0 };
      aging[b.data.currency][bucket] = sumMinor([
        aging[b.data.currency][bucket],
        s.outstanding_minor,
      ]);
    }
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  const buyerIds = [...new Set(allOrders.map((order) => order.data.prepared_by || order.owner_id).filter(Boolean))];
  const categoryOptions = [...new Set(allOrders.flatMap((order) => (order.data.lines || []).map((line: any) => String(line.product_snapshot?.category || ''))))]
    .sort((left, right) => left.localeCompare(right))
    .map((category) => ({ value: category ? 'category:' + category : 'uncategorized', label: category || 'Uncategorised' }));
  const buyerRows = buyerIds.length
    ? await dbAll(
        `SELECT p.user_id,p.display_name FROM ac_profiles p JOIN ac_memberships m ON m.user_id=p.user_id WHERE m.org_id=? AND p.user_id IN (${buyerIds.map(() => '?').join(',')})`,
        [a.org, ...buyerIds],
      )
    : [];
  const buyerNames = new Map(buyerRows.map((row: any) => [row.user_id, row.display_name]));
  const openOffers = offers.filter((r) => r.status === 'draft');
  const relevantOrderIds = new Set(orders.map((order) => order.id));
  const receipts = (await objects(a, 'receipt')).filter((receipt) =>
    !!receipt.parent_id && relevantOrderIds.has(receipt.parent_id),
  );
  let late_receipts = 0;
  for (const order of orders) {
    if (!['issued', 'confirmed'].includes(order.status) || !order.data.delivery_on || order.data.delivery_on >= today) continue;
    const counts = await received(a, order.id);
    if (order.data.lines.some((line: any) => matchesCategory(line) && line.product_snapshot?.track_inventory && (counts.get(line.id) || 0) < line.quantity_milli)) late_receipts++;
  }
  const reportOfferIds = new Set(offers.map((offer) => offer.id));
  const ordersByOffer = new Set(
    orders
      .filter((o) => ['issued', 'confirmed'].includes(o.status) && reportOfferIds.has(o.data.rfq_id))
      .map((o) => o.data.rfq_id),
  );
  return {
    request_count: requests.length,
    draft_requests: requests.filter((r) => r.status === 'draft').length,
    pending_requests: requests.filter((r) => r.status === 'submitted').length,
    offer_count: offers.length,
    awarded_rfqs: offers.filter((r) => r.status === 'accepted').length,
    open_offers: openOffers.length,
    late_rfqs: openOffers.filter((r) => r.data.deadline_on && r.data.deadline_on < today).length,
    rfq_to_order: ordersByOffer.size,
    late_receipts,
    posted_receipts: receipts.length,
    total_orders: orders.filter((o) => ['issued', 'confirmed'].includes(o.status)).length,
    currencies,
    buyer_options: buyerIds.map((id) => ({ id, name: buyerNames.get(id) || 'Former member ' + id.slice(0, 8) })),
    category_options: categoryOptions,
    by_vendor: Object.values(by_vendor).sort((x: any, y: any) => y.value_minor - x.value_minor),
    by_product: Object.values(by_product).sort((x: any, y: any) => y.value_minor - x.value_minor),
    by_month: Object.values(by_month).sort((x: any, y: any) => x.month.localeCompare(y.month)),
    payables,
    aging,
    definitions:
      'Committed amounts retain cancelled-order history; they are not cash outflow or on-hand valuation.' +
      (q.category ? ' Category-filtered purchase values use matching line subtotals; order-level tax is not allocated by product category.' : '') +
      ' Payables use approved supplier bills less approved credits and manual payment observations; payable aging remains at whole-bill level. Aging uses the recorded due date and UTC day; currencies remain separate.',
  };
}
