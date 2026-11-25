import { z } from 'zod';
import { dbAll } from '../db/adapter';
import { type Access } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { decode, insert, operation, type ERPKind } from './store';

const day = z.iso.date();
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

const routeLeadSchema = z.object({
  matched: z.boolean(),
  rule_id: z.string().nullable(),
  rule_name: z.string().nullable(),
  team_name: z.string().nullable(),
  assigned_rep_id: z.string().nullable(),
});

const winLossSchema = z.object({
  won_count: z.number().int(),
  lost_count: z.number().int(),
  open_count: z.number().int(),
  won_revenue_minor: z.number().int(),
  lost_revenue_minor: z.number().int(),
  win_rate_bps: z.number().int(),
  avg_won_deal_minor: z.number().int(),
  avg_cycle_days: z.number().int(),
  lost_reasons: z.array(
    z.object({
      reason: z.string(),
      count: z.number().int(),
      lost_revenue_minor: z.number().int(),
    }),
  ),
});

const recurringSchema = z.object({
  total_mrr_minor: z.number().int(),
  total_arr_minor: z.number().int(),
  total_weighted_mrr_minor: z.number().int(),
  total_weighted_arr_minor: z.number().int(),
  rows: z.array(
    z.object({
      opportunity_id: z.string(),
      mrr_minor: z.number().int(),
      arr_minor: z.number().int(),
      weighted_mrr_minor: z.number().int(),
    }),
  ),
});

const quotaSchema = z.object({
  total_target_minor: z.number().int(),
  total_won_minor: z.number().int(),
  total_attainment_bps: z.number().int(),
  rows: z.array(
    z.object({
      owner_id: z.string(),
      owner_name: z.string(),
      target_minor: z.number().int(),
      won_minor: z.number().int(),
      gap_minor: z.number().int(),
      attainment_bps: z.number().int(),
      achieved: z.boolean(),
    }),
  ),
});

// 1. Lead Routing Rules
export async function listCrmRoutingRules(a: Access) {
  await requireServices(a, ['customers']);
  const rows = await records(a, 'crm_routing_rule');
  return { rules: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createCrmRoutingRule(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: text(140),
      team_name: text(100),
      priority: z.number().int().min(1).max(1000).default(100),
      country: text(8).optional(),
      source: text(60).optional(),
      min_revenue_minor: z.number().int().min(0).max(100_000_000_000).optional(),
      reps: z
        .array(
          z
            .object({
              rep_id: text(80),
              active_leads: z.number().int().min(0).max(10_000).default(0),
              max_capacity: z.number().int().min(1).max(10_000).default(50),
            })
            .strict(),
        )
        .default([]),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.crm_routing_rule.create',
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const rec = await insert(a, 'crm_routing_rule', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function evaluateCrmLeadRoute(a: Access, input: unknown) {
  const d = z
    .object({
      country: text(8).optional(),
      source: text(60).optional(),
      expected_revenue_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  const rules = (await records(a, 'crm_routing_rule'))
    .filter((r) => r.status === 'active')
    .map((r) => ({ id: r.id, ...r.data }));
  return accountingPython('crm_routing_analytics', { op: 'route_lead', lead: d, rules }, routeLeadSchema);
}

// 2. Lost Reasons & Win/Loss Analytics
export async function listCrmLostReasons(a: Access) {
  await requireServices(a, ['customers']);
  const rows = await records(a, 'crm_lost_reason');
  return { reasons: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createCrmLostReason(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      code: text(40),
      label: text(140),
      category: z.enum(['pricing', 'competitor', 'timing', 'fit', 'other']).default('other'),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.crm_lost_reason.create',
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const rec = await insert(
        a,
        'crm_lost_reason',
        { code: d.code.toUpperCase(), label: d.label, category: d.category },
        { status: 'active' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function computeCrmWinLoss(a: Access, input: unknown) {
  const d = z
    .object({
      deals: z
        .array(
          z
            .object({
              outcome: z.enum(['won', 'lost', 'open']),
              expected_revenue_minor: z.number().int().min(0).max(100_000_000_000),
              cycle_days: z.number().int().min(0).max(3650).optional(),
              lost_reason: text(140).optional(),
            })
            .strict(),
        )
        .max(1000)
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython('crm_routing_analytics', { op: 'win_loss_analytics', deals: d.deals }, winLossSchema);
}

// 3. Recurring Revenue (MRR/ARR) Rollup
export async function computeCrmRecurringRollup(a: Access, input: unknown) {
  const d = z
    .object({
      opportunities: z
        .array(
          z
            .object({
              opportunity_id: text(80),
              recurring_plan: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
              recurring_revenue_minor: z.number().int().min(0).max(100_000_000_000),
              probability_bps: z.number().int().min(0).max(10_000).default(10_000),
            })
            .strict(),
        )
        .max(500)
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['customers']);
  return accountingPython(
    'crm_routing_analytics',
    { op: 'recurring_rollup', opportunities: d.opportunities },
    recurringSchema,
  );
}

// 4. Sales Team Quotas & Attainment
export async function listCrmQuotas(a: Access) {
  await requireServices(a, ['customers']);
  const rows = await records(a, 'crm_quota');
  return { quotas: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createCrmQuota(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      owner_id: text(80),
      owner_name: text(140),
      period_start: day,
      period_end: day,
      currency: currencySchema.default('KES'),
      target_minor: z.number().int().min(1).max(100_000_000_000),
      won_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.crm_quota.create',
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const rec = await insert(a, 'crm_quota', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function evaluateCrmQuotas(a: Access) {
  await requireServices(a, ['customers']);
  const quotas = (await records(a, 'crm_quota')).map((r) => r.data);
  return accountingPython('crm_routing_analytics', { op: 'quota_attainment', quotas }, quotaSchema);
}

// 5. Lead Enrichment Profiles
export async function listCrmEnrichments(a: Access) {
  await requireServices(a, ['customers']);
  const rows = await records(a, 'crm_lead_enrichment');
  return { enrichments: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createCrmEnrichment(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      lead_id: text(80),
      company_domain: text(160),
      industry: text(100).optional(),
      employee_band: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).default('11-50'),
      country: text(8).default('KE'),
      confidence_bps: z.number().int().min(0).max(10_000).default(8500),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'customers.crm_enrichment.create',
    key,
    d,
    () => requireServices(a, ['customers']),
    async () => {
      const rec = await insert(
        a,
        'crm_lead_enrichment',
        { ...d, enriched_at: new Date().toISOString() },
        { status: 'enriched' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}
