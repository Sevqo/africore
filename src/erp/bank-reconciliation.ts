import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { currencyDigits, sumMinor } from '../finance/money';
import { type Access, fail } from '../platform/auth';
import { hash } from '../platform/crypto';
import { currencySchema } from '../platform/domain';
import { accountingAccess, accountingSettings } from './accounting';
import { bankPython } from './bank-python';
import { decode, history, insert, operation, read, update, type ERPObject } from './store';

const id = z.string().uuid();
const minor = z.number().int().min(-100_000_000_000).max(100_000_000_000);
const positive = minor.min(1);
const scope = (a: Access) => [a.org, a.environment];
const pageSize = 25;
const page = z.coerce.number().int().min(0).max(10000).default(0);
const counted = ['applied', 'reversal_pending', 'reversal_approved'];
const statuses = ['unmatched', 'partial', 'reconciled'] as const;
export const bankJournalInput = z
  .object({
    journal_id: id,
    account_id: id,
    currency: currencySchema,
  })
  .strict();
export const bankStatementInput = z
  .object({
    bank_journal_id: id,
    name: z.string().trim().min(1).max(100),
    opening_minor: minor,
    closing_minor: minor,
    csv: z.string().min(1).max(96_000),
  })
  .strict();
export const bankMatchInput = z
  .object({
    candidate_id: id,
    amount_minor: positive,
    reason: z.string().trim().min(4).max(400),
  })
  .strict();
export const bankDecisionInput = z
  .object({
    action: z.enum(['approve', 'reject', 'apply', 'request_reversal', 'cancel']),
    expected_version: z.number().int().positive(),
    reason: z.string().trim().min(4).max(400),
  })
  .strict();

async function records(a: Access, kind: ERPObject['kind'], suffix: string, params: unknown[] = []) {
  return (
    await dbAll(
      'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ' + suffix,
      [...scope(a), kind, ...params],
    )
  ).map((row) => decode(a, row));
}

async function checkBankAccount(a: Access, d: z.infer<typeof bankJournalInput>) {
  const journal = await dbGet(
    'SELECT id FROM ac_accounting_journals WHERE org_id=? AND environment=? AND id=? AND active=1',
    [...scope(a), d.journal_id],
  );
  const account = await dbGet(
    "SELECT id FROM ac_accounting_accounts WHERE org_id=? AND environment=? AND id=? AND type='asset' AND active=1",
    [...scope(a), d.account_id],
  );
  if (!journal || !account) fail(400, 'Choose an active scoped journal and bank asset account');
}

export async function listBankJournals(a: Access) {
  await accountingAccess(a);
  return { data: await records(a, 'bank_journal', 'ORDER BY created_at,id LIMIT 100') };
}

export async function unmatchedBankLines(a: Access, journalId: string, query: unknown) {
  await accountingAccess(a);
  const bank = await read(a, id.parse(journalId), 'bank_journal');
  const d = z.object({ page }).parse(query);
  const rows = await records(
    a,
    'bank_statement_line',
    "AND parent_id=? AND status IN ('unmatched','partial') ORDER BY due_on DESC,id DESC LIMIT ? OFFSET ?",
    [bank.id, pageSize + 1, d.page * pageSize],
  );
  return {
    currency: bank.data.currency,
    data: rows.slice(0, pageSize),
    has_more: rows.length > pageSize,
  };
}

export async function createBankJournal(a: Access, input: unknown, key: string) {
  const d = bankJournalInput.parse(input);
  return operation(
    a,
    'accounting.bank_journal',
    key,
    d,
    () => accountingAccess(a, true, true),
    async () => {
      await accountingSettings(a);
      await checkBankAccount(a, d);
      const journals = (await listBankJournals(a)).data;
      if (journals.length >= 100) fail(409, 'Bank journal limit reached');
      if (
        journals.some(
          (j) =>
            j.data.currency === d.currency &&
            (j.data.journal_id === d.journal_id || j.data.account_id === d.account_id),
        )
      )
        fail(409, 'A bank journal already uses this journal or asset account in this currency');
      return insert(a, 'bank_journal', d);
    },
  );
}

const parsedStatement = z.object({
  lines: z
    .array(
      z.object({
        date: z.string().date(),
        reference: z.string().min(1).max(100),
        reference_key: z.string().min(1).max(300),
        description: z.string().min(1).max(250),
        amount_minor: minor.refine((n) => n !== 0),
      }),
    )
    .min(1)
    .max(200),
});

export async function importBankStatement(a: Access, input: unknown, key: string) {
  const d = bankStatementInput.parse(input);
  await accountingAccess(a, true);
  const bank = await read(a, d.bank_journal_id, 'bank_journal');
  const { lines } = await bankPython(
    {
      operation: 'parse',
      csv: d.csv,
      currency: bank.data.currency,
      digits: currencyDigits[bank.data.currency],
    },
    parsedStatement,
  );
  const movement = sumMinor(lines.map((line) => line.amount_minor));
  if (sumMinor([d.opening_minor, movement]) !== d.closing_minor)
    fail(400, 'Opening balance plus transactions must equal the supplied closing balance');
  const { csv, ...details } = d;
  const fileHash = hash(csv);
  const keys = lines.map((line) => hash(bank.id + ':' + line.reference_key));
  return operation(
    a,
    'accounting.bank_import',
    key,
    { ...details, fileHash },
    () => accountingAccess(a, true),
    async () => {
      await checkBankAccount(a, bank.data);
      const existing = await records(a, 'bank_statement', 'AND root_id=? AND stage=? LIMIT 1', [
        bank.id,
        fileHash,
      ]);
      if (existing[0]) {
        if (
          existing[0].data.opening_minor !== d.opening_minor ||
          existing[0].data.closing_minor !== d.closing_minor
        )
          fail(409, 'This file has already been imported with different balances');
        return existing[0];
      }
      const settings = await accountingSettings(a);
      if (lines.some((line) => line.date < settings.start_on))
        fail(400, 'Statement contains transactions before the reviewed books');
      const duplicates = await dbGet(
        'SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? AND stage IN (' +
          keys.map(() => '?').join(',') +
          ') LIMIT 1',
        [...scope(a), 'bank_statement_line', ...keys],
      );
      if (duplicates)
        fail(409, 'One or more references are already imported for this bank journal');
      const statement = await insert(
        a,
        'bank_statement',
        {
          ...details,
          currency: bank.data.currency,
          movement_minor: movement,
          line_count: lines.length,
        },
        { root: bank.id, stage: fileHash },
      );
      for (let index = 0; index < lines.length; index++) {
        const { reference_key, ...line } = lines[index];
        await insert(
          a,
          'bank_statement_line',
          { ...line, matched_minor: 0 },
          {
            root: statement.id,
            parent: bank.id,
            stage: keys[index],
            position: index,
            status: 'unmatched',
            due: line.date,
          },
        );
      }
      return statement;
    },
  );
}

export async function listBankStatements(a: Access, query: unknown) {
  await accountingAccess(a);
  const d = z.object({ bank_journal_id: id.optional(), page }).parse(query);
  const rows = await records(
    a,
    'bank_statement',
    (d.bank_journal_id ? 'AND root_id=? ' : '') +
      'ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
    [...(d.bank_journal_id ? [d.bank_journal_id] : []), pageSize + 1, d.page * pageSize],
  );
  return { data: rows.slice(0, pageSize), has_more: rows.length > pageSize };
}

export async function bankStatement(a: Access, statementId: string, query: unknown) {
  await accountingAccess(a);
  const d = z
    .object({
      page,
      status: z.enum(statuses).optional(),
      search: z.string().trim().max(100).optional(),
    })
    .parse(query);
  const statement = await read(a, id.parse(statementId), 'bank_statement');
  const lines = await records(
    a,
    'bank_statement_line',
    'AND root_id=? ORDER BY position,id LIMIT 200',
    [statement.id],
  );
  const search = d.search?.toLowerCase();
  const selected = lines.filter(
    (line) =>
      (!d.status || line.status === d.status) &&
      (!search ||
        [line.data.reference, line.data.description, line.data.date].some((value: string) =>
          value.toLowerCase().includes(search),
        )),
  );
  const counts = { unmatched: 0, partial: 0, reconciled: 0 };
  let outstanding_in_minor = 0;
  let outstanding_out_minor = 0;
  for (const line of lines) {
    counts[line.status as keyof typeof counts]++;
    const outstanding = Math.abs(line.data.amount_minor) - line.data.matched_minor;
    if (line.data.amount_minor > 0) outstanding_in_minor += outstanding;
    else outstanding_out_minor += outstanding;
  }
  return {
    statement,
    counts,
    outstanding_in_minor,
    outstanding_out_minor,
    total: selected.length,
    lines: selected.slice(d.page * pageSize, (d.page + 1) * pageSize),
  };
}

interface Candidate {
  id: string;
  entry_id: string;
  reference: string;
  date: string;
  source_type: string;
  source_id: string;
  provider_reference: string | null;
  contact_id: string | null;
  amount_minor: number;
  available_minor: number;
}

async function candidateRows(
  a: Access,
  line: ERPObject,
  bank: ERPObject,
  candidateId?: string,
  partner?: string,
) {
  const booked = line.data.amount_minor > 0 ? 'l.debit_minor' : 'l.credit_minor';
  const dateShift = (days: number) =>
    new Date(Date.parse(line.data.date) + days * 86_400_000).toISOString().slice(0, 10);
  const rows = await dbAll(
    `SELECT * FROM (
     SELECT l.id,l.entry_id,l.contact_id,e.reference,e.entry_on AS date,e.source_type,e.source_id,${booked} AS amount_minor,
       CASE WHEN e.source_type='allocation' THEN (
         SELECT MIN(d.provider_reference) FROM ac_effective_allocations b
         JOIN ac_events p ON p.id=b.event_id AND p.org_id=b.org_id AND p.environment=b.environment
         JOIN ac_payment_event_details d ON d.event_id=p.id
         WHERE b.org_id=e.org_id AND b.environment=e.environment AND b.id=e.source_id
           AND p.status='succeeded' AND p.currency=e.currency
       ) END AS provider_reference
     FROM ac_accounting_lines l JOIN ac_accounting_entries e ON e.id=l.entry_id
       AND e.org_id=l.org_id AND e.environment=l.environment
     WHERE l.org_id=? AND l.environment=? AND l.account_id=? AND e.currency=? AND e.status='posted'
       AND ${booked}>0 AND e.reverses_id IS NULL AND e.entry_on>=? AND e.entry_on<=?
       AND NOT EXISTS(SELECT 1 FROM ac_accounting_entries r WHERE r.org_id=e.org_id
         AND r.environment=e.environment AND r.status='posted' AND r.reverses_id=e.id)` +
      (candidateId ? ' AND l.id=?' : '') +
      (partner ? ' AND l.contact_id=?' : '') +
      ') eligible ORDER BY CASE WHEN LOWER(reference)=LOWER(?) OR LOWER(source_id)=LOWER(?)' +
      ' OR LOWER(provider_reference)=LOWER(?) THEN 0 ELSE 1 END,' +
      ' CASE WHEN amount_minor=? THEN 0 ELSE 1 END,date DESC,id LIMIT 101',
    [
      ...scope(a),
      bank.data.account_id,
      bank.data.currency,
      dateShift(-31),
      dateShift(31),
      ...(candidateId ? [candidateId] : []),
      ...(partner ? [partner] : []),
      line.data.reference,
      line.data.reference,
      line.data.reference,
      Math.abs(line.data.amount_minor) - line.data.matched_minor,
    ],
  );
  if (!rows.length) return [];
  const links = await records(
    a,
    'bank_match',
    "AND status IN ('applied','reversal_pending','reversal_approved') AND parent_id IN (" +
      rows.map(() => '?').join(',') +
      ') LIMIT 2001',
    rows.map((row) => row.id),
  );
  if (links.length > 2000) fail(409, 'Candidate usage limit reached; narrow the selection');
  const consumed = new Map<string, number>();
  for (const link of links)
    consumed.set(link.parent_id!, (consumed.get(link.parent_id!) || 0) + link.data.amount_minor);
  return rows.map((row) => ({
    ...row,
    amount_minor: Number(row.amount_minor),
    available_minor: Number(row.amount_minor) - (consumed.get(row.id) || 0),
  })) as Candidate[];
}

const scores = z.object({
  matches: z
    .array(
      z.object({
        id,
        score: z.number().int().min(0).max(100),
        reasons: z.array(z.string()).max(3),
        suggested_minor: positive,
      }),
    )
    .max(101),
});

export async function bankLine(a: Access, lineId: string, query: unknown) {
  const role = await accountingAccess(a);
  const d = z.object({ partner_id: id.optional(), history_page: page }).parse(query);
  const line = await read(a, id.parse(lineId), 'bank_statement_line');
  const bank = await read(a, line.parent_id!, 'bank_journal');
  const matches = await records(
    a,
    'bank_match',
    'AND root_id=? ORDER BY created_at DESC,id DESC LIMIT 101',
    [line.id],
  );
  const rejected = new Set(
    matches.filter((match) => match.status === 'rejected').map((match) => match.parent_id),
  );
  const eligible =
    line.status === 'reconciled' ? [] : await candidateRows(a, line, bank, undefined, d.partner_id);
  const candidates = eligible.slice(0, 100).filter((row) => !rejected.has(row.id));
  const result = candidates.length
    ? await bankPython(
        {
          operation: 'match',
          line: {
            date: line.data.date,
            reference: line.data.reference,
            remaining_minor: Math.abs(line.data.amount_minor) - line.data.matched_minor,
          },
          candidates,
        },
        scores,
      )
    : { matches: [] };
  const lookup = new Map(candidates.map((row) => [row.id, row]));
  const events = await history(a, line, pageSize + 1, d.history_page * pageSize);
  return {
    line,
    currency: bank.data.currency,
    matches: matches.slice(0, 100).map((match) => ({
      ...match,
      can_review:
        ['owner', 'admin'].includes(role) &&
        (match.status === 'pending'
          ? match.data.proposer !== a.actor
          : match.status === 'reversal_pending' && match.data.reversal_proposer !== a.actor),
      can_cancel: ['pending', 'approved'].includes(match.status)
        ? a.actor === match.data.proposer
        : ['reversal_pending', 'reversal_approved'].includes(match.status) &&
          a.actor === match.data.reversal_proposer,
    })),
    candidates: result.matches.flatMap((match) => {
      const row = lookup.get(match.id);
      return row ? [{ ...row, ...match }] : [];
    }),
    candidates_truncated: eligible.length > 100,
    history: events.slice(0, pageSize),
    history_has_more: events.length > pageSize,
  };
}

async function checkCapacity(a: Access, line: ERPObject, candidateId: string, amount: number) {
  const bank = await read(a, line.parent_id!, 'bank_journal');
  await checkBankAccount(a, bank.data);
  const [candidate] = await candidateRows(a, line, bank, candidateId);
  if (
    !candidate ||
    amount > candidate.available_minor ||
    amount > Math.abs(line.data.amount_minor) - line.data.matched_minor
  )
    fail(409, 'Candidate or statement balance changed; review the remaining amounts');
  return candidate;
}

export async function proposeBankMatch(a: Access, lineId: string, input: unknown, key: string) {
  const d = bankMatchInput.parse(input);
  id.parse(lineId);
  return operation(
    a,
    'accounting.bank_propose:' + lineId,
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      const line = await read(a, lineId, 'bank_statement_line');
      const existing = await records(a, 'bank_match', 'AND root_id=? LIMIT 100', [line.id]);
      if (existing.length >= 100) fail(409, 'Match history limit reached for this line');
      if (
        existing.some((match) =>
          ['pending', 'approved', 'reversal_pending', 'reversal_approved'].includes(match.status),
        )
      )
        fail(409, 'Resolve the current review first');
      const candidate = await checkCapacity(a, line, d.candidate_id, d.amount_minor);
      const match = await insert(
        a,
        'bank_match',
        { ...d, candidate, proposer: a.actor },
        {
          root: line.id,
          parent: candidate.id,
          status: 'pending',
        },
      );
      await update(
        a,
        line,
        { ...line.data, last_match_id: match.id, last_reason: d.reason },
        {},
        'match_proposed',
      );
      return match;
    },
  );
}

export async function decideBankMatch(a: Access, matchId: string, input: unknown, key: string) {
  const d = bankDecisionInput.parse(input);
  id.parse(matchId);
  const reviewer = d.action === 'approve' || d.action === 'reject';
  return operation(
    a,
    'accounting.bank_decide:' + matchId,
    key,
    d,
    () => accountingAccess(a, true, reviewer),
    async () => {
      const match = await read(a, matchId, 'bank_match');
      const line = await read(a, match.root_id, 'bank_statement_line');
      if (match.version !== d.expected_version) fail(409, 'Match changed; reload before deciding');
      const reversing = match.status.startsWith('reversal_');
      let next: string;
      let data = { ...match.data };
      let matched = line.data.matched_minor as number;
      if (d.action === 'request_reversal') {
        if (match.status !== 'applied') fail(409, 'Only an applied match can be reversed');
        const pending = await records(
          a,
          'bank_match',
          "AND root_id=? AND status IN ('pending','approved','reversal_pending','reversal_approved') LIMIT 1",
          [line.id],
        );
        if (pending.length) fail(409, 'Resolve the current review first');
        data = { ...data, reversal_proposer: a.actor, reversal_reason: d.reason };
        next = 'reversal_pending';
      } else if (d.action === 'cancel') {
        if (
          !['pending', 'approved', 'reversal_pending', 'reversal_approved'].includes(match.status)
        )
          fail(409, 'Only an unapplied decision can be withdrawn');
        if (a.actor !== (reversing ? data.reversal_proposer : data.proposer))
          fail(403, 'Only the proposer can withdraw this decision');
        next = reversing ? 'applied' : 'cancelled';
      } else if (reviewer) {
        if (!['pending', 'reversal_pending'].includes(match.status)) fail(409, 'No pending review');
        if (a.actor === (reversing ? data.reversal_proposer : data.proposer))
          fail(403, 'A different owner or administrator must review');
        if (d.action === 'approve' && !reversing)
          await checkCapacity(a, line, match.parent_id!, data.amount_minor);
        data = {
          ...data,
          [reversing ? 'reversal_review' : 'review']: {
            actor: a.actor,
            decision: d.action,
            reason: d.reason,
          },
        };
        next = reversing
          ? d.action === 'approve'
            ? 'reversal_approved'
            : 'applied'
          : d.action === 'approve'
            ? 'approved'
            : 'rejected';
      } else {
        if (!['approved', 'reversal_approved'].includes(match.status))
          fail(409, 'Separate approval is required');
        const approval = reversing ? data.reversal_review : data.review;
        const currentReviewer = await dbGet(
          "SELECT user_id FROM ac_memberships WHERE org_id=? AND user_id=? AND role IN ('owner','admin')",
          [a.org, approval.actor],
        );
        if (!currentReviewer)
          fail(409, 'Reviewer authority changed; withdraw and request a new review');
        if (!reversing) {
          await checkCapacity(a, line, match.parent_id!, data.amount_minor);
          matched += data.amount_minor;
        } else {
          if (!counted.includes(match.status) || matched < data.amount_minor)
            fail(409, 'Match balance changed');
          matched -= data.amount_minor;
        }
        next = reversing ? 'reversed' : 'applied';
        data = {
          ...data,
          [reversing ? 'reversal' : 'application']: { actor: a.actor, reason: d.reason },
        };
      }
      const changed = await update(
        a,
        match,
        data,
        { status: next },
        d.action + (reversing ? '_reversal' : ''),
      );
      await update(
        a,
        line,
        { ...line.data, matched_minor: matched, last_match_id: match.id, last_reason: d.reason },
        {
          status:
            matched === 0
              ? 'unmatched'
              : matched === Math.abs(line.data.amount_minor)
                ? 'reconciled'
                : 'partial',
        },
        d.action + (reversing ? '_reversal' : ''),
      );
      return changed;
    },
  );
}
