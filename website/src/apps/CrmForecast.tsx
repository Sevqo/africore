import { useEffect, useMemo, useState } from 'react';
import { Field, money, type API } from '../operations/UI';

const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];
const dateBucket = (date?: string | null) => {
  if (!date) return 'no_date';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return date < today ? 'overdue' : date.slice(0, 7);
};
const bucketName = (key: string) => key === 'overdue' ? 'Overdue Expected Close' : key === 'no_date' ? 'No Expected Closing Date' : new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(key + '-01T00:00:00Z'));

export function CrmForecast({ api, open, writable, members = [] }: { api: API; open: (id: string) => void; writable: boolean; members?: any[] }) {
  const [view, setView] = useState<'kanban' | 'graph' | 'pivot' | 'pipeline'>('kanban'), [currency, setCurrency] = useState('KES'), [groupBy, setGroupBy] = useState('close_month'), [measure, setMeasure] = useState('open_amount_minor'),
    [data, setData] = useState<any>(null), [report, setReport] = useState<any>(null), [pivot, setPivot] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true; setError(''); setData(null);
    api('/crm/forecast?' + new URLSearchParams({ currency, limit: '200', offset: '0' })).then((r) => live && setData(r)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [api, currency]);
  useEffect(() => {
    if (!['graph', 'pipeline'].includes(view)) return;
    let live = true; setError(''); setReport(null);
    const endpoint = view === 'pipeline' ? '/crm/pipeline-report?' : '/crm/forecast/report?';
    api(endpoint + new URLSearchParams({ currency, group_by: view === 'pipeline' ? 'stage' : groupBy })).then((r) => live && setReport(r)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [api, currency, groupBy, view]);
  useEffect(() => {
    if (view !== 'pivot') return;
    let live = true; setError(''); setPivot(null);
    api('/crm/forecast/pivot?' + new URLSearchParams({ row_by: 'stage', column_by: 'close_month', currency })).then((r) => live && setPivot(r)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [api, currency, view]);
  const records: any[] = data?.records || [], groups: any[] = data?.groups || [];
  const buckets = useMemo(() => {
    const keys = new Set(groups.map((g) => g.bucket));
    records.forEach((r) => keys.add(dateBucket(r.expected_close_on)));
    return [...keys].sort((a, b) => a === 'overdue' ? -1 : b === 'overdue' ? 1 : a === 'no_date' ? 1 : b === 'no_date' ? -1 : a.localeCompare(b));
  }, [groups, records]);
  const graphData = report?.groups || [], max = Math.max(1, ...graphData.map((g: any) => Number(g[measure] || 0))), pipelineMax = Math.max(1, ...graphData.map((g: any) => Number(g.opportunity_count || 0)));
  const graphWidth = Math.max(760, graphData.length * 190), graphHeight = 410, chartTop = 50, chartBottom = 335;
  const pivotColumns: any[] = [...new Set((pivot?.cells || []).map((c: any) => c.column_key))],
    pivotRows: any[] = [...new Set((pivot?.cells || []).map((c: any) => c.row_key))],
    pivotCell = (row: any, column: any) => pivot?.cells.find((c: any) => c.row_key === row && c.column_key === column && c.currency === currency),
    pivotTotalCell = (total: any, key?: string) => <td key={key}><strong>{total?.opportunity_count || 0}</strong><small>{money(total?.open_amount_minor || 0, currency)} open</small><small>{money(total?.weighted_open_minor || 0, currency)} weighted</small></td>;
  async function updateDate(entry: any, expected_close_on: string) {
    setBusy(entry.id); setError('');
    try { const { id, version, created_at, updated_at, merged_into, contact_completeness, ...rest } = entry; await api('/crm/entries/' + id, 'PATCH', { expected_version: version, entry: { ...rest, expected_close_on: expected_close_on || null } }, { 'Idempotency-Key': crypto.randomUUID() }); setData((previous: any) => previous ? { ...previous, records: previous.records.map((r: any) => r.id === id ? { ...r, expected_close_on: expected_close_on || null } : r) } : previous); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  return <section className="panel crm-forecast">
    <div className="crm-toolbar"><div><h2>Forecast</h2><p>Expected values grouped by expected closing month. Forecasts are estimates, not recognized revenue.</p></div><Field label="Currency"><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></Field></div>
    <div className="crm-report-toolbar" role="group" aria-label="Forecast views">{([['kanban','Forecast Kanban'],['graph','Forecast Graph'],['pivot','Pipeline Pivot'],['pipeline','Pipeline Graph']] as const).map(([id,label]) => <button key={id} className={view === id ? 'button' : 'secondary-button'} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    {error && <p role="alert" className="alert error">{error}</p>}
    {view === 'kanban' && <>
      {data && <p className="environment-note">{data.coverage} · {groups.length} month/currency groups · {records.length} opportunities loaded</p>}
      {!data && !error && <p role="status">Loading forecast totals…</p>}
      <div className="crm-forecast-board">{buckets.map((bucket) => {
        const summary = groups.find((g) => g.bucket === bucket && g.currency === currency), items = records.filter((r) => dateBucket(r.expected_close_on) === bucket);
        return <section className="crm-forecast-column" key={bucket}><header><h3>{bucketName(bucket)}</h3><strong>{money(summary?.open_amount_minor || 0, currency)}</strong><small>Weighted: {money(summary?.weighted_open_minor || 0, currency)} · {summary?.open_count || 0} open</small><div className="crm-stage-volume"><span style={{ width: `${summary?.open_amount_minor ? Math.max(5, Math.round(100 * summary.weighted_open_minor / summary.open_amount_minor)) : 0}%` }} /></div></header>
          {!items.length && <p className="crm-stage-empty">No opportunity cards on this page.</p>}
          {items.map((entry) => { const member = members.find((m) => m.id === entry.assigned_to); return <article className="panel crm-forecast-card" key={entry.id}><button className="quiet-button crm-forecast-title" onClick={() => open(entry.id)}>{entry.title}</button><p>{entry.customer_id ? (entry.contact_name || entry.company || 'Customer-linked opportunity') : (entry.contact_name || entry.company || 'Prospect')}</p><strong>{money(entry.amount_minor || 0, entry.currency)}</strong><small>{entry.probability_bps === null ? 'Probability not recorded' : `${(entry.probability_bps / 100).toFixed(2)}% recorded probability`} · {entry.stage}</small><small>{entry.assigned_to ? `Assigned · ${member?.display_name || member?.email || 'Workspace member'}` : 'Unassigned'} · Priority {'★'.repeat(entry.priority || 0)}{'☆'.repeat(3 - (entry.priority || 0))}</small><Field label="Expected close"><input type="date" disabled={!writable || busy === entry.id} value={entry.expected_close_on || ''} onChange={(e) => void updateDate(entry, e.target.value)} /></Field></article>; })}</section>;
      })}</div>
      {data && data.records.length >= data.limit && <p className="environment-note">Card list is paginated; use the lead/opportunity search to open records beyond this page. Group totals are complete.</p>}
    </>}
    {view === 'graph' && <>
      <div className="crm-report-toolbar"><Field label="Group by"><select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>{['close_month','stage','team','assignee','source'].map((d) => <option key={d} value={d}>{d.replaceAll('_',' ')}</option>)}</select></Field><Field label="Measure"><select value={measure} onChange={(e) => setMeasure(e.target.value)}>{[['open_amount_minor','Open expected value'],['weighted_open_minor','Weighted expected value'],['opportunity_count','Opportunity count'],['won_amount_minor','Won value'],['lost_amount_minor','Lost value']] .map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></Field></div>
      {!report && !error && <p role="status">Loading server totals…</p>}{report && <><p className="environment-note">{report.definition}</p><div className="crm-forecast-chart-scroll"><svg className="crm-forecast-chart" viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="img" aria-label={`${measure.replaceAll('_',' ')} grouped by ${groupBy}`}>
        {[0,1,2,3,4].map((i) => { const y = chartBottom - i * (chartBottom-chartTop)/4; return <g key={i}><line x1="70" x2={graphWidth-20} y1={y} y2={y} stroke="currentColor" opacity=".16"/><text x="60" y={y+5} textAnchor="end">{measure.endsWith('_minor') ? money(max*i/4,currency) : (max*i/4).toFixed(0)}</text></g>; })}
        {graphData.map((g: any,i:number) => { const val=Number(g[measure]||0), h=(val/max)*(chartBottom-chartTop), x=105+i*190; return <g key={String(g.bucket)}><title>{String(g.bucket)}: {measure.endsWith('_minor') ? money(val,currency) : val}</title><rect x={x} y={chartBottom-h} width="96" height={h} rx="4" fill="#51a8e8"/><text x={x+48} y={chartBottom+24} textAnchor="middle">{String(g.bucket || 'Unassigned').slice(0,18)}</text></g>; })}
      </svg></div><p>Open opportunities: {report.totals?.open_count || 0} · Won: {report.totals?.won_count || 0} · Lost: {report.totals?.lost_count || 0} · Weighted amounts use recorded probabilities only.</p></>}</>}
    {view === 'pipeline' && <><p className="environment-note">Current opportunity-stage snapshot; not a historical reconstruction of stage changes.</p>{report && <div className="crm-report-chart-scroll"><svg viewBox={`0 0 ${Math.max(680, graphData.length*180)} 360`} role="img" aria-label="Pipeline opportunities by current stage">{graphData.map((g:any,i:number)=>{const val=Number(g.opportunity_count||0), h=val/pipelineMax*240; return <g key={g.bucket}><rect x={60+i*180} y={280-h} width="100" height={h} fill="#4bb6aa"/><text x={110+i*180} y="310" textAnchor="middle">{String(g.bucket)}</text><text x={110+i*180} y={270-h} textAnchor="middle">{val}</text></g>;})}</svg></div>}{report && <p>{report.totals?.opportunity_count || 0} opportunities in current stage distribution.</p>}</>}
    {view === 'pivot' && <>
      {!pivot && !error && <p role="status">Loading SQL pivot totals…</p>}
      {pivot && <>
        <p className="environment-note">{pivot.definition}</p>
        <div className="crm-pivot-scroll">
          <table className="crm-pivot-table">
            <thead><tr><th>Stage</th>{pivotColumns.map((column) => <th key={String(column)}>{String(column || 'Unassigned')}</th>)}<th>Total · {currency}</th></tr></thead>
            <tbody>
              {pivotRows.map((row) => <tr key={String(row)}>
                <th>{String(row || 'Unassigned')}</th>
                {pivotColumns.map((column) => {
                  const cell = pivotCell(row, column);
                  return <td key={String(column)}>{cell ? <><strong>{cell.opportunity_count}</strong><small>{money(cell.open_amount_minor, currency)} open</small><small>{money(cell.weighted_open_minor, currency)} weighted</small></> : '—'}</td>;
                })}
                {pivotTotalCell(pivot.row_totals.find((t: any) => t.row_key === row && t.currency === currency))}
              </tr>)}
              <tr className="crm-pivot-grand-total"><th>Grand Total</th>
                {pivotColumns.map((column) => pivotTotalCell(pivot.column_totals.find((t: any) => t.column_key === column && t.currency === currency), String(column)))}
                {pivotTotalCell(pivot.grand_totals.find((t: any) => t.currency === currency))}
              </tr>
            </tbody>
          </table>
        </div>
      </>}
    </>}
  </section>;
}
