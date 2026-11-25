import { useEffect, useState, type FormEvent } from 'react';
import { money, type API } from '../operations/UI';

type Row = Record<string, any>;

export function CrmParityPanel({ api, writable }: { api: API; writable: boolean }) {
  const [tab, setTab] = useState<'routing' | 'lost' | 'quotas' | 'enrich'>('routing');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [rules, setRules] = useState<Row[]>([]);
  const [ruleName, setRuleName] = useState('Kenya Enterprise');
  const [teamName, setTeamName] = useState('Enterprise KE');
  const [country, setCountry] = useState('KE');

  const [reasons, setReasons] = useState<Row[]>([]);
  const [reasonCode, setReasonCode] = useState('PRICE');
  const [reasonLabel, setReasonLabel] = useState('Price too high');

  const [quotas, setQuotas] = useState<Row[]>([]);
  const [ownerName, setOwnerName] = useState('Amina');
  const [targetMinor, setTargetMinor] = useState('1000000');
  const [wonMinor, setWonMinor] = useState('850000');

  const [enrichments, setEnrichments] = useState<Row[]>([]);
  const [leadId, setLeadId] = useState('lead-001');
  const [domain, setDomain] = useState('nairobi-tech.co.ke');

  async function refresh() {
    const [r1, r2, r3, r4] = await Promise.allSettled([
      api('/crm/routing-rules'),
      api('/crm/lost-reasons'),
      api('/crm/quotas'),
      api('/crm/enrichments'),
    ]);
    if (r1.status === 'fulfilled') setRules(r1.value?.rules || []);
    if (r2.status === 'fulfilled') setReasons(r2.value?.reasons || []);
    if (r3.status === 'fulfilled') setQuotas(r3.value?.quotas || []);
    if (r4.status === 'fulfilled') setEnrichments(r4.value?.enrichments || []);
  }

  useEffect(() => {
    refresh();
  }, [api]);

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/crm/routing-rules', 'POST', {
        name: ruleName,
        team_name: teamName,
        priority: 10,
        country,
        reps: [{ rep_id: 'rep-1', active_leads: 2, max_capacity: 25 }],
      });
      setNotice('Lead routing rule saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save routing rule');
    }
  }

  async function addReason(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/crm/lost-reasons', 'POST', {
        code: reasonCode,
        label: reasonLabel,
        category: 'pricing',
      });
      setNotice('Lost reason saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save lost reason');
    }
  }

  async function addQuota(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/crm/quotas', 'POST', {
        owner_id: `rep-${Date.now()}`,
        owner_name: ownerName,
        period_start: '2026-10-01',
        period_end: '2026-12-31',
        currency: 'KES',
        target_minor: Number(targetMinor) || 100_000,
        won_minor: Number(wonMinor) || 0,
      });
      setNotice('Sales quota saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save quota');
    }
  }

  async function addEnrichment(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/crm/enrichments', 'POST', {
        lead_id: leadId,
        company_domain: domain,
        industry: 'Technology',
        employee_band: '51-200',
        country: 'KE',
        confidence_bps: 9000,
      });
      setNotice('Lead enrichment recorded.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to enrich lead');
    }
  }

  return (
    <section style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
      <h3 style={{ margin: '0 0 4px' }}>Routing, Quotas & Enrichment</h3>
      <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
        Lead assignment rules, lost-reason catalog, team quotas, and company enrichment.
      </p>
      <div className="ac-subtabs">
        {[
          ['routing', `Lead Routing (${rules.length})`],
          ['lost', `Lost Reasons (${reasons.length})`],
          ['quotas', `Quotas (${quotas.length})`],
          ['enrich', `Enrichments (${enrichments.length})`],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'primary' : ''} onClick={() => setTab(id as any)}>
            {label}
          </button>
        ))}
      </div>
      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}

      {tab === 'routing' && (
        <div>
          {writable && (
            <form onSubmit={addRule} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Rule name" />
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team" />
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
              <button type="submit" className="primary">Add Routing Rule</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Rule</th><th>Team</th><th>Country</th><th>Priority</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.country || 'Any'}</td><td>{r.priority}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'lost' && (
        <div>
          {writable && (
            <form onSubmit={addReason} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="Code" />
              <input value={reasonLabel} onChange={(e) => setReasonLabel(e.target.value)} placeholder="Label" />
              <button type="submit" className="primary">Add Lost Reason</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Code</th><th>Label</th><th>Category</th></tr></thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.id}><td>{r.code}</td><td>{r.label}</td><td>{r.category}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'quotas' && (
        <div>
          {writable && (
            <form onSubmit={addQuota} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Rep / Team" />
              <input value={targetMinor} onChange={(e) => setTargetMinor(e.target.value)} placeholder="Target minor" />
              <input value={wonMinor} onChange={(e) => setWonMinor(e.target.value)} placeholder="Won minor" />
              <button type="submit" className="primary">Add Quota</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Owner</th><th className="num">Target</th><th className="num">Won</th></tr></thead>
            <tbody>
              {quotas.map((q) => (
                <tr key={q.id}><td>{q.owner_name}</td><td className="num">{money(q.target_minor, q.currency)}</td><td className="num">{money(q.won_minor, q.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'enrich' && (
        <div>
          {writable && (
            <form onSubmit={addEnrichment} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Lead ID" />
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Company domain" />
              <button type="submit" className="primary">Record Enrichment</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Lead</th><th>Domain</th><th>Industry</th><th>Band</th></tr></thead>
            <tbody>
              {enrichments.map((e) => (
                <tr key={e.id}><td>{e.lead_id}</td><td>{e.company_domain}</td><td>{e.industry || '-'}</td><td>{e.employee_band}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
