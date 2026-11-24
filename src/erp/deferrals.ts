import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { canonical } from '../finance/service';
import { sumMinor } from '../finance/money';
import { type Access, fail } from '../platform/auth';
import { hash, now } from '../platform/crypto';
import { currencySchema } from '../platform/domain';
import { accountingAccess, accountingEntry, prepareDerivedEntry } from './accounting';
import { accountingPython } from './bank-python';
import { decode, insert, operation, read, update, type ERPObject } from './store';

const id = z.string().uuid();
const day = z.string().date();
const version = z.number().int().nonnegative();
const minor = z.number().int().min(0).max(100_000_000_000);
const kind = z.enum(['expense', 'revenue']);
const policy = z
  .object({
    method: z.enum(['equal', 'days', 'months', 'full_months']),
    frequency: z.enum(['monthly', 'quarterly', 'annual']),
  })
  .strict();
const config = z
  .object({
    kind,
    name: z.string().trim().min(1).max(100),
    expected_version: version,
    deferred_account_id: id,
    recognition_account_id: id,
    journal_id: id,
    policy,
  })
  .strict();
export const deferralModelInput = config.extend({
  duration_months: z.number().int().min(1).max(360),
  active: z.boolean(),
});
export const deferralInput = config.extend({
  source_entry_id: id,
  model_id: id.optional(),
  currency: currencySchema,
  amount_minor: minor.min(1),
  start_on: day,
  end_on: day,
});
export const deferralActionInput = z.discriminatedUnion('action', [
  z
    .object({ action: z.enum(['compute', 'confirm', 'archive']), expected_version: version })
    .strict(),
  z
    .object({
      action: z.literal('retire'),
      reason: z.string().trim().min(5).max(400),
      expected_version: version,
    })
    .strict(),
  z
    .object({ action: z.enum(['prepare', 'withdraw']), date: day, expected_version: version })
    .strict(),
  z
    .object({
      action: z.literal('revise'),
      start_on: day,
      end_on: day,
      policy,
      reason: z.string().trim().min(5).max(400),
      expected_version: version,
    })
    .strict(),
]);

const scheduleRow = z
  .object({ date: day, amount_minor: minor, cumulative_minor: minor, remaining_minor: minor })
  .strict();
const scheduleResult = z.object({ rows: z.array(scheduleRow).min(1).max(360) }).strict();
type ScheduleRow = z.infer<typeof scheduleRow> & { evidence_id?: string };
type Deferral = z.infer<typeof deferralInput> & {
  source_on: string;
  source_version: number;
  source_reference: string;
  source_type: string;
  source_id: string;
  contact_id: string | null;
  rows?: ScheduleRow[];
};
type Journal = Awaited<ReturnType<typeof accountingEntry>>;
const scope = (a: Access) => [a.org, a.environment];
const recType = 'deferral_recognition';
const bit = (value: unknown) => value === true || Number(value) === 1;

async function objects(a: Access, type: 'deferral' | 'deferral_model') {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 201',
      [...scope(a), type],
    )
  ).map((row) => decode(a, row));
}

async function checkAccounts(a: Access, d: z.infer<typeof config>) {
  const accountRows = await dbAll(
    'SELECT id,type FROM ac_accounting_accounts WHERE org_id=? AND environment=? AND active=1 AND id IN (?,?)',
    [...scope(a), d.deferred_account_id, d.recognition_account_id],
  );
  const types = new Map(accountRows.map((r) => [r.id, r.type]));
  if (
    types.get(d.deferred_account_id) !== (d.kind === 'expense' ? 'asset' : 'liability') ||
    types.get(d.recognition_account_id) !== (d.kind === 'expense' ? 'expense' : 'revenue')
  )
    fail(
      400,
      'Select active balance-sheet and recognition accounts appropriate to the deferral type',
    );
  if (
    !(await dbGet(
      'SELECT id FROM ac_accounting_journals WHERE org_id=? AND environment=? AND id=? AND active=1',
      [...scope(a), d.journal_id],
    ))
  )
    fail(400, 'Select an active recognition journal');
}

async function checkSource(a: Access, d: z.infer<typeof deferralInput>, expected?: number) {
  const source = await accountingEntry(a, d.source_entry_id);
  if (
    source.status !== 'posted' ||
    source.currency !== d.currency ||
    source.reverses_id ||
    source.source_type === recType ||
    source.source_type === 'asset_depreciation' ||
    (expected !== undefined && expected !== source.version) ||
    d.start_on < source.entry_on ||
    (await dbGet(
      "SELECT id FROM ac_accounting_entries WHERE org_id=? AND environment=? AND reverses_id=? AND status='posted'",
      [...scope(a), source.id],
    ))
  )
    fail(
      409,
      'Select current unreversed posted evidence in the same currency on or before the start date',
    );
  const lines = source.lines.filter((line) => line.account_id === d.deferred_account_id);
  if (lines.length !== 1)
    fail(409, 'Use one identifiable deferred balance line from the posted source');
  const line = lines[0];
  const amount =
    d.kind === 'expense'
      ? line.debit_minor - line.credit_minor
      : line.credit_minor - line.debit_minor;
  if (amount !== d.amount_minor)
    fail(409, 'The posted deferred balance must equal the original amount');
  if (
    await dbGet(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='fixed_asset' AND parent_id=? AND status<>'archived'",
      [...scope(a), source.id],
    )
  )
    fail(409, 'This source is already assigned to a fixed asset');
  return {
    source_on: source.entry_on,
    source_version: source.version,
    source_reference: source.reference,
    source_type: source.source_type,
    source_id: source.source_id,
    contact_id: line.contact_id,
  };
}

export async function deferralSources(a: Access, query: unknown) {
  await accountingAccess(a);
  const d = z.object({ account: id, currency: currencySchema, kind }).parse(query);
  const positive =
    d.kind === 'expense' ? 'l.debit_minor-l.credit_minor' : 'l.credit_minor-l.debit_minor';
  return {
    data: await dbAll(
      `SELECT e.id,e.reference,e.entry_on,e.source_type,e.source_id,${positive} AS amount_minor
      FROM ac_accounting_entries e JOIN ac_accounting_lines l ON e.id=l.entry_id
        AND l.org_id=e.org_id AND l.environment=e.environment
      WHERE e.org_id=? AND e.environment=? AND e.currency=? AND l.account_id=? AND e.status='posted'
        AND e.reverses_id IS NULL AND e.source_type NOT IN ('deferral_recognition','asset_depreciation')
        AND (${positive})>0
        AND NOT EXISTS(SELECT 1 FROM ac_accounting_lines other WHERE other.entry_id=e.id AND other.account_id=l.account_id AND other.id<>l.id)
        AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.reverses_id=e.id AND r.status='posted')
        AND NOT EXISTS(SELECT 1 FROM ac_erp_objects o WHERE o.org_id=e.org_id AND o.environment=e.environment
          AND o.parent_id=e.id AND o.status<>'archived'
          AND (o.kind='fixed_asset' OR (o.kind='deferral' AND o.stage=l.account_id)))
      ORDER BY e.entry_on DESC,e.id LIMIT 100`,
      [...scope(a), d.currency, d.account],
    ),
  };
}

export async function listDeferralModels(a: Access) {
  await accountingAccess(a);
  return { data: (await objects(a, 'deferral_model')).slice(0, 200) };
}

export async function saveDeferralModel(
  a: Access,
  modelId: string | null,
  input: unknown,
  key: string,
) {
  const d = deferralModelInput.parse(input);
  if (modelId) id.parse(modelId);
  return operation(
    a,
    'accounting.deferral_model:' + (modelId || 'new'),
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      const old = modelId ? await read(a, modelId, 'deferral_model') : null;
      if ((old?.version ?? 0) !== d.expected_version) fail(409, 'Reload the current model');
      await checkAccounts(a, d);
      if (!old && (await objects(a, 'deferral_model')).length >= 200)
        fail(409, 'Model limit reached');
      return old ? update(a, old, d, {}, 'model_updated') : insert(a, 'deferral_model', d);
    },
  );
}

export async function saveDeferral(
  a: Access,
  recordId: string | null,
  input: unknown,
  key: string,
) {
  const d = deferralInput.parse(input);
  if (recordId) id.parse(recordId);
  return operation(
    a,
    'accounting.deferral:' + (recordId || 'new'),
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      const old = recordId ? await read(a, recordId, 'deferral') : null;
      if ((old?.version ?? 0) !== d.expected_version || (old && old.status !== 'draft'))
        fail(409, 'Only the current draft can be edited');
      if (d.start_on > d.end_on) fail(400, 'End date must be on or after start');
      if (d.model_id) {
        const model = await read(a, d.model_id, 'deferral_model');
        if (model.data.kind !== d.kind || (!model.data.active && old?.data.model_id !== d.model_id))
          fail(409, 'Choose an active model of the same type');
      }
      await checkAccounts(a, d);
      const evidence = await checkSource(a, d);
      if (
        await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='deferral' AND parent_id=? AND stage=? AND id<>? AND status<>'archived'",
          [...scope(a), d.source_entry_id, d.deferred_account_id, recordId || ''],
        )
      )
        fail(409, 'This posted balance already supports a deferral');
      if (!old && (await objects(a, 'deferral')).length >= 200) fail(409, 'Register limit reached');
      return old
        ? update(
            a,
            old,
            { ...d, ...evidence },
            { parent_id: d.source_entry_id, stage: d.deferred_account_id },
            'draft_updated',
          )
        : insert(
            a,
            'deferral',
            { ...d, ...evidence },
            { parent: d.source_entry_id, stage: d.deferred_account_id, status: 'draft' },
          );
    },
  );
}

async function journalState(a: Access, recordId?: string) {
  return dbAll(
    `SELECT e.id,e.source_id,e.source_parent_id,e.reference,e.status,e.entry_on,e.source_gross_minor, r.entry_on AS reversed_on,
        EXISTS(SELECT 1 FROM ac2_approvals p JOIN ac_approval_bindings b ON b.approval_id=p.id
          JOIN ac_memberships m ON m.org_id=p.org_id AND m.user_id=p.approver
          WHERE p.org_id=e.org_id AND p.environment=e.environment AND p.resource_id=e.id
          AND p.action='journal_posting' AND p.status='approved' AND p.expires_at>?
          AND b.consumed_at IS NULL AND m.role IN ('owner','admin','finance')) AS approved
     FROM ac_accounting_entries e LEFT JOIN ac_accounting_entries r ON r.reverses_id=e.id
       AND r.org_id=e.org_id AND r.environment=e.environment AND r.status='posted'
     WHERE e.org_id=? AND e.environment=? AND e.source_type='deferral_recognition'` +
      (recordId ? ' AND e.source_parent_id=?' : ''),
    [now(), ...scope(a), ...(recordId ? [recordId] : [])],
  );
}

function board(data: Deferral, journals: Awaited<ReturnType<typeof journalState>>) {
  const bySource = new Map(journals.map((entry) => [entry.source_id, entry]));
  return (data.rows || []).map((row) => {
    const entry = row.evidence_id && bySource.get(row.evidence_id);
    return {
      ...row,
      posting: !row.amount_minor
        ? 'no_amount'
        : !entry
          ? 'proposed'
          : entry.reversed_on
            ? 'reversed'
            : entry.status === 'posted'
              ? 'posted'
              : bit(entry.approved)
                ? 'approved'
                : 'draft',
      journal_entry_id: entry?.id ?? null,
      journal_reference: entry?.reference ?? null,
    };
  });
}

export async function deferralDetail(a: Access, recordId: string) {
  await accountingAccess(a);
  const record = await read(a, id.parse(recordId), 'deferral');
  const rows = board(record.data, await journalState(a, record.id));
  const recognized_minor = sumMinor(
    rows.filter((row) => row.posting === 'posted').map((row) => row.amount_minor),
  );
  return {
    record,
    rows,
    recognized_minor,
    remaining_minor: record.data.amount_minor - recognized_minor,
    status:
      record.status === 'running' && recognized_minor === record.data.amount_minor
        ? 'recognized'
        : record.status,
    history: await dbAll(
      'SELECT version,actor,action,created_at FROM ac_erp_history WHERE org_id=? AND environment=? AND resource_id=? ORDER BY version DESC LIMIT 100',
      [...scope(a), record.id],
    ),
  };
}

export async function listDeferrals(a: Access, query: unknown) {
  await accountingAccess(a);
  const d = z
    .object({
      kind: kind.optional(),
      search: z.string().trim().max(100).default(''),
      state: z.enum(['draft', 'running', 'recognized', 'archived']).optional(),
      from: day.optional(),
      to: day.optional(),
      offset: z.coerce.number().int().min(0).max(200).default(0),
    })
    .parse(query);
  if (d.from && d.to && d.from > d.to) fail(400, 'Invalid date range');
  const totals = await dbAll(
    `SELECT e.source_parent_id,SUM(e.source_gross_minor) AS posted FROM ac_accounting_entries e
      WHERE e.org_id=? AND e.environment=? AND e.source_type='deferral_recognition' AND e.status='posted'
      AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.reverses_id=e.id AND r.status='posted')
      GROUP BY e.source_parent_id`,
    scope(a),
  );
  const amounts = new Map(totals.map((row) => [row.source_parent_id, Number(row.posted)]));
  const rows = (await objects(a, 'deferral'))
    .slice(0, 200)
    .map((r) => {
      const data = r.data as Deferral;
      const recognized_minor = amounts.get(r.id) || 0;
      return {
        id: r.id,
        name: data.name,
        kind: data.kind,
        currency: data.currency,
        amount_minor: data.amount_minor,
        status:
          r.status === 'running' && recognized_minor === data.amount_minor
            ? 'recognized'
            : r.status,
        recognized_minor,
        start_on: data.start_on,
        end_on: data.end_on,
        source_reference: data.source_reference,
      };
    })
    .filter(
      (r) =>
        (!d.kind || d.kind === r.kind) &&
        (!d.from || r.end_on >= d.from) &&
        (!d.to || r.start_on <= d.to) &&
        (!d.state || r.status === d.state) &&
        (r.name + ' ' + r.source_reference).toLowerCase().includes(d.search.toLowerCase()),
    );
  return { data: rows.slice(d.offset, d.offset + 25), has_more: rows.length > d.offset + 25 };
}

async function compute(data: Deferral, prior: number, start: string, end: string) {
  const { rows } = await accountingPython(
    'deferrals',
    {
      ...data.policy,
      amount_minor: data.amount_minor,
      prior_minor: prior,
      start_on: start,
      end_on: end,
    },
    scheduleResult,
  );
  let running = prior;
  let previous = '';
  for (const row of rows) {
    running += row.amount_minor;
    if (
      row.date < start ||
      row.date > end ||
      row.date <= previous ||
      running > data.amount_minor ||
      row.cumulative_minor !== running ||
      row.remaining_minor !== data.amount_minor - running
    )
      throw new Error('Recognition schedule failed validation');
    previous = row.date;
  }
  if (running !== data.amount_minor || previous !== end)
    throw new Error('Recognition board does not settle the original amount');
  return rows;
}

export async function actOnDeferral(a: Access, recordId: string, input: unknown, key: string) {
  id.parse(recordId);
  const d = deferralActionInput.parse(input);
  return operation(
    a,
    'accounting.deferral_action:' + recordId,
    key,
    d,
    () => accountingAccess(a, true, d.action === 'retire'),
    async () => {
      const record = await read(a, recordId, 'deferral');
      const data = record.data as Deferral;
      if (record.version !== d.expected_version) fail(409, 'Deferral changed; reload');
      if (d.action === 'archive') {
        if (record.status !== 'draft') fail(409, 'Only a draft can be archived');
        return update(a, record, data, { status: 'archived' }, 'archived');
      }
      if (d.action === 'retire') {
        if (record.status !== 'running') fail(409, 'Only a confirmed schedule can be retired');
        const rows = board(data, await journalState(a, record.id));
        if (rows.some((row) => ['draft', 'approved', 'posted'].includes(row.posting)))
          fail(409, 'Withdraw drafts and reverse posted recognition before retiring');
        return update(
          a,
          record,
          { ...data, retirement_reason: d.reason },
          { status: 'archived' },
          'retired',
        );
      }
      if (d.action !== 'withdraw') {
        await checkAccounts(a, data);
        await checkSource(a, data, data.source_version);
      }
      if (d.action === 'compute' || d.action === 'confirm') {
        if (record.status !== 'draft') fail(409, 'Only a draft can be calculated or confirmed');
        if (d.action === 'compute')
          return update(
            a,
            record,
            {
              ...data,
              rows: await compute(data, 0, data.start_on, data.end_on),
            },
            {},
            'schedule_computed',
          );
        if (!data.rows?.length) fail(409, 'Compute and review the schedule before confirming');
        return update(a, record, data, { status: 'running' }, 'confirmed');
      }
      if (record.status !== 'running') fail(409, 'Confirm this deferral first');
      const rows = board(data, await journalState(a, record.id));
      if (d.action === 'revise') {
        if (rows.some((r) => ['draft', 'approved'].includes(r.posting)))
          fail(409, 'Withdraw the outstanding draft first');
        const cutoff = rows.map((row) => row.posting).lastIndexOf('posted');
        const prefix = (data.rows || []).slice(0, cutoff + 1);
        const prior = prefix.at(-1)?.cumulative_minor ?? 0;
        if (
          prior === data.amount_minor ||
          d.start_on < data.start_on ||
          d.start_on > d.end_on ||
          (cutoff >= 0 && d.start_on <= rows[cutoff].date)
        )
          fail(409, 'Revise only the remaining period after posted entries');
        const revised = { ...data, end_on: d.end_on, policy: d.policy, revision_reason: d.reason };
        const future = await compute(revised, prior, d.start_on, d.end_on);
        if (prefix.length + future.length > 720) fail(409, 'Schedule history limit reached');
        return update(
          a,
          record,
          { ...revised, rows: [...prefix, ...future] },
          {},
          'schedule_revised',
        );
      }
      const requested = 'date' in d ? d.date : fail(400, 'Choose a recognition period');
      const selected = rows.find((row) => row.date === requested) ?? fail(404, 'Period not found');
      if (d.action === 'withdraw') {
        if (!['draft', 'approved'].includes(selected.posting))
          fail(409, 'There is no outstanding draft');
        const next = data.rows!.map((row) =>
          row.date === requested
            ? {
                date: row.date,
                amount_minor: row.amount_minor,
                cumulative_minor: row.cumulative_minor,
                remaining_minor: row.remaining_minor,
              }
            : row,
        );
        return update(a, record, { ...data, rows: next }, {}, 'draft_withdrawn');
      }
      if (
        rows.find((row) => row.amount_minor > 0 && row.posting !== 'posted')?.date !== requested ||
        !['proposed', 'reversed'].includes(selected.posting)
      )
        fail(409, 'Prepare only the next outstanding period');
      const evidence = await insert(
        a,
        'deferral_recognition',
        { date: requested, amount_minor: selected.amount_minor },
        { root: record.id, status: 'prepared' },
      );
      const source = {
        id: evidence.id,
        type: recType,
        source_on: requested,
        currency: data.currency,
        description: 'Recognition: ' + data.name,
        amount_minor: selected.amount_minor,
        contact_id: data.contact_id,
        facts: {
          deferral_id: record.id,
          source_entry_id: data.source_entry_id,
          source_version: data.source_version,
          deferral_version: record.version,
          policy: data.policy,
        },
      };
      const debit =
        data.kind === 'expense' ? data.recognition_account_id : data.deferred_account_id;
      const credit =
        data.kind === 'expense' ? data.deferred_account_id : data.recognition_account_id;
      const draft = await prepareDerivedEntry(a, {
        source,
        source_hash: hash(canonical(source)),
        posting_on: requested,
        journal_id: data.journal_id,
        adjustment_reason: 'Deferral recognition',
        book_tax_minor: 0,
        lines: [
          {
            account_id: debit,
            contact_id: data.contact_id,
            debit_minor: selected.amount_minor,
            credit_minor: 0,
            memo: source.description,
          },
          {
            account_id: credit,
            contact_id: data.contact_id,
            debit_minor: 0,
            credit_minor: selected.amount_minor,
            memo: source.description,
          },
        ],
      });
      await update(
        a,
        record,
        {
          ...data,
          rows: data.rows!.map((row) =>
            row.date === requested ? { ...row, evidence_id: evidence.id } : row,
          ),
        },
        {},
        'recognition_prepared',
      );
      return draft;
    },
  );
}

export async function validateDeferralPosting(a: Access, entry: Journal) {
  const evidence = await read(a, entry.source_id, 'deferral_recognition');
  const record = await read(a, evidence.root_id, 'deferral');
  const next = board(record.data, await journalState(a, record.id)).find(
    (row) => row.amount_minor && row.posting !== 'posted',
  );
  if (
    record.status !== 'running' ||
    next?.evidence_id !== evidence.id ||
    next.date !== entry.entry_on ||
    record.version !== entry.data.source_snapshot?.facts.deferral_version + 1 ||
    entry.source_hash !== hash(canonical(entry.data.source_snapshot))
  )
    fail(409, 'This draft is no longer the next current recognition period');
  await checkAccounts(a, record.data);
  await checkSource(a, record.data, record.data.source_version);
}

export async function validateDeferralReversal(a: Access, original: Journal) {
  if (
    await dbGet(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='deferral' AND parent_id=? AND status<>'archived'",
      [...scope(a), original.id],
    )
  )
    fail(409, 'Resolve dependent deferrals before reversing this source');
  if (
    original.reverses_id &&
    (await accountingEntry(a, original.reverses_id)).source_type === recType
  )
    fail(409, 'Reprepare recognition from the board instead of reversing its reversal');
  if (original.source_type !== recType) return;
  const evidence = await read(a, original.source_id, 'deferral_recognition');
  const record = await read(a, evidence.root_id, 'deferral');
  const rows = board(record.data, await journalState(a, record.id));
  if (rows.some((row) => ['draft', 'approved'].includes(row.posting)))
    fail(409, 'Withdraw the outstanding recognition draft before reversing');
  if (rows.filter((row) => row.posting === 'posted').at(-1)?.evidence_id !== evidence.id)
    fail(409, 'Reverse later recognition periods first');
}

export async function recordDeferralPosting(a: Access, posted: Journal) {
  const original = posted.reverses_id ? await accountingEntry(a, posted.reverses_id) : posted;
  if (original.source_type !== recType) return;
  const evidence = await read(a, original.source_id, 'deferral_recognition');
  const record = await read(a, evidence.root_id, 'deferral');
  await update(
    a,
    record,
    { ...record.data, last_journal_id: posted.id },
    {},
    posted.reverses_id ? 'recognition_reversed' : 'recognition_posted',
  );
}

export async function deferralReport(a: Access, query: unknown) {
  await accountingAccess(a);
  const d = z
    .object({
      kind,
      from: day.optional(),
      to: day.optional(),
      period_id: id.optional(),
      account: id.optional(),
      journal: id.optional(),
      partner: id.optional(),
      state: z.enum(['draft', 'running', 'recognized', 'archived']).optional(),
    })
    .parse(query);
  let from = d.from,
    to = d.to;
  if (d.period_id) {
    const period = await dbGet(
      'SELECT starts_on,ends_on FROM ac_accounting_periods WHERE org_id=? AND environment=? AND id=?',
      [...scope(a), d.period_id],
    );
    if (!period) fail(404, 'Accounting period not found');
    ({ starts_on: from, ends_on: to } = period);
  }
  const rangeStart = from ?? fail(400, 'Choose a valid date range or accounting period');
  const rangeEnd = to ?? fail(400, 'Choose a valid date range or accounting period');
  if (rangeStart > rangeEnd) fail(400, 'Start must precede the end of the report');
  const results = [];
  const byRecord = new Map<string, Awaited<ReturnType<typeof journalState>>>();
  for (const entry of await journalState(a)) {
    const group = byRecord.get(entry.source_parent_id) || [];
    group.push(entry);
    byRecord.set(entry.source_parent_id, group);
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const record of (await objects(a, 'deferral')).slice(0, 200)) {
    const asset = record.data as Deferral;
    if (
      asset.kind !== d.kind ||
      asset.source_on > rangeEnd ||
      (record.status === 'archived' && d.state !== 'archived') ||
      (d.account &&
        ![asset.deferred_account_id, asset.recognition_account_id].includes(d.account)) ||
      (d.journal && d.journal !== asset.journal_id) ||
      (d.partner && d.partner !== asset.contact_id)
    )
      continue;
    const entries = byRecord.get(record.id) || [];
    const current = board(asset, entries);
    const movements = entries
      .filter((entry) => entry.status === 'posted')
      .flatMap((entry) => [
        { date: entry.entry_on as string, amount: Number(entry.source_gross_minor) },
        ...(entry.reversed_on
          ? [{ date: entry.reversed_on as string, amount: -Number(entry.source_gross_minor) }]
          : []),
      ]);
    const amountBefore = sumMinor(
      movements.filter((movement) => movement.date < rangeStart).map((movement) => movement.amount),
    );
    const periodAmount = sumMinor(
      movements
        .filter((movement) => movement.date >= rangeStart && movement.date <= rangeEnd)
        .map((movement) => movement.amount),
    );
    const recognized = amountBefore + periodAmount;
    const currentState =
      record.status === 'running' && recognized === asset.amount_minor
        ? 'recognized'
        : record.status;
    if (d.state && d.state !== currentState) continue;
    const open = current.filter((row) => !['posted', 'no_amount'].includes(row.posting));
    results.push({
      id: record.id,
      name: asset.name,
      status: currentState,
      ...Object.fromEntries(
        [
          'currency',
          'amount_minor',
          'deferred_account_id',
          'recognition_account_id',
          'journal_id',
          'contact_id',
          'source_entry_id',
          'source_reference',
          'source_type',
          'source_id',
          'start_on',
          'end_on',
        ].map((field) => [field, asset[field as keyof Deferral]]),
      ),
      before_minor: amountBefore,
      period_minor: periodAmount,
      recognized_minor: recognized,
      balance_minor: asset.amount_minor - recognized,
      proposed_in_period_minor: sumMinor(
        open
          .filter((row) => row.date >= rangeStart && row.date <= rangeEnd)
          .map((row) => row.amount_minor),
      ),
      later_planned_minor: sumMinor(
        current.filter((row) => row.date > rangeEnd).map((row) => row.amount_minor),
      ),
      overdue_minor:
        record.status === 'running'
          ? sumMinor(
              open
                .filter((row) => row.date < today && row.date <= rangeEnd)
                .map((row) => row.amount_minor),
            )
          : 0,
    });
  }
  return { from: rangeStart, to: rangeEnd, data: results };
}
