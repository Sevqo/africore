import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { hash } from '../platform/crypto';
import { currencySchema } from '../platform/domain';
import { canonical } from '../finance/service';
import { accountingAccess, accountingSettings, prepareDerivedEntry } from './accounting';
import { operation, read, insert, update, decode } from './store';
import { calculateTaxWithPython } from './python-accounting';
export const taxCodeInput = z
  .object({
    expected_version: z.number().int().min(0),
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{1,20}$/),
    name: z.string().trim().min(2).max(150),
    rate_bps: z.number().int().min(0).max(10000),
    purpose: z.enum(['sales', 'purchase']),
    account_id: z.string().uuid(),
    active: z.boolean().default(true),
  })
  .strict();
export const taxEntryInput = z
  .object({
    tax_code_id: z.string().uuid(),
    expected_tax_version: z.number().int().positive(),
    entry_on: z.string().date(),
    currency: currencySchema,
    base_minor: z.number().int().positive().max(50000000000),
    base_account_id: z.string().uuid(),
    counter_account_id: z.string().uuid(),
    reason: z.string().trim().min(8).max(2000),
    acknowledge_separate_manual_adjustment: z.literal(true),
    cash_rounding: z
      .discriminatedUnion('strategy', [
        z
          .object({
            strategy: z.literal('add_invoice_line'),
            increment_minor: z.number().int().min(1).max(1_000_000),
            method: z.enum(['UP', 'DOWN', 'HALF-UP']),
            profit_account_id: z.string().uuid(),
            loss_account_id: z.string().uuid(),
          })
          .strict(),
        z
          .object({
            strategy: z.literal('biggest_tax'),
            increment_minor: z.number().int().min(1).max(1_000_000),
            method: z.enum(['UP', 'DOWN', 'HALF-UP']),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();
export async function taxCodes(a: Access) {
  await accountingAccess(a);
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='accounting_tax_code' ORDER BY created_at,id LIMIT 201",
    [a.org, a.environment],
  );
  return {
    data: rows.slice(0, 200).map((r) => decode(a, r)),
    truncated: rows.length > 200,
    notice:
      'User-configured simple percentage tax codes for separate manual adjustments. A code is not a statutory rate certification, recoverability decision or filing integration. Shared invoice/bill source journals retain their original tax facts and are not recalculated by these codes.',
  };
}
export async function saveTaxCode(a: Access, id: string | null, input: unknown, key: string) {
  const d = taxCodeInput.parse(input);
  return operation(
    a,
    'accounting.tax-code:' + String(id || 'new'),
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      await accountingSettings(a);
      const old = id ? await read(a, id, 'accounting_tax_code') : null;
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Tax code changed; reload');
      const list = await taxCodes(a);
      if (!old && list.data.length >= 200) fail(409, 'Tax code evaluation limit reached');
      if (list.data.some((v) => v.id !== id && v.data.code === d.code))
        fail(409, 'Tax code already exists');
      const account = await dbGet(
        'SELECT type,active FROM ac_accounting_accounts WHERE id=? AND org_id=? AND environment=?',
        [d.account_id, a.org, a.environment],
      );
      if (
        !account ||
        !Number(account.active) ||
        account.type !== (d.purpose === 'sales' ? 'liability' : 'asset')
      )
        fail(
          400,
          'Choose an active scoped liability account for sales tax or asset account for a manually assessed purchase-tax adjustment',
        );
      return old
        ? update(a, old, d, { status: d.active ? 'active' : 'archived' }, 'tax_code_revised')
        : insert(a, 'accounting_tax_code', d, { status: d.active ? 'active' : 'archived' });
    },
  );
}
export async function previewTaxEntry(a: Access, input: unknown) {
  await accountingAccess(a, true);
  const d = taxEntryInput.parse(input),
    code = await read(a, d.tax_code_id, 'accounting_tax_code'),
    settings = await accountingSettings(a);
  if (code.status !== 'active' || code.version !== d.expected_tax_version)
    fail(409, 'Review an active current tax code version');
  if (d.entry_on < settings.start_on) fail(409, 'Tax adjustment predates the reviewed books');
  const roundingRule = d.cash_rounding;
  const ids = [d.base_account_id, d.counter_account_id, code.data.account_id];
  if (roundingRule?.strategy === 'add_invoice_line')
    ids.push(roundingRule.profit_account_id, roundingRule.loss_account_id);
  if (new Set(ids).size !== ids.length) fail(400, 'Choose distinct journal accounts');
  const accounts: any[] = [];
  for (const id of ids) {
    const account = await dbGet(
      'SELECT id,code,name,type,active FROM ac_accounting_accounts WHERE id=? AND org_id=? AND environment=?',
      [id, a.org, a.environment],
    );
    if (!account || !Number(account.active)) fail(400, 'Choose active scoped accounts');
    accounts.push(account);
  }
  if (accounts[2].type !== (code.data.purpose === 'sales' ? 'liability' : 'asset'))
    fail(409, 'Tax account classification changed; review this tax code');
  if (
    (code.data.purpose === 'sales' &&
      (accounts[0].type !== 'revenue' || accounts[1].type !== 'asset')) ||
    (code.data.purpose === 'purchase' &&
      (!['expense', 'asset'].includes(accounts[0].type) || accounts[1].type !== 'liability'))
  )
    fail(
      400,
      'Sales adjustments require revenue/asset base and counter accounts; purchase adjustments require expense-or-asset/liability accounts',
    );
  if (
    roundingRule?.strategy === 'add_invoice_line' &&
    (accounts[3].type !== 'revenue' || accounts[4].type !== 'expense')
  )
    fail(
      400,
      'Choose a revenue account for rounding gains and an expense account for rounding losses',
    );
  const calculation = await calculateTaxWithPython(
      d.base_minor,
      code.data.rate_bps,
      roundingRule && {
        increment_minor: roundingRule.increment_minor,
        method: roundingRule.method,
      },
    ),
    difference = calculation.cash_rounding?.difference_minor ?? 0,
    tax = calculation.tax_minor,
    total = calculation.cash_rounding?.rounded_total_minor ?? calculation.total_minor,
    taxRounding = roundingRule?.strategy === 'biggest_tax',
    bookTax = tax + (taxRounding ? difference : 0),
    sales = code.data.purpose === 'sales',
    line = (index: number, debit: number, credit: number, memo = d.reason) => ({
      account_id: accounts[index].id,
      contact_id: null,
      debit_minor: debit,
      credit_minor: credit,
      memo,
    }),
    lines = sales
      ? [line(1, total, 0), line(0, 0, d.base_minor), ...(tax ? [line(2, 0, tax)] : [])]
      : [line(0, d.base_minor, 0), ...(tax ? [line(2, tax, 0)] : []), line(1, 0, total)];
  if (roundingRule && (total <= 0 || total > 100_000_000_000))
    fail(400, 'Rounded total falls outside the supported journal amount');
  if (taxRounding && difference && (!tax || bookTax < 0))
    fail(400, 'Tax rounding requires a tax amount that can absorb the difference');
  if (difference) {
    const signedCredit = sales ? difference : -difference;
    lines.push(
      line(
        taxRounding ? 2 : signedCredit > 0 ? 3 : 4,
        Math.max(0, -signedCredit),
        Math.max(0, signedCredit),
        taxRounding ? 'Cash rounding on ' + code.data.code : 'Cash rounding difference',
      ),
    );
  }
  return {
    input: d,
    tax_code: {
      id: code.id,
      version: code.version,
      code: code.data.code,
      name: code.data.name,
      rate_bps: code.data.rate_bps,
      purpose: code.data.purpose,
      account_id: code.data.account_id,
    },
    base_minor: d.base_minor,
    tax_minor: bookTax,
    total_minor: total,
    ...(roundingRule && {
      cash_rounding: {
        ...roundingRule,
        original_total_minor: calculation.total_minor,
        original_tax_minor: tax,
        difference_minor: difference,
      },
    }),
    lines,
    accounts,
    notice:
      'Separate manual adjustment only. Do not duplicate an invoice or supplier bill already prepared through Shared financial sources. Tax is rounded once in integer minor units. Posting still requires an exact separate-person review. No jurisdictional compliance or tax recoverability is established.',
  };
}
export async function taxAdjustmentSource(a: Access, id: string) {
  await accountingAccess(a);
  const r = await read(a, id, 'accounting_tax_case'),
    d = r.data;
  return {
    type: 'configured_tax_entry',
    id,
    source_on: d.input.entry_on,
    currency: d.input.currency,
    description: 'Manual tax adjustment ' + d.tax_code.code + ' · ' + d.input.reason,
    amount_minor: d.total_minor,
    contact_id: null,
    facts: {
      input: d.input,
      tax_code: d.tax_code,
      base_minor: d.base_minor,
      tax_minor: d.tax_minor,
      total_minor: d.total_minor,
      ...(d.cash_rounding && { cash_rounding: d.cash_rounding }),
      lines: d.lines,
      assurance: 'user_configured_manual_adjustment_not_statutory_certification',
    },
  };
}
export async function prepareTaxEntry(a: Access, input: unknown, key: string) {
  const d = taxEntryInput.parse(input);
  return operation(
    a,
    'accounting.tax-entry',
    key,
    d,
    () => accountingAccess(a, true),
    async () => {
      const plan = await previewTaxEntry(a, d),
        record = await insert(a, 'accounting_tax_case', plan, {
          root: d.tax_code_id,
          status: 'prepared',
        }),
        source = await taxAdjustmentSource(a, record.id),
        sourceHash = hash(
          canonical({
            schema_version: 1,
            type: source.type,
            id: source.id,
            source_on: source.source_on,
            currency: source.currency,
            amount_minor: source.amount_minor,
            contact_id: source.contact_id,
            facts: source.facts,
          }),
        );
      return prepareDerivedEntry(a, {
        source,
        source_hash: sourceHash,
        posting_on: d.entry_on,
        adjustment_reason: d.reason,
        book_tax_minor: plan.tax_minor,
        lines: plan.lines,
      });
    },
  );
}
