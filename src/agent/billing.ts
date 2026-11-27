import { randomUUID } from 'node:crypto';
import { audit, fail, type Access } from '../platform/auth';
import { now } from '../platform/crypto';
import { billingPeriod } from '../marketplace/engine';
import { all, atomic, change, create } from '../operations/store';
import { runPythonAgent } from './python-bridge';

export type AgentPlanTier = 'agent_starter' | 'agent_growth' | 'agent_autonomous';
export type AgentCreditCategory =
  | 'analysis_read'
  | 'routine_run'
  | 'tool_action'
  | 'computer_use_session';

export const AGENT_CREDIT_COSTS: Record<AgentCreditCategory, number> = {
  analysis_read: 1,
  routine_run: 2,
  tool_action: 3,
  computer_use_session: 5,
};

const PLAN_DEFAULTS: Record<
  AgentPlanTier,
  { included_credits: number; overage_unit_minor: number }
> = {
  agent_starter: { included_credits: 50, overage_unit_minor: 1000 },
  agent_growth: { included_credits: 300, overage_unit_minor: 600 },
  agent_autonomous: { included_credits: 1000, overage_unit_minor: 400 },
};

async function getOrCreateAccount(a: Access) {
  const existing = (await all(a, 'agent_billing_account'))[0];
  if (existing) return existing;
  return create(a, 'agent_billing_account', {
    plan_tier: 'agent_starter',
    monthly_credits_included: 50,
    bonus_credits: 0,
    monthly_spend_cap_minor: 250000,
    hard_stop: true,
    overage_unit_minor: 1000,
    currency: 'KES',
    updated_by: a.actor,
  });
}

async function periodLedger(a: Access, period: string) {
  const rows = await all(a, 'agent_credit_ledger');
  return rows
    .filter((r) => r.period === period)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
}

/** Separate Agent Credit Billing summary computed by Python billing engine (`engines/agent/billing.py`). */
export async function getAgentBillingSummary(a: Access, period = billingPeriod()) {
  const account = await getOrCreateAccount(a);
  const ledger = await periodLedger(a, period);
  return runPythonAgent<any>({
    op: 'summarize_billing',
    plan_tier: account.plan_tier,
    period,
    monthly_credits_included: account.monthly_credits_included,
    bonus_credits: account.bonus_credits,
    overage_unit_minor: account.overage_unit_minor,
    monthly_spend_cap_minor: account.monthly_spend_cap_minor,
    hard_stop: account.hard_stop,
    ledger,
  });
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
  return atomic(a, async () => {
    const account = await getOrCreateAccount(a);
    const ledger = await periodLedger(a, period);
    const decision = await runPythonAgent<any>({
      op: 'evaluate_credit_charge',
      plan_tier: account.plan_tier,
      period,
      monthly_credits_included: account.monthly_credits_included,
      bonus_credits: account.bonus_credits,
      overage_unit_minor: account.overage_unit_minor,
      monthly_spend_cap_minor: account.monthly_spend_cap_minor,
      hard_stop: account.hard_stop,
      ledger,
      credits_requested: opts.credits,
    });
    if (!decision.allowed) {
      fail(decision.status || 429, decision.reason);
    }

    await create(
      a,
      'agent_credit_ledger',
      {
        actor: a.actor,
        run_id: opts.runId,
        entry_type: opts.entryType,
        credits_delta: -opts.credits,
        estimated_minor: decision.estimated_minor,
        currency: 'KES',
        reason: opts.reason,
        period,
      },
      randomUUID(),
    );

    return {
      credits_used: decision.credits_used,
      estimated_minor: decision.estimated_minor,
      remaining_after: decision.remaining_after,
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
  await atomic(a, async () => {
    const current = await getOrCreateAccount(a);
    const nextTier: AgentPlanTier = input.plan_tier || (current.plan_tier as AgentPlanTier);
    const planDefaults = PLAN_DEFAULTS[nextTier];
    if (!planDefaults) fail(400, 'Unknown Agent billing plan tier');

    await change(a, current, {
      plan_tier: nextTier,
      monthly_credits_included: planDefaults.included_credits,
      overage_unit_minor: planDefaults.overage_unit_minor,
      monthly_spend_cap_minor:
        input.monthly_spend_cap_minor === undefined
          ? current.monthly_spend_cap_minor
          : input.monthly_spend_cap_minor,
      hard_stop: input.hard_stop === undefined ? !!current.hard_stop : input.hard_stop,
      updated_by: a.actor,
      updated_at: now(),
    });
    await audit(a.org, a.actor, 'agent.billing_updated', nextTier);
  });
  return getAgentBillingSummary(a);
}

export async function grantEvaluationAgentCredits(a: Access, credits: number, reason: string) {
  if (a.api || !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Workspace owner or admin is required to add Agent evaluation credits');
  }
  if (a.environment === 'production') {
    fail(409, 'Sandbox evaluation credit packs are only available in sandbox evaluation');
  }
  await atomic(a, async () => {
    const current = await getOrCreateAccount(a);
    await change(a, current, {
      bonus_credits: Number(current.bonus_credits || 0) + credits,
      updated_by: a.actor,
    });
    await create(a, 'agent_credit_ledger', {
      actor: a.actor,
      run_id: null,
      entry_type: 'credit_pack',
      credits_delta: credits,
      estimated_minor: 0,
      currency: 'KES',
      reason,
      period: billingPeriod(),
    });
    await audit(a.org, a.actor, 'agent.credits_granted', String(credits));
  });
  return getAgentBillingSummary(a);
}
