import { useEffect, useRef, useState } from 'react';
import { Field, Form, money, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
import { useIdempotentAPI } from '../apps/useIdempotentAPI';
import { appNavigationEvent } from '../apps/AppNavigation';
import { POSAppDashboard } from './POSAppDashboard';
import { POSAppOrders } from './POSAppOrders';
import { POSAppProducts } from './POSAppProducts';
import { POSAppReporting } from './POSAppReporting';
import { POSAppConfiguration } from './POSAppConfiguration';
import { POSReceipt } from './POSReceipt';
import { POSCashier } from './POSCashier';
import { posAppViews, posSectionForView, type POSAppView } from './pos-app-model';
import './pos.css';
import './pos-app.css';

export function POSAppWorkspace({
  api: provided,
  scope,
  section = 'dashboard',
  navigate,
  services = [],
}: {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
  services?: any[];
}) {
  const api = useIdempotentAPI(provided, scope),
    [directory, setDirectory] = useState<any>(null),
    [overviews, setOverviews] = useState<Record<string, any>>({}),
    [team, setTeam] = useState<any[]>([]);
  const [selected, setSelected] = useState(''),
    [sessionId, setSessionId] = useState(''),
    [shift, setShift] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [resume, setResume] = useState<any>(null);
  const [view, setView] = useState<POSAppView>('dashboard'),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [closing, setClosing] = useState(false);
  const lock = useRef(false),
    mounted = useRef(true),
    identity = useRef('');
  identity.current = scope;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const connect = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setRevision((v) => v + 1);
    };
    addEventListener('online', connect);
    addEventListener('offline', connect);
    return () => {
      removeEventListener('online', connect);
      removeEventListener('offline', connect);
    };
  }, []);
  useEffect(() => {
    setDirectory(null);
    setOverviews({});
    setSelected('');
    setSessionId('');
    setShift(null);
    setReceipt(null);
    setResume(null);
    setError('');
  }, [scope]);
  useEffect(() => {
    let current = true;
    if (!online) return;
    setLoading(true);
    (async () => {
      const dir = await api('/pos/registers');
      if (!current) return;
      setDirectory(dir);
      const nextSelected = dir.data.some((row: any) => row.id === selected)
        ? selected
        : dir.data[0]?.id || '';
      if (current) setSelected(nextSelected);
      const loaded = await Promise.allSettled(
        dir.data.map(async (row: any) => {
          const overview = await api('/pos/registers/' + row.id);
          const open = (overview.sessions || []).find((session: any) => session.status === 'open');
          if (open) {
            overview.drawer = await api('/pos/sessions/' + open.id).catch(() => null);
          }
          return [row.id, overview] as [string, any];
        }),
      );
      if (!current) return;
      const map: Record<string, any> = {};
      for (const result of loaded)
        if (result.status === 'fulfilled') map[result.value[0]] = result.value[1];
      setOverviews(map);
      const [teamResult] = await Promise.allSettled([api('/team')]);
      if (current && teamResult.status === 'fulfilled') setTeam(teamResult.value.data || []);
    })()
      .catch((e) => {
        if (current) setError((e as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, scope, revision, online]);
  useEffect(() => {
    let current = true;
    if (!sessionId || !online) {
      setShift(null);
      return;
    }
    api('/pos/sessions/' + sessionId)
      .then((value) => {
        if (current) setShift(value);
      })
      .catch((e) => {
        if (current) setError((e as Error).message);
      });
    return () => {
      current = false;
    };
  }, [api, sessionId, revision, online]);
  useEffect(() => {
    const apply = () => {
      const params = new URLSearchParams(location.search);
      const requested = params.get('view');
      const routeSession = params.get('session'),
        routeRegister = params.get('register');
      if (routeSession) setSessionId(routeSession);
      if (routeRegister) setSelected(routeRegister);
      if (requested && posAppViews.includes(requested as POSAppView))
        setView(requested as POSAppView);
      else
        setView(
          ['orders', 'products', 'reporting', 'configuration'].includes(section)
            ? (section as POSAppView)
            : 'dashboard',
        );
    };
    apply();
    addEventListener('popstate', apply);
    addEventListener(appNavigationEvent, apply);
    return () => {
      removeEventListener('popstate', apply);
      removeEventListener(appNavigationEvent, apply);
    };
  }, [section]);
  useEffect(() => {
    if (
      !receipt &&
      view !== 'cashier' &&
      !['dashboard', 'orders', 'products', 'reporting', 'configuration'].includes(view)
    )
      setView('dashboard');
  }, [view, receipt]);
  const registers = directory?.data || [],
    selectedRegister = registers.find((row: any) => row.id === selected) || registers[0];
  function go(next: POSAppView, route?: { session?: string; register?: string }) {
    if (dirty && view === 'cashier' && next !== 'cashier') {
      setError('Save or clear the current basket before leaving the register.');
      return;
    }
    setError('');
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set('app', 'pos');
    url.searchParams.set('section', posSectionForView(next));
    url.searchParams.set('view', next);
    const routeSession = next === 'cashier' ? route?.session || sessionId : '',
      routeRegister = next === 'cashier' ? route?.register || selectedRegister?.id || '' : '';
    if (routeSession) url.searchParams.set('session', routeSession);
    else url.searchParams.delete('session');
    if (routeRegister) url.searchParams.set('register', routeRegister);
    else url.searchParams.delete('register');
    url.hash = encodeURIComponent('Apps');
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  async function mutate(work: () => Promise<any>) {
    if (lock.current) throw Error('Another register operation is still being checked.');
    if (!navigator.onLine) throw Error('Reconnect before saving; no transaction has been queued.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      return await work();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const editorApi: API = (path, method = 'GET', body, headers) =>
    ['GET', 'HEAD'].includes(method)
      ? api(path, method, body, headers)
      : mutate(() => api(path, method, body, headers));
  function refresh() {
    setError('');
    setRevision((v) => v + 1);
  }
  function selectRegister(id: string) {
    if (dirty && view === 'cashier') {
      setError('Save or clear the current basket before changing registers.');
      return;
    }
    setSelected(id);
    setSessionId('');
    setShift(null);
    setReceipt(null);
    setResume(null);
  }
  function enter(register: any, session: any) {
    setSelected(register.id);
    setSessionId(session.id);
    setShift(null);
    setReceipt(null);
    setResume(null);
    setDirty(false);
    go('cashier', { session: session.id, register: register.id });
  }
  async function openSession(
    register: any,
    input: { opening_cash_minor: number; note: string; acknowledge_count: boolean },
  ) {
    return mutate(async () => {
      const value = await api('/pos/registers/' + register.id + '/sessions', 'POST', {
        expected_register_version: register.version,
        opening_cash_minor: input.opening_cash_minor,
        note: input.note,
        acknowledge_count: input.acknowledge_count,
      });
      setRevision((v) => v + 1);
      setSessionId(value.session.id);
      setNotice('Opening cash recorded. The register is ready for a reviewed sale.');
      return value;
    });
  }
  async function openSale(row: any) {
    setError('');
    try {
      if (row.register_id) setSelected(row.register_id);
      if (row.status === 'draft') {
        const saved = await api('/pos/sales/' + row.id + '/draft');
        setResume(saved);
        setSessionId(saved.session_id);
        setReceipt(null);
        go('cashier', { session: saved.session_id, register: row.register_id });
      } else {
        const saved = await api('/pos/sales/' + row.id + '/receipt');
        setReceipt(saved);
        setResume(null);
        go('cashier', { session: saved.session_id, register: row.register_id });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function confirmed(value: any) {
    setReceipt(value);
    setResume(null);
    setDirty(false);
    setRevision((v) => v + 1);
  }
  function backToDashboard() {
    setReceipt(null);
    setResume(null);
    setDirty(false);
    setView('dashboard');
  }
  function newOrder() {
    setReceipt(null);
    setResume(null);
    setDirty(false);
    go('cashier', { session: sessionId, register: selectedRegister?.id });
  }
  async function closeSession(form: any) {
    if (!shift) return;
    await mutate(async () => {
      const value = await api('/pos/sessions/' + sessionId + '/close', 'POST', {
        expected_version: shift.session.version,
        counted_cash_minor: parseMoney(form.counted, shift.session.data.currency),
        variance_reason: form.reason || '',
        acknowledge_close: form.close === 'on',
      });
      setShift(value);
      setClosing(false);
      setRevision((v) => v + 1);
      setNotice('The counted shift is closed. Original counts and variance are retained.');
      setView('dashboard');
      setSessionId('');
    });
  }
  const status = (id: string) => {
    const row = services.find((item: any) => item.id === id);
    return row?.status || row?.entitlement?.status || 'unavailable';
  };
  const coreReadiness: {
    id: string;
    label: string;
    detail: string;
    state: 'ready' | 'attention' | 'blocked';
  }[] = [
    ['pos', 'Point of Sale'],
    ['products', 'Products'],
    ['orders', 'Orders'],
    ['invoicing', 'Invoicing'],
    ['cash_flow', 'Cash Flow'],
    ['customers', 'Customers'],
  ].map(([id, label]) => {
    const value = status(id);
    return {
      id,
      label: label as string,
      detail:
        id === 'customers' && value !== 'active'
          ? 'Required for canonical customer records'
          : value === 'active'
            ? 'Active'
            : value.replaceAll('_', ' '),
      state: value === 'active' ? ('ready' as const) : ('blocked' as const),
    };
  });
  const optionalReadiness: {
    id: string;
    label: string;
    detail: string;
    state: 'ready' | 'attention' | 'blocked';
  }[] = [
    {
      id: 'inventory',
      label: 'Inventory & warehouse',
      detail:
        status('inventory') === 'active'
          ? 'Tracked products can be sold where a warehouse is configured'
          : 'Tracked products require active Inventory and a warehouse',
      state: status('inventory') === 'active' ? 'ready' : 'attention',
    },
    {
      id: 'register',
      label: 'Register policy',
      detail: registers.length
        ? registers.length + ' configured'
        : 'Create a register policy to begin',
      state: registers.length ? 'ready' : 'attention',
    },
    {
      id: 'payments',
      label: 'Payments',
      detail:
        status('payments') === 'active'
          ? 'Sandbox electronic requests available'
          : 'Electronic simulator requires the Payments service',
      state: status('payments') === 'active' ? 'ready' : 'attention',
    },
  ];
  const readiness = [...coreReadiness, ...optionalReadiness];
  const activeSession = shift?.session?.id === sessionId ? shift.session : null;
  return (
    <div className="pos-app-shell">
      <header className="pos-app-module">
        <div className="pos-app-brand">
          <span className="pos-app-mark">POS</span>
          <strong>Point of Sale</strong>
        </div>
        <nav aria-label="Point of Sale sections">
          {registers.length > 0 && (
            <button
              type="button"
              className={view === 'dashboard' && !receipt ? 'active' : ''}
              onClick={() => {
                setReceipt(null);
                go('dashboard');
              }}
            >
              Dashboard
            </button>
          )}
          {registers.length > 0 && (
            <button
              type="button"
              className={view === 'orders' ? 'active' : ''}
              onClick={() => {
                setReceipt(null);
                go('orders');
              }}
            >
              Orders
            </button>
          )}
          {registers.length > 0 && (
            <button
              type="button"
              className={view === 'products' ? 'active' : ''}
              onClick={() => {
                setReceipt(null);
                go('products');
              }}
            >
              Products
            </button>
          )}
          {registers.length > 0 && (
            <button
              type="button"
              className={view === 'reporting' ? 'active' : ''}
              onClick={() => {
                setReceipt(null);
                go('reporting');
              }}
            >
              Reporting
            </button>
          )}
          <button
            type="button"
            className={view === 'configuration' ? 'active' : ''}
            onClick={() => {
              setReceipt(null);
              go('configuration');
            }}
          >
            Configuration
          </button>
        </nav>
        <div className="pos-app-module-context">
          {selectedRegister && (
            <>
              <span>{selectedRegister.data.name}</span>
              <span className="badge">{selectedRegister.data.currency}</span>
            </>
          )}
          <span className={online ? 'pos-online' : 'pos-offline'}>
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>
      {error && (
        <p role="alert" className="alert error pos-app-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert pos-app-alert">
          {notice}
        </p>
      )}
      {view === 'dashboard' && !receipt && (
        <POSAppDashboard
          directory={directory}
          overviews={overviews}
          loading={loading}
          readiness={readiness as any}
          selectedRegister={selectedRegister?.id}
          onSelect={selectRegister}
          onContinue={(register: any, _overview: any, session: any) => enter(register, session)}
          onConfigure={() => go('configuration')}
          onRefresh={refresh}
          openSession={openSession}
          manager={!!directory?.permissions?.configure}
          online={online}
          busy={busy}
          onSetupCustomers={() => navigate('Explore Services')}
        />
      )}
      {view === 'orders' && !receipt && (
        <POSAppOrders
          api={api}
          registers={registers}
          team={team}
          online={online}
          busy={busy}
          onOpen={openSale}
        />
      )}
      {view === 'products' && !receipt && (
        <POSAppProducts api={api} registers={registers} online={online} navigate={navigate} />
      )}
      {view === 'reporting' && !receipt && (
        <POSAppReporting
          api={api}
          registers={registers}
          team={team}
          online={online}
          revision={revision}
          identity={scope}
          onOpen={openSale}
        />
      )}
      {view === 'configuration' && !receipt && (
        <POSAppConfiguration
          api={editorApi}
          registers={registers}
          selected={selectedRegister?.id}
          onSelect={selectRegister}
          onSaved={(value: any) => {
            if (value?.id) setSelected(value.id);
            setRevision((v) => v + 1);
            setNotice('Register policy saved. Open a counted shift to begin selling.');
          }}
          manager={!!directory?.permissions?.configure}
          online={online}
          busy={busy}
          navigate={navigate}
          services={services}
        />
      )}
      {view === 'cashier' && !receipt && activeSession && (
        <POSCashier
          api={api}
          register={selectedRegister}
          session={activeSession}
          canWrite={!!overviews[selectedRegister?.id]?.permissions?.write}
          manager={!!overviews[selectedRegister?.id]?.manager}
          online={online}
          initialDraft={resume || undefined}
          onDirty={setDirty}
          onConfirmed={confirmed}
          mutate={mutate}
          onExit={() => go('dashboard')}
          onCloseShift={() => setClosing(true)}
        />
      )}
      {view === 'cashier' && !receipt && !activeSession && (
        <section className="panel pos-app-empty">
          <h3>Register shift unavailable</h3>
          <p>
            Select an open shift from the dashboard or ask a register manager to open and assign
            one.
          </p>
          <button type="button" className="button" onClick={backToDashboard}>
            Back to dashboard
          </button>
        </section>
      )}
      {receipt && (
        <div className="pos-receipt-screen">
          <header className="pos-receipt-success">
            <div className="pos-success-icon">✓</div>
            <div>
              <span className="eyebrow">Transaction complete</span>
              <h2>{receipt.reference}</h2>
              <p>
                {money(receipt.totals?.total_minor || receipt.total_minor || 0, receipt.currency)} ·{' '}
                {receipt.payment?.status || receipt.payment_status || 'Recorded'}
              </p>
            </div>
            <div className="pos-receipt-screen-actions">
              <button type="button" className="secondary-button" onClick={backToDashboard}>
                Close
              </button>
              <button type="button" className="button" onClick={newOrder}>
                New order
              </button>
            </div>
          </header>
          <POSReceipt
            receipt={receipt}
            session={shift?.session}
            canWrite={!!overviews[selectedRegister?.id]?.permissions?.write}
            api={api}
            mutate={mutate}
            onChanged={setReceipt}
            navigate={navigate}
          />
          <p className="pos-app-note">
            Receipt is backed by the confirmed sale, shared invoice and recorded payment evidence.
            Printing uses the browser print dialog; no receipt printer driver is configured.
          </p>
        </div>
      )}
      {closing && shift && (
        <div className="pos-modal-backdrop">
          <section className="pos-modal pos-closing" role="dialog" aria-modal="true">
            <header>
              <div>
                <span className="eyebrow">{selectedRegister?.data?.name}</span>
                <h3>Closing register</h3>
              </div>
              <button type="button" className="quiet-button" onClick={() => setClosing(false)}>
                Close
              </button>
            </header>
            <dl className="pos-closing-summary">
              <div>
                <dt>Opening cash</dt>
                <dd>{money(shift.session.data.opening_cash_minor, shift.session.data.currency)}</dd>
              </div>
              <div>
                <dt>Expected physical cash</dt>
                <dd>{money(shift.expected_minor, shift.session.data.currency)}</dd>
              </div>
              <div>
                <dt>Cash adjustments</dt>
                <dd>{shift.adjustments?.length || 0}</dd>
              </div>
            </dl>
            {!!shift.adjustments?.length && (
              <div className="pos-closing-adjustments">
                <strong>Drawer adjustments</strong>
                <ul>
                  {shift.adjustments.map((item: any) => (
                    <li key={item.id}>
                      <span>{money(item.amount_minor, shift.session.data.currency)}</span>
                      <span>{item.data?.reason || 'Manager adjustment'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              Counted cash is compared with expected physical cash. A difference requires an
              explanation of at least eight characters.
            </p>
            <Form disabled={busy} submit={(form) => closeSession(form)}>
              <Field label={'Counted cash (' + shift.session.data.currency + ')'}>
                <input name="counted" required inputMode="decimal" placeholder="0.00" autoFocus />
              </Field>
              <Field label="Closing note / variance explanation">
                <textarea name="reason" maxLength={1000} required minLength={0} />
              </Field>
              <label className="checkbox-field">
                <input name="close" type="checkbox" required />I confirm the counted cash and
                understand the shift will close.
              </label>
              <div className="pos-modal-actions">
                <button type="submit" className="button">
                  Close register
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setClosing(false)}
                >
                  Discard
                </button>
              </div>
            </Form>
          </section>
        </div>
      )}
    </div>
  );
}
