import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { unseal } from '../platform/crypto';
import { record } from '../platform/payments';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from '../erp/bank-python';
import { decode, insert, operation, update, type ERPKind } from '../erp/store';
import { product, products } from '../inventory/service';
import { quantityMilli } from '../inventory/quantity';

const uuid = z.uuid();
const day = z.iso.date();
const scope = (a: Access) => [a.org, a.environment];

const downPaymentKind: ERPKind = 'sales_down_payment';
const optionalKind: ERPKind = 'sales_optional_product';

export const downPaymentInput = z
  .object({
    order_id: uuid,
    mode: z.enum(['percentage', 'fixed']),
    percentage_bps: z.number().int().min(1).max(10000).optional(),
    fixed_amount_minor: z.number().int().positive().max(100_000_000_000).optional(),
    reference: z.string().trim().min(2).max(120),
    due_on: day,
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

export const optionalProductInput = z
  .object({
    quotation_id: uuid,
    product_id: uuid,
    quantity_milli: z.number().int().positive().max(1e12),
    unit_price_minor: z.number().int().min(0).max(100_000_000_000),
    description: z.string().trim().max(500).default(''),
  })
  .strict();

export const optionalProductDecisionInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['offered', 'accepted', 'declined']),
  })
  .strict();

const marginResultSchema = z
  .object({
    orders: z.array(
      z
        .object({
          id: z.string(),
          currency: z.string(),
          revenue_minor: z.number().int(),
          cost_minor: z.number().int(),
          margin_minor: z.number().int(),
          margin_bps: z.number().int(),
          lines: z.array(
            z
              .object({
                product_id: z.string().nullable().optional(),
                quantity_milli: z.number().int(),
                revenue_minor: z.number().int(),
                cost_minor: z.number().int(),
                margin_minor: z.number().int(),
                margin_bps: z.number().int(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    totals_by_currency: z.record(
      z.string(),
      z
        .object({
          revenue_minor: z.number().int(),
          cost_minor: z.number().int(),
          margin_minor: z.number().int(),
          margin_bps: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const downPaymentResultSchema = z
  .object({
    order_total_minor: z.number().int().positive(),
    already_invoiced_minor: z.number().int().min(0),
    amount_minor: z.number().int().positive(),
    remaining_after_minor: z.number().int().min(0),
  })
  .strict();

async function erpRecords(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

function decodeOrderRow(a: Access, row: any) {
  let payload: any = {};
  if (typeof row.data === 'string') {
    try {
      payload = JSON.parse(row.data);
    } catch {
      try {
        payload = JSON.parse(
          unseal(row.data, JSON.stringify(['record', a.org, a.environment, 'orders', row.id])),
        );
      } catch {
        payload = {};
      }
    }
  }
  return {
    ...payload,
    id: row.id,
    status: payload.status ?? row.status ?? 'confirmed',
    created_at: row.created_at,
  };
}

export async function salesMarginReport(
  a: Access,
  query: { currency?: string; from?: string; to?: string },
) {
  await requireServices(a, ['sales']);
  const orderRows = await dbAll(
    "SELECT id,data,created_at FROM ac_records WHERE org_id=? AND environment=? AND kind='orders' ORDER BY created_at DESC, id DESC LIMIT 500",
    scope(a),
  );
  const allProducts = await products(a, '', 500, 0);
  const costByProduct = new Map(allProducts.map((p) => [p.id, Number(p.purchase_cost_minor || 0)]));

  const orders = orderRows
    .map((row) => decodeOrderRow(a, row))
    .filter((o) => {
      if (o.status === 'cancelled') return false;
      if (query.currency && (o.currency || 'KES') !== query.currency) return false;
      const date = String(o.order_date || o.created_at || '').slice(0, 10);
      if (query.from && date < query.from) return false;
      if (query.to && date > query.to) return false;
      return true;
    });

  const payload = orders.map((o) => ({
    id: o.id,
    currency: String(o.currency || 'KES'),
    lines: (Array.isArray(o.items) ? o.items : []).map((item: any) => ({
      product_id: item.product_id ?? null,
      quantity_milli:
        typeof item.quantity_milli === 'number'
          ? item.quantity_milli
          : quantityMilli(String(item.quantity ?? '1')),
      unit_price_minor: Number(item.unit_price_minor ?? 0),
      discount_bps: Number(item.discount_bps ?? 0),
      unit_cost_minor: item.product_id ? (costByProduct.get(item.product_id) ?? 0) : 0,
    })),
  }));

  const computed = await accountingPython(
    'sales_pricing',
    { op: 'margins', orders: payload },
    marginResultSchema,
  );
  const metaById = new Map(orders.map((o) => [o.id, o]));
  return {
    totals_by_currency: computed.totals_by_currency,
    data: computed.orders.map((o) => {
      const m = metaById.get(o.id);
      return {
        ...o,
        reference: m?.number || m?.reference || o.id.slice(0, 8).toUpperCase(),
        customer_id: m?.customer_id ?? null,
        status: m?.status ?? 'confirmed',
        order_date: String(m?.order_date || m?.created_at || '').slice(0, 10),
      };
    }),
  };
}

async function computeDownPaymentForOrder(a: Access, d: z.infer<typeof downPaymentInput>) {
  const order = await record(a, d.order_id, 'orders');
  if (['draft', 'cancelled'].includes(order.status))
    fail(409, 'Down payments require a confirmed sales order');
  const orderTotal = Number(order.total_minor ?? 0);
  if (orderTotal <= 0) fail(400, 'Order total must be positive');
  const existing = (await erpRecords(a, downPaymentKind)).filter(
    (r) => r.data.order_id === d.order_id && r.status !== 'cancelled',
  );
  const already = existing.reduce((sum, r) => sum + Number(r.data.amount_minor || 0), 0);
  const calc = await accountingPython(
    'sales_pricing',
    {
      op: 'down_payment',
      order_total_minor: orderTotal,
      already_invoiced_minor: already,
      mode: d.mode,
      ...(d.percentage_bps !== undefined ? { percentage_bps: d.percentage_bps } : {}),
      ...(d.fixed_amount_minor !== undefined ? { fixed_amount_minor: d.fixed_amount_minor } : {}),
    },
    downPaymentResultSchema,
  );
  return {
    order,
    ...calc,
    currency: String(order.currency || 'KES'),
    order_reference: order.number || order.reference || d.order_id.slice(0, 8).toUpperCase(),
  };
}

export async function listDownPayments(a: Access, orderId?: string) {
  await requireServices(a, ['sales']);
  const rows = (await erpRecords(a, downPaymentKind))
    .filter((r) => !orderId || r.data.order_id === orderId)
    .map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      created_at: r.created_at,
      ...r.data,
    }))
    .reverse();
  return { data: rows };
}

export async function previewDownPayment(a: Access, input: unknown) {
  await requireServices(a, ['sales']);
  const d = downPaymentInput.parse(input);
  const res = await computeDownPaymentForOrder(a, d);
  return {
    order_id: d.order_id,
    order_reference: res.order_reference,
    currency: res.currency,
    order_total_minor: res.order_total_minor,
    already_invoiced_minor: res.already_invoiced_minor,
    amount_minor: res.amount_minor,
    remaining_after_minor: res.remaining_after_minor,
  };
}

export async function createDownPayment(a: Access, input: unknown, key: string) {
  const d = downPaymentInput.parse(input);
  return operation(
    a,
    'sales.down_payment.create:' + d.order_id,
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const res = await computeDownPaymentForOrder(a, d);
      const saved = await insert(
        a,
        downPaymentKind,
        {
          order_id: d.order_id,
          order_reference: res.order_reference,
          currency: res.currency,
          mode: d.mode,
          percentage_bps: d.percentage_bps ?? null,
          amount_minor: res.amount_minor,
          order_total_minor: res.order_total_minor,
          remaining_after_minor: res.remaining_after_minor,
          reference: d.reference,
          due_on: d.due_on,
          notes: d.notes,
          requested_by: a.actor,
        },
        { parent: d.order_id, status: 'requested', due: d.due_on },
      );
      await audit(a.org, a.actor, 'sales.down_payment_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function listOptionalProducts(a: Access, quotationId?: string) {
  await requireServices(a, ['sales']);
  const allProducts = await products(a, '', 500, 0);
  const byProd = new Map(allProducts.map((p) => [p.id, p]));
  const rows = (await erpRecords(a, optionalKind))
    .filter((r) => !quotationId || r.data.quotation_id === quotationId)
    .map((r) => {
      const p = byProd.get(r.data.product_id);
      return {
        id: r.id,
        version: r.version,
        status: r.status,
        created_at: r.created_at,
        ...r.data,
        product_sku: p?.sku ?? '',
        product_name: p?.name ?? '',
        currency: p?.currency ?? 'KES',
        unit: p?.unit ?? 'unit',
      };
    })
    .reverse();
  return { data: rows };
}

export async function addOptionalProduct(a: Access, input: unknown, key: string) {
  const d = optionalProductInput.parse(input);
  return operation(
    a,
    'sales.optional_product.add:' + d.quotation_id,
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const p = await product(a, d.product_id);
      if (p.status !== 'active') fail(400, 'Choose an active product for optional upsells');
      const saved = await insert(a, optionalKind, d, {
        parent: d.quotation_id,
        status: 'offered',
      });
      await audit(a.org, a.actor, 'sales.optional_product_added', saved.id);
      return {
        id: saved.id,
        version: saved.version,
        status: saved.status,
        ...saved.data,
        product_sku: p.sku,
        product_name: p.name,
        currency: p.currency,
      };
    },
  );
}

export async function decideOptionalProduct(a: Access, optId: string, input: unknown, key: string) {
  const id = uuid.parse(optId);
  const d = optionalProductDecisionInput.parse(input);
  return operation(
    a,
    'sales.optional_product.decide:' + id,
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const row = await dbGet(
        'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
        [id, ...scope(a), optionalKind],
      );
      if (!row) fail(404, 'Optional product not found');
      const old = decode(a, row);
      if (old.version !== d.expected_version)
        fail(409, 'Optional product changed; reload before deciding');
      const saved = await update(a, old, old.data, { status: d.status }, 'optional_' + d.status);
      await audit(a.org, a.actor, 'sales.optional_product_' + d.status, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}
