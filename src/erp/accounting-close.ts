import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { sumMinor } from '../finance/money';
import { type Access, audit, fail } from '../platform/auth';
import { hash, now } from '../platform/crypto';
import { accountingAccess, accountingSettings } from './accounting';
import { currentMember, decode, insert, operation, update, type ERPKind } from './store';

const day = z.iso.date();
const id = z.uuid();
const reason = z.string().trim().min(8).max(1000);
const scope = (a: Access) => [a.org, a.environment];
const yearKind = 'accounting_fiscal_year';
const reviewKind = 'accounting_period_review';
const lockKind = 'accounting_lock_dates';
const lockFields = ['sales', 'purchases', 'tax', 'all'] as const;
const emptyLocks = { sales: null, purchases: null, tax: null, all: null };

export const fiscalYearInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    starts_on: day,
    ends_on: day,
  })
  .strict()
  .refine((d) => d.starts_on <= d.ends_on, 'Fiscal dates must be ordered');
export const lockDatesInput = z
  .object({
    expected_version: z.number().int().nonnegative(),
    sales: day.nullable(),
    purchases: day.nullable(),
    tax: day.nullable(),
    all: day.nullable(),
    reason,
  })
  .strict();
export const periodReviewInput = z
  .object({
    action: z.enum(['request', 'approve', 'close', 'cancel', 'request_reopen', 'reopen']),
    expected_version: z.number().int().nonnegative(),
    expected_period_version: z.number().int().positive(),
    reason,
  })
  .strict();

async function records(a: Access, kind: ERPKind, parent?: string) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=?' +
        (parent ? ' AND parent_id=?' : '') +
        ' ORDER BY created_at,id',
      [...scope(a), kind, ...(parent ? [parent] : [])],
    )
  ).map((row) => decode(a, row));
}

export async function fiscalYears(a: Access) {
  await accountingAccess(a);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  const periods = await dbAll(
    'SELECT id,name,starts_on,ends_on,status,version FROM ac_accounting_periods WHERE org_id=? AND environment=? ORDER BY starts_on',
    scope(a),
  );
  return {
    today,
    data: (await records(a, yearKind))
      .map((year) => ({
        id: year.id,
        ...year.data,
        current: year.data.starts_on <= today && year.data.ends_on >= today,
        periods: periods.filter(
          (p) => p.starts_on >= year.data.starts_on && p.ends_on <= year.data.ends_on,
        ),
      }))
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on)),
  };
}

export async function enforceFiscalPeriodBoundary(a: Access, from: string, to: string) {
  const years = await records(a, yearKind);
  if (!years.some(({ data }) => data.starts_on <= to && data.ends_on >= from)) return;
  if (!years.some(({ data }) => data.starts_on <= from && data.ends_on >= to))
    fail(409, 'An accounting period cannot cross a configured fiscal-year boundary');
}

export async function createFiscalYear(a: Access, input: unknown, key: string) {
  const d = fiscalYearInput.parse(input);
  return operation(
    a,
    'accounting.fiscal_year.create',
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      await accountingSettings(a);
      const years = await records(a, yearKind);
      if (years.some(({ data }) => data.starts_on <= d.ends_on && data.ends_on >= d.starts_on))
        fail(409, 'Fiscal years cannot overlap');
      if (
        await dbGet(
          'SELECT id FROM ac_accounting_periods WHERE org_id=? AND environment=? AND starts_on<=? AND ends_on>=? AND (starts_on<? OR ends_on>?)',
          [...scope(a), d.ends_on, d.starts_on, d.starts_on, d.ends_on],
        )
      )
        fail(409, 'Fiscal year would split an existing accounting period');
      return insert(a, yearKind, d, { due: d.ends_on });
    },
  );
}

export async function lockDates(a: Access) {
  await accountingAccess(a);
  const record = (await records(a, lockKind))[0];
  return {
    version: record?.version ?? 0,
    dates: record?.data.dates ?? emptyLocks,
    history: record ? await history(a, record.id) : [],
  };
}

export async function saveLockDates(a: Access, input: unknown, key: string) {
  const d = lockDatesInput.parse(input);
  return operation(
    a,
    'accounting.lock_dates.save',
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      const settings = await accountingSettings(a);
      const old = (await records(a, lockKind))[0];
      if ((old?.version ?? 0) !== d.expected_version) fail(409, 'Lock dates changed; reload');
      const dates = { sales: d.sales, purchases: d.purchases, tax: d.tax, all: d.all };
      if (Object.values(dates).some((date) => date && date < settings.start_on))
        fail(400, 'Lock dates must be on or after the reviewed start');
      const data = { dates, previous: old?.data.dates ?? emptyLocks, reason: d.reason };
      const value = old
        ? await update(a, old, data, {}, 'lock_dates_changed')
        : await insert(a, lockKind, data);
      await audit(a.org, a.actor, 'accounting.lock_dates_changed', value.id);
      return { version: value.version, dates };
    },
  );
}

export async function enforceLockDates(
  a: Access,
  date: string,
  journalId: string,
  source = 'manual',
  taxMinor = 0,
  accountIds: string[] = [],
) {
  const record = (await records(a, lockKind))[0];
  if (!record) return;
  const dates = record.data.dates as Record<(typeof lockFields)[number], string | null>;
  if (dates.all && date <= dates.all) fail(409, 'All accounting entries are locked on this date');
  if (!dates.sales && !dates.purchases && !dates.tax) return;
  const journal = await dbGet(
    'SELECT code FROM ac_accounting_journals WHERE org_id=? AND environment=? AND id=?',
    [...scope(a), journalId],
  );
  const sales =
    ['invoice', 'credit_note', 'pos_sale'].includes(source) || journal?.code === 'SALES';
  const purchases =
    ['supplier_bill', 'supplier_credit', 'expense'].includes(source) ||
    journal?.code === 'PURCHASE';
  if (sales && dates.sales && date <= dates.sales)
    fail(409, 'Sales entries are locked on this date');
  if (purchases && dates.purchases && date <= dates.purchases)
    fail(409, 'Purchase entries are locked on this date');
  if (dates.tax && date <= dates.tax) {
    const settings = await accountingSettings(a);
    const taxAccounts = new Set([settings.data.accounts['2100'], settings.data.accounts['1300']]);
    const configured = await records(a, 'accounting_tax_code');
    for (const code of configured) taxAccounts.add(code.data.account_id);
    if (
      taxMinor ||
      source === 'configured_tax_entry' ||
      accountIds.some((account) => taxAccounts.has(account))
    )
      fail(409, 'Tax-sensitive entries are locked on this date');
  }
}

async function period(a: Access, periodId: string) {
  const value = await dbGet(
    'SELECT * FROM ac_accounting_periods WHERE org_id=? AND environment=? AND id=?',
    [...scope(a), id.parse(periodId)],
  );
  if (!value) fail(404, 'Accounting period not found');
  return { ...value, version: Number(value.version) };
}

async function history(a: Access, recordId: string) {
  return dbAll(
    'SELECT version,actor,action,created_at FROM ac_erp_history WHERE org_id=? AND environment=? AND resource_id=? ORDER BY version DESC LIMIT 100',
    [...scope(a), recordId],
  );
}

export async function ensureDirectPeriodStateAllowed(a: Access, periodId: string) {
  const review = (await records(a, reviewKind, periodId))[0];
  if (review && review.status !== 'open')
    fail(409, 'Use the period review workflow for this period');
}

export async function enforceBankDates(a: Access, dates: string[]) {
  const policy = (await records(a, lockKind))[0]?.data.dates;
  const locked = await dbAll(
    "SELECT starts_on,ends_on FROM ac_accounting_periods WHERE org_id=? AND environment=? AND status='locked'",
    scope(a),
  );
  if (
    dates.some(
      (date) =>
        (policy?.all && date <= policy.all) ||
        locked.some((p) => p.starts_on <= date && p.ends_on >= date),
    )
  )
    fail(409, 'Bank reconciliation evidence is locked on this date');
}

async function checklist(a: Access, p: Awaited<ReturnType<typeof period>>) {
  const settings = await accountingSettings(a);
  const journals = await dbAll(
    `SELECT e.id,e.version,e.reference,e.status,e.currency,COUNT(l.id) AS lines,
       COALESCE(SUM(l.debit_minor),0) AS debits,COALESCE(SUM(l.credit_minor),0) AS credits
     FROM ac_accounting_entries e LEFT JOIN ac_accounting_lines l
       ON l.entry_id=e.id AND l.org_id=e.org_id AND l.environment=e.environment
     WHERE e.org_id=? AND e.environment=? AND e.entry_on BETWEEN ? AND ?
     GROUP BY e.id,e.version,e.reference,e.status,e.currency ORDER BY e.id`,
    [...scope(a), p.starts_on, p.ends_on],
  );
  const trial = new Map<string, bigint>();
  for (const row of journals.filter((r) => r.status === 'posted')) {
    trial.set(
      row.currency,
      (trial.get(row.currency) ?? 0n) + BigInt(row.debits) - BigInt(row.credits),
    );
  }
  const bank = await dbAll(
    "SELECT id,root_id,version,status,due_on FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='bank_statement_line' AND due_on<=? AND status NOT IN ('reconciled','matched') ORDER BY id",
    [...scope(a), p.ends_on],
  );
  const matches = await dbAll(
    `SELECT m.id,m.version,m.root_id FROM ac_erp_objects m JOIN ac_erp_objects l
       ON l.id=m.root_id AND l.org_id=m.org_id AND l.environment=m.environment
     WHERE m.org_id=? AND m.environment=? AND m.kind='bank_match'
       AND m.status IN ('pending','approved','reversal_pending','reversal_approved')
       AND l.due_on<=? ORDER BY m.id`,
    [...scope(a), p.ends_on],
  );
  const recognition = await dbAll(
    `SELECT e.source_id FROM ac_accounting_entries e WHERE e.org_id=? AND e.environment=?
     AND e.source_type IN ('asset_depreciation','deferral_recognition') AND e.status='posted'
     AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.org_id=e.org_id
       AND r.environment=e.environment AND r.reverses_id=e.id AND r.status='posted' AND r.entry_on<=?)
     AND e.entry_on<=?`,
    [...scope(a), p.ends_on, p.ends_on],
  );
  const posted = new Set(recognition.map((r) => r.source_id));
  const schedules = await Promise.all([records(a, 'fixed_asset'), records(a, 'deferral')]);
  const due = schedules.map((group) =>
    group
      .filter((o) => o.status === 'running')
      .flatMap((o) =>
        (o.data.rows || [])
          .filter(
            (r: any) =>
              r.amount_minor > 0 && r.date <= p.ends_on && !posted.has(r.evidence_id ?? r.case_id),
          )
          .map((r: any) => ({ id: o.id, kind: o.kind, date: r.date, version: o.version })),
      ),
  );
  const draft = journals.filter((j) => j.status === 'draft');
  const invalid = journals.filter(
    (j) => Number(j.lines) < 2 || BigInt(j.debits) !== BigInt(j.credits),
  );
  const variance = [...trial]
    .filter(([, value]) => value !== 0n)
    .map(([currency, value]) => ({ currency, variance_minor: sumMinor([value.toString()]) }));
  const overlap = await dbGet(
    'SELECT id FROM ac_accounting_periods WHERE org_id=? AND environment=? AND id<>? AND starts_on<=? AND ends_on>=?',
    [...scope(a), p.id, p.ends_on, p.starts_on],
  );
  const opening =
    settings.opening_policy === 'reviewed_opening_entry_required' &&
    p.starts_on <= settings.start_on &&
    !settings.data.opening_entries?.[settings.currency];
  const item = (
    code: string,
    severity: 'blocker' | 'warning',
    count: number,
    details: unknown[],
  ) => ({ code, severity, count, details: details.slice(0, 50) });
  const checks = [
    item(
      'draft_journals',
      'blocker',
      draft.length,
      draft.map(({ id, reference }) => ({ id, reference })),
    ),
    item(
      'unbalanced_journals',
      'blocker',
      invalid.length,
      invalid.map(({ id, reference }) => ({ id, reference })),
    ),
    item('unreconciled_bank_lines', 'blocker', bank.length, bank),
    item('pending_bank_decisions', 'blocker', matches.length, matches),
    item('depreciation_due', 'blocker', due[0].length, due[0]),
    item('deferral_recognition_due', 'blocker', due[1].length, due[1]),
    item('period_consistency', 'blocker', overlap ? 1 : 0, overlap ? [overlap] : []),
    item('trial_balance_variance', 'blocker', variance.length, variance),
    item('opening_balance_required', 'blocker', opening ? 1 : 0, []),
  ];
  const pending = await dbAll(
    `SELECT a.id,a.resource_id,a.created_at FROM ac2_approvals a JOIN ac_accounting_entries e
       ON e.id=a.resource_id AND e.org_id=a.org_id AND e.environment=a.environment
     WHERE a.org_id=? AND a.environment=? AND a.action='journal_posting' AND a.status='pending'
       AND e.entry_on BETWEEN ? AND ? ORDER BY a.id`,
    [...scope(a), p.starts_on, p.ends_on],
  );
  checks.push(item('pending_journal_reviews', 'warning', pending.length, pending));
  return {
    checks,
    ready: !checks.some((check) => check.severity === 'blocker' && check.count),
    fingerprint: hash(
      JSON.stringify([p.version, journals, bank, matches, due, variance, pending, !!opening]),
    ),
  };
}

export async function periodCloseDetail(a: Access, periodId: string) {
  await accountingAccess(a);
  const p = await period(a, periodId);
  const review = (await records(a, reviewKind, p.id))[0];
  const facts = await checklist(a, p);
  return {
    period: p,
    review: review ?? null,
    ...facts,
    stale:
      !!review?.data.fingerprint &&
      ['under_review', 'approved'].includes(review.status) &&
      review.data.fingerprint !== facts.fingerprint,
    history: review ? await history(a, review.id) : [],
  };
}

export async function actOnPeriodClose(a: Access, periodId: string, input: unknown, key: string) {
  const d = periodReviewInput.parse(input);
  return operation(
    a,
    'accounting.period_close:' + periodId,
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      const p = await period(a, periodId);
      const review = (await records(a, reviewKind, p.id))[0];
      if ((review?.version ?? 0) !== d.expected_version || p.version !== d.expected_period_version)
        fail(409, 'Period or review changed; reload');
      const state = review?.status ?? 'open';
      const at = now();
      async function persist(next: string, data: Record<string, unknown>) {
        const nextData = {
          ...review?.data,
          ...data,
          reason: d.reason,
          acted_on: at,
          acted_by: a.actor,
        };
        await audit(a.org, a.actor, 'accounting.period_review_' + next, p.id);
        return review
          ? update(a, review, nextData, { status: next }, d.action)
          : insert(a, reviewKind, nextData, { parent: p.id, status: next });
      }
      async function updatePeriod(status: 'open' | 'locked') {
        await dbRun(
          'UPDATE ac_accounting_periods SET status=?,version=version+1,updated_at=? WHERE org_id=? AND environment=? AND id=? AND version=?',
          [status, at, ...scope(a), p.id, p.version],
        );
      }
      function differentActor() {
        if (review?.data.requested_by === a.actor)
          fail(403, 'A different accounting manager must review the request');
      }
      if (d.action === 'cancel' && ['under_review', 'approved', 'reopen_review'].includes(state))
        return persist(state === 'reopen_review' ? 'closed' : 'open', { fingerprint: null });
      if (d.action === 'request_reopen' && state === 'closed')
        return persist('reopen_review', { requested_by: a.actor, requested_on: at });
      if (d.action === 'reopen' && state === 'reopen_review') {
        differentActor();
        await updatePeriod('open');
        return persist('open', { fingerprint: null, reopened_by: a.actor, reopened_on: at });
      }
      if (p.status !== 'open') fail(409, 'Period must be open for a new close review');
      const facts = await checklist(a, p);
      if (d.action === 'request' && ['open', 'under_review', 'approved'].includes(state))
        return persist('under_review', {
          fingerprint: facts.fingerprint,
          requested_by: a.actor,
          requested_on: at,
          approved_by: null,
        });
      if (!facts.ready) fail(409, 'Resolve the period close blockers before approval or close');
      if (facts.fingerprint !== review?.data.fingerprint)
        fail(409, 'Accounting records changed; request a new review');
      if (d.action === 'approve' && state === 'under_review') {
        differentActor();
        return persist('approved', { approved_by: a.actor, approved_on: at });
      }
      if (d.action === 'close' && state === 'approved') {
        const reviewer = await currentMember({ ...a, actor: review?.data.approved_by }).catch(
          () => null,
        );
        if (!reviewer || !['owner', 'admin'].includes(reviewer))
          fail(409, 'A current independent approval is required');
        await updatePeriod('locked');
        return persist('closed', { closed_by: a.actor, closed_on: at });
      }
      return fail(409, 'This action is unavailable in the current close state');
    },
  );
}
