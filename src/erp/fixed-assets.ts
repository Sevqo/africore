import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { sumMinor } from '../finance/money';
import { canonical } from '../finance/service';
import { type Access, fail } from '../platform/auth';
import { hash, now } from '../platform/crypto';
import { currencySchema } from '../platform/domain';
import { accountingAccess, accountingEntry, prepareDerivedEntry } from './accounting';
import { accountingPython } from './bank-python';
import { decode, history, insert, operation, read, update, type ERPObject } from './store';

const id = z.string().uuid();
const minor = z.number().int().min(0).max(100_000_000_000);
const date = z
  .string()
  .date()
  .refine((day) => day >= '1900-01-01' && day <= '2300-12-31');
const version = z.number().int().min(0);
const terms = z
  .object({
    method: z.enum(['straight_line', 'declining', 'none']),
    frequency: z.enum(['monthly', 'annual']),
    periods: z.number().int().min(0).max(360),
    rate_bps: z.number().int().min(0).max(10000).default(0),
    prorata: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.method === 'none'
        ? v.periods !== 0
        : !v.periods || (v.frequency === 'annual' && v.periods > 60)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['periods'],
        message: 'Invalid useful life for method and frequency',
      });
    if (v.method === 'declining' ? !v.rate_bps : v.rate_bps !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['rate_bps'],
        message: 'Set a positive rate only for declining balance',
      });
  });
const accounts = z
  .object({
    asset_account_id: id,
    accumulated_account_id: id,
    expense_account_id: id,
    journal_id: id,
  })
  .strict();
export const assetModelInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    expected_version: version,
    terms,
    accounts,
  })
  .strict();
export const fixedAssetInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    expected_version: version,
    model_id: id.optional(),
    acquisition_entry_id: id,
    acquisition_on: date,
    start_on: date,
    currency: currencySchema,
    gross_minor: minor.min(1),
    salvage_minor: minor,
    prior_minor: minor.default(0),
    terms,
    accounts,
  })
  .strict();
export const assetActionInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.enum(['compute', 'confirm', 'archive']),
      expected_version: version,
    })
    .strict(),
  z
    .object({
      action: z.literal('revise'),
      expected_version: version,
      terms,
      reason: z.string().trim().min(5).max(400),
    })
    .strict(),
  z
    .object({
      action: z.enum(['prepare', 'withdraw']),
      expected_version: version,
      date: z.string().date(),
    })
    .strict(),
]);

const rowSchema = z
  .object({
    date: z.string().date(),
    amount_minor: minor,
    cumulative_minor: minor,
    remaining_minor: minor,
    book_minor: minor,
  })
  .strict();
const scheduleSchema = z.object({ rows: z.array(rowSchema).max(361) }).strict();
type Row = z.infer<typeof rowSchema> & { case_id?: string };
type Asset = z.infer<typeof fixedAssetInput> & { rows?: Row[] };
type Entry = Awaited<ReturnType<typeof accountingEntry>>;
const scope = (a: Access) => [a.org, a.environment];

async function checkAccounts(a: Access, config: z.infer<typeof accounts>) {
  const selected = [
    config.asset_account_id,
    config.accumulated_account_id,
    config.expense_account_id,
  ];
  if (new Set(selected).size !== 3) fail(400, 'Use three distinct accounts');
  const rows = await dbAll(
    'SELECT id,type FROM ac_accounting_accounts WHERE org_id=? AND environment=? AND active=1 AND id IN (?,?,?)',
    [...scope(a), ...selected],
  );
  const types = new Map(rows.map((row) => [row.id, row.type]));
  if (
    types.get(selected[0]) !== 'asset' ||
    types.get(selected[1]) !== 'asset' ||
    types.get(selected[2]) !== 'expense'
  )
    fail(400, 'Choose active asset, contra-asset and expense accounts in this workspace');
  if (
    !(await dbGet(
      'SELECT id FROM ac_accounting_journals WHERE org_id=? AND environment=? AND id=? AND active=1',
      [...scope(a), config.journal_id],
    ))
  )
    fail(400, 'Choose an active depreciation journal');
}

async function isReversed(a: Access, entryId: string) {
  return !!(await dbGet(
    "SELECT id FROM ac_accounting_entries WHERE org_id=? AND environment=? AND reverses_id=? AND status='posted'",
    [...scope(a), entryId],
  ));
}

async function acquisition(a: Access, d: Asset) {
  const entry = await accountingEntry(a, d.acquisition_entry_id);
  if (
    entry.status !== 'posted' ||
    entry.currency !== d.currency ||
    entry.entry_on !== d.acquisition_on ||
    entry.reverses_id ||
    entry.source_type === 'asset_depreciation' ||
    entry.source_type === 'deferral_recognition' ||
    (await isReversed(a, entry.id))
  )
    fail(409, 'Choose an unreversed posted acquisition on the same date and in the same currency');
  if (
    await dbGet(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='deferral' AND parent_id=? AND stage=? AND status<>'archived'",
      [...scope(a), entry.id, d.accounts.asset_account_id],
    )
  )
    fail(409, 'This acquisition balance is already assigned to a deferral');
  const byAccount = (account: string) =>
    sumMinor(
      entry.lines
        .filter((line) => line.account_id === account)
        .flatMap((line) => [line.debit_minor, -line.credit_minor]),
    );
  if (
    byAccount(d.accounts.asset_account_id) !== d.gross_minor ||
    byAccount(d.accounts.accumulated_account_id) !== -d.prior_minor
  )
    fail(
      409,
      'The journal must evidence the full acquisition cost and any opening accumulated depreciation',
    );
  return entry;
}

async function list(a: Access, kind: 'fixed_asset' | 'asset_model') {
  const records = await dbAll(
    'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 201',
    [...scope(a), kind],
  );
  return records.map((row) => decode(a, row));
}

async function board(a: Access, asset: ERPObject) {
  const saved = asset.data as Asset;
  const rows = saved.rows || [];
  const journals = await dbAll(
    `SELECT e.id,e.source_id,e.reference,e.status,
        EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.org_id=e.org_id AND r.environment=e.environment
          AND r.reverses_id=e.id AND r.status='posted') AS reversed,
        EXISTS(SELECT 1 FROM ac2_approvals ap JOIN ac_approval_bindings b ON b.approval_id=ap.id
          JOIN ac_memberships m ON m.org_id=ap.org_id AND m.user_id=ap.approver
          WHERE ap.org_id=e.org_id AND ap.environment=e.environment AND ap.resource_id=e.id
           AND ap.action='journal_posting' AND ap.status='approved' AND ap.expires_at>?
           AND b.consumed_at IS NULL AND m.role IN ('owner','admin','finance')) AS approved
     FROM ac_accounting_entries e WHERE e.org_id=? AND e.environment=? AND e.source_type='asset_depreciation'
        AND e.source_parent_id=?`,
    [now(), ...scope(a), asset.id],
  );
  const byCase = new Map(journals.map((row) => [row.source_id, row]));
  return rows.map((row) => {
    const entry = row.case_id && byCase.get(row.case_id);
    const posting = !row.amount_minor
      ? 'no_amount'
      : !entry
        ? 'proposed'
        : entry.reversed
          ? 'reversed'
          : entry.status === 'posted'
            ? 'posted'
            : entry.approved
              ? 'approved'
              : 'draft';
    return {
      ...row,
      posting,
      journal_entry_id: entry?.id ?? null,
      journal_reference: entry?.reference ?? null,
    };
  });
}

export async function listAssets(a: Access) {
  await accountingAccess(a);
  const assets = await list(a, 'fixed_asset');
  const totals = await dbAll(
    `SELECT e.source_parent_id,SUM(e.source_gross_minor) AS posted FROM ac_accounting_entries e
     WHERE e.org_id=? AND e.environment=? AND e.source_type='asset_depreciation' AND e.status='posted'
      AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.org_id=e.org_id AND r.environment=e.environment
        AND r.reverses_id=e.id AND r.status='posted')
     GROUP BY e.source_parent_id`,
    scope(a),
  );
  const posted = new Map(totals.map((row) => [row.source_parent_id, Number(row.posted)]));
  return {
    data: assets.slice(0, 200).map(({ data, ...asset }) => {
      const book = data.gross_minor - data.prior_minor - (posted.get(asset.id) || 0);
      const status =
        asset.status === 'running' && data.terms.method !== 'none' && book === data.salvage_minor
          ? 'fully_depreciated'
          : asset.status;
      return {
        id: asset.id,
        status,
        name: data.name,
        gross_minor: data.gross_minor,
        book_minor: book,
        currency: data.currency,
      };
    }),
  };
}

export async function listAssetModels(a: Access) {
  await accountingAccess(a);
  return { data: (await list(a, 'asset_model')).slice(0, 200) };
}

export async function assetSources(a: Access, query: unknown) {
  await accountingAccess(a);
  const d = z.object({ account: id, currency: currencySchema }).parse(query);
  return {
    data: await dbAll(
      `SELECT e.id,e.reference,e.entry_on,e.source_type,e.source_id,SUM(l.debit_minor-l.credit_minor) AS amount_minor
     FROM ac_accounting_entries e JOIN ac_accounting_lines l ON l.entry_id=e.id
      AND l.org_id=e.org_id AND l.environment=e.environment
     WHERE e.org_id=? AND e.environment=? AND l.account_id=? AND e.currency=? AND e.status='posted'
      AND e.reverses_id IS NULL AND e.source_type<>'asset_depreciation'
      AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.reverses_id=e.id
        AND r.org_id=e.org_id AND r.environment=e.environment AND r.status='posted')
      AND NOT EXISTS(SELECT 1 FROM ac_erp_objects a WHERE a.parent_id=e.id AND a.kind='fixed_asset'
        AND a.org_id=e.org_id AND a.environment=e.environment AND a.status<>'archived')
     GROUP BY e.id,e.reference,e.entry_on,e.source_type,e.source_id HAVING SUM(l.debit_minor-l.credit_minor)>0
     ORDER BY e.entry_on DESC,e.id LIMIT 100`,
      [...scope(a), d.account, d.currency],
    ),
  };
}

export async function assetDetail(a: Access, assetId: string) {
  await accountingAccess(a);
  const asset = await read(a, id.parse(assetId), 'fixed_asset');
  const rows = await board(a, asset);
  const posted = sumMinor(
    rows.filter((row) => row.posting === 'posted').map((row) => row.amount_minor),
  );
  const book = asset.data.gross_minor - asset.data.prior_minor - posted;
  return {
    asset,
    rows,
    book_minor: book,
    posted_minor: posted,
    status:
      asset.status === 'running' &&
      asset.data.terms.method !== 'none' &&
      book === asset.data.salvage_minor
        ? 'fully_depreciated'
        : asset.status,
    history: (await history(a, asset, 100)).map(({ snapshot: _snapshot, ...event }) => event),
  };
}

export async function saveAssetModel(
  a: Access,
  modelId: string | null,
  input: unknown,
  key: string,
) {
  if (modelId) id.parse(modelId);
  const d = assetModelInput.parse(input);
  return operation(
    a,
    'accounting.asset_model:' + (modelId || 'new'),
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      const old = modelId ? await read(a, modelId, 'asset_model') : null;
      if ((old?.version ?? 0) !== d.expected_version) fail(409, 'Asset model changed; reload');
      await checkAccounts(a, d.accounts);
      if (!old && (await list(a, 'asset_model')).length >= 200)
        fail(409, 'Asset model limit reached');
      return old ? update(a, old, d, {}, 'model_updated') : insert(a, 'asset_model', d);
    },
  );
}

export async function saveFixedAsset(
  a: Access,
  assetId: string | null,
  input: unknown,
  key: string,
) {
  if (assetId) id.parse(assetId);
  const d = fixedAssetInput.parse(input);
  return operation(
    a,
    'accounting.fixed_asset:' + (assetId || 'new'),
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      const old = assetId ? await read(a, assetId, 'fixed_asset') : null;
      if ((old?.version ?? 0) !== d.expected_version || (old && old.status !== 'draft'))
        fail(409, 'Only the current draft can be edited');
      if (d.start_on < d.acquisition_on || d.salvage_minor + d.prior_minor > d.gross_minor)
        fail(400, 'Review acquisition date, prorata date, salvage and prior depreciation');
      if (d.model_id) await read(a, d.model_id, 'asset_model');
      await checkAccounts(a, d.accounts);
      await acquisition(a, d);
      if (
        await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='fixed_asset' AND parent_id=? AND id<>? AND status<>'archived'",
          [...scope(a), d.acquisition_entry_id, assetId || ''],
        )
      )
        fail(409, 'This acquisition already supports another asset');
      if (!old && (await list(a, 'fixed_asset')).length >= 200)
        fail(409, 'Asset register limit reached');
      return old
        ? update(a, old, d, { parent_id: d.acquisition_entry_id }, 'draft_updated')
        : insert(a, 'fixed_asset', d, { parent: d.acquisition_entry_id, status: 'draft' });
    },
  );
}

async function compute(d: Asset, prior: number, start: string): Promise<Row[]> {
  const { rows } = await accountingPython(
    'assets',
    {
      ...d.terms,
      gross_minor: d.gross_minor,
      salvage_minor: d.salvage_minor,
      prior_minor: prior,
      start_on: start,
    },
    scheduleSchema,
  );
  const target = d.gross_minor - d.salvage_minor;
  let running = prior;
  let previous = '';
  for (const row of rows) {
    running += row.amount_minor;
    if (
      row.date < start ||
      row.date <= previous ||
      running > target ||
      row.cumulative_minor !== running ||
      row.remaining_minor !== target - running ||
      row.book_minor !== d.gross_minor - running
    )
      throw new Error('Depreciation schedule failed reconciliation');
    previous = row.date;
  }
  if (d.terms.method === 'none' ? rows.length !== 0 : running !== target)
    throw new Error('Depreciation schedule does not reach the target');
  return rows;
}

function nextDay(day: string) {
  return new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
}

export async function actOnAsset(a: Access, assetId: string, input: unknown, key: string) {
  id.parse(assetId);
  const d = assetActionInput.parse(input);
  return operation(
    a,
    'accounting.asset_action:' + assetId,
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      const asset = await read(a, assetId, 'fixed_asset');
      if (asset.version !== d.expected_version) fail(409, 'Asset changed; reload');
      const saved = asset.data as Asset;
      if (d.action === 'archive') {
        if (asset.status !== 'draft') fail(409, 'Only draft assets can be archived');
        return update(a, asset, saved, { status: 'archived' }, 'asset_archived');
      }
      if (d.action === 'compute' || d.action === 'confirm') {
        if (asset.status !== 'draft')
          fail(409, 'Only a draft asset can be calculated or confirmed');
        await checkAccounts(a, saved.accounts);
        await acquisition(a, saved);
        if (d.action === 'compute')
          return update(
            a,
            asset,
            { ...saved, rows: await compute(saved, saved.prior_minor, saved.start_on) },
            {},
            'board_calculated',
          );
        if (!saved.rows) fail(409, 'Compute and review the board before confirming');
        return update(a, asset, saved, { status: 'running' }, 'asset_confirmed');
      }
      if (asset.status !== 'running') fail(409, 'Confirm the asset before changing its board');
      const current = await board(a, asset);
      if (d.action === 'revise') {
        if (saved.terms.method === 'none' || d.terms.method === 'none')
          fail(409, 'Changing depreciability requires a separate accounting decision');
        if (current.some((row) => ['draft', 'approved'].includes(row.posting)))
          fail(409, 'Withdraw the outstanding depreciation draft before revising');
        const last = current.map((row) => row.posting).lastIndexOf('posted');
        const prefix = (saved.rows || []).slice(0, last + 1);
        const prior = prefix.at(-1)?.cumulative_minor ?? saved.prior_minor;
        if (prior === saved.gross_minor - saved.salvage_minor)
          fail(409, 'The asset is fully depreciated');
        const anchor = prefix.length ? nextDay(prefix.at(-1)!.date) : saved.start_on;
        const changed = { ...saved, terms: d.terms, revision_reason: d.reason };
        const future = await compute(changed, prior, anchor);
        if (prefix.length + future.length > 720) fail(409, 'Board history limit reached');
        return update(a, asset, { ...changed, rows: [...prefix, ...future] }, {}, 'board_revised');
      }
      const requestedDate = 'date' in d ? d.date : fail(400, 'Select a depreciation period');
      const selected =
        current.find((row) => row.date === requestedDate) ??
        fail(404, 'Depreciation period not found');
      if (d.action === 'withdraw') {
        if (!selected.case_id || !['draft', 'approved'].includes(selected.posting))
          fail(409, 'Only an outstanding draft can be withdrawn');
        const rows = saved.rows!.map((row) =>
          row.date === selected.date
            ? rowSchema.parse(
                Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'case_id')),
              )
            : row,
        );
        return update(a, asset, { ...saved, rows }, {}, 'period_withdrawn');
      }
      const due = current.find((row) => row.amount_minor > 0 && row.posting !== 'posted');
      if (due?.date !== selected.date || !['proposed', 'reversed'].includes(selected.posting))
        fail(409, 'Prepare only the next outstanding period');
      await checkAccounts(a, saved.accounts);
      await acquisition(a, saved);
      const evidence = await insert(
        a,
        'asset_depreciation',
        { date: selected.date, amount_minor: selected.amount_minor },
        { root: asset.id, status: 'prepared' },
      );
      const source = {
        type: 'asset_depreciation',
        id: evidence.id,
        source_on: selected.date,
        currency: saved.currency,
        description: 'Depreciation: ' + saved.name,
        amount_minor: selected.amount_minor,
        contact_id: null,
        facts: {
          asset_id: asset.id,
          acquisition_entry_id: saved.acquisition_entry_id,
          asset_version: asset.version,
          journal_id: saved.accounts.journal_id,
          accounts: saved.accounts,
          terms: saved.terms,
        },
      };
      const memo = 'Depreciation ' + selected.date;
      const entry = await prepareDerivedEntry(a, {
        source,
        source_hash: hash(canonical(source)),
        posting_on: selected.date,
        journal_id: saved.accounts.journal_id,
        adjustment_reason: memo,
        book_tax_minor: 0,
        lines: [
          {
            account_id: saved.accounts.expense_account_id,
            contact_id: null,
            debit_minor: selected.amount_minor,
            credit_minor: 0,
            memo,
          },
          {
            account_id: saved.accounts.accumulated_account_id,
            contact_id: null,
            debit_minor: 0,
            credit_minor: selected.amount_minor,
            memo,
          },
        ],
      });
      await update(
        a,
        asset,
        {
          ...saved,
          rows: saved.rows!.map((row) =>
            row.date === selected.date ? { ...row, case_id: evidence.id } : row,
          ),
        },
        {},
        'depreciation_journal_prepared',
      );
      return entry;
    },
  );
}

export async function validateAssetPosting(a: Access, entry: Entry) {
  const evidence = await read(a, entry.source_id, 'asset_depreciation');
  const asset = await read(a, evidence.root_id, 'fixed_asset');
  const rows = await board(a, asset);
  const due = rows.find((row) => row.amount_minor > 0 && row.posting !== 'posted');
  if (
    asset.status !== 'running' ||
    due?.case_id !== evidence.id ||
    due.date !== entry.entry_on ||
    asset.version !== entry.data.source_snapshot?.facts.asset_version + 1 ||
    entry.source_hash !== hash(canonical(entry.data.source_snapshot))
  )
    fail(409, 'Depreciation draft is no longer the next period on the asset board');
  await checkAccounts(a, asset.data.accounts);
  await acquisition(a, asset.data);
}

export async function validateAssetReversal(a: Access, entryId: string) {
  if (
    await dbGet(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='fixed_asset' AND parent_id=? AND status<>'archived'",
      [...scope(a), entryId],
    )
  )
    fail(409, 'Acquisition is linked to an asset');
  const original = await accountingEntry(a, entryId);
  if (
    original.reverses_id &&
    (await accountingEntry(a, original.reverses_id)).source_type === 'asset_depreciation'
  )
    fail(409, 'Reprepare depreciation from the asset board to restore a reversed period');
  if (original.source_type !== 'asset_depreciation') return;
  const evidence = await read(a, original.source_id, 'asset_depreciation');
  const asset = await read(a, evidence.root_id, 'fixed_asset');
  if (
    (await board(a, asset)).filter((row) => row.posting === 'posted').at(-1)?.case_id !==
    evidence.id
  )
    fail(409, 'Reverse later depreciation periods before this one');
}

export async function recordAssetJournalPosting(a: Access, posted: Entry) {
  const original = posted.reverses_id ? await accountingEntry(a, posted.reverses_id) : posted;
  if (original.source_type !== 'asset_depreciation') return;
  const evidence = await read(a, original.source_id, 'asset_depreciation');
  const asset = await read(a, evidence.root_id, 'fixed_asset');
  await update(
    a,
    asset,
    {
      ...asset.data,
      last_posted_journal_id: posted.id,
    },
    {},
    posted.reverses_id ? 'depreciation_reversed' : 'depreciation_posted',
  );
}
