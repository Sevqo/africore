import { useEffect, useState, type FormEvent } from 'react';
import { money, type API } from '../operations/UI';

type Row = Record<string, any>;

export function SuiteParityToolsPanel({ api, writable }: { api: API; writable: boolean }) {
  const [tab, setTab] = useState<'pos' | 'sign' | 'ops'>('pos');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [floors, setFloors] = useState<Row[]>([]);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [floorName, setFloorName] = useState('Main Dining');
  const [kdsOrder, setKdsOrder] = useState('POS-1001');
  const [kdsItem, setKdsItem] = useState('Grilled Tilapia');

  const [envelopes, setEnvelopes] = useState<Row[]>([]);
  const [docTitle, setDocTitle] = useState('Service Level Agreement 2026');
  const [signerEmail, setSignerEmail] = useState('client@example.co.ke');

  const [runway, setRunway] = useState<Row | null>(null);
  const [oee, setOee] = useState<Row | null>(null);

  async function refresh() {
    const [r1, r2, r3] = await Promise.allSettled([
      api('/pos/floors'),
      api('/pos/kds/tickets'),
      api('/documents/sign/envelopes'),
    ]);
    if (r1.status === 'fulfilled') setFloors(r1.value?.floors || []);
    if (r2.status === 'fulfilled') setTickets(r2.value?.tickets || []);
    if (r3.status === 'fulfilled') setEnvelopes(r3.value?.envelopes || []);
  }

  useEffect(() => {
    refresh();
  }, [api]);

  async function addFloor(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/pos/floors', 'POST', { name: floorName, location: 'Ground Floor' });
      setNotice('POS restaurant floor added.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to add floor');
    }
  }

  async function addKds(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/pos/kds/tickets', 'POST', {
        order_ref: kdsOrder,
        station: 'grill',
        items: [{ name: kdsItem, qty: 1 }],
      });
      setNotice('KDS kitchen ticket queued.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to queue KDS ticket');
    }
  }

  async function addEnvelope(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/documents/sign/envelopes', 'POST', {
        document_title: docTitle,
        signers: [{ name: 'Client Signer', email: signerEmail, order: 1 }],
      });
      setNotice('E-signature envelope created with SHA-256 hash.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to create sign envelope');
    }
  }

  async function runDiagnostics() {
    setError('');
    try {
      const [rw, oe] = await Promise.allSettled([
        api('/finance/treasury/runway', 'POST', {
          cash_balance_minor: 1_200_000,
          monthly_inflow_minor: 350_000,
          monthly_outflow_minor: 500_000,
        }),
        api('/mrp/workcenters/oee', 'POST', {
          planned_minutes: 480,
          downtime_minutes: 30,
          ideal_cycle_seconds: 60,
          total_units: 420,
          good_units: 405,
        }),
      ]);
      if (rw.status === 'fulfilled') setRunway(rw.value);
      if (oe.status === 'fulfilled') setOee(oe.value);
      setNotice('Treasury and production metrics updated.');
    } catch (err: any) {
      setError(err?.message || 'Diagnostics failed');
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Floor Plan, Signatures & Operational Calculators</h3>
      <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
        Restaurant Floor Plan & KDS, Cryptographic Document Sign, Treasury Runway, and Production OEE.
      </p>
      <div className="ac-subtabs">
        {[
          ['pos', `POS Floors (${floors.length}) & KDS (${tickets.length})`],
          ['sign', `Documents Sign (${envelopes.length})`],
          ['ops', 'Operational Calculators'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'primary' : ''} onClick={() => setTab(id as any)}>
            {label}
          </button>
        ))}
      </div>
      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}

      {tab === 'pos' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {writable && (
            <form onSubmit={addFloor} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="Floor name" />
              <button type="submit" className="primary">Add Floor</button>
            </form>
          )}
          {writable && (
            <form onSubmit={addKds} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={kdsOrder} onChange={(e) => setKdsOrder(e.target.value)} placeholder="Order ref" />
              <input value={kdsItem} onChange={(e) => setKdsItem(e.target.value)} placeholder="Dish / item" />
              <button type="submit" className="primary">Send to KDS</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Order</th><th>Station</th><th>Status</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}><td>{t.order_ref}</td><td>{t.station}</td><td>{t.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sign' && (
        <div>
          {writable && (
            <form onSubmit={addEnvelope} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Document title" />
              <input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="Signer email" />
              <button type="submit" className="primary">Send for Signature</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Document</th><th>Status</th><th>SHA-256</th></tr></thead>
            <tbody>
              {envelopes.map((ev) => (
                <tr key={ev.id}><td>{ev.document_title}</td><td>{ev.status}</td><td><code>{String(ev.document_hash || '').slice(0, 12)}…</code></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ops' && (
        <div>
          <button type="button" className="primary" onClick={runDiagnostics}>
            Run Treasury Runway & MRP OEE Calculators
          </button>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            {runway && (
              <div className="panel" style={{ minWidth: 220 }}>
                <strong>Treasury Runway</strong>
                <p style={{ margin: '6px 0 0' }}>
                  {runway.runway_months} months ({runway.liquidity_status}) · Net burn{' '}
                  {money(runway.monthly_burn_minor, 'KES')}/mo
                </p>
              </div>
            )}
            {oee && (
              <div className="panel" style={{ minWidth: 220 }}>
                <strong>MRP Workcenter OEE</strong>
                <p style={{ margin: '6px 0 0' }}>
                  OEE {(Number(oee.oee_bps || 0) / 100).toFixed(2)}% (Avail{' '}
                  {(Number(oee.availability_bps || 0) / 100).toFixed(1)}%)
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
