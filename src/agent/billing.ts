import { randomUUID } from 'node:crypto';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import { now } from '../platform/crypto';
import { billingPeriod, lockWorkspace } from '../marketplace/engine';

export type AgentPlanTier = 'agent_starter' | 'agent_growth' | 'agent_autonomous';

export interface AgentPlanDefinition {
  id: AgentPlanTier;
  name: string;
  currency: 'KES';
  monthly_minor: number;
  included_credits: number;
  overage_unit_minor: number;
  summary: string;
  features: string[];
}

/**
 * Separate Agent Billing Catalog (KES minor units, 100 minor = KSh 1.00).
 * Explicitly billed SEPARATELY from normal AfriCore workspace modules and excluded
 * from the KSh 1,990/mo All-Apps ERP cap so autonomous compute/reasoning/computer-use
 * scales predictably with Town-style credit metering and hard spend controls.
 */
export const AGENT_PLANS: Record<AgentPlanTier, AgentPlanDefinition> = {
  agent_starter: {
    id: 'agent_starter',
    name: 'Agent Starter',
    currency: 'KES',
    monthly_minor: 0,
    included_credits: 50,
    overage_unit_minor: 1_000, // KSh 10.00 per extra credit
    summary: 'KSh 0/mo · 50 Agent Credits/mo included, then KSh 10/credit',
    features: [
      'Separate from workspace ERP billing',
      '50 monthly autonomous credits',
      'Live Computer Use stage & Floating Agent',
      'Hard spend cap protection',
    ],
  },
  agent_growth: {
    id: 'agent_growth',
    name: 'Agent Growth',
    currency: 'KES',
    monthly_minor: 99_000, // KSh 990.00/mo
    included_credits: 300,
    overage_unit_minor: 600, // KSh 6.00 per extra credit
    summary: 'KSh 990/mo · 300 Agent Credits/mo included, then KSh 6/credit',
    features: [
      '300 monthly autonomous credits',
      'Scheduled Townie-style business routines',
      'Multi-step Computer Use workspace execution',
      'Lower overage rate (KSh 6/credit)',
    ],
  },
  agent_autonomous: {
    id: 'agent_autonomous',
    name: 'Agent Autonomous Pro',
    currency: 'KES',
    monthly_minor: 249_000, // KSh 2,490.00/mo
    included_credits: 1_000,
    overage_unit_minor: 400, // KSh 4.00 per extra credit
    summary: 'KSh 2,490/mo · 1,000 Agent Credits/mo included, then KSh 4/credit',
    features: [
      '1,000 monthly autonomous credits',
      'Unlimited active routines & priority execution',
      'Full owner autonomy & audit ledger export',
      'Lowest overage rate (KSh 4/credit)',
    ],
  },
};

export const AGENT_CREDIT_COSTS = {
  analysis_read: 1,
  routine_run: 2,
  tool_action: 3,
  computer_use_session: 5,
} as const;

export type AgentCreditCategory = keyof typeof AGENT_CREDIT_COSTS;

export async function ensureAgentBillingAccount(a: Access) {
  let row = await dbGet(
    'SELECT * FROM ac_agent_billing_accounts WHERE org_id=? AND environment=?',
    [a.org, a.environment],
  );
  if (!row) {
    const starter = AGENT_PLANS.agent_starter;
    const at = now();
    await dbRun(
      `INSERT INTO ac_agent_billing_accounts
       (org_id, environment, plan_tier, monthly_credits_included, bonus_credits, monthly_spend_cap_minor, hard_stop, overage_unit_minor, currency, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 0, 250000, 1, ?, 'KES', ?, ?)
       ON CONFLICT(org_id, environment) DO NOTHING`,
      [
        a.org,
        a.environment,
        starter.id,
        starter.included_credits,
        starter.overage_unit_minor,
        a.actor,
        at,
      ],
    );
    row = await dbGet(
      'SELECT * FROM ac_agent_billing_accounts WHERE org_id=? AND environment=?',
      [a.org, a.environment],
    );
  }
  return row;
}

export async function getAgentBillingSummary(a: Access, period = billingPeriod()) {
  const account = await ensureAgentBillingAccount(a);
  const plan =
    AGENT_PLANS[account.plan_tier as AgentPlanTier] || AGENT_PLANS.agent_starter;

  const usageRow = await dbGet(
    `SELECT COALESCE(SUM(CASE WHEN credits_delta < 0 THEN -credits_delta ELSE 0 END), 0) AS used_credits,
            COALESCE(SUM(CASE WHEN credits_delta > 0 THEN credits_delta ELSE 0 END), 0) AS granted_credits,
            COALESCE(SUM(estimated_minor), 0) AS overage_estimated_minor
     FROM ac_agent_credit_ledger
     WHERE org_id=? AND environment=? AND period=?`,
    [a.org, a.environment, period],
  );

  const ledger = await dbAll(
    `SELECT id, actor, run_id, entry_type, credits_delta, estimated_minor, currency, reason, period, created_at
     FROM ac_agent_credit_ledger
     WHERE org_id=? AND environment=? AND period=?
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [a.org, a.environment, period],
  );

  const included = Number(account.monthly_credits_included || plan.included_credits);
  const bonus = Number(account.bonus_credits || 0);
  const totalAvailable = included + bonus;
  const used = Number(usageRow?.used_credits || 0);
  const remaining = Math.max(0, totalAvailable - used);
  const overageCredits = Math.max(0, used - totalAvailable);
  const overageMinor = overageCredits * Number(account.overage_unit_minor || plan.overage_unit_minor);
  const totalEstimatedMinor = plan.monthly_minor + overageMinor;

  return {
    billing_stream: 'separate_agent_credits',
    excluded_from_workspace_all_apps_cap: true,
    collection_enabled: false,
    classification: 'separate_agent_estimate',
    period,
    currency: 'KES',
    plan,
    available_plans: Object.values(AGENT_PLANS),
    credit_costs: AGENT_CREDIT_COSTS,
    included_credits: included,
    bonus_credits: bonus,
    total_credits_pool: totalAvailable,
    credits_used: used,
    credits_remaining: remaining,
    overage_credits: overageCredits,
    overage_unit_minor: Number(account.overage_unit_minor || plan.overage_unit_minor),
    plan_monthly_minor: plan.monthly_minor,
    overage_estimated_minor: overageMinor,
    total_estimated_minor: totalEstimatedMinor,
    amount_due_minor: 0,
    monthly_spend_cap_minor:
      account.monthly_spend_cap_minor === null ? null : Number(account.monthly_spend_cap_minor),
    hard_stop: !!account.hard_stop,
    ledger,
    policy_note:
      'Agent usage is billed on its own credit ledger separately from workspace apps and is excluded from the KSh 1,990/mo All-Apps ERP cap. All figures are evaluation estimates; collection remains disabled.',
  };
}

export async function consumeAgentCredits(
  a: Access,
  opts: {
    credits: number;
    runId: string;
    entryType: AgentCreditCategory;
    reason: string;
  },
): Promise<{ credits_used: number; estimated_minor: number; remaining_after: number }> {
  const period = billingPeriod();
  return dbTransaction(async () => {
    await lockWorkspace(a.org);
    const summary = await getAgentBillingSummary(a, period);
    const nextUsed = summary.credits_used + opts.credits;
    const nextOverage = Math.max(0, nextUsed - summary.total_credits_pool);
    const prevOverage = summary.overage_credits;
    const incrementalOverageCredits = Math.max(0, nextOverage - prevOverage);
    const incrementalMinor = incrementalOverageCredits * summary.overage_unit_minor;
    const projectedTotalMinor = summary.plan_monthly_minor + nextOverage * summary.overage_unit_minor;

    if (
      summary.hard_stop &&
      summary.monthly_spend_cap_minor !== null &&
      projectedTotalMinor > summary.monthly_spend_cap_minor
    ) {
      fail(
        429,
        `Agent monthly spend cap reached (${summary.currency} ${(summary.monthly_spend_cap_minor / 100).toFixed(2)}). Increase your Agent Billing cap or upgrade your Agent plan.`,
      );
    }

    await dbRun(
      `INSERT INTO ac_agent_credit_ledger
       (id, org_id, environment, actor, run_id, entry_type, credits_delta, estimated_minor, currency, reason, period, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'KES', ?, ?, ?)`,
      [
        randomUUID(),
        a.org,
        a.environment,
        a.actor,
        opts.runId,
        opts.entryType,
        -opts.credits,
        incrementalMinor,
        opts.reason,
        period,
        now(),
      ],
    );

    return {
      credits_used: opts.credits,
      estimated_minor: incrementalMinor,
      remaining_after: Math.max(0, summary.total_credits_pool - nextUsed),
    };
  });
}

export async function updateAgentBilling(
  a: Access,
  input: {
    plan_tier?: AgentPlanTier;
    monthly_spend_cap_minor?: number | null;
    hard_stop?: boolean;
  },
) {
  if (a.api || !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Workspace owner or admin is required to manage separate Agent Billing');
  }
  return dbTransaction(async () => {
    await lockWorkspace(a.org);
    const current = await ensureAgentBillingAccount(a);
    const nextTier: AgentPlanTier = input.plan_tier || (current.plan_tier as AgentPlanTier);
    const plan = AGENT_PLANS[nextTier];
    if (!plan) fail(400, 'Unknown Agent billing plan tier');

    const nextCap =
      input.monthly_spend_cap_minor === undefined
        ? current.monthly_spend_cap_minor
        : input.monthly_spend_cap_minor;
    const nextHardStop =
      input.hard_stop === undefined ? Number(current.hard_stop) : input.hard_stop ? 1 : 0;

    await dbRun(
      `UPDATE ac_agent_billing_accounts
       SET plan_tier=?, monthly_credits_included=?, overage_unit_minor=?, monthly_spend_cap_minor=?, hard_stop=?, updated_by=?, updated_at=?
       WHERE org_id=? AND environment=?`,
      [
        plan.id,
        plan.included_credits,
        plan.overage_unit_minor,
        nextCap,
        nextHardStop,
        a.actor,
        now(),
        a.org,
        a.environment,
      ],
    );
    await audit(a.org, a.actor, 'agent.billing_updated', plan.id);
    return getAgentBillingSummary(a);
  });
}

export async function grantEvaluationAgentCredits(a: Access, credits: number, reason: string) {
  if (a.api || !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Workspace owner or admin is required to add Agent evaluation credits');
  }
  if (a.environment === 'production') {
    fail(409, 'Sandbox evaluation credit packs are only available in sandbox evaluation');
  }
  return dbTransaction(async () => {
    await lockWorkspace(a.org);
    await ensureAgentBillingAccount(a);
    await dbRun(
      'UPDATE ac_agent_billing_accounts SET bonus_credits = bonus_credits + ?, updated_by=?, updated_at=? WHERE org_id=? AND environment=?',
      [credits, a.actor, now(), a.org, a.environment],
    );
    await dbRun(
      `INSERT INTO ac_agent_credit_ledger
       (id, org_id, environment, actor, run_id, entry_type, credits_delta, estimated_minor, currency, reason, period, created_at)
       VALUES (?, ?, ?, ?, NULL, 'credit_pack', ?, 0, 'KES', ?, ?, ?)`,
      [randomUUID(), a.org, a.environment, a.actor, credits, reason, billingPeriod(), now()],
    );
    await audit(a.org, a.actor, 'agent.credits_granted', String(credits));
    return getAgentBillingSummary(a);
  });
}
