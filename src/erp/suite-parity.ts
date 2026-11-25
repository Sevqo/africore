import { createHash } from 'node:crypto';
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

// App #7 Work: Project Profitability
export async function evaluateWorkProfitability(a: Access, input: unknown) {
  const d = z
    .object({
      revenue_minor: z.number().int().min(0),
      labor_cost_minor: z.number().int().min(0),
      expense_cost_minor: z.number().int().min(0).default(0),
      planned_hours: z.number().int().min(0).default(0),
      logged_hours: z.number().int().min(0).default(0),
      billable_hours: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['work']);
  return accountingPython('enterprise_operations', { op: 'work_profitability', ...d }, z.record(z.string(), z.any()));
}

// App #8 People: Shift Overtime
export async function evaluatePeopleOvertime(a: Access, input: unknown) {
  const d = z
    .object({
      regular_limit_minutes: z.number().int().min(60).max(1440).default(480),
      hourly_rate_minor: z.number().int().min(1),
      overtime_multiplier_bps: z.number().int().min(10_000).max(50_000).default(15_000),
      shifts: z.array(z.object({ worked_minutes: z.number().int().min(0).max(1440) }).strict()).min(1),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['people']);
  return accountingPython('enterprise_operations', { op: 'people_shift_overtime', ...d }, z.record(z.string(), z.any()));
}

// App #9 Commerce: Abandoned Carts & Wishlists
export async function evaluateAbandonedCarts(a: Access, input: unknown) {
  const d = z
    .object({
      threshold_minutes: z.number().int().min(1).default(60),
      carts: z
        .array(
          z
            .object({
              cart_id: text(80),
              customer_email: text(160),
              idle_minutes: z.number().int().min(0),
              cart_total_minor: z.number().int().min(0),
              recovered: z.boolean().default(false),
            })
            .strict(),
        )
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['sales']);
  return accountingPython('enterprise_operations', { op: 'commerce_abandoned_carts', ...d }, z.record(z.string(), z.any()));
}

export async function listWishlists(a: Access) {
  await requireServices(a, ['sales']);
  const rows = await records(a, 'commerce_wishlist');
  return { wishlists: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function addWishlistItem(a: Access, input: unknown, key: string) {
  const d = z.object({ customer_id: text(80), product_id: text(80) }).strict().parse(input);
  return operation(
    a,
    'sales.wishlist.add',
    key,
    d,
    () => requireServices(a, ['sales']),
    async () => {
      const rec = await insert(a, 'commerce_wishlist', d, { status: 'saved' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// App #10 Finance: Treasury Runway
export async function evaluateTreasuryRunway(a: Access, input: unknown) {
  const d = z
    .object({
      cash_balance_minor: z.number().int(),
      monthly_inflow_minor: z.number().int().min(0),
      monthly_outflow_minor: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['accounting']);
  return accountingPython('enterprise_operations', { op: 'finance_treasury_runway', ...d }, z.record(z.string(), z.any()));
}

// App #11 Documents: Cryptographic E-Signature Envelopes (Odoo Sign)
export async function listSignEnvelopes(a: Access) {
  await requireServices(a, ['documents']);
  const rows = await records(a, 'document_sign_envelope');
  return { envelopes: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createSignEnvelope(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      document_title: text(160),
      document_hash: text(128).optional(),
      signers: z.array(z.object({ name: text(120), email: text(160), order: z.number().int().min(1) }).strict()).min(1),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'documents.sign_envelope.create',
    key,
    d,
    () => requireServices(a, ['documents']),
    async () => {
      const hash = d.document_hash || createHash('sha256').update(d.document_title).digest('hex');
      const rec = await insert(
        a,
        'document_sign_envelope',
        { ...d, document_hash: hash, signatures: [] },
        { status: 'sent' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function signEnvelope(a: Access, envelopeId: string, input: unknown, key: string) {
  const d = z.object({ signer_email: text(160), signature_text: text(120) }).strict().parse(input);
  return operation(
    a,
    'documents.sign_envelope.sign:' + envelopeId,
    key,
    d,
    () => requireServices(a, ['documents']),
    async () => {
      const rec = (await records(a, 'document_sign_envelope')).find((r) => r.id === envelopeId);
      if (!rec) {
        fail(404, 'Sign envelope not found');
        throw new Error('Sign envelope not found');
      }
      const signedAt = new Date().toISOString();
      const digest = createHash('sha256')
        .update(`${rec.data.document_hash}|${d.signer_email}|${d.signature_text}|${signedAt}`)
        .digest('hex');
      const sigs = [...(Array.isArray(rec.data.signatures) ? rec.data.signatures : []), { ...d, signed_at: signedAt, sha256: digest }];
      const allSigned = sigs.length >= (Array.isArray(rec.data.signers) ? rec.data.signers.length : 1);
      const nextStatus = allSigned ? 'completed' : 'partially_signed';
      await update(a, rec, { ...rec.data, signatures: sigs }, { status: nextStatus }, 'envelope_signed');
      return { id: rec.id, status: nextStatus, signatures: sigs };
    },
  );
}

// App #12 Analytics: KPI Snapshots
export async function listAnalyticsSnapshots(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'analytics_kpi_snapshot');
  return { snapshots: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createAnalyticsSnapshot(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      title: text(140),
      currency: currencySchema.default('KES'),
      metrics: z.record(z.string(), z.number().int()),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'accounting.analytics_snapshot.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(a, 'analytics_kpi_snapshot', { ...d, captured_at: new Date().toISOString() }, { status: 'published' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// App #17 Marketing: Funnel Analytics
export async function evaluateMarketingFunnel(a: Access, input: unknown) {
  const d = z
    .object({
      sent: z.number().int().min(0).default(0),
      delivered: z.number().int().min(0),
      opened: z.number().int().min(0),
      clicked: z.number().int().min(0),
      converted: z.number().int().min(0),
      attributed_revenue_minor: z.number().int().min(0).default(0),
      spend_minor: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython('enterprise_operations', { op: 'marketing_funnel', ...d }, z.record(z.string(), z.any()));
}

// App #18 Support: SLA Compliance
export async function evaluateSupportSla(a: Access, input: unknown) {
  const d = z
    .object({
      tickets: z
        .array(
          z
            .object({
              ticket_id: text(80),
              sla_target_minutes: z.number().int().min(1),
              elapsed_minutes: z.number().int().min(0),
            })
            .strict(),
        )
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython('enterprise_operations', { op: 'support_sla_evaluate', ...d }, z.record(z.string(), z.any()));
}

// App #19 Subscriptions: NRR & Churn
export async function evaluateSubscriptionsNrr(a: Access, input: unknown) {
  const d = z
    .object({
      starting_mrr_minor: z.number().int().min(0),
      expansion_mrr_minor: z.number().int().min(0).default(0),
      contraction_mrr_minor: z.number().int().min(0).default(0),
      churn_mrr_minor: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['sales']);
  return accountingPython('enterprise_operations', { op: 'subscriptions_nrr', ...d }, z.record(z.string(), z.any()));
}

// App #20 Manufacturing: Workcenter OEE
export async function evaluateMrpOee(a: Access, input: unknown) {
  const d = z
    .object({
      planned_minutes: z.number().int().min(1),
      downtime_minutes: z.number().int().min(0).default(0),
      ideal_cycle_seconds: z.number().int().min(1),
      total_units: z.number().int().min(0),
      good_units: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['inventory']);
  return accountingPython('enterprise_operations', { op: 'mrp_workcenter_oee', ...d }, z.record(z.string(), z.any()));
}

// App #21 Field Ops / Rental: Rental Periodicity Pricing
export async function evaluateRentalPricing(a: Access, input: unknown) {
  const d = z
    .object({
      period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
      duration_units: z.number().int().min(1),
      rate_minor: z.number().int().min(0),
      late_units: z.number().int().min(0).default(0),
      late_fee_per_unit_minor: z.number().int().min(0).default(0),
      deposit_minor: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['inventory']);
  return accountingPython('enterprise_operations', { op: 'rental_pricing', ...d }, z.record(z.string(), z.any()));
}

// App #23 Property & Hospitality: Occupancy & RevPAR
export async function evaluateHospitalityRevpar(a: Access, input: unknown) {
  const d = z
    .object({
      available_room_nights: z.number().int().min(1),
      occupied_room_nights: z.number().int().min(0),
      room_revenue_minor: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython('enterprise_operations', { op: 'hospitality_revpar', ...d }, z.record(z.string(), z.any()));
}

// App #24 Knowledge & Learning: Quiz Grader & Certification
export async function gradeLearningQuiz(a: Access, input: unknown) {
  const d = z
    .object({
      pass_threshold_bps: z.number().int().min(0).max(10_000).default(7000),
      questions: z
        .array(
          z
            .object({
              points: z.number().int().min(1).default(1),
              submitted: z.string().max(200),
              expected: z.string().max(200),
            })
            .strict(),
        )
        .min(1),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython('enterprise_operations', { op: 'learning_quiz_grade', ...d }, z.record(z.string(), z.any()));
}
