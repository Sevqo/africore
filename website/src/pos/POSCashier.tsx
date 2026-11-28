import { useEffect, useState } from 'react';
import { money, factor, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
import { quantityMilli, displayQuantity } from '../../../src/inventory/quantity';
import { posCategoryTone, posProductInitials, posSuggestedCashInput } from './pos-app-model';

type Props = {
  api: API;
  register: any;
  session: any;
  canWrite: boolean;
  manager: boolean;
  online: boolean;
  initialDraft?: any;
  onDirty: (value: boolean) => void;
  onConfirmed: (receipt: any) => void;
  mutate: (work: () => Promise<any>) => Promise<any>;
  onExit?: () => void;
  onCloseShift?: () => void;
  onCashAdjustment?: () => void;
  onXReport?: () => void;
  onRegisterUpdated?: () => void;
};
type KeyMode = 'qty' | 'discount';
type HeldOrder = {
  id: string;
  label: string;
  tableNumber: string;
  basket: any[];
  discount: string;
  notes: string;
  customer: string;
  savedAt: string;
};
export function POSCashier({
  api,
  register: r,
  session,
  canWrite,
  manager,
  online,
  initialDraft,
  onDirty,
  onConfirmed,
  mutate,
  onExit,
  onCloseShift,
  onCashAdjustment,
  onXReport,
  onRegisterUpdated,
}: Props) {
  const c = r.data,
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [category, setCategory] = useState(''),
    [products, setProducts] = useState<any>(null),
    [error, setError] = useState('');
  const [basket, setBasket] = useState<any[]>(
    () =>
      initialDraft?.draft?.items.map((item: any, i: number) => ({
        product: {
          id: item.product_id,
          name: initialDraft.quote.document.items[i]?.description || 'Saved product',
          sale_price_minor: initialDraft.quote.document.items[i]?.unit_price_minor || 0,
          currency: initialDraft.quote.document.currency,
        },
        quantity: displayQuantity(item.quantity_milli),
      })) || [],
  );
  const [discount, setDiscount] = useState(
      String((initialDraft?.draft?.discount_minor || 0) / factor(c.currency)),
    ),
    [notes, setNotes] = useState(initialDraft?.draft?.notes || ''),
    [customer, setCustomer] = useState(initialDraft?.draft?.customer_id || ''),
    [customerQuery, setCustomerQuery] = useState(''),
    [customers, setCustomers] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(
      initialDraft ? { id: initialDraft.id, version: initialDraft.version } : null,
    ),
    [quote, setQuote] = useState<any>(null),
    [selected, setSelected] = useState<string>('');
  const [searchRevision, setSearchRevision] = useState(0),
    [paymentOpen, setPaymentOpen] = useState(false),
    [method, setMethod] = useState(
      c.allow_cash
        ? 'cash'
        : c.electronic_method === 'sandbox_simulator'
          ? 'electronic'
          : 'pending',
    ),
    [cashInput, setCashInput] = useState(''),
    [tenderedInput, setTenderedInput] = useState('');
  const [keyMode, setKeyMode] = useState<KeyMode>('qty'),
    [keyBuffer, setKeyBuffer] = useState(''),
    [notice, setNotice] = useState(''),
    [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]),
    [tableNumber, setTableNumber] = useState(''),
    [floors, setFloors] = useState<any[]>([]),
    [loyaltyPrograms, setLoyaltyPrograms] = useState<any[]>([]),
    [loyaltyRedeemPts, setLoyaltyRedeemPts] = useState(''),
    [quickCustomerOpen, setQuickCustomerOpen] = useState(false),
    [quickCustomer, setQuickCustomer] = useState({ name: '', phone: '', email: '' });
  useEffect(() => {
    if (!online) return;
    api('/pos/floors')
      .then((res) => setFloors(res?.floors || res?.data || []))
      .catch(() => setFloors([]));
    api('/pos/loyalty-programs')
      .then((res) => setLoyaltyPrograms((res?.data || []).filter((p: any) => p.status === 'active')))
      .catch(() => setLoyaltyPrograms([]));
  }, [online]);
  useEffect(() => {
    let current = true;
    setProducts(null);
    setError('');
    if (online)
      api(
        '/pos/registers/' +
          r.id +
          '/products?' +
          new URLSearchParams({ q: query, offset: String(offset), category }),
      )
        .then((value) => {
          if (current) setProducts(value);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [r.id, query, offset, category, searchRevision, online]);
  useEffect(() => {
    let current = true;
    if (manager)
      api('/records/customers?q=' + encodeURIComponent(customerQuery))
        .then((value) => {
          if (current) setCustomers(Array.isArray(value) ? value : value.data || []);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [manager, customerQuery]);
  useEffect(() => {
    setQuote(null);
  }, [session.version, online]);
  useEffect(() => {
    onDirty(basket.length > 0 && !quote);
  }, [basket, quote]);
  const change = () => {
    setQuote(null);
    setError('');
    setNotice('');
  };
  const line = () => basket.find((item) => item.product.id === selected);
  const add = (product: any) => {
    const found = basket.find((item) => item.product.id === product.id),
      quantity = found ? displayQuantity(quantityMilli(found.quantity) + 1000) : '1';
    change();
    setSelected(product.id);
    setBasket((previous) =>
      previous.some((item) => item.product.id === product.id)
        ? previous.map((item) => (item.product.id === product.id ? { ...item, quantity } : item))
        : [...previous, { product, quantity }],
    );
  };
  const remove = (id: string) => {
    change();
    setBasket((values) => values.filter((v) => v.product.id !== id));
    if (selected === id) setSelected('');
  };
  const clear = () => {
    setBasket([]);
    setDraft(null);
    setQuote(null);
    setDiscount('0');
    setNotes('');
    setCustomer('');
    setError('');
    setSelected('');
    setPaymentOpen(false);
    setKeyBuffer('');
    onDirty(false);
  };
  const setQuantity = (id: string, quantity: string) => {
    change();
    setBasket((values) => values.map((v) => (v.product.id === id ? { ...v, quantity } : v)));
  };
  const applyKey = () => {
    if (!keyBuffer) return;
    if (keyMode === 'discount') {
      if (Number(keyBuffer) < 0) {
        setError('Discount cannot be negative.');
        return;
      }
      setError('');
      change();
      setDiscount(keyBuffer);
      setKeyBuffer('');
      return;
    }
    if (!selected) {
      setError('Select a basket line before setting quantity.');
      return;
    }
    if (!(Number(keyBuffer) > 0)) {
      setError('Quantity must be greater than zero.');
      return;
    }
    setError('');
    setQuantity(selected, keyBuffer);
    setKeyBuffer('');
  };
  function parkCurrentOrder() {
    if (!basket.length) return;
    const label = tableNumber
      ? `Table ${tableNumber}`
      : customers.find((cust) => cust.id === customer)?.name || `Held #${heldOrders.length + 1}`;
    const entry: HeldOrder = {
      id: crypto.randomUUID(),
      label,
      tableNumber,
      basket,
      discount,
      notes,
      customer,
      savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setHeldOrders((cur) => [...cur, entry]);
    clear();
    setTableNumber('');
    setNotice(`Order parked as "${label}". Tap its tab anytime to resume.`);
  }
  function resumeHeldOrder(order: HeldOrder) {
    if (basket.length) parkCurrentOrder();
    setBasket(order.basket);
    setDiscount(order.discount);
    setNotes(order.notes);
    setCustomer(order.customer);
    setTableNumber(order.tableNumber);
    setHeldOrders((cur) => cur.filter((h) => h.id !== order.id));
    setQuote(null);
    setDraft(null);
    setNotice(`Resumed "${order.label}".`);
  }
  function handleBarcodeOrSearchEnter() {
    const term = query.trim().toLowerCase();
    if (!term || !products?.data?.length) {
      setSearchRevision((v) => v + 1);
      return;
    }
    const exact = products.data.find(
      (p: any) =>
        String(p.barcode || '').toLowerCase() === term ||
        String(p.sku || '').toLowerCase() === term,
    );
    const match = exact || (products.data.length === 1 ? products.data[0] : null);
    if (match && canWrite) {
      add(match);
      setQuery('');
      setOffset(0);
      setNotice(`Scanned & added ${match.name}.`);
    } else {
      setSearchRevision((v) => v + 1);
    }
  }
  async function sendBasketToKitchen() {
    if (!basket.length) return;
    try {
      await mutate(() =>
        api('/pos/kds/tickets', 'POST', {
          order_ref: 'POS-' + (draft?.id?.slice(0, 6) || Date.now().toString().slice(-5)).toUpperCase(),
          table_number: tableNumber || undefined,
          station: 'main',
          items: basket.map((item) => ({
            name: item.product.name,
            qty: Math.max(1, Math.round(Number(item.quantity || 1))),
            notes: notes.trim() || undefined,
          })),
        }),
      );
      setNotice(
        `Sent ${basket.length} item(s) to Kitchen Display (KDS)${tableNumber ? ` for Table ${tableNumber}` : ''}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createQuickCustomer() {
    if (!quickCustomer.name.trim()) return;
    try {
      const created = await mutate(() =>
        api('/records/customers', 'POST', {
          name: quickCustomer.name.trim(),
          email: quickCustomer.email.trim() || undefined,
          phone: quickCustomer.phone.trim() || undefined,
          status: 'active',
        }),
      );
      setCustomers((cur) => [created, ...cur]);
      setCustomer(created.id);
      setQuickCustomer({ name: '', phone: '', email: '' });
      setQuickCustomerOpen(false);
      setNotice(`Created customer "${created.name}" and attached to this order.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function applyLoyaltyRedemption() {
    const prog = loyaltyPrograms[0];
    const pts = Math.max(0, Math.round(Number(loyaltyRedeemPts || 0)));
    if (!prog || !pts || !basket.length) return;
    const basketTotalMinor = basket.reduce(
      (sum, item) =>
        sum + Math.round((quantityMilli(item.quantity) / 1000) * (item.product.sale_price_minor || 0)),
      0,
    );
    try {
      const calc = await api('/pos/loyalty/calculate', 'POST', {
        order_total_minor: basketTotalMinor,
        points_per_1000_minor: Number(prog.data?.points_per_1000_minor || 10),
        redeem_points: pts,
        available_points: pts,
        minor_per_point: Number(prog.data?.minor_per_point || 100),
      });
      const discMinor = Number(calc.redemption_discount_minor ?? calc.discount_minor ?? 0);
      change();
      setDiscount(String(discMinor / factor(c.currency)));
      setNotes((prev: string) =>
        prev ? `${prev} | Loyalty redeemed: ${pts} pts` : `Loyalty redeemed: ${pts} pts`,
      );
      setLoyaltyRedeemPts('');
      setNotice(
        `Applied ${money(discMinor, c.currency)} loyalty discount (${pts} pts via ${prog.data?.name}).`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const press = (key: string) => {
    if (key === 'C') {
      setKeyBuffer('');
      return;
    }
    if (key === 'back') {
      setKeyBuffer((value) => value.slice(0, -1));
      return;
    }
    if (key === '+/-') {
      setKeyBuffer((value) => (value.startsWith('-') ? value.slice(1) : value ? '-' + value : '-'));
      return;
    }
    if (key === '.' && keyBuffer.includes('.')) return;
    if ((keyBuffer + key).length > 12) return;
    setKeyBuffer((value) => value + key);
  };
  let preview: string | null = null;
  if (quote && ['cash', 'split'].includes(method)) {
    try {
      const total = quote.amounts.total_minor,
        cash = method === 'cash' ? total : parseMoney(cashInput, c.currency);
      if (method === 'split' && cash <= 0)
        preview = 'Enter a positive cash amount for the split tender.';
      else if (cash > total) preview = 'Cash applied must fit the positive invoice balance.';
      else if (method === 'split' && cash >= total)
        preview = 'Split cash must be less than the total so an electronic remainder is created.';
      else if (!tenderedInput) preview = 'Enter the cash tendered at the drawer.';
      else {
        const tendered = parseMoney(tenderedInput, c.currency);
        preview =
          tendered < cash
            ? 'Tendered cash is below the amount applied.'
            : 'Change: ' +
              money(tendered - cash, c.currency) +
              (method === 'split'
                ? ' · Electronic remainder: ' + money(total - cash, c.currency)
                : '');
      }
    } catch {
      preview = 'Enter exact currency amounts before confirming.';
    }
  }
  async function review() {
    const input = {
      expected_session_version: session.version,
      customer_id: customer || null,
      items: basket.map((item) => ({
        product_id: item.product.id,
        quantity_milli: quantityMilli(item.quantity),
      })),
      discount_minor: parseMoney(discount, c.currency),
      notes,
    };
    const saved = await api(
      draft ? '/pos/sales/' + draft.id + '/draft' : '/pos/sessions/' + session.id + '/drafts',
      draft ? 'PUT' : 'POST',
      draft ? { ...input, expected_version: draft.version } : input,
    );
    if (saved.status === 'confirmed') {
      onConfirmed(await api('/pos/sales/' + saved.id + '/receipt'));
      return;
    }
    const current = await api('/pos/sales/' + saved.id + '/quote');
    setDraft({ id: saved.id, version: saved.version });
    setQuote(current);
    setPaymentOpen(true);
    setTenderedInput('');
    setCashInput('');
    if (c.allow_cash)
      setTenderedInput(posSuggestedCashInput(current.amounts.total_minor, c.currency));
  }
  async function confirmPayment() {
    if (!quote || !draft) throw Error('Review the current basket before taking payment.');
    const total = quote.amounts.total_minor,
      cash = method === 'cash' ? total : method === 'split' ? parseMoney(cashInput, c.currency) : 0,
      tendered =
        method === 'cash' || method === 'split' ? parseMoney(tenderedInput, c.currency) : 0;
    const value = await api('/pos/sales/' + draft.id + '/confirm', 'POST', {
      expected_version: draft.version,
      quote_hash: quote.quote_hash,
      payment_intent: method,
      cash_amount_minor: cash,
      tendered_cash_minor: tendered,
      handover_now: method === 'cash',
      acknowledge_recorded_cash: ['cash', 'split'].includes(method),
      acknowledge_sandbox_electronic: ['electronic', 'split'].includes(method),
      acknowledge_handover: method === 'cash',
    });
    clear();
    onConfirmed(value);
  }
  if (paymentOpen && quote && draft)
    return (
      <div className="pos-payment-screen">
        <header className="pos-payment-top">
          <button type="button" className="quiet-button" onClick={() => setPaymentOpen(false)}>
            ← Back
          </button>
          <div>
            <span className="eyebrow">Payment</span>
            <h2>
              {c.name} · {draft ? 'Current order' : ''}
            </h2>
          </div>
          <div className="pos-payment-context">
            <span className="badge">{c.currency}</span>
            <span>{session.data.cashier_label || 'Cashier'}</span>
          </div>
        </header>
        <div className="pos-payment-layout">
          <section className="pos-payment-methods">
            <h3>Payment method</h3>
            <div className="pos-payment-method-list">
              {c.allow_cash && (
                <button
                  type="button"
                  className={method === 'cash' ? 'pos-payment-method active' : 'pos-payment-method'}
                  onClick={() => {
                    setMethod('cash');
                    setTenderedInput(posSuggestedCashInput(quote.amounts.total_minor, c.currency));
                  }}
                >
                  <span>Cash</span>
                  <small>Recorded at the drawer</small>
                </button>
              )}
              {c.electronic_method === 'sandbox_simulator' && (
                <button
                  type="button"
                  className={
                    method === 'electronic' ? 'pos-payment-method active' : 'pos-payment-method'
                  }
                  onClick={() => setMethod('electronic')}
                >
                  <span>Card / electronic</span>
                  <small>Sandbox simulator only</small>
                </button>
              )}
              {c.allow_cash && c.electronic_method === 'sandbox_simulator' && (
                <button
                  type="button"
                  className={
                    method === 'split' ? 'pos-payment-method active' : 'pos-payment-method'
                  }
                  onClick={() => setMethod('split')}
                >
                  <span>Split</span>
                  <small>Cash plus sandbox remainder</small>
                </button>
              )}
              {c.allow_pending_orders && (
                <button
                  type="button"
                  className={
                    method === 'pending' ? 'pos-payment-method active' : 'pos-payment-method'
                  }
                  onClick={() => setMethod('pending')}
                >
                  <span>Pending order</span>
                  <small>No money recorded</small>
                </button>
              )}
            </div>
          </section>
          <div className="pos-payment-keypad">
            <div className="pos-keypad-display">
              <span>
                {method === 'split'
                  ? 'Cash applied'
                  : method === 'cash'
                    ? 'Cash tendered'
                    : 'Amount'}
              </span>
              <strong>
                {method === 'split'
                  ? cashInput || '0'
                  : method === 'cash'
                    ? tenderedInput || '0'
                    : money(quote.amounts.total_minor, c.currency)}
              </strong>
            </div>
            {method === 'split' && (
              <label className="pos-payment-input">
                <span>Cash applied</span>
                <input
                  inputMode="decimal"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder={posSuggestedCashInput(quote.amounts.total_minor, c.currency)}
                />
              </label>
            )}
            {['cash', 'split'].includes(method) && (
              <>
                <label className="pos-payment-input">
                  <span>Cash tendered</span>
                  <input
                    inputMode="decimal"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => {
                      const exact = posSuggestedCashInput(quote.amounts.total_minor, c.currency);
                      if (method === 'split') setCashInput(exact);
                      setTenderedInput(exact);
                    }}
                  >
                    Exact
                  </button>
                  {[100, 500, 1000, 2000, 5000].map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      className="secondary-button"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => {
                        const baseNum = Number(tenderedInput || 0);
                        setTenderedInput(String(baseNum + bill));
                      }}
                    >
                      +{bill.toLocaleString()}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="pos-keypad-small">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, '.'].map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    const current = method === 'split' ? cashInput : tenderedInput;
                    const next = current + String(key);
                    if (method === 'split') setCashInput(next);
                    else setTenderedInput(next);
                  }}
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (method === 'split') setCashInput((v) => v.slice(0, -1));
                  else setTenderedInput((v) => v.slice(0, -1));
                }}
              >
                ⌫
              </button>
            </div>
          </div>
          <section className="pos-payment-summary">
            <span className="eyebrow">Amount due</span>
            <strong className="pos-payment-due">
              {money(quote.amounts.total_minor, c.currency)}
            </strong>
            <dl className="pos-totals">
              <div>
                <dt>Cash applied</dt>
                <dd>
                  {money(
                    method === 'cash'
                      ? quote.amounts.total_minor
                      : method === 'split'
                        ? parseMoneySafe(cashInput, c.currency)
                        : 0,
                    c.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Electronic remainder</dt>
                <dd>
                  {money(
                    method === 'split'
                      ? Math.max(
                          0,
                          quote.amounts.total_minor - parseMoneySafe(cashInput, c.currency),
                        )
                      : method === 'electronic'
                        ? quote.amounts.total_minor
                        : 0,
                    c.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>
                  {money(
                    Math.max(
                      0,
                      quote.amounts.total_minor -
                        (method === 'cash'
                          ? parseMoneySafe(tenderedInput, c.currency)
                          : method === 'split'
                            ? parseMoneySafe(cashInput, c.currency)
                            : 0),
                    ),
                    c.currency,
                  )}
                </dd>
              </div>
            </dl>
            {preview && (
              <p role="status" className="pos-payment-preview">
                {preview}
              </p>
            )}
            <div className="pos-payment-acks">
              {['cash', 'split'].includes(method) && (
                <p>
                  I recorded the physical cash received. This is a merchant observation, not
                  provider confirmation.
                </p>
              )}
              {['electronic', 'split'].includes(method) && (
                <p>
                  A sandbox request is created for the unpaid remainder. A request does not confirm
                  payment.
                </p>
              )}
              {method === 'pending' && (
                <p>
                  An unpaid order and invoice are created. No cash or electronic evidence is
                  recorded.
                </p>
              )}
            </div>
            <button
              type="button"
              className="button pos-validate"
              disabled={!canWrite || (!!preview && !preview.startsWith('Change:'))}
              onClick={() => mutate(confirmPayment).catch((e) => setError(e.message))}
            >
              Validate
            </button>
            <button type="button" className="quiet-button" onClick={() => setPaymentOpen(false)}>
              Cancel
            </button>
          </section>
        </div>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
      </div>
    );
  const current = line();
  return (
    <section className="pos-cashier">
      <header className="pos-cashier-top">
        <div className="pos-cashier-identity">
          <span className="pos-app-mark">POS</span>
          <div>
            <strong>{c.name}</strong>
            <small>{session.data.cashier_label || 'Cashier'} · shift open</small>
          </div>
        </div>
        <div className="pos-cashier-search">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleBarcodeOrSearchEnter();
              }
            }}
            placeholder="Scan barcode, SKU, or search products… (Enter to quick-add)"
            aria-label="Search products or scan barcode"
          />
          <button type="button" onClick={handleBarcodeOrSearchEnter}>
            Search
          </button>
        </div>
        <div className="pos-cashier-actions">
          <span className="badge">{c.currency}</span>
          {onCashAdjustment && manager && (
            <button
              type="button"
              className="quiet-button"
              style={{ color: '#ffffff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
              onClick={onCashAdjustment}
            >
              Cash In/Out
            </button>
          )}
          {onXReport && (
            <button
              type="button"
              className="quiet-button"
              style={{ color: '#ffffff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
              onClick={onXReport}
            >
              X-Report
            </button>
          )}
          {onCloseShift && manager && (
            <button
              type="button"
              className="quiet-button"
              style={{ color: '#ffffff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
              onClick={onCloseShift}
            >
              Close register
            </button>
          )}
          {onExit && (
            <button
              type="button"
              className="quiet-button"
              style={{ color: '#ffffff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
              onClick={onExit}
            >
              Exit
            </button>
          )}
        </div>
      </header>
      {heldOrders.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '8px 14px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontSize: '12.5px',
          }}
        >
          <strong>Held Orders ({heldOrders.length}):</strong>
          {heldOrders.map((held) => (
            <button
              key={held.id}
              type="button"
              className="secondary-button"
              style={{ padding: '4px 12px', fontSize: '12px' }}
              onClick={() => resumeHeldOrder(held)}
            >
              {held.label} ({held.basket.length} items · {held.savedAt})
            </button>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="alert error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span>{error}</span>
          {(/configured warehouse|Inventory/i.test(error) || !c.warehouse_id) && manager && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void mutate(async () => {
                  try {
                    await api('/services/inventory/activate', 'POST', {});
                  } catch {
                    /* already active or managed */
                  }
                  const whList = await api('/inventory/warehouses');
                  let targetWh = (whList.data || []).find((w: any) => w.status === 'active');
                  if (!targetWh) {
                    targetWh = await api(
                      '/inventory/warehouses',
                      'POST',
                      {
                        code: 'MAIN-' + String(Date.now()).slice(-4),
                        name: 'Main Store Warehouse',
                        address: 'POS Counter Stock',
                        status: 'active',
                      },
                      { 'Idempotency-Key': crypto.randomUUID() },
                    );
                  }
                  await api('/pos/registers/' + r.id, 'PUT', {
                    expected_version: r.version,
                    name: c.name,
                    currency: c.currency,
                    tax_bps: c.tax_bps,
                    timezone: c.timezone,
                    default_customer_id: c.default_customer_id,
                    warehouse_id: targetWh.id,
                    location_id: null,
                    cashier_ids: c.cashier_ids,
                    manager_ids: c.manager_ids,
                    cashier_discount_bps: c.cashier_discount_bps,
                    manager_discount_bps: c.manager_discount_bps,
                    allow_cash: c.allow_cash,
                    electronic_method: c.electronic_method,
                    allow_pending_orders: c.allow_pending_orders,
                    active: r.status === 'active',
                    acknowledge_automated_invoicing: true,
                    acknowledge_recorded_cash: true,
                  });
                  r.data.warehouse_id = targetWh.id;
                  r.version += 1;
                  setError('');
                  setNotice(`Linked "${targetWh.name}" to ${c.name}. Click Review or Payment to continue your order.`);
                  onRegisterUpdated?.();
                }).catch((e) => setError((e as Error).message))
              }
            >
              Link Default Warehouse &amp; Continue
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="alert">
          {notice}
        </p>
      )}
      <div className="pos-cashier-layout">
        <section className="pos-cashier-basket">
          <div className="pos-basket-toolbar">
            <div>
              <span className="eyebrow">Current order</span>
              <strong>{basket.length} lines</strong>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="quiet-button"
                disabled={!basket.length || !canWrite}
                onClick={parkCurrentOrder}
              >
                Hold
              </button>
              <button
                type="button"
                className="quiet-button"
                disabled={!basket.length || !canWrite}
                onClick={() => void sendBasketToKitchen()}
              >
                Send KDS
              </button>
              <button
                type="button"
                className="quiet-button"
                disabled={!basket.length || !canWrite}
                onClick={clear}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="pos-basket-lines">
            {!basket.length && (
              <div className="pos-empty-cart">
                <span>🛒</span>
                <strong>Start adding products</strong>
                <small>Select a product from the catalog.</small>
              </div>
            )}
            {basket.map((item) => (
              <button
                type="button"
                className={
                  selected === item.product.id ? 'pos-basket-row selected' : 'pos-basket-row'
                }
                key={item.product.id}
                onClick={() => {
                  setSelected(item.product.id);
                  setKeyBuffer('');
                }}
              >
                <span className="pos-basket-name">
                  {item.product.name}
                  <small>
                    {money(item.product.sale_price_minor || 0, item.product.currency || c.currency)}{' '}
                    each
                  </small>
                </span>
                <span className="pos-basket-qty">× {item.quantity}</span>
                <strong>
                  {money(
                    Math.round(
                      (quantityMilli(item.quantity) / 1000) * (item.product.sale_price_minor || 0),
                    ),
                    item.product.currency || c.currency,
                  )}
                </strong>
                <span
                  className="pos-basket-remove"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(item.product.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      remove(item.product.id);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
          <div className="pos-basket-total">
            <span>Total</span>
            <strong>
              {quote
                ? money(quote.amounts.total_minor, c.currency)
                : money(
                    basket.reduce(
                      (sum, item) =>
                        sum +
                        Math.round(
                          (quantityMilli(item.quantity) / 1000) *
                            (item.product.sale_price_minor || 0),
                        ),
                      0,
                    ),
                    c.currency,
                  )}
            </strong>
          </div>
          {quote && (
            <dl className="pos-basket-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(quote.amounts.subtotal_minor, c.currency)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>−{money(quote.amounts.discount_minor, c.currency)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(quote.amounts.tax_minor, c.currency)}</dd>
              </div>
            </dl>
          )}
          <div className="pos-basket-controls">
            <div className="pos-keypad-modes">
              <button
                type="button"
                className={keyMode === 'qty' ? 'active' : ''}
                onClick={() => setKeyMode('qty')}
              >
                Qty
              </button>
              <button
                type="button"
                className={keyMode === 'discount' ? 'active' : ''}
                onClick={() => setKeyMode('discount')}
              >
                Disc
              </button>
            </div>
            <div className="pos-keypad-display">
              <span>{keyMode === 'qty' ? 'Quantity' : 'Discount (' + c.currency + ')'}</span>
              <strong>{keyBuffer || current?.quantity || '0'}</strong>
            </div>
            <div className="pos-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, '+/-', 0, '.', 'back'].map((key) => (
                <button
                  type="button"
                  key={key}
                  className={key === 'back' ? 'pos-key-back' : key === '+/-' ? 'pos-key-plus' : ''}
                  onClick={() => (key === 'back' ? press('back') : press(String(key)))}
                >
                  {key === 'back' ? '⌫' : key}
                </button>
              ))}
              <button type="button" className="pos-key-apply" onClick={applyKey}>
                Set
              </button>
            </div>
            <div className="pos-basket-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!basket.length || !canWrite}
                onClick={() => mutate(review).catch((e) => setError(e.message))}
              >
                Review
              </button>
              <button
                type="button"
                className="button pos-pay-button"
                disabled={!basket.length || !canWrite}
                onClick={() => mutate(review).catch((e) => setError(e.message))}
              >
                Payment
              </button>
            </div>
          </div>
          <div className="pos-cashier-customer">
            {manager ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Customer</span>
                  <button
                    type="button"
                    className="quiet-button"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                    onClick={() => setQuickCustomerOpen((v) => !v)}
                  >
                    {quickCustomerOpen ? 'Cancel' : '+ New Customer'}
                  </button>
                </div>
                {quickCustomerOpen && (
                  <div style={{ display: 'grid', gap: '6px', padding: '8px', background: '#f8fafc', borderRadius: '10px', marginBottom: '6px' }}>
                    <input
                      placeholder="Full name *"
                      value={quickCustomer.name}
                      onChange={(e) => setQuickCustomer((q) => ({ ...q, name: e.target.value }))}
                    />
                    <input
                      placeholder="Phone (optional)"
                      value={quickCustomer.phone}
                      onChange={(e) => setQuickCustomer((q) => ({ ...q, phone: e.target.value }))}
                    />
                    <input
                      placeholder="Email (optional)"
                      type="email"
                      value={quickCustomer.email}
                      onChange={(e) => setQuickCustomer((q) => ({ ...q, email: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="button"
                      disabled={!quickCustomer.name.trim()}
                      onClick={() => void createQuickCustomer()}
                    >
                      Save &amp; Attach Customer
                    </button>
                  </div>
                )}
                <label>
                  <input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search customers"
                  />
                </label>
                <select
                  value={customer}
                  onChange={(e) => {
                    change();
                    setCustomer(e.target.value);
                  }}
                >
                  <option value="">Walk-in customer</option>
                  {customer && !customers.some((v) => v.id === customer) && (
                    <option value={customer}>Saved sale contact</option>
                  )}
                  {customers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p>Walk-in customer · {c.name}</p>
            )}
            {floors.length > 0 && (
              <label>
                <span>Dine-in Table</span>
                <select value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
                  <option value="">Counter / Takeaway</option>
                  {floors.flatMap((fl: any) =>
                    (fl.tables || []).map((t: any) => {
                      const num = t.table_number || t.data?.table_number;
                      const seats = t.seats || t.data?.seats || 4;
                      return (
                        <option key={t.id} value={num}>
                          {fl.name || fl.data?.name} · Table {num} ({seats} seats)
                        </option>
                      );
                    }),
                  )}
                </select>
              </label>
            )}
            {loyaltyPrograms.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  placeholder={`Redeem pts (${loyaltyPrograms[0].data?.name})`}
                  value={loyaltyRedeemPts}
                  onChange={(e) => setLoyaltyRedeemPts(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                  disabled={!loyaltyRedeemPts || !basket.length}
                  onClick={() => void applyLoyaltyRedemption()}
                >
                  Redeem
                </button>
              </div>
            )}
            <label>
              <span>Discount ({c.currency})</span>
              <input
                value={discount}
                inputMode="decimal"
                onChange={(e) => {
                  change();
                  setDiscount(e.target.value);
                }}
              />
            </label>
            <label>
              <span>Note</span>
              <input
                value={notes}
                maxLength={1000}
                onChange={(e) => {
                  change();
                  setNotes(e.target.value);
                }}
              />
            </label>
          </div>
        </section>
        <section className="pos-cashier-catalog">
          <div className="pos-catalog-categories">
            <button
              type="button"
              className={!category ? 'active' : ''}
              onClick={() => {
                setCategory('');
                setOffset(0);
              }}
            >
              All
            </button>
            {(products?.categories || []).map((name: string) => (
              <button
                type="button"
                key={name}
                className={category === name ? 'active' : ''}
                onClick={() => {
                  setCategory(name);
                  setOffset(0);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          {!products && !error && <p role="status">Loading products…</p>}
          {products && (
            <>
              <div className="pos-product-grid">
                {products.data.map((product: any) => (
                  <button
                    type="button"
                    className="pos-product-tile"
                    key={product.id}
                    onClick={() => add(product)}
                    disabled={!canWrite}
                  >
                    <span
                      className="pos-product-visual"
                      style={{ background: posCategoryTone(product.category) }}
                    >
                      {posProductInitials(product.name)}
                    </span>
                    <span className="pos-product-name">{product.name}</span>
                    <small>{product.category || product.sku || 'Product'}</small>
                    <strong>{money(product.sale_price_minor, product.currency)}</strong>
                    {product.track_inventory && (
                      <span className="pos-product-stock">
                        {product.available_milli !== null && product.available_milli !== undefined
                          ? `${displayQuantity(product.available_milli)} in stock`
                          : 'Tracked'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!products.data.length && (
                <p className="pos-empty-catalog">No matching products in {c.currency}.</p>
              )}
              <nav className="pagination">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!offset}
                  onClick={() => setOffset((v) => Math.max(0, v - 25))}
                >
                  Previous
                </button>
                <span>Up to 25 products</span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!products.has_more}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
function parseMoneySafe(value: string, currency: string) {
  try {
    return parseMoney(value, currency);
  } catch {
    return 0;
  }
}
