import { useState } from 'react';
import { Field, Form, today, factor, money, type API } from '../operations/UI';
import { parseMoney, sumMinor } from '../../../src/finance/money';
import { Overlay } from '../components/Overlay';
export function JournalEditor({
  entry: e,
  configuration: c,
  api,
  onSaved,
  onClose,
}: {
  entry?: any;
  configuration: any;
  api: API;
  onSaved: (entry: any) => void;
  onClose: () => void;
}) {
  const [currency, setCurrency] = useState(e?.currency || c.settings.currency),
    [lines, setLines] = useState<any[]>(
      e?.lines.map((l: any) => ({
        key: l.id,
        account_id: l.account_id,
        contact_id: l.contact_id,
        debit: String(l.debit_minor / factor(e.currency)),
        credit: String(l.credit_minor / factor(e.currency)),
        memo: l.data.memo,
      })) || [
        {
          key: crypto.randomUUID(),
          account_id: '',
          contact_id: null,
          debit: '',
          credit: '',
          memo: '',
        },
        {
          key: crypto.randomUUID(),
          account_id: '',
          contact_id: null,
          debit: '',
          credit: '',
          memo: '',
        },
      ],
    );
  function amount(value: string) {
    return value.trim() ? parseMoney(value, currency) : 0;
  }
  const validLines = lines.length >= 2 && lines.every((line) => {
    try {
      const debit = amount(line.debit), credit = amount(line.credit);
      return !!line.account_id && ((debit > 0) !== (credit > 0));
    } catch {
      return false;
    }
  });
  const totals = (() => {
    try {
      return {
        debit: sumMinor(lines.map((l) => amount(l.debit))),
        credit: sumMinor(lines.map((l) => amount(l.credit))),
      };
    } catch {
      return null;
    }
  })();
  function change(key: string, field: string, value: string) {
    setLines((v) => v.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }
  return (
    <Overlay onClose={onClose}>
      <section
        className="panel work-editor acc-journal-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-editor-title"
      >
        <h2 id="journal-editor-title">{e ? 'Edit manual draft' : 'Prepare a journal draft'}</h2>
        <p>
          Drafts may be incomplete. Posting requires balanced lines, an open period and an exact
          approval from a different owner or administrator. This ledger operation does not move
          funds.
        </p>
        <Form
          submit={async (d) => {
            if (!validLines) throw new Error('Complete each journal line with an account and exactly one non-zero debit or credit.');
            const result = await api(
              '/accounting/entries' + (e ? '/' + e.id : ''),
              e ? 'PUT' : 'POST',
              {
                expected_version: e?.version || 0,
                journal_id: d.journal,
                entry_on: d.date,
                currency,
                description: d.description,
                opening_entry: d.opening === 'on',
                lines: lines.map((l) => ({
                  account_id: l.account_id,
                  contact_id: l.contact_id || null,
                  debit_minor: amount(l.debit),
                  credit_minor: amount(l.credit),
                  memo: l.memo,
                })),
              },
            );
            onSaved(result);
          }}
        >
          <div className="form-grid">
            <Field label="Posting date">
              <input
                name="date"
                type="date"
                required
                min={c.settings.start_on}
                defaultValue={e?.entry_on || today()}
              />
            </Field>
            <Field label="Journal">
              <select name="journal" required defaultValue={e?.journal_id || c.journals[0]?.id}>
                {c.journals
                  .filter((j: any) => j.active || j.id === e?.journal_id)
                  .map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {j.code} · {j.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Entry currency">
              <select
                value={currency}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    lines.some((line) => line.debit.trim() || line.credit.trim()) &&
                    !window.confirm('Changing currency clears entered debit and credit amounts. Continue?')
                  ) return;
                  setCurrency(next);
                  setLines((v) => v.map((l) => ({ ...l, debit: '', credit: '' })));
                }}
              >
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Journal description">
            <textarea
              name="description"
              required
              minLength={3}
              maxLength={3000}
              defaultValue={e?.data.description || ''}
            />
          </Field>
          {c.settings.opening_policy === 'reviewed_opening_entry_required' && (
            <label className="checkbox-field">
              <input name="opening" type="checkbox" defaultChecked={e?.data.opening_entry} />
              Reviewed opening entry on {c.settings.start_on}
            </label>
          )}
          <div className="acc-journal-table-scroll">
            <table className="acc-journal-lines">
              <thead>
                <tr>
                  <th>Account</th><th>Partner</th><th>Label</th><th>Analytic Distribution</th>
                  <th className="num">Debit · {currency}</th><th className="num">Credit · {currency}</th><th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, index) => (
                  <tr key={l.key}>
                    <td>
                      <select
                        aria-label={'Account for line ' + (index + 1)}
                        value={l.account_id}
                        onChange={(event) => change(l.key, 'account_id', event.target.value)}
                      >
                        <option value="">Choose an account</option>
                        {c.accounts.filter((a: any) => a.active || a.id === l.account_id).map((a: any) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>{l.contact_id ? 'Linked contact' : '—'}</td>
                    <td><input aria-label={'Label for line ' + (index + 1)} value={l.memo} maxLength={1000} onChange={(event) => change(l.key, 'memo', event.target.value)} /></td>
                    <td className="acc-not-configured">Not configured</td>
                    <td><input aria-label={'Debit for line ' + (index + 1)} value={l.debit} inputMode="decimal" onChange={(event) => change(l.key, 'debit', event.target.value)} /></td>
                    <td><input aria-label={'Credit for line ' + (index + 1)} value={l.credit} inputMode="decimal" onChange={(event) => change(l.key, 'credit', event.target.value)} /></td>
                    <td>{lines.length > 2 && <button className="quiet-button" type="button" aria-label={'Remove line ' + (index + 1)} onClick={() => setLines((v) => v.filter((n) => n.key !== l.key))}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={lines.length >= 200}
            onClick={() =>
              setLines((v) => [
                ...v,
                {
                  key: crypto.randomUUID(),
                  account_id: '',
                  contact_id: null,
                  debit: '',
                  credit: '',
                  memo: '',
                },
              ])
            }
          >
            Add journal line
          </button>
          {totals ? (
            <p role="status">
              Debits {money(totals.debit, currency)} · Credits {money(totals.credit, currency)} ·{' '}
              {totals.debit === totals.credit
                ? 'Balanced · posting still requires approval'
                : 'Unbalanced draft · posting will be refused'}
            </p>
          ) : (
            <p>Enter valid currency amounts to check this draft.</p>
          )}
          <button className="button" disabled={!validLines} title={!validLines ? 'Complete each line with an account and either a debit or credit.' : undefined}>Save journal draft</button>
        </Form>
        <button className="secondary-button" onClick={onClose}>
          Cancel draft editing
        </button>
      </section>
    </Overlay>
  );
}
