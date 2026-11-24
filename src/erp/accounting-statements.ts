import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { sumMinor } from '../finance/money';
import { type Access, fail } from '../platform/auth';
import { unseal } from '../platform/crypto';
import { currencySchema } from '../platform/domain';
import { accountingAccess, accountingSettings } from './accounting';
import { fiscalYears } from './accounting-close';
import { accountingPython } from './bank-python';

const minor = z.number().int();
const statementSummarySchema = z
  .object({
    categories: z.array(
      z
        .object({
          category: z.string(),
          balance_minor: minor,
          profit_minor: minor,
        })
        .strict(),
    ),
    totals: z
      .object({
        debit_minor: minor,
        credit_minor: minor,
        balanced: z.boolean(),
        opening_debit_minor: minor,
        opening_credit_minor: minor,
        assets_minor: minor,
        liabilities_minor: minor,
        posted_equity_minor: minor,
        retained_earnings_minor: minor,
        current_year_result_minor: minor,
        equity_minor: minor,
        equation_variance_minor: minor,
        revenue_minor: minor,
        cost_of_sales_minor: minor,
        has_cost_of_sales: z.boolean(),
        gross_profit_minor: minor,
        operating_expenses_minor: minor,
        net_profit_minor: minor,
      })
      .strict(),
  })
  .strict();

const day = z.iso.date();
const id = z.uuid();
export const statementQuery = z
  .object({
    view: z.enum(['trial', 'ledger', 'balance', 'profit', 'accounts', 'audit', 'summary']),
    currency: currencySchema,
    from: day.optional(),
    to: day.optional(),
    period_id: id.optional(),
    fiscal_year_id: id.optional(),
    journal_id: id.optional(),
    account_id: id.optional(),
    comparison: z.enum(['previous_period', 'prior_year']).optional(),
    search: z.string().trim().max(100).default(''),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict();
type Query = z.infer<typeof statementQuery>;
type Range = { from: string; to: string };
const scope = (a: Access) => [a.org, a.environment];
const limit = 50;
const margin = (debits: string, credits: string) =>
  sumMinor([(BigInt(debits) - BigInt(credits)).toString()]);
const inBook = `FROM ac_accounting_lines l JOIN ac_accounting_entries e
    ON e.id=l.entry_id AND e.org_id=l.org_id AND e.environment=l.environment
    JOIN ac_accounting_accounts a ON a.id=l.account_id AND a.org_id=l.org_id AND a.environment=l.environment
    WHERE e.org_id=? AND e.environment=? AND e.currency=? AND e.status='posted'`;
const journalFilter = (q: Query) => (q.journal_id ? ' AND e.journal_id=?' : '');
const filters = (a: Access, q: Query) => [
  ...scope(a),
  q.currency,
  ...(q.journal_id ? [q.journal_id] : []),
];
const searchPattern = (search: string) => '%' + search.toLowerCase().replace(/[!%_]/g, '!$&') + '%';
const dateOf = (date: Date) => date.toISOString().slice(0, 10);
function previous(range: Range, method: Query['comparison']) {
  const to = new Date(range.to + 'T00:00:00Z'),
    from = new Date(range.from + 'T00:00:00Z');
  if (method === 'prior_year') {
    for (const date of [to, from]) {
      const month = date.getUTCMonth();
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      if (date.getUTCMonth() !== month) date.setUTCDate(0);
    }
  } else {
    const span = to.getTime() - from.getTime() + 86400000;
    to.setTime(to.getTime() - span);
    from.setTime(from.getTime() - span);
  }
  return { from: dateOf(from), to: dateOf(to) };
}

async function aggregate(
  a: Access,
  q: Query,
  range: Range,
  fiscalStart: string,
  costAccount: string,
) {
  const source = await dbAll(
    `SELECT a.id,a.code,a.name,a.type,
      SUM(CASE WHEN e.entry_on<? THEN l.debit_minor-l.credit_minor ELSE 0 END) AS opening,
      SUM(CASE WHEN e.entry_on>=? THEN l.debit_minor ELSE 0 END) AS debit,
      SUM(CASE WHEN e.entry_on>=? THEN l.credit_minor ELSE 0 END) AS credit,
      SUM(CASE WHEN e.entry_on>=? THEN l.credit_minor-l.debit_minor ELSE 0 END) AS fiscal_result,
      SUM(l.debit_minor-l.credit_minor) AS closing
      ${inBook}${journalFilter(q)} AND e.entry_on<=?
     GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code,a.id`,
    [range.from, range.from, range.from, fiscalStart, ...filters(a, q), range.to],
  );
  const rows = source.map((r) => {
    const opening = sumMinor([r.opening]),
      closing = sumMinor([r.closing]);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      category: r.id === costAccount && r.type === 'expense' ? 'cost_of_sales' : r.type,
      opening_debit_minor: Math.max(0, opening),
      opening_credit_minor: Math.max(0, -opening),
      debit_minor: sumMinor([r.debit]),
      credit_minor: sumMinor([r.credit]),
      fiscal_result_minor: sumMinor([r.fiscal_result]),
      closing_minor: closing,
      movement_minor: margin(r.debit, r.credit),
    };
  });
  const selected = rows.filter(
    (r) =>
      (!q.account_id || r.id === q.account_id) &&
      (!q.search || (r.code + ' ' + r.name).toLowerCase().includes(q.search.toLowerCase())),
  );
  const selectedIds = new Set(selected.map((r) => r.id));
  const summary = await accountingPython(
    'statements',
    {
      rows: rows.map((r) => ({
        type: r.type,
        category: r.category,
        selected: selectedIds.has(r.id),
        opening_debit_minor: r.opening_debit_minor,
        opening_credit_minor: r.opening_credit_minor,
        debit_minor: r.debit_minor,
        credit_minor: r.credit_minor,
        fiscal_result_minor: r.fiscal_result_minor,
        closing_minor: r.closing_minor,
        movement_minor: r.movement_minor,
      })),
    },
    statementSummarySchema,
  );
  return {
    rows: selected,
    categories: summary.categories,
    totals: summary.totals,
  };
}

async function ledger(a: Access, q: Query, range: Range) {
  const where =
    'balance.entry_on>=?' +
    (q.search
      ? " AND (LOWER(balance.reference) LIKE ? ESCAPE '!' OR LOWER(balance.code) LIKE ? ESCAPE '!' OR LOWER(balance.name) LIKE ? ESCAPE '!' OR LOWER(balance.source_id) LIKE ? ESCAPE '!')"
      : '');
  const p = searchPattern(q.search);
  const rows = await dbAll(
    `WITH balance AS (
      SELECT l.id,l.entry_id,l.account_id,l.debit_minor,l.credit_minor,l.data AS line_data,
        a.code,a.name,e.reference,e.entry_on,e.source_type,e.source_id,e.journal_id,e.data AS entry_data,
        SUM(l.debit_minor-l.credit_minor) OVER(PARTITION BY l.account_id ORDER BY e.entry_on,e.id,l.id ROWS UNBOUNDED PRECEDING) AS running
      ${inBook}${journalFilter(q)} AND e.entry_on<=?${q.account_id ? ' AND l.account_id=?' : ''}
    ) SELECT balance.*,j.code AS journal_code FROM balance JOIN ac_accounting_journals j ON j.id=balance.journal_id
    WHERE ${where} ORDER BY balance.entry_on,balance.entry_id,balance.id LIMIT ? OFFSET ?`,
    [
      ...filters(a, q),
      range.to,
      ...(q.account_id ? [q.account_id] : []),
      range.from,
      ...(q.search ? [p, p, p, p] : []),
      limit + 1,
      q.offset,
    ],
  );
  return rows.map(({ line_data, entry_data, running, ...r }) => {
    const context = (kind: string, key: string) =>
      JSON.stringify(['accounting', a.org, a.environment, kind, key]);
    const description = JSON.parse(unseal(entry_data, context('entry', r.entry_id))).description;
    const memo = JSON.parse(unseal(line_data, context('line', r.id))).memo;
    return {
      ...r,
      debit_minor: sumMinor([r.debit_minor]),
      credit_minor: sumMinor([r.credit_minor]),
      running_minor: sumMinor([running]),
      description,
      memo,
    };
  });
}

async function journalAudit(a: Access, q: Query, range: Range) {
  const search = searchPattern(q.search);
  return dbAll(
    `SELECT e.id,e.reference,e.entry_on,e.status,e.source_type,e.source_id,e.reverses_id,
      e.created_by,e.created_at,e.posted_by,e.posted_at,j.code AS journal_code,
      p.id AS approval_id,p.approver,p.status AS approval_status,p.created_at AS approval_requested_at,
      b.consumed_at AS approval_consumed_at
      FROM ac_accounting_entries e JOIN ac_accounting_journals j ON j.id=e.journal_id
      LEFT JOIN ac2_approvals p ON p.id=(SELECT x.id FROM ac2_approvals x
        WHERE x.org_id=e.org_id AND x.environment=e.environment AND x.resource_id=e.id AND x.action='journal_posting'
        ORDER BY CASE WHEN EXISTS (SELECT 1 FROM ac_approval_bindings x_b WHERE x_b.approval_id=x.id AND x_b.consumed_at IS NOT NULL) THEN 0 ELSE 1 END,
          x.created_at DESC,x.id DESC LIMIT 1)
      LEFT JOIN ac_approval_bindings b ON b.approval_id=p.id
      WHERE e.org_id=? AND e.environment=? AND e.currency=? AND e.status='posted'
      ${journalFilter(q)} AND e.entry_on BETWEEN ? AND ?
      ${q.account_id ? ' AND EXISTS(SELECT 1 FROM ac_accounting_lines l WHERE l.entry_id=e.id AND l.account_id=? AND l.org_id=e.org_id AND l.environment=e.environment)' : ''}
      ${q.search ? " AND (LOWER(e.reference) LIKE ? ESCAPE '!' OR LOWER(e.source_id) LIKE ? ESCAPE '!')" : ''}
      ORDER BY e.entry_on DESC,e.id LIMIT ? OFFSET ?`,
    [
      ...filters(a, q),
      range.from,
      range.to,
      ...(q.account_id ? [q.account_id] : []),
      ...(q.search ? [search, search] : []),
      limit + 1,
      q.offset,
    ],
  );
}

export async function accountingStatements(a: Access, input: unknown) {
  await accountingAccess(a);
  const q = statementQuery.parse(input);
  const s = await accountingSettings(a);
  const years = (await fiscalYears(a)).data;
  let { from, to } = q;
  if (q.period_id) {
    const p = await dbGet(
      'SELECT starts_on,ends_on FROM ac_accounting_periods WHERE org_id=? AND environment=? AND id=?',
      [...scope(a), q.period_id],
    );
    if (!p) fail(404, 'Accounting period not found');
    from = p.starts_on;
    to = p.ends_on;
  } else if (q.fiscal_year_id) {
    const fiscal = years.find((year) => year.id === q.fiscal_year_id);
    if (!fiscal) fail(404, 'Fiscal year not found');
    from = fiscal.starts_on < s.start_on ? s.start_on : fiscal.starts_on;
    to = fiscal.ends_on;
  }
  const range = {
    from: from ?? fail(400, 'Select a report start'),
    to: to ?? fail(400, 'Select a report end'),
  };
  if (range.from < s.start_on || range.from > range.to)
    fail(400, 'Select dates on or after the reviewed accounting start');
  const fiscalStart = (date: string) =>
    years.find((year) => year.starts_on <= date && year.ends_on >= date)?.starts_on ??
    date.slice(0, 4) + '-01-01';

  {
    const current = await aggregate(a, q, range, fiscalStart(range.to), s.data.accounts['5100']);
    const before = q.comparison ? previous(range, q.comparison) : null;
    const comparison =
      before && before.to >= s.start_on
        ? await aggregate(a, q, before, fiscalStart(before.to), s.data.accounts['5100'])
        : null;
    const comparisonById = new Map(comparison?.rows.map((r) => [r.id, r]));
    const ofType = (row: (typeof current.rows)[number]) =>
      q.view === 'profit'
        ? ['revenue', 'expense'].includes(row.type) && (row.debit_minor > 0 || row.credit_minor > 0)
        : q.view === 'balance'
          ? ['asset', 'liability', 'equity'].includes(row.type)
          : true;
    const accounts = current.rows
      .filter(ofType)
      .map((r) => ({ ...r, comparison: comparisonById.get(r.id) ?? null }));
    const lines =
      q.view === 'ledger'
        ? await ledger(a, q, range)
        : q.view === 'audit'
          ? await journalAudit(a, q, range)
          : [];
    const unposted = await dbGet(
      `SELECT COUNT(*) AS count FROM ac_accounting_entries e
       WHERE e.org_id=? AND e.environment=? AND e.currency=? AND e.status='draft'${journalFilter(q)} AND e.entry_on<=?`,
      [...filters(a, q), range.to],
    );
    return {
      range,
      currency: q.currency,
      fiscal_start: fiscalStart(range.to),
      comparison_range: before,
      unposted_count: Number(unposted?.count ?? 0),
      totals: current.totals,
      comparison_totals: comparison?.totals ?? null,
      accounts,
      categories: current.categories,
      data: lines.slice(0, limit),
      has_more: lines.length > limit,
      offset: q.offset,
      limit,
    };
  }
}
