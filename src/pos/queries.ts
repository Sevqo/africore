import { z } from 'zod';
import { dbAll, dbGet, isPostgres } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { decode } from '../erp/store';
import { requireServices } from '../marketplace/engine';
import { documentBalance } from '../finance/ledger';
import { registerAccess } from './registers';
import { posSale } from './quotes';
import { stockReturnChoices } from './stock';

const paging = z
  .object({ offset: z.coerce.number().int().min(0).max(1_000_000).default(0) })
  .strict();
const productQuery = paging
  .extend({
    q: z.string().trim().max(100).default(''),
    category: z.string().trim().max(120).default(''),
  })
  .strict();
const saleQuery = paging
  .extend({
    state: z.enum(['draft', 'confirmed']).optional(),
    q: z.string().trim().max(120).default(''),
    from: z.string().trim().max(40).default(''),
    to: z.string().trim().max(40).default(''),
  })
  .strict();
const literal = (value: string) => value.toLowerCase().replace(/[\\%_]/g, '\\$&');
const field = (name: string) =>
  isPostgres ? "(data::jsonb->>'" + name + "')" : "json_extract(data,'$." + name + "')";
const quoteCustomer = isPostgres
  ? "COALESCE(o.data::jsonb->'confirmed_quote'->'document'->>'customer_id',o.data::jsonb->'quote'->'document'->>'customer_id')"
  : "COALESCE(json_extract(o.data,'$.confirmed_quote.document.customer_id'),json_extract(o.data,'$.quote.document.customer_id'))";
const recordName = isPostgres
  ? "COALESCE(c.data::jsonb->>'name','')"
  : "COALESCE(json_extract(c.data,'$.name'),'')";
export async function registerOverview(a: Access, id: string, input: unknown = {}) {
  const q = paging.parse(input),
    { register, manager, write_allowed } = await registerAccess(a, id);
  const rows = await dbAll(
    "SELECT o.* FROM ac_erp_objects o JOIN ac_pos_sessions s ON s.session_id=o.id AND s.org_id=o.org_id AND s.environment=o.environment WHERE o.org_id=? AND o.environment=? AND o.root_id=? AND o.kind='pos_session'" +
      (manager ? '' : ' AND s.cashier_id=?') +
      ' ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET ?',
    [a.org, a.environment, id, ...(manager ? [] : [a.actor]), q.offset],
  );
  const occupied = !!(await dbGet(
    "SELECT session_id FROM ac_pos_sessions WHERE org_id=? AND environment=? AND register_id=? AND status='open'",
    [a.org, a.environment, id],
  ));
  return {
    register,
    manager,
    occupied,
    permissions: { write: write_allowed },
    sessions: rows.slice(0, 20).map((row) => decode(a, row)),
    has_more: rows.length > 20,
    offset: q.offset,
    limit: 20,
  };
}
/** Minimal current product projection. Literal search precedes pagination;
 * private purchase costs and supplier/contact data never enter cashier search. */
export async function posProducts(a: Access, id: string, input: unknown = {}) {
  const q = productQuery.parse(input),
    { register } = await registerAccess(a, id);
  await requireServices(a, ['products'], true);
  const search = '%' + literal(q.q) + '%',
    category = q.category ? [q.category] : [];
  const rows = await dbAll(
    "SELECT id,version,sku,name,data FROM ac_products WHERE org_id=? AND environment=? AND status='active' AND " +
      field('currency') +
      "=? AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(sku) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(" +
      field('barcode') +
      ",'')) LIKE ? ESCAPE '\\')" +
      (category.length ? ' AND COALESCE(' + field('category') + ",'')=?" : '') +
      ' ORDER BY name,id LIMIT 26 OFFSET ?',
    [a.org, a.environment, register.data.currency, search, search, search, ...category, q.offset],
  );
  const categories = await dbAll(
    'SELECT DISTINCT COALESCE(' +
      field('category') +
      ",'') AS category FROM ac_products WHERE org_id=? AND environment=? AND status='active' AND " +
      field('currency') +
      '=? AND COALESCE(' +
      field('category') +
      ",'')<>'' ORDER BY category",
    [a.org, a.environment, register.data.currency],
  );
  return {
    data: rows.slice(0, 25).map((row) => {
      const p = JSON.parse(row.data);
      return {
        id: row.id,
        version: Number(row.version),
        sku: row.sku,
        name: row.name,
        barcode: p.barcode,
        variant: p.variant,
        category: p.category || '',
        unit: p.unit,
        currency: p.currency,
        sale_price_minor: p.sale_price_minor,
        track_inventory: p.track_inventory,
      };
    }),
    categories: categories.map((row: any) => row.category).slice(0, 100),
    has_more: rows.length > 25,
    offset: q.offset,
    limit: 25,
    notice:
      'Current canonical catalog. Exact location stock and prices are revalidated in the sale quote. Keyboard barcode input is supported; no camera or payment terminal is connected.',
  };
}
export async function posSales(a: Access, id: string, input: unknown = {}) {
  const q = saleQuery.parse(input),
    { manager } = await registerAccess(a, id);
  const dateFilters = [q.from ? 'o.created_at>=?' : '', q.to ? 'o.created_at<?' : ''].filter(
      Boolean,
    ),
    search = q.q ? '%' + literal(q.q) + '%' : '';
  const rows = await dbAll(
    'SELECT o.*,c.data AS pos_customer,s.cashier_id AS pos_cashier,s.status AS pos_session_status FROM ac_erp_objects o LEFT JOIN ac_records c ON c.id=' +
      quoteCustomer +
      " AND c.org_id=o.org_id AND c.environment=o.environment AND c.kind='customers' LEFT JOIN ac_pos_sessions s ON s.session_id=o.parent_id AND s.org_id=o.org_id AND s.environment=o.environment WHERE o.org_id=? AND o.environment=? AND o.root_id=? AND o.kind='pos_sale'" +
      (manager ? '' : ' AND s.cashier_id=?') +
      (q.state ? ' AND o.status=?' : '') +
      (search
        ? " AND (LOWER(o.id) LIKE ? ESCAPE '\\' OR LOWER(" + recordName + ") LIKE ? ESCAPE '\\')"
        : '') +
      (dateFilters.length ? ' AND ' + dateFilters.join(' AND ') : '') +
      ' ORDER BY o.created_at DESC,o.id DESC LIMIT 26 OFFSET ?',
    [
      a.org,
      a.environment,
      id,
      ...(manager ? [] : [a.actor]),
      ...(q.state ? [q.state] : []),
      ...(search ? [search, search] : []),
      ...(q.from ? [q.from] : []),
      ...(q.to ? [q.to] : []),
      q.offset,
    ],
  );
  const data = await Promise.all(
    rows.slice(0, 25).map(async (row) => {
      const sale = decode(a, row),
        quote = sale.data.confirmed_quote || sale.data.quote,
        customer = row.pos_customer ? JSON.parse(row.pos_customer) : null,
        balance = sale.data.invoice_id
          ? await documentBalance(a, sale.data.invoice_id).catch(() => null)
          : null;
      return {
        id: sale.id,
        version: sale.version,
        status: sale.status,
        created_at: sale.created_at,
        register_id: sale.root_id,
        session_id: sale.parent_id,
        session_status: row.pos_session_status || null,
        cashier_id: row.pos_cashier || null,
        customer_id: quote?.document.customer_id || null,
        customer_name: customer?.name || null,
        currency: quote?.document.currency,
        total_minor: quote?.amounts.total_minor,
        paid_minor: balance?.paid_minor || 0,
        outstanding_minor: balance?.outstanding_minor ?? null,
        payment_status: balance?.status || null,
        invoice_id: sale.data.invoice_id || null,
        order_id: sale.data.order_id || null,
        handover: sale.data.handover || 'not_recorded',
      };
    }),
  );
  return { data, has_more: rows.length > 25, offset: q.offset, limit: 25 };
}
export async function posReceipt(a: Access, id: string) {
  const sale = await posSale(a, id);
  if (sale.status !== 'confirmed') fail(409, 'Confirm this draft before opening a sale receipt');
  const { register, manager } = await registerAccess(a, sale.root_id),
    invoice = await documentBalance(a, sale.data.invoice_id),
    merchant = await dbGet('SELECT name FROM ac_organizations WHERE id=?', [a.org]);
  const returns = await dbAll(
    "SELECT id,amount_minor,occurred_at,related_receipt_id FROM ac_cash_movements WHERE org_id=? AND environment=? AND document_id=? AND kind='return' ORDER BY occurred_at DESC,id DESC LIMIT 21",
    [a.org, a.environment, invoice.id],
  );
  const request = sale.data.checkout
    ? await dbGet(
        'SELECT id,status,amount_minor,expires_at FROM ac_requests WHERE id=? AND org_id=? AND environment=? AND document_id=?',
        [sale.data.checkout.request_id, a.org, a.environment, invoice.id],
      )
    : null;
  const canOpenCheckout =
    request &&
    ['pending', 'failed'].includes(request.status) &&
    !invoice.collection_hold &&
    Number(request.amount_minor) <= invoice.outstanding_minor &&
    request.expires_at > new Date().toISOString();
  const stock_returns = await stockReturnChoices(a, id);
  const stockService = await dbGet(
    "SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='inventory'",
    [a.org, a.environment],
  );
  const receivingWarehouse = register.data.warehouse_id
    ? await dbGet(
        "SELECT id FROM ac_warehouses WHERE id=? AND org_id=? AND environment=? AND status='active'",
        [register.data.warehouse_id, a.org, a.environment],
      )
    : null;
  const canReturnStock =
    manager &&
    stockService?.status === 'active' &&
    Number(stockService.enabled) === 1 &&
    !!receivingWarehouse;
  return {
    id: sale.id,
    version: sale.version,
    reference: 'POS-' + sale.id.slice(0, 12).toUpperCase(),
    merchant: merchant?.name,
    register_id: register.id,
    register_name: register.data.name,
    timezone: register.data.timezone,
    environment: a.environment,
    confirmed_at: sale.data.confirmed_at,
    recorded_by_label: sale.data.confirmed_by_label || sale.data.confirmed_by,
    lines: invoice.items,
    currency: invoice.currency,
    subtotal_minor: invoice.subtotal_minor,
    discount_minor: invoice.discount_minor,
    tax_minor: invoice.tax_minor,
    total_minor: invoice.total_minor,
    invoice_id: invoice.id,
    order_id: sale.data.order_id,
    payment: {
      status: invoice.status,
      provider_paid_minor: invoice.provider_paid_minor,
      recorded_cash_paid_minor: invoice.recorded_cash_paid_minor,
      cash_returned_minor: invoice.cash_returned_minor,
      credited_minor: invoice.credited_minor,
      outstanding_minor: invoice.outstanding_minor,
      collection_hold: invoice.collection_hold,
    },
    tender: sale.data.tender,
    cash_receipt_id: sale.data.cash_receipt_id,
    handover: sale.data.handover,
    stock_returns,
    returns: returns
      .slice(0, 20)
      .map((row) => ({ ...row, amount_minor: Number(row.amount_minor) })),
    returns_has_more: returns.length > 20,
    checkout: canOpenCheckout
      ? {
          request_id: request.id,
          amount_minor: Number(request.amount_minor),
          url: sale.data.checkout.url,
          expires_at: request.expires_at,
        }
      : null,
    permissions: { manager, stock_return: canReturnStock },
    notice:
      'Sandbox sale receipt. Recorded physical cash is a merchant observation; electronic confirmations are test simulations. Handover, invoice corrections, stock returns and independent journal posting remain separate.',
  };
}
