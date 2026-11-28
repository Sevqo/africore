import { useEffect, useState, type FormEvent } from 'react';
import { Field, money, type API } from '../operations/UI';

type Props = {
  api: API;
  mode: 'hospitality' | 'loyalty';
  currency: string;
  online: boolean;
  mutate: (work: () => Promise<any>) => Promise<any>;
};

const KDS_STATIONS = ['all', 'main', 'grill', 'bar', 'cold', 'bakery'] as const;
const NEXT_KDS_STATUS: Record<string, string> = {
  queued: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

export function POSOperationsHub({ api, mode, currency, online, mutate }: Props) {
  const [floors, setFloors] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [stationFilter, setStationFilter] = useState<string>('all');
  const [loyaltyPrograms, setLoyaltyPrograms] = useState<any[]>([]);
  const [cashCounts, setCashCounts] = useState<any[]>([]);
  const [selfOrderResult, setSelfOrderResult] = useState<any>(null);
  const [splitResult, setSplitResult] = useState<any>(null);
  const [loyaltyResult, setLoyaltyResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [floorForm, setFloorForm] = useState({ name: '', location: 'Main Dining' });
  const [tableForm, setTableForm] = useState({ floor_id: '', table_number: 'T1', seats: '4' });
  const [kdsForm, setKdsForm] = useState({
    order_ref: '',
    table_number: '',
    station: 'main',
    item_name: '',
    qty: '1',
    notes: '',
  });
  const [loyaltyForm, setLoyaltyForm] = useState({
    name: 'VIP Rewards',
    points_per_1000_minor: '10',
    minor_per_point: '100',
  });
  const [calcForm, setCalcForm] = useState({
    order_total: '5000',
    available_points: '150',
    redeem_points: '50',
  });
  const [splitForm, setSplitForm] = useState({
    subtotal: '4000',
    tax: '640',
    tip_percent: '10',
    guests: '4',
  });

  const currFactor = ['UGX', 'RWF'].includes(currency) ? 1 : 100;

  async function loadAll() {
    if (!online) return;
    setError('');
    try {
      if (mode === 'hospitality') {
        const [fl, kd] = await Promise.all([api('/pos/floors'), api('/pos/kds/tickets')]);
        const floorData = fl?.floors || fl?.data || [];
        setFloors(floorData);
        if (!tableForm.floor_id && floorData[0]?.id) {
          setTableForm((f) => ({ ...f, floor_id: floorData[0].id }));
        }
        setTickets(kd?.tickets || kd?.data || []);
      } else {
        const [lp, cc] = await Promise.all([api('/pos/loyalty-programs'), api('/pos/cash-counts')]);
        setLoyaltyPrograms(lp?.data || lp?.programs || []);
        setCashCounts(cc?.data || cc?.cash_counts || []);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [mode, online]);

  async function addFloor(e: FormEvent) {
    e.preventDefault();
    if (!floorForm.name.trim()) return;
    try {
      await mutate(() =>
        api('/pos/floors', 'POST', {
          name: floorForm.name.trim(),
          location: floorForm.location.trim() || 'Main Dining',
        }),
      );
      setFloorForm({ name: '', location: 'Main Dining' });
      setNotice('Floor created.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addTable(e: FormEvent) {
    e.preventDefault();
    if (!tableForm.floor_id || !tableForm.table_number.trim()) return;
    try {
      await mutate(() =>
        api('/pos/tables', 'POST', {
          floor_id: tableForm.floor_id,
          table_number: tableForm.table_number.trim(),
          seats: Math.max(1, Number(tableForm.seats || 4)),
        }),
      );
      setTableForm((f) => ({ ...f, table_number: '' }));
      setNotice('Table added to floor plan.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function startSelfOrderQR(tableNumber: string, guestCount = 2) {
    try {
      const res = await mutate(() =>
        api('/pos/self-order/sessions', 'POST', {
          table_number: tableNumber,
          guest_count: guestCount,
        }),
      );
      setSelfOrderResult(res);
      setNotice(`Self-order QR session generated for table ${tableNumber}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createKdsTicket(e: FormEvent) {
    e.preventDefault();
    if (!kdsForm.item_name.trim()) return;
    try {
      await mutate(() =>
        api('/pos/kds/tickets', 'POST', {
          order_ref: kdsForm.order_ref.trim() || 'POS-' + Date.now().toString().slice(-5),
          table_number: kdsForm.table_number.trim() || undefined,
          station: kdsForm.station,
          items: [
            {
              name: kdsForm.item_name.trim(),
              qty: Math.max(1, Number(kdsForm.qty || 1)),
              notes: kdsForm.notes.trim() || undefined,
            },
          ],
        }),
      );
      setKdsForm((f) => ({ ...f, order_ref: '', item_name: '', qty: '1', notes: '' }));
      setNotice('Kitchen ticket dispatched to KDS.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function advanceTicket(ticket: any) {
    const next = NEXT_KDS_STATUS[ticket.status];
    if (!next) return;
    try {
      await mutate(() => api(`/pos/kds/tickets/${ticket.id}/status`, 'POST', { status: next }));
      setNotice(`Ticket ${ticket.order_ref || ticket.data?.order_ref || ticket.id.slice(0, 6)} marked ${next}.`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createLoyaltyProgram(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate(() =>
        api('/pos/loyalty-programs', 'POST', {
          name: loyaltyForm.name.trim(),
          currency,
          points_per_1000_minor: Math.max(0, Number(loyaltyForm.points_per_1000_minor || 10)),
          minor_per_point: Math.max(0, Number(loyaltyForm.minor_per_point || 100)),
          active: true,
        }),
      );
      setNotice('Loyalty program saved and active at POS checkout.');
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function evaluateLoyalty(e: FormEvent) {
    e.preventDefault();
    const prog = loyaltyPrograms.find((p) => p.status === 'active') || loyaltyPrograms[0];
    try {
      const res = await api('/pos/loyalty/calculate', 'POST', {
        order_total_minor: Math.round(Number(calcForm.order_total || 0) * currFactor),
        points_per_1000_minor: Number(prog?.data?.points_per_1000_minor ?? 10),
        redeem_points: Math.max(0, Math.round(Number(calcForm.redeem_points || 0))),
        available_points: Math.max(0, Math.round(Number(calcForm.available_points || 0))),
        minor_per_point: Number(prog?.data?.minor_per_point ?? 100),
      });
      setLoyaltyResult(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function evaluateSplitBill(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api('/pos/bills/split', 'POST', {
        subtotal_minor: Math.round(Number(splitForm.subtotal || 0) * currFactor),
        tax_minor: Math.round(Number(splitForm.tax || 0) * currFactor),
        tip_bps: Math.round(Number(splitForm.tip_percent || 0) * 100),
        guests: Math.max(1, Number(splitForm.guests || 1)),
      });
      setSplitResult(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (mode === 'hospitality') {
    const filteredTickets = tickets.filter(
      (t) => stationFilter === 'all' || (t.station || t.data?.station) === stationFilter,
    );
    return (
      <div className="pos-app-page o-app-sheet">
        <div className="o-flat-cp">
          <div>
            <span className="eyebrow">HOSPITALITY &amp; KITCHEN</span>
            <h2 style={{ margin: '2px 0 0' }}>Floor Plan, Tables &amp; Live KDS</h2>
          </div>
          <button type="button" className="secondary-button" onClick={() => void loadAll()}>
            Refresh board
          </button>
        </div>

        {error && <p className="alert error" role="alert">{error}</p>}
        {notice && <p className="alert" role="status">{notice}</p>}

        <div className="pos-ops-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '12px' }}>
          <section className="panel">
            <h3>Restaurant Floors &amp; Tables ({floors.length})</h3>
            {floors.map((floor: any) => (
              <div key={floor.id} style={{ padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{floor.name || floor.data?.name}</strong>
                  <small className="muted">{floor.location || floor.data?.location || 'Dining'}</small>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {(floor.tables || []).map((tbl: any) => {
                    const tblNum = tbl.table_number || tbl.data?.table_number;
                    const tblSeats = tbl.seats || tbl.data?.seats || 4;
                    return (
                      <div
                        key={tbl.id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12.5px',
                        }}
                      >
                        <span>
                          <strong>{tblNum}</strong> · {tblSeats} seats
                        </span>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => void startSelfOrderQR(tblNum, tblSeats)}
                        >
                          QR Token
                        </button>
                      </div>
                    );
                  })}
                  {!(floor.tables || []).length && <small className="muted">No tables on this floor yet.</small>}
                </div>
              </div>
            ))}
            {selfOrderResult && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: '#ecfdf5', borderRadius: '10px', fontSize: '13px' }}>
                <strong>Table {selfOrderResult.table_number || selfOrderResult.data?.table_number} Self-Order Token:</strong>{' '}
                <code>{selfOrderResult.qr_token || selfOrderResult.data?.qr_token}</code> ({selfOrderResult.guest_count || selfOrderResult.data?.guest_count} guests)
              </div>
            )}
            <form onSubmit={addFloor} style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
              <strong>Add Floor</strong>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  required
                  placeholder="Floor name (e.g. Main Patio)"
                  value={floorForm.name}
                  onChange={(e) => setFloorForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  placeholder="Area"
                  value={floorForm.location}
                  onChange={(e) => setFloorForm((f) => ({ ...f, location: e.target.value }))}
                />
                <button type="submit" className="button">+ Add Floor</button>
              </div>
            </form>
            {floors.length > 0 && (
              <form onSubmit={addTable} style={{ display: 'grid', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <strong>Add Table to Floor</strong>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    value={tableForm.floor_id}
                    onChange={(e) => setTableForm((f) => ({ ...f, floor_id: e.target.value }))}
                  >
                    {floors.map((fl: any) => (
                      <option key={fl.id} value={fl.id}>{fl.name || fl.data?.name}</option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Table # (e.g. T4)"
                    value={tableForm.table_number}
                    onChange={(e) => setTableForm((f) => ({ ...f, table_number: e.target.value }))}
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    style={{ width: '80px' }}
                    value={tableForm.seats}
                    onChange={(e) => setTableForm((f) => ({ ...f, seats: e.target.value }))}
                  />
                  <button type="submit" className="secondary-button">+ Add Table</button>
                </div>
              </form>
            )}
          </section>

          <section className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Kitchen Display System (KDS)</h3>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {KDS_STATIONS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={stationFilter === st ? 'button' : 'secondary-button'}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setStationFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {filteredTickets.map((t: any) => {
                const orderRef = t.order_ref || t.data?.order_ref;
                const tblNum = t.table_number || t.data?.table_number;
                const station = t.station || t.data?.station;
                const items = t.items || t.data?.items || [];
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      background:
                        t.status === 'ready'
                          ? '#ecfdf5'
                          : t.status === 'preparing'
                            ? '#eff6ff'
                            : '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>
                        {orderRef} {tblNum ? `· Table ${tblNum}` : ''}
                      </strong>
                      <span className="badge">{station} · {t.status}</span>
                    </div>
                    <ul style={{ margin: '6px 0', paddingLeft: '18px', fontSize: '13px' }}>
                      {items.map((item: any, idx: number) => (
                        <li key={idx}>
                          {item.qty}× {item.name} {item.notes ? `(${item.notes})` : ''}
                        </li>
                      ))}
                    </ul>
                    {NEXT_KDS_STATUS[t.status] && (
                      <button
                        type="button"
                        className="button"
                        style={{ padding: '5px 12px', fontSize: '12px' }}
                        onClick={() => void advanceTicket(t)}
                      >
                        Mark {NEXT_KDS_STATUS[t.status]} →
                      </button>
                    )}
                  </div>
                );
              })}
              {!filteredTickets.length && <p className="muted">No kitchen tickets in this station queue.</p>}
            </div>
            <form onSubmit={createKdsTicket} style={{ display: 'grid', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              <strong>Dispatch Manual KDS Ticket</strong>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  placeholder="Order Ref"
                  value={kdsForm.order_ref}
                  onChange={(e) => setKdsForm((f) => ({ ...f, order_ref: e.target.value }))}
                />
                <input
                  placeholder="Table #"
                  style={{ width: '90px' }}
                  value={kdsForm.table_number}
                  onChange={(e) => setKdsForm((f) => ({ ...f, table_number: e.target.value }))}
                />
                <select
                  value={kdsForm.station}
                  onChange={(e) => setKdsForm((f) => ({ ...f, station: e.target.value }))}
                >
                  {['main', 'grill', 'bar', 'cold', 'bakery'].map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Dish / Drink item"
                  value={kdsForm.item_name}
                  onChange={(e) => setKdsForm((f) => ({ ...f, item_name: e.target.value }))}
                />
                <input
                  type="number"
                  min="1"
                  style={{ width: '70px' }}
                  value={kdsForm.qty}
                  onChange={(e) => setKdsForm((f) => ({ ...f, qty: e.target.value }))}
                />
                <button type="submit" className="secondary-button">Send to Kitchen</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-app-page o-app-sheet">
      <div className="o-flat-cp">
        <div>
          <span className="eyebrow">LOYALTY, SPLIT BILL &amp; CASH CONTROL</span>
          <h2 style={{ margin: '2px 0 0' }}>POS Loyalty Programs &amp; Counter Tools</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => void loadAll()}>
          Refresh
        </button>
      </div>

      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert" role="status">{notice}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '12px' }}>
        <section className="panel">
          <h3>Loyalty Programs ({loyaltyPrograms.length})</h3>
          {loyaltyPrograms.map((p: any) => (
            <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13.5px' }}>
              <strong>{p.data?.name}</strong> <span className="badge">{p.status}</span>
              <div className="muted">
                Earn {p.data?.points_per_1000_minor} pts per {money(1000, p.data?.currency || currency)} · Redeem {money(p.data?.minor_per_point || 0, p.data?.currency || currency)} per pt
              </div>
            </div>
          ))}
          <form onSubmit={createLoyaltyProgram} style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
            <Field label="Program name">
              <input
                required
                value={loyaltyForm.name}
                onChange={(e) => setLoyaltyForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label="Points per 1,000 minor units">
                <input
                  type="number"
                  min="0"
                  value={loyaltyForm.points_per_1000_minor}
                  onChange={(e) =>
                    setLoyaltyForm((f) => ({ ...f, points_per_1000_minor: e.target.value }))
                  }
                />
              </Field>
              <Field label="Minor units value per point">
                <input
                  type="number"
                  min="0"
                  value={loyaltyForm.minor_per_point}
                  onChange={(e) => setLoyaltyForm((f) => ({ ...f, minor_per_point: e.target.value }))}
                />
              </Field>
            </div>
            <button type="submit" className="button">+ Save Loyalty Program</button>
          </form>

          <form onSubmit={evaluateLoyalty} style={{ display: 'grid', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
            <strong>Loyalty Points Calculator</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <Field label={`Order (${currency})`}>
                <input
                  type="number"
                  value={calcForm.order_total}
                  onChange={(e) => setCalcForm((f) => ({ ...f, order_total: e.target.value }))}
                />
              </Field>
              <Field label="Available pts">
                <input
                  type="number"
                  value={calcForm.available_points}
                  onChange={(e) => setCalcForm((f) => ({ ...f, available_points: e.target.value }))}
                />
              </Field>
              <Field label="Redeem pts">
                <input
                  type="number"
                  value={calcForm.redeem_points}
                  onChange={(e) => setCalcForm((f) => ({ ...f, redeem_points: e.target.value }))}
                />
              </Field>
            </div>
            <button type="submit" className="secondary-button">Calculate Points &amp; Discount</button>
            {loyaltyResult && (
              <div style={{ padding: '10px', background: '#ecfdf5', borderRadius: '10px', fontSize: '13px' }}>
                Earned: <strong>+{loyaltyResult.earned_points ?? loyaltyResult.points_earned ?? 0} pts</strong> ·
                Redeem discount: <strong>{money(loyaltyResult.discount_minor ?? loyaltyResult.redemption_discount_minor ?? 0, currency)}</strong> ·
                Net payable: <strong>{money(loyaltyResult.net_payable_minor ?? loyaltyResult.net_total_minor ?? 0, currency)}</strong> ·
                Ending balance: <strong>{loyaltyResult.ending_points ?? 0} pts</strong>
              </div>
            )}
          </form>
        </section>

        <section className="panel">
          <h3>Split Bill &amp; Tip Calculator</h3>
          <form onSubmit={evaluateSplitBill} style={{ display: 'grid', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label={`Subtotal (${currency})`}>
                <input
                  type="number"
                  value={splitForm.subtotal}
                  onChange={(e) => setSplitForm((f) => ({ ...f, subtotal: e.target.value }))}
                />
              </Field>
              <Field label={`Tax (${currency})`}>
                <input
                  type="number"
                  value={splitForm.tax}
                  onChange={(e) => setSplitForm((f) => ({ ...f, tax: e.target.value }))}
                />
              </Field>
              <Field label="Tip (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={splitForm.tip_percent}
                  onChange={(e) => setSplitForm((f) => ({ ...f, tip_percent: e.target.value }))}
                />
              </Field>
              <Field label="Number of guests">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={splitForm.guests}
                  onChange={(e) => setSplitForm((f) => ({ ...f, guests: e.target.value }))}
                />
              </Field>
            </div>
            <button type="submit" className="button">Calculate Per-Guest Split</button>
          </form>
          {splitResult && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '12px', fontSize: '13.5px' }}>
              <div>Grand total (with tip): <strong>{money(splitResult.grand_total_minor ?? splitResult.total_minor ?? 0, currency)}</strong></div>
              <div>
                Per guest share:{' '}
                <strong>
                  {money(
                    Array.isArray(splitResult.shares) && splitResult.shares.length
                      ? typeof splitResult.shares[0] === 'number'
                        ? splitResult.shares[0]
                        : Number(splitResult.shares[0]?.amount_minor ?? 0)
                      : (splitResult.per_guest_minor ?? splitResult.base_share_minor ?? 0),
                    currency,
                  )}
                </strong>
                {Array.isArray(splitResult.shares) && splitResult.shares.length > 1
                  ? ` (${splitResult.shares
                      .map((s: any) =>
                        money(typeof s === 'number' ? s : Number(s?.amount_minor ?? 0), currency),
                      )
                      .join(' / ')})`
                  : ''}
              </div>
              {splitResult.tip_minor != null && <div>Tip total: {money(splitResult.tip_minor, currency)}</div>}
            </div>
          )}

          <h3 style={{ marginTop: '20px' }}>Recorded Cash Denomination Counts ({cashCounts.length})</h3>
          {cashCounts.slice(0, 8).map((cc: any) => (
            <div key={cc.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{cc.data?.session_ref} · <span className="badge">{cc.status}</span></span>
              <strong>{money(cc.data?.counted_minor ?? 0, cc.data?.currency || currency)}</strong>
            </div>
          ))}
          {!cashCounts.length && <p className="muted">Denomination cash counts recorded at shift close appear here.</p>}
        </section>
      </div>
    </div>
  );
}
