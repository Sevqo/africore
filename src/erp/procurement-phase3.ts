import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { decode, insert, operation, update, type ERPKind } from './store';

const uuid = z.uuid();
const day = z.iso.date();
const scope = (a: Access) => [a.org, a.environment];

const matchKind: ERPKind = 'procurement_three_way_match';
const blanketKind: ERPKind = 'procurement_blanket_order';

export const threeWayLineInput = z
  .object({
    id: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(''),
    ordered_milli: z.number().int().min(0).max(1e12),
    received_milli: z.number().int().min(0).max(1e12),
    billed_milli: z.number().int().min(0).max(1e12),
    po_unit_price_minor: z.number().int().min(0).max(100_000_000_000),
    bill_unit_price_minor: z.number().int().min(0).max(100_000_000_000),
  })
  .strict();

export const threeWayMatchInput = z
  .object({
    purchase_order_ref: z.string().trim().min(2).max(120),
    vendor_bill_ref: z.string().trim().min(2).max(120),
    currency: currencySchema.default('KES'),
    tolerance_bps: z.number().int().min(0).max(5000).default(0),
    lines: z.array(threeWayLineInput).min(1).max(200),
  })
  .strict();

export const threeWayOverrideInput = z
  .object({
    expected_version: z.number().int().positive(),
    decision: z.enum(['approve_override', 'reject_bill']),
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();

export const blanketOrderInput = z
  .object({
    reference: z.string().trim().min(2).max(120),
    vendor_name: z.string().trim().min(2).max(200),
    currency: currencySchema.default('KES'),
    starts_on: day,
    ends_on: day,
    lines: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(80),
            description: z.string().trim().min(1).max(300),
            agreed_quantity_milli: z.number().int().positive().max(1e12),
            ordered_quantity_milli: z.number().int().min(0).max(1e12).default(0),
            unit_price_minor: z.number().int().min(0).max(100_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((d) => d.starts_on <= d.ends_on, 'Blanket order dates must be ordered');

export const blanketOrderPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['draft', 'ongoing', 'closed', 'cancelled']),
    reason: z.string().trim().min(3).max(1000).default('Status updated'),
  })
  .strict();

export const compareBidsInput = z
  .object({
    bids: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            vendor_name: z.string().trim().min(1).max(200),
            total_minor: z.number().int().min(0).max(100_000_000_000),
            lead_time_days: z.number().int().min(0).max(3650),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

const threeWayResultSchema = z
  .object({
    status: z.enum(['matched', 'partial_match', 'over_billed', 'price_variance', 'awaiting_receipt']),
    pay_eligible: z.boolean(),
    tolerance_bps: z.number().int(),
    total_po_minor: z.number().int(),
    total_bill_minor: z.number().int(),
    total_variance_minor: z.number().int(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          ordered_milli: z.number().int(),
          received_milli: z.number().int(),
          billed_milli: z.number().int(),
          quantity_variance_milli: z.number().int(),
          po_value_minor: z.number().int(),
          bill_value_minor: z.number().int(),
          price_variance_minor: z.number().int(),
          status: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const compareBidsResultSchema = z
  .object({
    lowest_total_minor: z.number().int(),
    highest_total_minor: z.number().int(),
    ranked: z.array(
      z
        .object({
          id: z.string(),
          vendor_name: z.string(),
          total_minor: z.number().int(),
          lead_time_days: z.number().int(),
          rank: z.number().int(),
          delta_vs_lowest_minor: z.number().int(),
          savings_vs_highest_bps: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

export async function evaluateThreeWay(a: Access, input: unknown) {
  await requireServices(a, ['procurement']);
  const d = threeWayMatchInput.parse(input);
  return accountingPython(
    'procurement_matching',
    { op: 'three_way_match', tolerance_bps: d.tolerance_bps, lines: d.lines },
    threeWayResultSchema,
  );
}

export async function listThreeWayMatches(a: Access) {
  await requireServices(a, ['procurement']);
  return {
    data: (await records(a, matchKind))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createThreeWayMatch(a: Access, input: unknown, key: string) {
  const d = threeWayMatchInput.parse(input);
  return operation(
    a,
    'procurement.three_way_match.create',
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const result = await accountingPython(
        'procurement_matching',
        { op: 'three_way_match', tolerance_bps: d.tolerance_bps, lines: d.lines },
        threeWayResultSchema,
      );
      const status = result.pay_eligible ? 'matched' : 'discrepancy_hold';
      const saved = await insert(
        a,
        matchKind,
        {
          ...d,
          result,
          created_by: a.actor,
        },
        { status },
      );
      await audit(a.org, a.actor, 'procurement.three_way_match_' + status, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function decideThreeWayMatch(a: Access, matchId: string, input: unknown, key: string) {
  const id = uuid.parse(matchId);
  const d = threeWayOverrideInput.parse(input);
  return operation(
    a,
    'procurement.three_way_match.decide:' + id,
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const row = await dbGet(
        'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
        [id, ...scope(a), matchKind],
      );
      if (!row) fail(404, '3-way match record not found');
      const old = decode(a, row);
      if (old.version !== d.expected_version) fail(409, '3-way match changed; reload');
      if (old.status !== 'discrepancy_hold')
        fail(409, 'Only discrepancy holds require manager override or rejection');
      if (old.data.created_by === a.actor)
        fail(403, 'A different manager must review a 3-way match discrepancy');
      const nextStatus = d.decision === 'approve_override' ? 'approved_override' : 'rejected';
      const saved = await update(
        a,
        old,
        {
          ...old.data,
          override_by: a.actor,
          override_reason: d.reason,
          result: {
            ...old.data.result,
            pay_eligible: d.decision === 'approve_override',
          },
        },
        { status: nextStatus },
        d.decision,
      );
      await audit(a.org, a.actor, 'procurement.three_way_match_' + nextStatus, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function listBlanketOrders(a: Access) {
  await requireServices(a, ['procurement']);
  return {
    data: (await records(a, blanketKind))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createBlanketOrder(a: Access, input: unknown, key: string) {
  const d = blanketOrderInput.parse(input);
  return operation(
    a,
    'procurement.blanket_order.create',
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const saved = await insert(a, blanketKind, d, { status: 'ongoing', due: d.ends_on });
      await audit(a.org, a.actor, 'procurement.blanket_order_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function updateBlanketOrder(a: Access, orderId: string, input: unknown, key: string) {
  const id = uuid.parse(orderId);
  const d = blanketOrderPatchInput.parse(input);
  return operation(
    a,
    'procurement.blanket_order.update:' + id,
    key,
    d,
    () => requireServices(a, ['procurement']),
    async () => {
      const row = await dbGet(
        'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
        [id, ...scope(a), blanketKind],
      );
      if (!row) fail(404, 'Blanket order not found');
      const old = decode(a, row);
      if (old.version !== d.expected_version) fail(409, 'Blanket order changed; reload');
      const saved = await update(
        a,
        old,
        { ...old.data, last_reason: d.reason },
        { status: d.status },
        'blanket_' + d.status,
      );
      await audit(a.org, a.actor, 'procurement.blanket_order_' + d.status, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function compareTenderBids(a: Access, input: unknown) {
  await requireServices(a, ['procurement']);
  const d = compareBidsInput.parse(input);
  return accountingPython(
    'procurement_matching',
    { op: 'compare_bids', bids: d.bids },
    compareBidsResultSchema,
  );
}
