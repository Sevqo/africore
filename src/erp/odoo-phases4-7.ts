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

async function records(a: Access, kind: ERPKind) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at,id',
      [...scope(a), kind],
    )
  ).map((row) => decode(a, row));
}

async function getOne(a: Access, id: string, kind: ERPKind, label: string) {
  const row = await dbGet(
    'SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',
    [uuid.parse(id), ...scope(a), kind],
  );
  if (!row) fail(404, label + ' not found');
  return decode(a, row);
}

// ---------------------------------------------------------------------------
// PHASE 4: POS Cash Drawer Control & Loyalty Programs
// ---------------------------------------------------------------------------
const cashCountInput = z
  .object({
    session_ref: z.string().trim().min(2).max(120),
    currency: currencySchema.default('KES'),
    opening_minor: z.number().int().min(0).max(100_000_000_000),
    cash_sales_minor: z.number().int().min(0).max(100_000_000_000),
    cash_in_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    cash_out_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    denominations: z
      .array(
        z
          .object({
            denomination_minor: z.number().int().positive().max(100_000_000),
            count: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .max(100),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

const cashCountResultSchema = z
  .object({
    opening_minor: z.number().int(),
    expected_minor: z.number().int(),
    counted_minor: z.number().int(),
    variance_minor: z.number().int(),
    status: z.enum(['balanced', 'overage', 'shortage']),
    breakdown: z.array(
      z
        .object({
          denomination_minor: z.number().int(),
          count: z.number().int(),
          subtotal_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const loyaltyProgramInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    currency: currencySchema.default('KES'),
    points_per_1000_minor: z.number().int().min(0).max(10000),
    minor_per_point: z.number().int().min(0).max(1_000_000),
    active: z.boolean().default(true),
  })
  .strict();

const loyaltyCalcInput = z
  .object({
    order_total_minor: z.number().int().min(0).max(100_000_000_000),
    points_per_1000_minor: z.number().int().min(0).max(10000),
    redeem_points: z.number().int().min(0).max(10_000_000),
    available_points: z.number().int().min(0).max(10_000_000),
    minor_per_point: z.number().int().min(0).max(1_000_000),
  })
  .strict();

const loyaltyCalcResultSchema = z
  .object({
    order_total_minor: z.number().int(),
    redeemed_points: z.number().int(),
    discount_minor: z.number().int(),
    net_payable_minor: z.number().int(),
    earned_points: z.number().int(),
    ending_points: z.number().int(),
  })
  .strict();

export async function evaluatePosCashCount(a: Access, input: unknown) {
  await requireServices(a, ['pos']);
  const d = cashCountInput.parse(input);
  return accountingPython('pos_session', { op: 'cash_count', ...d }, cashCountResultSchema);
}

export async function listPosCashCounts(a: Access) {
  await requireServices(a, ['pos']);
  return {
    data: (await records(a, 'pos_cash_count'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createPosCashCount(a: Access, input: unknown, key: string) {
  const d = cashCountInput.parse(input);
  return operation(
    a,
    'pos.cash_count.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const result = await accountingPython(
        'pos_session',
        { op: 'cash_count', ...d },
        cashCountResultSchema,
      );
      const saved = await insert(
        a,
        'pos_cash_count',
        { ...d, result, counted_by: a.actor },
        { status: result.status },
      );
      await audit(a.org, a.actor, 'pos.cash_count_recorded', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function listPosLoyaltyPrograms(a: Access) {
  await requireServices(a, ['pos']);
  return {
    data: (await records(a, 'pos_loyalty_program'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createPosLoyaltyProgram(a: Access, input: unknown, key: string) {
  const d = loyaltyProgramInput.parse(input);
  return operation(
    a,
    'pos.loyalty_program.create',
    key,
    d,
    () => requireServices(a, ['pos']),
    async () => {
      const saved = await insert(a, 'pos_loyalty_program', d, {
        status: d.active ? 'active' : 'archived',
      });
      await audit(a.org, a.actor, 'pos.loyalty_program_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function calculatePosLoyalty(a: Access, input: unknown) {
  await requireServices(a, ['pos']);
  const d = loyaltyCalcInput.parse(input);
  return accountingPython('pos_session', { op: 'loyalty', ...d }, loyaltyCalcResultSchema);
}

// ---------------------------------------------------------------------------
// PHASE 5: CRM Lead Scoring, Weighted Forecast & Scheduled Activities
// ---------------------------------------------------------------------------
const crmScoreInput = z
  .object({
    has_email: z.boolean().default(false),
    has_phone: z.boolean().default(false),
    has_company: z.boolean().default(false),
    expected_revenue_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    activities_completed: z.number().int().min(0).max(1000).default(0),
    days_stale: z.number().int().min(0).max(3650).default(0),
  })
  .strict();

const crmScoreResultSchema = z
  .object({
    score: z.number().int(),
    tier: z.enum(['hot', 'warm', 'cold']),
    suggested_probability_bps: z.number().int(),
  })
  .strict();

const crmForecastInput = z
  .object({
    leads: z
      .array(
        z
          .object({
            stage: z.string().trim().min(1).max(80),
            currency: currencySchema.default('KES'),
            expected_revenue_minor: z.number().int().min(0).max(100_000_000_000),
            probability_bps: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();

const crmForecastResultSchema = z
  .object({
    by_stage: z.array(
      z
        .object({
          stage: z.string(),
          currency: z.string(),
          count: z.number().int(),
          expected_revenue_minor: z.number().int(),
          weighted_revenue_minor: z.number().int(),
        })
        .strict(),
    ),
    totals_by_currency: z.record(
      z.string(),
      z
        .object({
          count: z.number().int(),
          expected_revenue_minor: z.number().int(),
          weighted_revenue_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const crmActivityInput = z
  .object({
    lead_ref: z.string().trim().min(1).max(120),
    activity_type: z.enum(['call', 'meeting', 'email', 'todo']),
    summary: z.string().trim().min(2).max(200),
    due_on: day,
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

const crmActivityPatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['planned', 'done', 'cancelled']),
    outcome: z.string().trim().max(1000).default(''),
  })
  .strict();

export async function evaluateCrmScore(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  return accountingPython('crm_forecast', { op: 'score', ...crmScoreInput.parse(input) }, crmScoreResultSchema);
}

export async function evaluateCrmWeightedForecast(a: Access, input: unknown) {
  await requireServices(a, ['crm']);
  return accountingPython(
    'crm_forecast',
    { op: 'forecast', ...crmForecastInput.parse(input) },
    crmForecastResultSchema,
  );
}

export async function listCrmScheduledActivities(a: Access) {
  await requireServices(a, ['crm']);
  return {
    data: (await records(a, 'crm_scheduled_activity'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createCrmScheduledActivity(a: Access, input: unknown, key: string) {
  const d = crmActivityInput.parse(input);
  return operation(
    a,
    'crm.scheduled_activity.create',
    key,
    d,
    () => requireServices(a, ['crm']),
    async () => {
      const saved = await insert(a, 'crm_scheduled_activity', { ...d, owner_id: a.actor }, {
        status: 'planned',
        due: d.due_on,
      });
      await audit(a.org, a.actor, 'crm.activity_scheduled', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function updateCrmScheduledActivity(
  a: Access,
  actId: string,
  input: unknown,
  key: string,
) {
  const d = crmActivityPatchInput.parse(input);
  return operation(
    a,
    'crm.scheduled_activity.update:' + actId,
    key,
    d,
    () => requireServices(a, ['crm']),
    async () => {
      const old = await getOne(a, actId, 'crm_scheduled_activity', 'Scheduled activity');
      if (old.version !== d.expected_version) fail(409, 'Activity changed; reload');
      const saved = await update(
        a,
        old,
        { ...old.data, outcome: d.outcome },
        { status: d.status },
        'activity_' + d.status,
      );
      await audit(a.org, a.actor, 'crm.activity_' + d.status, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

// ---------------------------------------------------------------------------
// PHASE 6: Work Milestones & Billable Timesheets
// ---------------------------------------------------------------------------
const milestoneInput = z
  .object({
    project_ref: z.string().trim().min(1).max(120),
    name: z.string().trim().min(2).max(200),
    target_on: day,
    progress_pct: z.number().int().min(0).max(100).default(0),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

const milestonePatchInput = z
  .object({
    expected_version: z.number().int().positive(),
    progress_pct: z.number().int().min(0).max(100).optional(),
    status: z.enum(['open', 'reached', 'cancelled']).optional(),
  })
  .strict();

const workBillingInput = z
  .object({
    project_ref: z.string().trim().min(1).max(120),
    currency: currencySchema.default('KES'),
    budget_minor: z.number().int().min(0).max(100_000_000_000).default(0),
    entries: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            minutes: z.number().int().positive().max(100_000),
            hourly_rate_minor: z.number().int().min(0).max(10_000_000),
            hourly_cost_minor: z.number().int().min(0).max(10_000_000),
            billable: z.boolean().default(true),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();

const workBillingResultSchema = z
  .object({
    billable_minutes: z.number().int(),
    non_billable_minutes: z.number().int(),
    total_minutes: z.number().int(),
    billable_minor: z.number().int(),
    cost_minor: z.number().int(),
    margin_minor: z.number().int(),
    budget_minor: z.number().int(),
    budget_burn_bps: z.number().int(),
    over_budget: z.boolean(),
    lines: z.array(
      z
        .object({
          id: z.string(),
          minutes: z.number().int(),
          billable: z.boolean(),
          billable_minor: z.number().int(),
          cost_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

export async function listWorkMilestones(a: Access) {
  await requireServices(a, ['work']);
  return {
    data: (await records(a, 'work_milestone'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createWorkMilestone(a: Access, input: unknown, key: string) {
  const d = milestoneInput.parse(input);
  return operation(
    a,
    'work.milestone.create',
    key,
    d,
    () => requireServices(a, ['work']),
    async () => {
      const saved = await insert(a, 'work_milestone', d, {
        status: d.progress_pct >= 100 ? 'reached' : 'open',
        due: d.target_on,
      });
      await audit(a.org, a.actor, 'work.milestone_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function updateWorkMilestone(a: Access, id: string, input: unknown, key: string) {
  const d = milestonePatchInput.parse(input);
  return operation(
    a,
    'work.milestone.update:' + id,
    key,
    d,
    () => requireServices(a, ['work']),
    async () => {
      const old = await getOne(a, id, 'work_milestone', 'Milestone');
      if (old.version !== d.expected_version) fail(409, 'Milestone changed; reload');
      const nextPct = d.progress_pct ?? old.data.progress_pct;
      const nextStatus = d.status ?? (nextPct >= 100 ? 'reached' : old.status);
      const saved = await update(
        a,
        old,
        { ...old.data, progress_pct: nextPct },
        { status: nextStatus },
        'milestone_' + nextStatus,
      );
      await audit(a.org, a.actor, 'work.milestone_updated', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function evaluateWorkBilling(a: Access, input: unknown) {
  await requireServices(a, ['work']);
  const d = workBillingInput.parse(input);
  return accountingPython('work_billing', d, workBillingResultSchema);
}

export async function listWorkBillingSummaries(a: Access) {
  await requireServices(a, ['work']);
  return {
    data: (await records(a, 'work_billing_summary'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createWorkBillingSummary(a: Access, input: unknown, key: string) {
  const d = workBillingInput.parse(input);
  return operation(
    a,
    'work.billing_summary.create',
    key,
    d,
    () => requireServices(a, ['work']),
    async () => {
      const result = await accountingPython('work_billing', d, workBillingResultSchema);
      const saved = await insert(
        a,
        'work_billing_summary',
        { ...d, result, created_by: a.actor },
        { status: result.over_budget ? 'over_budget' : 'within_budget' },
      );
      await audit(a.org, a.actor, 'work.billing_summary_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

// ---------------------------------------------------------------------------
// PHASE 7: People Payroll Engine & Leave Allocations
// ---------------------------------------------------------------------------
const payrollInput = z
  .object({
    period_label: z.string().trim().min(2).max(80),
    pay_date: day,
    currency: currencySchema.default('KES'),
    tax_brackets: z
      .array(
        z
          .object({
            up_to_minor: z.number().int().positive().nullable(),
            rate_bps: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    employees: z
      .array(
        z
          .object({
            employee_id: z.string().trim().min(1).max(80),
            name: z.string().trim().min(1).max(200),
            base_salary_minor: z.number().int().min(0).max(100_000_000_000),
            allowances_minor: z.number().int().min(0).max(100_000_000_000).default(0),
            pre_tax_deductions_minor: z.number().int().min(0).max(100_000_000_000).default(0),
            post_tax_deductions_minor: z.number().int().min(0).max(100_000_000_000).default(0),
            tax_relief_minor: z.number().int().min(0).max(100_000_000_000).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

const payrollResultSchema = z
  .object({
    totals: z
      .object({
        gross_minor: z.number().int(),
        tax_minor: z.number().int(),
        total_deductions_minor: z.number().int(),
        net_pay_minor: z.number().int(),
      })
      .strict(),
    payslips: z.array(
      z
        .object({
          employee_id: z.string(),
          name: z.string(),
          gross_minor: z.number().int(),
          taxable_minor: z.number().int(),
          tax_minor: z.number().int(),
          total_deductions_minor: z.number().int(),
          net_pay_minor: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();

const payrollApproveInput = z
  .object({
    expected_version: z.number().int().positive(),
    decision: z.enum(['approve', 'cancel']),
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();

const leaveAllocationInput = z
  .object({
    employee_name: z.string().trim().min(2).max(200),
    leave_type: z.enum(['annual', 'sick', 'parental', 'compassionate', 'unpaid']),
    year: z.number().int().min(2020).max(2100),
    allocated_days_tenths: z.number().int().min(0).max(3650),
    used_days_tenths: z.number().int().min(0).max(3650).default(0),
  })
  .strict();

export async function previewPayroll(a: Access, input: unknown) {
  await requireServices(a, ['people']);
  const d = payrollInput.parse(input);
  return accountingPython('payroll', d, payrollResultSchema);
}

export async function listPayrollRuns(a: Access) {
  await requireServices(a, ['people']);
  return {
    data: (await records(a, 'people_payroll_run'))
      .map((r) => ({ id: r.id, version: r.version, status: r.status, created_at: r.created_at, ...r.data }))
      .reverse(),
  };
}

export async function createPayrollRun(a: Access, input: unknown, key: string) {
  const d = payrollInput.parse(input);
  return operation(
    a,
    'people.payroll_run.create',
    key,
    d,
    () => requireServices(a, ['people']),
    async () => {
      const result = await accountingPython('payroll', d, payrollResultSchema);
      const saved = await insert(
        a,
        'people_payroll_run',
        { ...d, result, prepared_by: a.actor },
        { status: 'draft', due: d.pay_date },
      );
      await audit(a.org, a.actor, 'people.payroll_run_created', saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function decidePayrollRun(a: Access, runId: string, input: unknown, key: string) {
  const d = payrollApproveInput.parse(input);
  return operation(
    a,
    'people.payroll_run.decide:' + runId,
    key,
    d,
    () => requireServices(a, ['people']),
    async () => {
      const old = await getOne(a, runId, 'people_payroll_run', 'Payroll run');
      if (old.version !== d.expected_version) fail(409, 'Payroll run changed; reload');
      if (old.status !== 'draft') fail(409, 'Only draft payroll runs can be approved or cancelled');
      if (d.decision === 'approve' && old.data.prepared_by === a.actor)
        fail(403, 'A different manager must approve the payroll run');
      const next = d.decision === 'approve' ? 'approved' : 'cancelled';
      const saved = await update(
        a,
        old,
        { ...old.data, decided_by: a.actor, decision_reason: d.reason },
        { status: next },
        'payroll_' + next,
      );
      await audit(a.org, a.actor, 'people.payroll_run_' + next, saved.id);
      return { id: saved.id, version: saved.version, status: saved.status, ...saved.data };
    },
  );
}

export async function listLeaveAllocations(a: Access) {
  await requireServices(a, ['people']);
  return {
    data: (await records(a, 'people_leave_allocation'))
      .map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        created_at: r.created_at,
        ...r.data,
        remaining_days_tenths: Math.max(
          0,
          Number(r.data.allocated_days_tenths || 0) - Number(r.data.used_days_tenths || 0),
        ),
      }))
      .reverse(),
  };
}

export async function createLeaveAllocation(a: Access, input: unknown, key: string) {
  const d = leaveAllocationInput.parse(input);
  return operation(
    a,
    'people.leave_allocation.create',
    key,
    d,
    () => requireServices(a, ['people']),
    async () => {
      const saved = await insert(a, 'people_leave_allocation', d, { status: 'active' });
      await audit(a.org, a.actor, 'people.leave_allocation_created', saved.id);
      return {
        id: saved.id,
        version: saved.version,
        status: saved.status,
        ...saved.data,
        remaining_days_tenths: Math.max(0, d.allocated_days_tenths - d.used_days_tenths),
      };
    },
  );
}
