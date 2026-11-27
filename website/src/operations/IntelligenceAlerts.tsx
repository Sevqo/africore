import { parseMoney, parsePercent } from '../../../src/finance/money';
import { useEffect, useState } from 'react';
import { Field, Form, money, type API } from './UI';
import { isDemo } from '../demo/transport';
export function IntelligenceAlerts({ api, writable }: { api: API; writable: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    if (!isDemo())
      api('/intelligence/alerts')
        .then((r) => {
          if (live) setData(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [revision]);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const p = data.policy;
  return (
    <section style={{ paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13.5 }}>Evidence-backed alerts</strong>{' '}
          <span className="o-flat-note">
            · Thresholds identify records for review ({data.data.length} matching).
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {writable && (
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  await api('/intelligence/alerts/evaluate', 'POST', {});
                  setRevision((v) => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Check configured rules
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="alert error">{error}</p>}
      {writable && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#166534', fontWeight: 600 }}>
            Configure alert thresholds
          </summary>
          <Form
            submit={async (d) => {
              await api('/intelligence/alerts/policy', 'PUT', {
                currency: d.currency,
                enabled: d.enabled === 'on',
                notify: d.notify === 'on',
                overdue_minor: parseMoney(d.overdue, d.currency),
                obligation_minor: parseMoney(d.obligation, d.currency),
                days_before_due: Number(d.days),
                concentration_bps: parsePercent(d.concentration),
              });
              setRevision((v) => v + 1);
            }}
          >
            <div className="form-grid">
              <Field label="Alert currency">
                <select name="currency" defaultValue={p.currency}>
                  {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Overdue amount">
                <input
                  name="overdue"
                  inputMode="decimal"
                  required
                  defaultValue={String(
                    p.overdue_minor / (['UGX', 'RWF'].includes(p.currency) ? 1 : 100),
                  )}
                />
              </Field>
              <Field label="Obligation amount">
                <input
                  name="obligation"
                  inputMode="decimal"
                  required
                  defaultValue={String(
                    p.obligation_minor / (['UGX', 'RWF'].includes(p.currency) ? 1 : 100),
                  )}
                />
              </Field>
              <Field label="Days before obligation">
                <input name="days" type="number" min={0} max={30} defaultValue={p.days_before_due} />
              </Field>
              <Field label="Invoice concentration (%)">
                <input
                  name="concentration"
                  type="number"
                  min={10}
                  max={100}
                  step="0.01"
                  defaultValue={p.concentration_bps / 100}
                />
              </Field>
            </div>
            <label className="checkbox-field">
              <input type="checkbox" name="enabled" defaultChecked={p.enabled} />
              Enable these rules
            </label>
            <label className="checkbox-field">
              <input type="checkbox" name="notify" defaultChecked={p.notify} />
              Create in-app notifications; honor member preferences
            </label>
            <button className="button">Save alert policy</button>
          </Form>
        </details>
      )}
      {data.data.length > 0 && (
        <div className="ac-record-list">
          {data.data.map((a: any) => {
            const e = JSON.parse(a.evidence);
            return (
              <div className="ac-record-row" key={a.id}>
                <div className="ac-record-main">
                  <span className="ac-record-title">
                    {a.rule.replaceAll('_', ' ')} · <span className="badge">{a.severity}</span> · {a.status}
                  </span>
                  <span className="ac-record-meta">
                    {new Date(a.created_at).toLocaleString()}
                    {e.outstanding_minor ? ` · ${money(e.outstanding_minor, e.currency)} outstanding (Due ${e.due_date})` : ''}
                    {e.amount_minor ? ` · ${money(e.amount_minor, e.currency)} planned (Due ${e.due_on})` : ''}
                    {e.share_bps ? ` · ${e.share_bps / 100}% of recorded invoice face value` : ''}
                  </span>
                </div>
                {writable && a.status === 'open' && (
                  <div className="ac-record-actions">
                    {['acknowledged', 'dismissed'].map((status) => (
                      <button
                        className="quiet-button"
                        key={status}
                        onClick={async () => {
                          try {
                            await api('/intelligence/alerts/' + a.id, 'PATCH', { status });
                            setRevision((v) => v + 1);
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        {status === 'acknowledged' ? 'Acknowledge' : 'Dismiss'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
