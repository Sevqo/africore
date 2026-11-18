import { useMemo, useState } from 'react';
import { Field, type API } from '../operations/UI';
import { parseCsv } from '../../../src/services/statement/csv';

const columns = [
  ['title', 'Lead Title', ['lead title', 'title', 'opportunity']],
  ['contact_name', 'Contact Name', ['contact name', 'contact', 'name']],
  ['company', 'Company', ['company', 'organization', 'organisation']],
  ['email', 'Email', ['email', 'email address']],
  ['phone', 'Phone', ['phone', 'telephone', 'mobile']],
  ['source', 'Lead Source', ['lead source', 'source']],
  ['source_ref', 'Source Reference', ['source reference', 'source ref', 'campaign id']],
  ['notes', 'Notes', ['notes', 'description']],
  ['assigned_to', 'Assigned Salesperson', ['assigned salesperson', 'salesperson', 'owner']],
  ['team', 'Sales Team', ['sales team', 'team']],
  ['amount', 'Expected Value', ['expected value', 'amount', 'expected amount']],
  ['currency', 'Currency', ['currency']],
  ['expected_close_on', 'Expected Closing Date', ['expected closing date', 'expected close', 'close date']],
  ['tags', 'Tags', ['tags', 'labels']],
] as const;
type Target = (typeof columns)[number][0];

export function CrmImport({ api, writable, onSaved }: { api: API; customers?: any[]; writable: boolean; onSaved: () => void }) {
  const [csv, setCsv] = useState(''), [sourceId, setSourceId] = useState(''), [mapping, setMapping] = useState<Record<Target, string>>({} as any),
    [preview, setPreview] = useState<any>(null), [result, setResult] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    if (!csv.trim()) return { headers: [] as string[], rows: [] as string[][], error: '' };
    try { const grid = parseCsv(csv), headers = (grid[0] || []).map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim()); return { headers, rows: grid.slice(1).filter((row) => row.some((v) => v.trim())), error: '' }; }
    catch (e) { return { headers: [] as string[], rows: [] as string[][], error: (e as Error).message }; }
  }, [csv]);
  const resolvedMapping = useMemo(() => {
    const result = { ...mapping };
    for (const [target, _label, aliases] of columns) if (!result[target]) {
      const found = parsed.headers.find((h) => (aliases as readonly string[]).includes(h.trim().toLowerCase()));
      if (found) result[target] = found;
    }
    return result;
  }, [mapping, parsed.headers.join('\0')]);
  const indexByTarget = (target: Target) => parsed.headers.indexOf(resolvedMapping[target] || ''),
    rows = parsed.rows.map((cells) => Object.fromEntries(columns.map(([target]) => [target, cells[indexByTarget(target)] || ''])) as unknown as Record<Target, string>).map((row, i) => ({ ...row, _row: i + 2 })),
    rowErrors = rows.map((row) => {
      const errors: string[] = [];
      if (row._row > 101) errors.push('The file exceeds the 100 row limit.');
      if (row._row > 2 && !row.title.trim()) errors.push('Lead title is required.');
      if (!row.contact_name.trim() && !row.company.trim()) errors.push('Contact name or company is required.');
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Email is invalid.');
      if (row.phone && row.phone.replace(/\D/g, '').length < 7) errors.push('Phone number is too short.');
      if (row.amount && !/^\d{1,12}(?:\.\d{1,4})?$/.test(row.amount)) errors.push('Expected value must be a decimal amount.');
      if (row.currency && !['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].includes(row.currency.toUpperCase())) errors.push('Currency is not supported.');
      if (row.expected_close_on && !/^\d{4}-\d{2}-\d{2}$/.test(row.expected_close_on)) errors.push('Expected close date must use YYYY-MM-DD.');
      if (row.source && !['manual', 'imported', 'website', 'referral', 'campaign', 'other'].includes(row.source.toLowerCase())) errors.push('Lead source must be manual, imported, website, referral, campaign or other.');
      return errors;
    });
  async function previewRows() {
    setError(''); setPreview(null); setResult(null);
    if (new TextEncoder().encode(csv).length > 1_000_000) { setError('CSV files are limited to 1 MB.'); return; }
    if (parsed.error) { setError(parsed.error); return; }
    if (rows.length < 1 || rows.length > 100) { setError('Choose a CSV with 1 to 100 lead rows.'); return; }
    const missing = ['title'].filter((target) => indexByTarget(target as Target) < 0);
    if (missing.length || (indexByTarget('contact_name') < 0 && indexByTarget('company') < 0)) { setError('Map at least Lead Title and Contact Name or Company.'); return; }
    const invalid = rowErrors.findIndex((v) => v.length);
    if (invalid >= 0) { setError(`Row ${invalid + 2}: ${rowErrors[invalid].join(' ')}`); return; }
    setBusy(true);
    try { const body = rows.map(({ _row, ...row }) => ({ ...row, email: row.email.trim(), phone: row.phone.trim(), title: row.title.trim(), source: row.source.trim() || 'imported', currency: row.currency.trim().toUpperCase() || 'KES', amount: row.amount.trim() || '0', expected_close_on: row.expected_close_on.trim() || null })); setPreview(await api('/crm/import/preview', 'POST', { rows: body })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function importRows() {
    if (!sourceId.trim()) { setError('Enter a stable source identifier for this import batch.'); return; }
    if (!preview) { setError('Preview and validate the CSV before importing.'); return; }
    setBusy(true); setError('');
    try { const body = rows.map(({ _row, ...row }) => ({ ...row, email: row.email.trim(), phone: row.phone.trim(), title: row.title.trim(), source: row.source.trim() || 'imported', currency: row.currency.trim().toUpperCase() || 'KES', amount: row.amount.trim() || '0', expected_close_on: row.expected_close_on.trim() || null })); setResult(await api('/crm/import', 'POST', { source_id: sourceId.trim(), rows: body }, { 'Idempotency-Key': crypto.randomUUID() })); onSaved(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel crm-import">
    <h2>Import leads</h2>
    <p>Upload a CSV, map the columns, review validation and duplicate suggestions, then confirm. Imports create prospects without creating Customers. Dates use YYYY-MM-DD; values use ordinary decimal amounts.</p>
    <Field label="Choose CSV file"><input type="file" accept=".csv,text/csv" disabled={!writable || busy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError('CSV files are limited to 1 MB.'); return; } setCsv(await file.text()); setPreview(null); setResult(null); }} /></Field>
    <Field label="CSV contents (optional paste)"><textarea rows={7} value={csv} disabled={!writable || busy} onChange={(e) => { setCsv(e.target.value); setPreview(null); setResult(null); }} placeholder={'Lead Title,Contact Name,Company,Email,Phone,Lead Source,Notes,Assigned Salesperson,Sales Team,Expected Value,Currency,Expected Closing Date,Tags\nNew office furniture,Sam K.,Acme Ltd,sam@example.com,+254700000000,referral,Needs 20 desks,,,250000,KES,2026-12-30,office'} /></Field>
    {parsed.headers.length > 0 && <><h3>Map columns</h3><div className="form-grid crm-import-mapping">{columns.map(([target, label]) => <Field key={target} label={label}><select value={resolvedMapping[target] || ''} onChange={(e) => setMapping({ ...resolvedMapping, [target]: e.target.value })}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></Field>)}</div>
      <h3>Preview · {rows.length} rows</h3><div className="crm-import-preview"><table><thead><tr><th>Row</th><th>Lead</th><th>Contact / Company</th><th>Email</th><th>Expected value</th><th>Validation</th><th>Duplicate review</th></tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={row._row}><td>{row._row}</td><td>{row.title || '—'}</td><td>{row.contact_name || row.company || '—'}</td><td>{row.email || '—'}</td><td>{row.amount || '0'} {row.currency || 'KES'}</td><td>{rowErrors[index].join(' ') || 'Ready'}</td><td>{preview?.rows?.[index]?.potential_duplicates?.map((d: any) => `${d.title} (${d.reasons.join(', ')})`).join('; ') || preview?.rows?.[index]?.duplicate_csv_rows?.join('; ') || 'No match found'}</td></tr>)}</tbody></table></div>
      <div className="form-actions"><button className="secondary-button" disabled={!writable || busy} onClick={() => void previewRows()}>{busy ? 'Checking…' : 'Validate and review duplicates'}</button></div>
    </>}
    {preview && <p role="status" className="alert">{preview.valid_rows} valid rows · {preview.duplicate_candidates} rows have potential duplicates. Suggestions never merge records automatically.</p>}
    {preview && !result && <div className="form-grid"><Field label="Stable import source identifier"><input value={sourceId} onChange={(e) => setSourceId(e.target.value)} maxLength={100} placeholder="campaign-2026-q4-import" /></Field><div className="form-actions"><button className="button" disabled={!writable || busy} onClick={() => void importRows()}>{busy ? 'Importing…' : 'Confirm import'}</button></div></div>}
    {result && <p role="status" className="alert">Imported {result.imported} prospects in batch “{result.source_id}”.</p>}
    {error && <p className="alert error" role="alert">{error}</p>}
    {!result && <p className="environment-note">Retries with the same source identifier are idempotent; changing a confirmed batch requires a new identifier. Potential duplicates remain separate until a user explicitly reviews and merges them.</p>}
  </section>;
}
