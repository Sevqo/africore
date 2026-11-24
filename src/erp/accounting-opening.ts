import { z } from 'zod';
import { dbAll } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { currencySchema } from '../platform/domain';
import { accountingAccess, accountingSettings, saveJournalEntry } from './accounting';
import { accountingPython } from './bank-python';

export const openingImportInput = z
  .object({
    journal_id: z.uuid(),
    entry_on: z.iso.date(),
    currency: currencySchema,
    opening_reference: z.string().trim().min(3).max(250),
    csv: z.string().min(1).max(65536),
  })
  .strict();

export async function importOpening(a: Access, input: unknown, key: string) {
  await accountingAccess(a, true);
  const { csv, ...d } = openingImportInput.parse(input);
  const result = await accountingPython(
    'opening',
    { csv },
    z
      .object({
        lines: z
          .array(
            z
              .object({
                account_code: z.string().regex(/^[A-Z0-9-]{1,20}$/),
                debit_minor: z.number().int().min(0).max(100_000_000_000),
                credit_minor: z.number().int().min(0).max(100_000_000_000),
                memo: z.string().max(1000),
              })
              .strict(),
          )
          .min(2)
          .max(200),
      })
      .strict(),
  );
  const accounts = await dbAll(
    'SELECT id,code FROM ac_accounting_accounts WHERE org_id=? AND environment=? AND active=1',
    [a.org, a.environment],
  );
  const byCode = new Map(accounts.map((account) => [account.code, account.id]));
  return saveJournalEntry(
    a,
    null,
    {
      ...d,
      expected_version: 0,
      description: d.opening_reference,
      opening_entry: true,
      lines: result.lines.map(({ account_code, ...line }) => ({
        ...line,
        account_id:
          byCode.get(account_code) ?? fail(400, 'Unknown active opening account ' + account_code),
      })),
    },
    key,
  );
}

export async function openingRegister(a: Access) {
  await accountingAccess(a);
  const s = await accountingSettings(a);
  return {
    start_on: s.start_on,
    policy: s.opening_policy,
    data: await (await import('./accounting')).openingJournalRegister(a, s.start_on),
  };
}
