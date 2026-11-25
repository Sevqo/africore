import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll } from '../db/adapter';
import { fail, type Access } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { decode, insert, operation, update, type ERPKind } from './store';

const text = (max: number) => z.string().trim().min(1).max(max);
const scope = (a: Access) => [a.org, a.environment];

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

const bestVendorSchema = z.object({
  quantity: z.number().int(),
  best: z
    .object({
      supplier_id: z.string(),
      supplier_name: z.string(),
      unit_price_minor: z.number().int(),
      total_minor: z.number().int(),
      lead_days: z.number().int(),
      min_qty: z.number().int(),
    })
    .nullable(),
  ranked: z.array(
    z.object({
      supplier_id: z.string(),
      supplier_name: z.string(),
      unit_price_minor: z.number().int(),
      total_minor: z.number().int(),
      lead_days: z.number().int(),
      min_qty: z.number().int(),
    }),
  ),
});

const calloffSchema = z.object({
  approved: z.boolean(),
  remaining_before: z.number().int(),
  remaining_after: z.number().int(),
  calloff_total_minor: z.number().int(),
  reason: z.string(),
});

const scorecardSchema = z.object({
  delivery_count: z.number().int(),
  otif_bps: z.number().int(),
  defect_bps: z.number().int(),
  composite_score_bps: z.number().int(),
});

const splitBillSchema = z.object({
  subtotal_minor: z.number().int(),
  tax_minor: z.number().int(),
  tip_minor: z.number().int(),
  grand_total_minor: z.number().int(),
  guests: z.number().int(),
  shares: z.array(z.object({ guest: z.number().int(), amount_minor: z.number().int() })),
});

const comboPriceSchema = z.object({
  base_price_minor: z.number().int(),
  addons_minor: z.number().int(),
  unit_total_minor: z.number().int(),
  quantity: z.number().int(),
  line_total_minor: z.number().int(),
});

// --- APP #5: PROCUREMENT PARITY ---

export async function listVendorTiers(a: Access) {
  await requireServices(a, ['procurement']);
  const rows = await records(a, 'vendor_price_tier');
  return { tiers: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createVendorTier(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      product_id: text(80),
      supplier_id: text(80),
      supplier_name: text(140),
      currency: currencySchema.default('KES'),
      min_qty: z.number().int().min(1).max(1_000_000).default(1),
      unit_price_minor: z.number().int().min(1).max(100_000_000_000),
      lead_days: z.number().int().min(0).max(365).default(3),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'procurement.vendor_tier.create',
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const rec = await insert(a, 'vendor_price_tier', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function selectBestVendorTier(a: Access, input: unknown) {
  const d = z
    .object({
      product_id: text(80),
      quantity: z.number().int().min(1).max(1_000_000),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['procurement']);
  const tiers = (await records(a, 'vendor_price_tier'))
    .filter((r) => r.status === 'active' && r.data.product_id === d.product_id)
    .map((r) => r.data);
  return accountingPython(
    'purchasing_pos_operations',
    { op: 'best_vendor_quote', quantity: d.quantity, tiers },
    bestVendorSchema,
  );
}

export async function evaluateAgreementCalloff(a: Access, input: unknown) {
  const d = z
    .object({
      ceiling_qty: z.number().int().min(1).max(10_000_000),
      already_ordered_qty: z.number().int().min(0).max(10_000_000),
      requested_qty: z.number().int().min(1).max(10_000_000),
      unit_price_minor: z.number().int().min(0).max(100_000_000_000),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['procurement']);
  return accountingPython('purchasing_pos_operations', { op: 'agreement_calloff', ...d }, calloffSchema);
}

export async function evaluateVendorScorecard(a: Access, input: unknown) {
  const d = z
    .object({
      supplier_id: text(80),
      deliveries: z
        .array(
          z
            .object({
              ordered_qty: z.number().int().min(1),
              received_qty: z.number().int().min(0),
              defective_qty: z.number().int().min(0).default(0),
              on_time: z.boolean().default(true),
            })
            .strict(),
        )
        .max(500),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['procurement']);
  const score = await accountingPython(
    'purchasing_pos_operations',
    { op: 'vendor_scorecard', deliveries: d.deliveries },
    scorecardSchema,
  );
  return { supplier_id: d.supplier_id, ...score };
}

export async function listDropships(a: Access) {
  await requireServices(a, ['procurement']);
  const rows = await records(a, 'dropship_order');
  return { dropships: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createDropship(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      sales_order_id: text(80),
      supplier_id: text(80),
      customer_address: text(240),
      product_id: text(80),
      quantity: z.number().int().min(1).max(1_000_000),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'procurement.dropship.create',
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const rec = await insert(a, 'dropship_order', d, { status: 'dispatched' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// --- APP #6: POS PARITY (Restaurant Floor Plan, KDS, Split Bill, Combos, Self-Order) ---

export async function listPosFloors(a: Access) {
  await requireServices(a, ['pos']);
  const floors = await records(a, 'pos_floor');
  const tables = await records(a, 'pos_table');
  return {
    floors: floors.map((f) => ({
      id: f.id,
      status: f.status,
      ...f.data,
      tables: tables
        .filter((t) => t.data.floor_id === f.id)
        .map((t) => ({ id: t.id, status: t.status, ...t.data })),
    })),
  };
}

export async function createPosFloor(a: Access, input: unknown, key: string) {
  const d = z.object({ name: text(100), location: text(100).default('Main Dining') }).strict().parse(input);
  return operation(
    a,
    'pos.floor.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const rec = await insert(a, 'pos_floor', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function createPosTable(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      floor_id: text(80),
      table_number: text(30),
      seats: z.number().int().min(1).max(100).default(4),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'pos.table.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const rec = await insert(a, 'pos_table', d, { status: 'available' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function listKdsTickets(a: Access) {
  await requireServices(a, ['pos']);
  const rows = await records(a, 'pos_kds_ticket');
  return { tickets: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createKdsTicket(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      order_ref: text(80),
      table_number: text(30).optional(),
      station: z.enum(['grill', 'bar', 'cold', 'bakery', 'main']).default('main'),
      items: z.array(z.object({ name: text(120), qty: z.number().int().min(1), notes: text(160).optional() }).strict()).min(1),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'pos.kds_ticket.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const rec = await insert(a, 'pos_kds_ticket', { ...d, created_at: new Date().toISOString() }, { status: 'queued' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function updateKdsTicketStatus(a: Access, ticketId: string, input: unknown, key: string) {
  const d = z.object({ status: z.enum(['queued', 'preparing', 'ready', 'served']) }).strict().parse(input);
  return operation(
    a,
    'pos.kds_ticket.status:' + ticketId,
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const rec = (await records(a, 'pos_kds_ticket')).find((r) => r.id === ticketId);
      if (!rec) {
        fail(404, 'KDS ticket not found');
        throw new Error('KDS ticket not found');
      }
      await update(a, rec, rec.data, { status: d.status }, 'kds_status_updated');
      return { id: rec.id, status: d.status, ...rec.data };
    },
  );
}

export async function calculateSplitBill(a: Access, input: unknown) {
  const d = z
    .object({
      subtotal_minor: z.number().int().min(0).max(100_000_000_000),
      tax_minor: z.number().int().min(0).max(100_000_000_000).default(0),
      tip_bps: z.number().int().min(0).max(10_000).default(0),
      guests: z.number().int().min(1).max(100).default(2),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['pos']);
  return accountingPython('purchasing_pos_operations', { op: 'split_bill', ...d }, splitBillSchema);
}

export async function calculateComboPrice(a: Access, input: unknown) {
  const d = z
    .object({
      base_price_minor: z.number().int().min(0).max(100_000_000_000),
      quantity: z.number().int().min(1).max(1000).default(1),
      modifiers: z
        .array(z.object({ name: text(100), extra_price_minor: z.number().int().min(0).max(10_000_000) }).strict())
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['pos']);
  return accountingPython('purchasing_pos_operations', { op: 'combo_price', ...d }, comboPriceSchema);
}

export async function createSelfOrderSession(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      table_number: text(30),
      guest_count: z.number().int().min(1).max(50).default(2),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'pos.self_order.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const qrToken = `QR-${randomUUID().slice(0, 8).toUpperCase()}`;
      const rec = await insert(
        a,
        'pos_self_order_session',
        { ...d, qr_token: qrToken, created_at: new Date().toISOString() },
        { status: 'open' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}
