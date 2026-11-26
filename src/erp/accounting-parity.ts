import { z } from 'zod';
import { dbAll } from '../db/adapter';
import { fail, type Access } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { requireServices } from '../marketplace/engine';
import { accountingPython } from './bank-python';
import { recordHubEvent } from './apps-17-26';
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

const cashFlowSchema = z.object({
  opening_cash_minor: z.number().int(),
  operating: z.object({
    inflow_minor: z.number().int(),
    outflow_minor: z.number().int(),
    net_minor: z.number().int(),
  }),
  investing: z.object({
    inflow_minor: z.number().int(),
    outflow_minor: z.number().int(),
    net_minor: z.number().int(),
  }),
  financing: z.object({
    inflow_minor: z.number().int(),
    outflow_minor: z.number().int(),
    net_minor: z.number().int(),
  }),
  net_change_minor: z.number().int(),
  closing_cash_minor: z.number().int(),
  movement_count: z.number().int(),
});

const fxRevalSchema = z.object({
  base_currency: z.string(),
  lines: z.array(
    z.object({
      reference: z.string(),
      currency: z.string(),
      foreign_amount_minor: z.number().int(),
      booked_rate_micros: z.number().int(),
      closing_rate_micros: z.number().int(),
      booked_base_minor: z.number().int(),
      revalued_base_minor: z.number().int(),
      unrealized_delta_minor: z.number().int(),
    }),
  ),
  total_unrealized_gain_minor: z.number().int(),
  total_unrealized_loss_minor: z.number().int(),
  net_unrealized_minor: z.number().int(),
});

const budgetVarianceSchema = z.object({
  lines: z.array(
    z.object({
      analytic_account_id: z.string(),
      name: z.string(),
      planned_minor: z.number().int(),
      actual_minor: z.number().int(),
      variance_minor: z.number().int(),
      achievement_bps: z.number().int(),
      over_budget: z.boolean(),
    }),
  ),
  total_planned_minor: z.number().int(),
  total_actual_minor: z.number().int(),
  total_variance_minor: z.number().int(),
  total_achievement_bps: z.number().int(),
});

const followupEvalSchema = z.object({
  actions: z.array(
    z.object({
      invoice_id: z.string(),
      customer_id: z.string(),
      days_overdue: z.number().int(),
      amount_due_minor: z.number().int(),
      level_id: z.string(),
      level_name: z.string(),
      channel: z.string(),
      auto_send: z.boolean(),
    }),
  ),
  action_count: z.number().int(),
  total_overdue_minor: z.number().int(),
});

const batchPaymentSchema = z.object({
  currency: z.string(),
  payment_count: z.number().int(),
  total_minor: z.number().int(),
  rows: z.array(
    z.object({
      payment_id: z.string(),
      partner_name: z.string(),
      reference: z.string(),
      amount_minor: z.number().int(),
      currency: z.string(),
    }),
  ),
});

// 1. Classified Cash Flow Statement
export async function computeCashFlowStatement(a: Access, input: unknown) {
  const d = z
    .object({
      currency: currencySchema.default('KES'),
      opening_cash_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000).default(0),
      period_start: day.optional(),
      period_end: day.optional(),
      movements: z
        .array(
          z
            .object({
              activity: z.enum(['operating', 'investing', 'financing']),
              label: text(160).optional(),
              amount_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000),
            })
            .strict(),
        )
        .max(500)
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['accounting']);
  const result = await accountingPython(
    'financial_statements_treasury',
    { op: 'cash_flow_statement', opening_cash_minor: d.opening_cash_minor, movements: d.movements },
    cashFlowSchema,
  );
  return {
    currency: d.currency,
    period_start: d.period_start || null,
    period_end: d.period_end || null,
    ...result,
  };
}

// 2. Multi-Currency FX Revaluation
export async function listFxRevaluations(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'fx_revaluation_run');
  return { revaluations: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function runFxRevaluation(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      as_of: day,
      base_currency: currencySchema.default('KES'),
      positions: z
        .array(
          z
            .object({
              reference: text(80),
              currency: currencySchema,
              foreign_amount_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000),
              booked_rate_micros: z.number().int().min(1).max(1_000_000_000_000),
              closing_rate_micros: z.number().int().min(1).max(1_000_000_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .parse(input);
  const calc = await accountingPython(
    'financial_statements_treasury',
    { op: 'fx_revaluation', base_currency: d.base_currency, positions: d.positions },
    fxRevalSchema,
  );
  return operation(
    a,
    'accounting.fx_revaluation.run',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(
        a,
        'fx_revaluation_run',
        { as_of: d.as_of, ...calc, computed_at: new Date().toISOString() },
        { status: 'computed' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// 3. Analytic Accounts & Budgets vs Actual
export async function listAnalyticAccounts(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'analytic_account');
  return { analytic_accounts: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createAnalyticAccount(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      code: text(40),
      name: text(140),
      plan: text(80).default('Departments'),
      currency: currencySchema.default('KES'),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'accounting.analytic_account.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(
        a,
        'analytic_account',
        { code: d.code.toUpperCase(), name: d.name, plan: d.plan, currency: d.currency },
        { status: 'active' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function listBudgets(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'analytic_budget');
  return { budgets: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createBudget(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: text(140),
      period_start: day,
      period_end: day,
      currency: currencySchema.default('KES'),
      lines: z
        .array(
          z
            .object({
              analytic_account_id: text(80),
              name: text(140),
              planned_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000),
              actual_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000).default(0),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(input);
  const summary = await accountingPython(
    'financial_statements_treasury',
    { op: 'budget_variance', lines: d.lines },
    budgetVarianceSchema,
  );
  return operation(
    a,
    'accounting.budget.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(
        a,
        'analytic_budget',
        {
          name: d.name,
          period_start: d.period_start,
          period_end: d.period_end,
          currency: d.currency,
          ...summary,
        },
        { status: 'confirmed' },
      );
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function evaluateBudget(a: Access, budgetId: string, input: unknown) {
  const d = z
    .object({
      actuals: z
        .array(
          z
            .object({
              analytic_account_id: text(80),
              actual_minor: z.number().int().min(-100_000_000_000).max(100_000_000_000),
            })
            .strict(),
        )
        .max(100)
        .default([]),
    })
    .strict()
    .parse(input || {});
  await requireServices(a, ['accounting']);
  const budget = (await records(a, 'analytic_budget')).find((r) => r.id === budgetId);
  if (!budget) {
    fail(404, 'Budget not found');
    throw new Error('Budget not found');
  }
  const actualMap = new Map(d.actuals.map((x) => [x.analytic_account_id, x.actual_minor]));
  const mergedLines = (Array.isArray(budget.data.lines) ? budget.data.lines : []).map(
    (line: any) => ({
      analytic_account_id: String(line.analytic_account_id || ''),
      name: String(line.name || ''),
      planned_minor: Number(line.planned_minor || 0),
      actual_minor: actualMap.has(String(line.analytic_account_id))
        ? actualMap.get(String(line.analytic_account_id))!
        : Number(line.actual_minor || 0),
    }),
  );
  const variance = await accountingPython(
    'financial_statements_treasury',
    { op: 'budget_variance', lines: mergedLines },
    budgetVarianceSchema,
  );
  return { budget_id: budget.id, name: budget.data.name, ...variance };
}

// 4. Payment Follow-ups / Dunning Levels
export async function listFollowupLevels(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'followup_level');
  return {
    levels: rows
      .map((r) => ({ id: r.id, status: r.status, ...r.data }))
      .sort((x: any, y: any) => Number(x.days_overdue || 0) - Number(y.days_overdue || 0)),
  };
}

export async function createFollowupLevel(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: text(120),
      days_overdue: z.number().int().min(1).max(3650),
      channel: z.enum(['email', 'sms', 'whatsapp', 'letter']).default('email'),
      auto_send: z.boolean().default(false),
      message_template: text(500).optional(),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'accounting.followup_level.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(a, 'followup_level', d, { status: 'active' });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

export async function evaluateFollowups(a: Access, input: unknown) {
  const d = z
    .object({
      invoices: z
        .array(
          z
            .object({
              invoice_id: text(80),
              customer_id: text(80),
              days_overdue: z.number().int().min(0).max(3650),
              amount_due_minor: z.number().int().min(0).max(100_000_000_000),
            })
            .strict(),
        )
        .max(500)
        .default([]),
    })
    .strict()
    .parse(input);
  await requireServices(a, ['accounting']);
  const levels = (await records(a, 'followup_level'))
    .filter((r) => r.status === 'active')
    .map((r) => ({ id: r.id, ...r.data }));
  return accountingPython(
    'financial_statements_treasury',
    { op: 'followup_evaluate', levels, invoices: d.invoices },
    followupEvalSchema,
  );
}

// 5. Batch Payments & Bank Remittance Export
export async function listBatchPayments(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'batch_payment');
  return { batches: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createBatchPayment(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      name: text(140),
      direction: z.enum(['inbound', 'outbound']).default('outbound'),
      method: z.enum(['sepa', 'bank_transfer', 'mobile_money', 'cheque']).default('bank_transfer'),
      currency: currencySchema.default('KES'),
      batch_date: day,
      payments: z
        .array(
          z
            .object({
              payment_id: text(80),
              partner_name: text(140),
              reference: text(80),
              amount_minor: z.number().int().min(1).max(100_000_000_000),
              currency: currencySchema.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .parse(input);
  const summary = await accountingPython(
    'financial_statements_treasury',
    {
      op: 'batch_payment_summary',
      currency: d.currency,
      payments: d.payments.map((p) => ({ ...p, currency: p.currency || d.currency })),
    },
    batchPaymentSchema,
  );
  const csvHeader = 'payment_id,partner_name,reference,amount_minor,currency';
  const csvLines = summary.rows.map(
    (r) =>
      `${r.payment_id},"${r.partner_name.replace(/"/g, '""')}","${r.reference.replace(/"/g, '""')}",${r.amount_minor},${r.currency}`,
  );
  const remittanceCsv = [csvHeader, ...csvLines].join('\n');

  return operation(
    a,
    'accounting.batch_payment.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const rec = await insert(
        a,
        'batch_payment',
        {
          name: d.name,
          direction: d.direction,
          method: d.method,
          batch_date: d.batch_date,
          ...summary,
          remittance_csv: remittanceCsv,
        },
        { status: 'ready' },
      );
      await recordHubEvent(a, {
        source_app: 'accounting',
        target_app: 'finance',
        event_type: 'batch_payment.ready',
        source_id: rec.id,
        target_id: rec.id,
        summary: `Batch remittance ${d.name} (${summary.payment_count} payments, ${d.currency} ${(summary.total_minor / 100).toFixed(2)}) ready for settlement`,
      });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}

// 6. Debit Notes
export async function listDebitNotes(a: Access) {
  await requireServices(a, ['accounting']);
  const rows = await records(a, 'debit_note');
  return { debit_notes: rows.map((r) => ({ id: r.id, status: r.status, ...r.data })) };
}

export async function createDebitNote(a: Access, input: unknown, key: string) {
  const d = z
    .object({
      original_invoice_id: text(80),
      reason: text(240),
      issue_date: day,
      currency: currencySchema.default('KES'),
      amount_minor: z.number().int().min(1).max(100_000_000_000),
      partner_id: text(80).optional(),
    })
    .strict()
    .parse(input);
  return operation(
    a,
    'accounting.debit_note.create',
    key,
    d,
    () => requireServices(a, ['accounting']),
    async () => {
      const existing = await records(a, 'debit_note');
      const number = `DN-${String(existing.length + 1).padStart(4, '0')}`;
      const rec = await insert(
        a,
        'debit_note',
        { number, ...d, created_at: new Date().toISOString() },
        { status: 'posted' },
      );
      await recordHubEvent(a, {
        source_app: 'accounting',
        target_app: 'sales',
        event_type: 'debit_note.posted',
        source_id: rec.id,
        target_id: d.original_invoice_id,
        summary: `Posted debit note ${number} linked to invoice ${d.original_invoice_id}`,
      });
      return { id: rec.id, status: rec.status, ...rec.data };
    },
  );
}
