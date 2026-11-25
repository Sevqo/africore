import { useEffect, useState, type FormEvent } from 'react';
import { DataTable } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { WorkspaceSkeleton } from '../components/Skeleton';
import { isDemo } from '../demo/transport';
import { peekQuery } from '../lib/query-cache';
import { Field, money, type API } from '../operations/UI';
import { commerceMerchantSections } from './merchant-sections';

const navigationEvent = 'africore:app-navigation';
type Props = {
  api: API;
  scope: string;
  manager: boolean;
  section?: string;
  navigate: (tab: string) => void;
};
type Listing = { id: string; version: number; status: string; data: any; canonical_product: any };
type Order = {
  id: string;
  invoice_id: string;
  reference: string;
  invoice_reference: string;
  created_at: string;
  currency: string;
  total_minor: number;
  paid_minor: number;
  credited_minor: number;
  outstanding_minor: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
};

function sum(rows: any[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}
function date(value: string) {
  return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) : '—';
}
function publicationState(store: any) {
  return store?.status === 'published' && !!store.data?.publication;
}
function checkoutState(store: any) {
  const policy = store?.data?.checkout_policy;
  if (!policy?.enabled)
    return {
      label: 'Not authorized',
      detail: 'Checkout must be enabled by an owner or administrator in the Commerce service.',
    };
  if (store.environment !== 'sandbox')
    return {
      label: 'Live checkout unavailable',
      detail: 'This environment does not execute live checkout.',
    };
  return {
    label: 'Sandbox policy enabled',
    detail:
      'Recorded test orders only. No live funds move; availability also depends on the authorizing administrator and required services.',
  };
}

/** App-level merchant workspace with inline listing builder & live Draft/Published Storefront Preview. */
export function CommerceMerchantWorkspace({
  api,
  scope,
  manager,
  section = 'dashboard',
  navigate,
}: Props) {
  const [orgId = '', env = 'sandbox'] = scope.split('\0');
  const base = '/commerce/stores';
  const warmStores = orgId
    ? peekQuery<any>('/api/v1/organizations/' + orgId + base, env, isDemo())
    : undefined;

  const [stores, setStores] = useState<any>(() => warmStores || null),
    [selected, setSelected] = useState(() => warmStores?.data?.[0]?.id || ''),
    [configuration, setConfiguration] = useState<any>(null),
    [listings, setListings] = useState<any>(null),
    [orders, setOrders] = useState<any>(null),
    [products, setProducts] = useState<any[]>([]);
  const [view, setView] = useState(section),
    [listingQuery, setListingQuery] = useState(''),
    [listingState, setListingState] = useState('all'),
    [listingLayout, setListingLayout] = useState<'list' | 'cards'>('list'),
    [listingOffset, setListingOffset] = useState(0),
    [orderQuery, setOrderQuery] = useState(''),
    [orderOffset, setOrderOffset] = useState(0);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(() => !warmStores),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false),
    [addingListing, setAddingListing] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop'),
    [previewCollection, setPreviewCollection] = useState('all'),
    [previewCart, setPreviewCart] = useState<Record<string, number>>({}),
    [publicationPreview, setPublicationPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({ name: '', slug: '', currency: 'KES', theme: 'market' }),
    [listingForm, setListingForm] = useState({
      mode: 'new' as 'new' | 'existing',
      productId: '',
      sku: '',
      name: '',
      price: '2500',
      description: '',
      state: 'active' as 'active' | 'draft',
    }),
    [settingsDraft, setSettingsDraft] = useState({
      name: '',
      description: '',
      brand_color: '#78a800',
      theme: 'market',
      contact_email: '',
    });

  const store = stores?.data?.find((item: any) => item.id === selected) || stores?.data?.[0],
    storePath = store ? base + '/' + store.id : '';
  const canWrite = !!stores?.permissions?.write && manager;

  useEffect(() => {
    setView(section);
  }, [section]);

  useEffect(() => {
    if (store?.data?.settings) {
      const s = store.data.settings;
      setSettingsDraft({
        name: s.name || '',
        description: s.description || '',
        brand_color: s.brand_color || '#78a800',
        theme: s.theme || 'market',
        contact_email: s.contact_email || '',
      });
    }
  }, [store?.id, store?.version]);

  useEffect(() => {
    let current = true;
    if (!stores) setLoading(true);
    setError('');
    api(base)
      .then((result) => {
        if (!current) return;
        setStores(result);
        setSelected((value: string) =>
          result.data.some((item: any) => item.id === value) ? value : result.data[0]?.id || '',
        );
      })
      .catch((e) => {
        if (current) setError((e as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [scope, revision]);

  useEffect(() => {
    if (!storePath) return;
    let current = true;
    const params = new URLSearchParams({ q: listingQuery, offset: String(listingOffset) });
    if (listingState !== 'all') params.set('state', listingState);
    Promise.allSettled([
      api(storePath + '/configuration'),
      api(storePath + '/listings?' + params),
      api('/products?limit=100'),
    ]).then(([configResult, listingResult, productResult]) => {
      if (!current) return;
      if (configResult.status === 'fulfilled') setConfiguration(configResult.value);
      if (listingResult.status === 'fulfilled') setListings(listingResult.value);
      else setListings(null);
      if (productResult.status === 'fulfilled') setProducts(productResult.value?.data || []);
      const failures = [configResult, listingResult]
        .filter((item) => item.status === 'rejected')
        .map((item) => (item as PromiseRejectedResult).reason)
        .map((reason) => (reason as Error)?.message || String(reason));
      setError(failures.join(' '));
    });
    return () => {
      current = false;
    };
  }, [storePath, listingQuery, listingState, listingOffset, revision]);

  useEffect(() => {
    if (!storePath || !manager) {
      setOrders(null);
      return;
    }
    let current = true;
    api(
      storePath + '/orders?' + new URLSearchParams({ q: orderQuery, offset: String(orderOffset) }),
    )
      .then((result) => {
        if (current) setOrders(result);
      })
      .catch((e) => {
        if (current) setError((e as Error).message);
      });
    return () => {
      current = false;
    };
  }, [storePath, manager, orderQuery, orderOffset, revision]);

  function go(next: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'commerce');
    url.searchParams.set('section', next);
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    setView(next);
    dispatchEvent(new Event(navigationEvent));
  }

  async function createStore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await api(
        base,
        'POST',
        { expected_version: 0, store: form },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setCreating(false);
      setForm({ name: '', slug: '', currency: 'KES', theme: 'market' });
      setRevision((value) => value + 1);
      if (created?.id) setSelected(created.id);
      setNotice('Store created. Add listings and preview your storefront before publishing.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProductAndListing(event: FormEvent) {
    event.preventDefault();
    if (!store) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const storeCurrency = store.data?.settings?.currency || 'KES';
      const factor = ['UGX', 'RWF'].includes(storeCurrency) ? 1 : 100;
      let targetProduct: any = null;
      if (listingForm.mode === 'existing') {
        targetProduct = products.find((p) => p.id === listingForm.productId);
        if (!targetProduct) throw new Error('Choose an existing canonical product first.');
      } else {
        targetProduct = await api(
          '/products',
          'POST',
          {
            sku: listingForm.sku.trim(),
            name: listingForm.name.trim(),
            description: listingForm.description.trim(),
            category: 'Storefront',
            unit: 'unit',
            barcode: '',
            parent_id: null,
            variant: '',
            purchase_cost_minor: 0,
            sale_price_minor: Math.max(0, Math.round(Number(listingForm.price || 0) * factor)),
            currency: storeCurrency,
            supplier_id: null,
            track_inventory: false,
            reorder_point_milli: 0,
            status: 'active',
          },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      }

      await api(
        `${storePath}/listings`,
        'POST',
        {
          expected_version: 0,
          product_id: targetProduct.id,
          expected_product_version: Number(targetProduct.version || 1),
          title: (listingForm.mode === 'new' ? listingForm.name : targetProduct.name).trim(),
          description: listingForm.description.trim() || targetProduct.description || '',
          state: listingForm.state,
          compare_at_minor: null,
          asset_ids: [],
          collection_ids: [],
          minimum_quantity_milli: 1000,
          maximum_quantity_milli: 1000000,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );

      setAddingListing(false);
      setListingForm({
        mode: 'new',
        productId: '',
        sku: '',
        name: '',
        price: '2500',
        description: '',
        state: 'active',
      });
      setRevision((v) => v + 1);
      setNotice('Storefront listing added. Click "Preview Storefront" to see how buyers view it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleListingStatus(item: Listing, nextState: 'active' | 'draft') {
    if (!store) return;
    setBusy(true);
    setError('');
    try {
      await api(
        `${storePath}/listings/${item.id}`,
        'PUT',
        {
          expected_version: item.version,
          product_id: item.canonical_product.id,
          expected_product_version: Number(item.canonical_product.version || 1),
          title: item.data.title || item.canonical_product.name,
          description: item.data.description || '',
          state: nextState,
          compare_at_minor: item.data.compare_at_minor ?? null,
          asset_ids: item.data.asset_ids || [],
          collection_ids: item.data.collection_ids || [],
          minimum_quantity_milli: item.data.minimum_quantity_milli || 1000,
          maximum_quantity_milli: item.data.maximum_quantity_milli || 1000000,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setRevision((v) => v + 1);
      setNotice(`Listing marked ${nextState}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function prepareStorePublication() {
    if (!storePath) return;
    setBusy(true);
    setError('');
    try {
      const preview = await api(`${storePath}/publication-preview`);
      setPublicationPreview(preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPublishStore() {
    if (!storePath || !publicationPreview) return;
    setBusy(true);
    setError('');
    try {
      await api(
        `${storePath}/publish`,
        'POST',
        {
          expected_version: publicationPreview.expected_version,
          review_hash: publicationPreview.review_hash,
          acknowledge_publication: true,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setPublicationPreview(null);
      setRevision((v) => v + 1);
      setNotice('Storefront snapshot published! Visitors can now view the published catalog.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveInlineSettings(event: FormEvent) {
    event.preventDefault();
    if (!store) return;
    setBusy(true);
    setError('');
    try {
      const current = store.data.settings;
      const payload = {
        ...current,
        name: settingsDraft.name.trim() || current.name,
        description: settingsDraft.description,
        brand_color: /^#[a-fA-F0-9]{6}$/.test(settingsDraft.brand_color)
          ? settingsDraft.brand_color
          : '#78a800',
        theme: settingsDraft.theme,
        ...(settingsDraft.contact_email.trim()
          ? { contact_email: settingsDraft.contact_email.trim() }
          : {}),
      };
      if (!settingsDraft.contact_email.trim()) delete payload.contact_email;
      await api(
        storePath,
        'PUT',
        { expected_version: store.version, store: payload },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setRevision((v) => v + 1);
      setNotice('Store presentation settings saved. Open Preview Storefront to inspect your changes.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const published = publicationState(store),
    checkout = checkoutState(store),
    settings = store?.data?.settings,
    rows: Listing[] = listings?.data || [],
    orderRows: Order[] = orders?.data || [],
    draftListings = rows.filter((item) => item.status === 'draft').length,
    tracked = rows.filter((item) => item.canonical_product?.track_inventory).length,
    confirmed = sum(orderRows, 'paid_minor'),
    outstanding = sum(orderRows, 'outstanding_minor'),
    currency = settings?.currency || 'KES';
  const paymentBreakdown = orderRows.reduce((groups: Record<string, number>, order) => {
    groups[order.payment_status] = (groups[order.payment_status] || 0) + 1;
    return groups;
  }, {});
  const pending = [
    !published ? 'Storefront is not published' : '',
    !checkout.label.startsWith('Sandbox') ? 'Checkout is not authorized for sandbox ordering' : '',
    draftListings ? draftListings + ' draft listing' + (draftListings === 1 ? '' : 's') : '',
    !rows.length ? 'No canonical products are listed yet' : '',
    configuration?.collections?.some((item: any) => item.status !== 'active')
      ? 'Inactive collections are excluded from the storefront'
      : '',
  ].filter(Boolean);

  if (loading && !stores) return <WorkspaceSkeleton />;
  if (error && !stores)
    return (
      <p className="alert error" role="alert">
        {error}
      </p>
    );
  if (!store)
    return (
      <div className="commerce-merchant">
        <section className="panel">
          <div className="section-heading">
            <h2>Set up your first store</h2>
            <span className="badge">Merchant app</span>
          </div>
          <p>
            Create your workspace storefront in seconds, add products, and preview the live buyer
            experience before publishing. Checkout stays sandbox-only.
          </p>
          {!creating ? (
            <button className="button" onClick={() => setCreating(true)} disabled={!canWrite}>
              Create a store
            </button>
          ) : (
            <form className="compact-form" onSubmit={createStore}>
              <Field label="Store name">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Savannah Market"
                  value={form.name}
                  onChange={(e) =>
                    setForm((value) => ({
                      ...value,
                      name: e.target.value,
                      slug:
                        value.slug ||
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                          .slice(0, 63),
                    }))
                  }
                />
              </Field>
              <Field label="Storefront address">
                <input
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  minLength={3}
                  maxLength={63}
                  placeholder="savannah-market"
                  value={form.slug}
                  onChange={(e) => setForm((value) => ({ ...value, slug: e.target.value }))}
                />
              </Field>
              <Field label="Currency">
                <select
                  value={form.currency}
                  onChange={(e) => setForm((value) => ({ ...value, currency: e.target.value }))}
                >
                  {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Theme">
                <select
                  value={form.theme}
                  onChange={(e) => setForm((value) => ({ ...value, theme: e.target.value }))}
                >
                  {['market', 'editorial', 'compact'].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <div className="form-actions">
                <button className="button" disabled={busy}>
                  {busy ? 'Creating…' : 'Create store'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  if (!canWrite && view !== 'dashboard')
    return (
      <div className="commerce-merchant">
        <section className="panel">
          <div className="section-heading">
            <h2>Merchant authority required</h2>
            <span className="badge">Read only</span>
          </div>
          <p>
            Your current role can inspect merchant records but cannot change store configuration.
            The Commerce service enforces the same authority.
          </p>
          <button className="secondary-button" onClick={() => go('dashboard')}>
            Back to overview
          </button>
        </section>
      </div>
    );

  const previewableListings = rows.filter((r) => r.status !== 'archived');
  const brandColor = settingsDraft.brand_color || settings?.brand_color || '#0b6e4f';
  const previewCartTotal = Object.entries(previewCart).reduce((acc, [id, qty]) => {
    const found = previewableListings.find((l) => l.id === id);
    return acc + (found ? Number(found.canonical_product?.sale_price_minor || 0) * qty : 0);
  }, 0);

  return (
    <div className="commerce-merchant">
      <div className="commerce-merchant-context">
        <div>
          <span className="eyebrow">Merchant app · {store.environment}</span>
          <h2>{settings?.name}</h2>
          <p>
            {published ? 'Published storefront' : 'Draft storefront'} · /{settings?.slug} ·{' '}
            {currency}
          </p>
        </div>
        <Field label="Active store">
          <select
            value={store.id}
            onChange={(e) => {
              setSelected(e.target.value);
              setListingOffset(0);
              setOrderOffset(0);
            }}
          >
            {stores.data.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.data.settings.name} · {item.environment}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => setPreviewOpen(true)}
          >
            <Icon name="eye" /> Preview Storefront
          </button>
          <button className="secondary-button" onClick={() => setRevision((value) => value + 1)}>
            Refresh
          </button>
          {canWrite && (
            <button className="secondary-button" onClick={() => setCreating((value) => !value)}>
              New store
            </button>
          )}
        </div>
      </div>

      {creating && (
        <form className="panel compact-form" onSubmit={createStore}>
          <Field label="Store name">
            <input
              required
              minLength={2}
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))}
            />
          </Field>
          <Field label="Storefront address">
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              minLength={3}
              maxLength={63}
              value={form.slug}
              onChange={(e) => setForm((value) => ({ ...value, slug: e.target.value }))}
            />
          </Field>
          <Field label="Currency">
            <select
              value={form.currency}
              onChange={(e) => setForm((value) => ({ ...value, currency: e.target.value }))}
            >
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <div className="form-actions">
            <button className="button" disabled={busy}>
              {busy ? 'Creating…' : 'Create store'}
            </button>
            <button type="button" className="secondary-button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <nav className="commerce-merchant-tabs" aria-label="Merchant sections">
        {commerceMerchantSections.map((item) => (
          <button
            key={item.section}
            type="button"
            aria-current={view === item.section ? 'page' : undefined}
            onClick={() => go(item.section)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}

      {view === 'dashboard' && (
        <div className="commerce-merchant-overview">
          <div className="app-metric-grid commerce-merchant-metrics">
            <article className="panel">
              <span>Storefront</span>
              <strong>{published ? 'Published' : 'Draft'}</strong>
              <small>
                {store.data.publication?.version
                  ? 'Snapshot version ' + store.data.publication.version
                  : 'Previewable in Draft'}
              </small>
            </article>
            <article className="panel">
              <span>Listings</span>
              <strong>{listings?.total ?? '—'}</strong>
              <small>{draftListings} draft on this page</small>
            </article>
            <article className="panel">
              <span>Loaded orders</span>
              <strong>{orders ? orderRows.length : '—'}</strong>
              <small>{orders?.has_more ? 'More orders available' : 'Latest authorized page'}</small>
            </article>
            <article className="panel">
              <span>Outstanding</span>
              <strong>{orders ? money(outstanding, currency) : '—'}</strong>
              <small>Recorded invoices, not external settlement</small>
            </article>
          </div>
          <div className="commerce-merchant-grid">
            <section className="panel">
              <div className="section-heading">
                <h3>Launch checklist</h3>
                <span className="badge">{pending.length}</span>
              </div>
              {pending.length ? (
                <ul className="commerce-merchant-queue">
                  {pending.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No merchant action is outstanding for the current snapshot.</p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    go('catalog');
                    setAddingListing(true);
                  }}
                >
                  + Add Product Listing
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview Storefront
                </button>
                <button className="secondary-button" onClick={() => go('storefront')}>
                  Publish Storefront
                </button>
              </div>
            </section>
            <section className="panel">
              <h3>Connected operations</h3>
              <p>
                Orders create canonical Sales orders and invoices. Payments record evidence only;
                fulfillment and stock remain separate authorized operations.
              </p>
              <div className="commerce-merchant-links">
                <button className="quiet-button" type="button" onClick={() => navigate('Orders')}>
                  Shared orders
                  <Icon name="right" />
                </button>
                <button className="quiet-button" type="button" onClick={() => navigate('Invoices')}>
                  Shared invoices
                  <Icon name="right" />
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => navigate('Inventory')}
                >
                  Inventory and stock
                  <Icon name="right" />
                </button>
                <button className="quiet-button" type="button" onClick={() => navigate('Commerce')}>
                  Advanced Commerce service editor
                  <Icon name="right" />
                </button>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h3>Recent storefront orders</h3>
              <button className="quiet-button" type="button" onClick={() => go('orders')}>
                All orders
                <Icon name="right" />
              </button>
            </div>
            {orders ? (
              <DataTable>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Created</th>
                    <th>Total</th>
                    <th>Confirmed</th>
                    <th>Outstanding</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.slice(0, 5).map((order) => (
                    <tr key={order.id}>
                      <td>
                        {order.reference}
                        <small>{order.invoice_reference}</small>
                      </td>
                      <td>{date(order.created_at)}</td>
                      <td>{money(order.total_minor, order.currency)}</td>
                      <td>{money(order.paid_minor, order.currency)}</td>
                      <td>{money(order.outstanding_minor, order.currency)}</td>
                      <td>
                        <span className="badge">{order.payment_status}</span>
                      </td>
                      <td>
                        <span className="badge">{order.fulfillment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <p>Order visibility requires current merchant access.</p>
            )}
            {orders && !orderRows.length && (
              <p>No storefront orders have been recorded for this store.</p>
            )}
          </section>
        </div>
      )}

      {view === 'catalog' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Catalogue</h2>
              <p>
                Add canonical products and storefront listings right here, then preview how buyers
                see your catalog before publishing.
              </p>
            </div>
            <div className="form-actions">
              {canWrite && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setAddingListing((v) => !v)}
                >
                  {addingListing ? 'Close form' : '+ Add product listing'}
                </button>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPreviewOpen(true)}
              >
                Preview Storefront
              </button>
              <button className="secondary-button" onClick={() => navigate('Products')}>
                Canonical products
              </button>
            </div>
          </div>

          {addingListing && canWrite && (
            <form className="panel compact-form" onSubmit={createProductAndListing}>
              <h3>Add Storefront Listing</h3>
              <div className="form-grid">
                <Field label="Product source">
                  <select
                    value={listingForm.mode}
                    onChange={(e) =>
                      setListingForm((f) => ({ ...f, mode: e.target.value as 'new' | 'existing' }))
                    }
                  >
                    <option value="new">Create new product &amp; list immediately</option>
                    {products.length > 0 && (
                      <option value="existing">Pick existing canonical product</option>
                    )}
                  </select>
                </Field>
                <Field label="Initial listing visibility">
                  <select
                    value={listingForm.state}
                    onChange={(e) =>
                      setListingForm((f) => ({
                        ...f,
                        state: e.target.value as 'active' | 'draft',
                      }))
                    }
                  >
                    <option value="active">Active (ready to publish)</option>
                    <option value="draft">Draft (preview only)</option>
                  </select>
                </Field>

                {listingForm.mode === 'existing' ? (
                  <Field label="Existing product">
                    <select
                      required
                      value={listingForm.productId}
                      onChange={(e) => setListingForm((f) => ({ ...f, productId: e.target.value }))}
                    >
                      <option value="">Choose a product…</option>
                      {products
                        .filter((p) => p.status === 'active' && p.currency === currency)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) — {money(p.sale_price_minor, p.currency)}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <>
                    <Field label="Product name">
                      <input
                        required
                        placeholder="Single-Origin Arabica 500g"
                        value={listingForm.name}
                        onChange={(e) => setListingForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </Field>
                    <Field label="SKU">
                      <input
                        required
                        placeholder="COF-500G"
                        value={listingForm.sku}
                        onChange={(e) => setListingForm((f) => ({ ...f, sku: e.target.value }))}
                      />
                    </Field>
                    <Field label={`Sale price (${currency})`}>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={listingForm.price}
                        onChange={(e) => setListingForm((f) => ({ ...f, price: e.target.value }))}
                      />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Storefront description">
                <textarea
                  rows={2}
                  placeholder="Washed medium roast from Nyeri highlands."
                  value={listingForm.description}
                  onChange={(e) => setListingForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Field>
              <div className="form-actions">
                <button className="button" disabled={busy}>
                  {busy ? 'Saving…' : 'Save listing to store'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAddingListing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="commerce-merchant-toolbar">
            <Field label="Search listings">
              <input
                type="search"
                value={listingQuery}
                onChange={(e) => {
                  setListingQuery(e.target.value);
                  setListingOffset(0);
                }}
              />
            </Field>
            <Field label="State">
              <select
                value={listingState}
                onChange={(e) => {
                  setListingState(e.target.value);
                  setListingOffset(0);
                }}
              >
                <option value="all">All states</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <div
              className="commerce-merchant-layout-switch"
              role="group"
              aria-label="Product layout"
            >
              <button
                type="button"
                className={listingLayout === 'cards' ? 'is-active' : ''}
                aria-pressed={listingLayout === 'cards'}
                onClick={() => setListingLayout('cards')}
              >
                Cards
              </button>
              <button
                type="button"
                className={listingLayout === 'list' ? 'is-active' : ''}
                aria-pressed={listingLayout === 'list'}
                onClick={() => setListingLayout('list')}
              >
                List
              </button>
            </div>
          </div>
          <p className="muted">{listings?.coverage}</p>
          {listingLayout === 'cards' ? (
            <div className="commerce-merchant-product-cards">
              {rows.map((item) => (
                <article className="panel" key={item.id}>
                  <div className="section-heading">
                    <h3>{item.data.title || item.canonical_product.name}</h3>
                    <span className="badge">{item.status}</span>
                  </div>
                  <p>
                    {item.data.description ||
                      item.canonical_product.description ||
                      'No listing description'}
                  </p>
                  <dl className="commerce-merchant-facts">
                    <div>
                      <dt>SKU</dt>
                      <dd>{item.canonical_product.sku || '—'}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>
                        {money(
                          item.canonical_product.sale_price_minor,
                          item.canonical_product.currency,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Product state</dt>
                      <dd>{item.canonical_product.status}</dd>
                    </div>
                    <div>
                      <dt>Stock tracking</dt>
                      <dd>
                        {item.canonical_product.track_inventory
                          ? 'Tracked in Inventory'
                          : 'Not tracked'}
                      </dd>
                    </div>
                  </dl>
                  {canWrite && (
                    <div className="form-actions">
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={busy}
                        onClick={() =>
                          void toggleListingStatus(
                            item,
                            item.status === 'active' ? 'draft' : 'active',
                          )
                        }
                      >
                        {item.status === 'active' ? 'Move to draft' : 'Activate listing'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>State</th>
                  <th>Product</th>
                  <th>Inventory</th>
                  {canWrite && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.data.title || item.canonical_product.name}
                      <small>
                        {item.data.description ||
                          item.canonical_product.description ||
                          'No listing description'}
                      </small>
                    </td>
                    <td>{item.canonical_product.sku}</td>
                    <td>
                      {money(
                        item.canonical_product.sale_price_minor,
                        item.canonical_product.currency,
                      )}
                    </td>
                    <td>
                      <span className="badge">{item.status}</span>
                    </td>
                    <td>
                      <span className="badge">{item.canonical_product.status}</span>
                    </td>
                    <td>{item.canonical_product.track_inventory ? 'Tracked' : 'Not tracked'}</td>
                    {canWrite && (
                      <td>
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={busy}
                          onClick={() =>
                            void toggleListingStatus(
                              item,
                              item.status === 'active' ? 'draft' : 'active',
                            )
                          }
                        >
                          {item.status === 'active' ? 'Set draft' : 'Set active'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {!rows.length && (
            <p>
              No listings yet. Click <strong>+ Add product listing</strong> above to add your first
              item directly in this workspace.
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary-button"
              disabled={listingOffset === 0}
              onClick={() => setListingOffset((value) => Math.max(0, value - 50))}
            >
              Previous
            </button>
            <button
              className="secondary-button"
              disabled={!listings?.has_more}
              onClick={() => setListingOffset((value) => value + 50)}
            >
              Next
            </button>
            <button className="secondary-button" onClick={() => navigate('Commerce')}>
              Open catalogue editor
            </button>
          </div>
        </div>
      )}

      {view === 'orders' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Storefront orders</h2>
              <p>
                Orders and linked invoices are canonical shared records. Payment and fulfillment
                statuses are separate facts.
              </p>
            </div>
            <button className="secondary-button" onClick={() => navigate('Orders')}>
              Shared sales orders
            </button>
          </div>
          <Field label="Search orders">
            <input
              type="search"
              value={orderQuery}
              onChange={(e) => {
                setOrderQuery(e.target.value);
                setOrderOffset(0);
              }}
            />
          </Field>
          {orders ? (
            <>
              <p className="muted">{orders.coverage}</p>
              <DataTable>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Invoice</th>
                    <th>Created</th>
                    <th>Total</th>
                    <th>Confirmed</th>
                    <th>Outstanding</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((order) => (
                    <tr key={order.id}>
                      <td>{order.reference}</td>
                      <td>{order.invoice_reference}</td>
                      <td>{date(order.created_at)}</td>
                      <td>{money(order.total_minor, order.currency)}</td>
                      <td>{money(order.paid_minor, order.currency)}</td>
                      <td>{money(order.outstanding_minor, order.currency)}</td>
                      <td>
                        <span className="badge">{order.payment_status}</span>
                      </td>
                      <td>
                        <span className="badge">{order.fulfillment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={orderOffset === 0}
                  onClick={() => setOrderOffset((value) => Math.max(0, value - 50))}
                >
                  Previous
                </button>
                <button
                  className="secondary-button"
                  disabled={!orders.has_more}
                  onClick={() => setOrderOffset((value) => value + 50)}
                >
                  Next
                </button>
              </div>
              {!orderRows.length && <p>No order matches this search.</p>}
            </>
          ) : (
            <p>Order visibility requires current merchant access.</p>
          )}
        </div>
      )}

      {view === 'storefront' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Storefront &amp; Live Buyer Preview</h2>
              <p>
                Inspect your live storefront design, theme, and shopping cart in Draft mode before
                publishing a public snapshot.
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPreviewOpen(true)}
              >
                <Icon name="eye" /> Fullscreen Draft Preview
              </button>
              {published && (
                <a
                  className="secondary-button"
                  href={'/s/' + store.environment + '/' + settings?.slug}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Public URL <Icon name="external" />
                </a>
              )}
              {canWrite && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void prepareStorePublication()}
                >
                  {published ? 'Publish Updated Snapshot' : 'Prepare & Publish Store'}
                </button>
              )}
            </div>
          </div>

          {publicationPreview && (
            <section
              className="panel"
              style={{ border: '2px solid #0b6e4f', background: '#ecfdf5' }}
            >
              <div className="section-heading">
                <h3>Ready to Publish Storefront Snapshot</h3>
                <span className="badge">
                  {publicationPreview.manifest?.listings?.length || 0} active listing(s)
                </span>
              </div>
              <p>{publicationPreview.disclosure}</p>
              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void confirmPublishStore()}
                >
                  {busy ? 'Publishing…' : 'Confirm & Publish Now'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPublicationPreview(null)}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* Inline Interactive Draft Storefront Preview */}
          <section
            className="panel"
            aria-label="Interactive draft storefront preview"
            style={{ padding: 0, overflow: 'hidden', border: '1px solid #cbd5e1' }}
          >
            <div
              style={{
                padding: '10px 16px',
                background: '#0f172a',
                color: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '12.5px',
              }}
            >
              <span>
                <strong>Buyer Storefront Preview</strong> ·{' '}
                {published ? 'Published + Draft Preview' : 'Draft Preview (Unpublished)'} · Theme:{' '}
                <code>{settings?.theme || 'market'}</code>
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => setPreviewDevice('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => setPreviewDevice('mobile')}
                >
                  Mobile
                </button>
              </div>
            </div>

            <div
              style={{
                maxWidth: previewDevice === 'mobile' ? '410px' : '100%',
                margin: '0 auto',
                background: settings?.theme === 'editorial' ? '#fafaf9' : '#ffffff',
                borderInline: previewDevice === 'mobile' ? '1px solid #e2e8f0' : 'none',
              }}
            >
              <header
                style={{
                  padding: '22px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  background: `linear-gradient(135deg, ${brandColor}18, #ffffff)`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '20px', color: '#0f172a' }}>{settings?.name}</strong>
                  <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '13.5px' }}>
                    {settings?.description ||
                      'Welcome to our online store. Browse products and add items to your cart.'}
                  </p>
                </div>
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: '999px',
                    background: brandColor,
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  Preview Cart ({Object.values(previewCart).reduce((a, b) => a + b, 0)}) ·{' '}
                  {money(previewCartTotal, currency)}
                </div>
              </header>

              {(configuration?.collections || []).length > 0 && (
                <div
                  style={{
                    padding: '12px 24px',
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setPreviewCollection('all')}
                  >
                    All Products
                  </button>
                  {(configuration?.collections || [])
                    .filter((c: any) => c.status === 'active')
                    .map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        className="secondary-button"
                        onClick={() => setPreviewCollection(c.id)}
                      >
                        {c.data?.name || c.name}
                      </button>
                    ))}
                </div>
              )}

              <div
                style={{
                  padding: '22px 24px',
                  display: 'grid',
                  gridTemplateColumns:
                    previewDevice === 'mobile'
                      ? '1fr'
                      : settings?.theme === 'compact'
                        ? 'repeat(auto-fill, minmax(190px, 1fr))'
                        : 'repeat(auto-fill, minmax(235px, 1fr))',
                  gap: '16px',
                }}
              >
                {previewableListings
                  .filter(
                    (item) =>
                      previewCollection === 'all' ||
                      (item.data.collection_ids || []).includes(previewCollection),
                  )
                  .map((item) => (
                    <article
                      key={item.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '16px',
                        background: '#ffffff',
                        display: 'grid',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          height: '110px',
                          borderRadius: '8px',
                          background: `${brandColor}15`,
                          color: brandColor,
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 700,
                          fontSize: '28px',
                        }}
                      >
                        {(item.data.title || item.canonical_product.name || 'P')
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                        <strong>{item.data.title || item.canonical_product.name}</strong>
                        {item.status === 'draft' && <span className="badge">Draft</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        {item.data.description ||
                          item.canonical_product.description ||
                          'Ready for online ordering'}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 'auto',
                        }}
                      >
                        <strong style={{ fontSize: '15px' }}>
                          {money(
                            item.canonical_product.sale_price_minor,
                            item.canonical_product.currency,
                          )}
                        </strong>
                        <button
                          type="button"
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: brandColor,
                            color: '#ffffff',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '12.5px',
                          }}
                          onClick={() =>
                            setPreviewCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))
                          }
                        >
                          + Add to cart
                        </button>
                      </div>
                    </article>
                  ))}
                {!previewableListings.length && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '24px' }}>
                    <p className="muted">
                      Your storefront has no listings yet. Add a product in Catalogue to preview how
                      buyers shop your store!
                    </p>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        go('catalog');
                        setAddingListing(true);
                      }}
                    >
                      + Add First Product Listing
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="commerce-merchant-grid">
            <section className="panel">
              <h3>Publication</h3>
              <dl className="commerce-merchant-facts">
                <div>
                  <dt>State</dt>
                  <dd>
                    <span className="badge">{published ? 'Published' : 'Draft'}</span>
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>/{settings?.slug}</dd>
                </div>
                <div>
                  <dt>Snapshot</dt>
                  <dd>{store.data.publication?.version || 'None'}</dd>
                </div>
                <div>
                  <dt>Theme</dt>
                  <dd>{settings?.theme}</dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>
                    {settings?.tax_label} · {(settings?.tax_bps || 0) / 100}%
                  </dd>
                </div>
                <div>
                  <dt>Checkout</dt>
                  <dd>{checkout.label}</dd>
                </div>
              </dl>
              <p className="muted">{checkout.detail}</p>
            </section>
            <section className="panel">
              <h3>Presentation and delivery</h3>
              <p>{settings?.description || 'No merchant description has been saved.'}</p>
              <dl className="commerce-merchant-facts">
                <div>
                  <dt>Shipping options</dt>
                  <dd>{configuration?.shipping?.length ?? '—'}</dd>
                </div>
                <div>
                  <dt>Collections</dt>
                  <dd>{configuration?.collections?.length ?? '—'}</dd>
                </div>
                <div>
                  <dt>Navigation links</dt>
                  <dd>{settings?.navigation?.length || 0}</dd>
                </div>
                <div>
                  <dt>SEO title</dt>
                  <dd>{settings?.seo?.title || 'Not set'}</dd>
                </div>
              </dl>
              <div className="form-actions">
                <button className="secondary-button" onClick={() => go('settings')}>
                  Customize theme &amp; brand
                </button>
                <button className="secondary-button" onClick={() => navigate('Commerce')}>
                  Advanced storefront settings
                </button>
              </div>
            </section>
          </div>
          <p className="commerce-capability-note">
            Custom domains and live checkout are not available. No provider readiness is implied by
            a published sandbox storefront.
          </p>
        </div>
      )}

      {view === 'inventory' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Inventory integration</h2>
              <p>
                Listing visibility is separate from stock. Quantities, reservations and movements
                are authoritative in Inventory.
              </p>
            </div>
            <button className="secondary-button" onClick={() => navigate('Inventory')}>
              Open Inventory
            </button>
          </div>
          <div className="app-metric-grid">
            <article className="panel">
              <span>Tracked listings</span>
              <strong>{tracked}</strong>
              <small>On the loaded listing page</small>
            </article>
            <article className="panel">
              <span>Untracked listings</span>
              <strong>{rows.length - tracked}</strong>
              <small>No stock reservation</small>
            </article>
            <article className="panel">
              <span>Warehouse</span>
              <strong>{settings?.warehouse_id ? 'Linked' : 'Not linked'}</strong>
              <small>
                {settings?.location_id ? 'Fulfillment location set' : 'No fulfillment location'}
              </small>
            </article>
            <article className="panel">
              <span>Inventory service</span>
              <strong>Separate</strong>
              <small>Requires its own activation and authority</small>
            </article>
          </div>
          <section className="panel">
            <h3>Listings with tracked goods</h3>
            <DataTable>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>SKU</th>
                  <th>Product status</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((item) => item.canonical_product.track_inventory)
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{item.data.title || item.canonical_product.name}</td>
                      <td>{item.canonical_product.sku}</td>
                      <td>
                        <span className="badge">{item.canonical_product.status}</span>
                      </td>
                      <td>{item.canonical_product.unit}</td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
            {!tracked && (
              <p>
                No listing on this page tracks stock. Inventory quantities are not inferred from
                catalogue records.
              </p>
            )}
          </section>
        </div>
      )}

      {view === 'payments' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Payments and evidence</h2>
              <p>
                Confirmed amounts are recorded payment evidence. They do not prove external
                settlement or move funds.
              </p>
            </div>
            <button className="secondary-button" onClick={() => navigate('Reconciliation')}>
              Reconciliation
            </button>
          </div>
          <div className="app-metric-grid">
            <article className="panel">
              <span>Loaded order value</span>
              <strong>{money(sum(orderRows, 'total_minor'), currency)}</strong>
              <small>Authorized order page</small>
            </article>
            <article className="panel">
              <span>Confirmed evidence</span>
              <strong>{money(confirmed, currency)}</strong>
              <small>Recorded against linked invoices</small>
            </article>
            <article className="panel">
              <span>Outstanding</span>
              <strong>{money(outstanding, currency)}</strong>
              <small>Not external debt collection</small>
            </article>
            <article className="panel">
              <span>Credited</span>
              <strong>{money(sum(orderRows, 'credited_minor'), currency)}</strong>
              <small>Retained credit records</small>
            </article>
          </div>
          <section className="panel">
            <h3>Payment status distribution</h3>
            {Object.keys(paymentBreakdown).length ? (
              <ul className="commerce-merchant-queue">
                {Object.entries(paymentBreakdown).map(([status, count]) => (
                  <li key={status}>
                    <span className="badge">{status}</span> {count} order{count === 1 ? '' : 's'} on
                    the loaded page
                  </li>
                ))}
              </ul>
            ) : (
              <p>No order payment status is available.</p>
            )}
            <p className="muted">
              M-Pesa and card collection remain unavailable. Sandbox checkout is not represented as
              real collection.
            </p>
          </section>
        </div>
      )}

      {view === 'promotions' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Promotion rules</h2>
              <p>
                These are the current store discount policies used by the server quote. Eligibility
                is recalculated at checkout.
              </p>
            </div>
            <button className="button" type="button" onClick={() => navigate('Commerce')}>
              Manage discount rules
            </button>
          </div>
          <p className="muted">
            {configuration?.discounts?.length ?? '—'} configured rule(s) · inactive, expired and
            minimum-order rules are still listed as configured policy.
          </p>
          <DataTable>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Minimum subtotal</th>
                <th>Maximum discount</th>
                <th>Valid from</th>
                <th>Valid until</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {(configuration?.discounts || []).map((rule: any) => (
                <tr key={rule.code}>
                  <td>{rule.code}</td>
                  <td>
                    {rule.kind === 'percentage'
                      ? `${(rule.value / 100).toFixed(2)}%`
                      : money(rule.value, currency)}
                  </td>
                  <td>{money(rule.minimum_subtotal_minor, currency)}</td>
                  <td>
                    {rule.maximum_discount_minor == null
                      ? 'No configured cap'
                      : money(rule.maximum_discount_minor, currency)}
                  </td>
                  <td>{date(rule.starts_at)}</td>
                  <td>{date(rule.ends_at)}</td>
                  <td>
                    <span className="badge">{rule.active ? 'Enabled policy' : 'Disabled'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {configuration && !configuration.discounts?.length && (
            <p>No discount rules are configured for this store.</p>
          )}
          <p className="commerce-capability-note">
            Codes are validated by the canonical server quote, including date window, minimum
            subtotal, percentage limits and discount cap. This register does not claim campaign
            attribution or customer usage analytics.
          </p>
        </div>
      )}

      {view === 'reports' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Reports</h2>
              <p>
                Supported order measures from the current authorized page only. The backend does not
                supply visitor conversion, traffic or promotion attribution.
              </p>
            </div>
          </div>
          <div className="app-metric-grid">
            <article className="panel">
              <span>Orders on page</span>
              <strong>{orderRows.length}</strong>
              <small>
                {orders?.has_more ? 'More orders exist than shown' : 'All authorized orders shown'}
              </small>
            </article>
            <article className="panel">
              <span>Order value</span>
              <strong>{money(sum(orderRows, 'total_minor'), currency)}</strong>
              <small>Sum of loaded orders</small>
            </article>
            <article className="panel">
              <span>Average order</span>
              <strong>
                {orderRows.length
                  ? money(Math.round(sum(orderRows, 'total_minor') / orderRows.length), currency)
                  : '—'}
              </strong>
              <small>Loaded page only</small>
            </article>
            <article className="panel">
              <span>Unpaid value</span>
              <strong>{money(outstanding, currency)}</strong>
              <small>Recorded outstanding</small>
            </article>
          </div>
          <section className="panel">
            <h3>Fulfillment distribution</h3>
            {orderRows.length ? (
              <DataTable>
                <thead>
                  <tr>
                    <th>Fulfillment</th>
                    <th>Orders</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    orderRows.reduce((groups: Record<string, Order[]>, order) => {
                      groups[order.fulfillment_status] = [
                        ...(groups[order.fulfillment_status] || []),
                        order,
                      ];
                      return groups;
                    }, {}),
                  ).map(([status, group]) => (
                    <tr key={status}>
                      <td>
                        <span className="badge">{status}</span>
                      </td>
                      <td>{group.length}</td>
                      <td>{money(sum(group, 'total_minor'), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <p>No orders are available for reporting.</p>
            )}
            <p className="commerce-capability-note">
              Unsupported metrics are omitted rather than estimated. Order and receipt values remain
              separate.
            </p>
          </section>
        </div>
      )}

      {view === 'settings' && (
        <div className="commerce-merchant-section">
          <div className="section-heading">
            <div>
              <h2>Merchant settings</h2>
              <p>
                Update your store name, brand color, theme, and description directly below, or open
                the full Commerce service for shipping &amp; checkout policy rules.
              </p>
            </div>
            <button className="secondary-button" onClick={() => navigate('Commerce')}>
              Open Commerce settings
            </button>
          </div>
          <div className="commerce-merchant-grid">
            <form className="panel compact-form" onSubmit={saveInlineSettings}>
              <h3>Store presentation &amp; identity</h3>
              <Field label="Store name">
                <input
                  required
                  value={settingsDraft.name}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <Field label="Storefront theme">
                <select
                  value={settingsDraft.theme}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, theme: e.target.value }))}
                >
                  <option value="market">Market (Standard Grid)</option>
                  <option value="editorial">Editorial (Warm Boutique)</option>
                  <option value="compact">Compact (High-Density Catalog)</option>
                </select>
              </Field>
              <Field label="Brand accent color">
                <input
                  type="color"
                  value={settingsDraft.brand_color}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, brand_color: e.target.value }))}
                />
              </Field>
              <Field label="Contact email (optional)">
                <input
                  type="email"
                  value={settingsDraft.contact_email}
                  onChange={(e) =>
                    setSettingsDraft((d) => ({ ...d, contact_email: e.target.value }))
                  }
                />
              </Field>
              <Field label="Storefront welcome description">
                <textarea
                  rows={3}
                  value={settingsDraft.description}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </Field>
              <div className="form-actions">
                <button className="button" disabled={busy || !canWrite}>
                  {busy ? 'Saving…' : 'Save presentation'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview changes
                </button>
              </div>
            </form>
            <section className="panel">
              <h3>Checkout and publication</h3>
              <dl className="commerce-merchant-facts">
                <div>
                  <dt>Address</dt>
                  <dd>/{settings?.slug}</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>{settings?.currency}</dd>
                </div>
                <div>
                  <dt>Checkout policy</dt>
                  <dd>{checkout.label}</dd>
                </div>
                <div>
                  <dt>Consent notice</dt>
                  <dd>{store.data.checkout_policy?.consent_notice_version || 'None'}</dd>
                </div>
                <div>
                  <dt>Publication</dt>
                  <dd>{published ? 'Published' : 'Draft'}</dd>
                </div>
                <div>
                  <dt>Shipping rules</dt>
                  <dd>{configuration?.shipping?.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Discount rules</dt>
                  <dd>{configuration?.discounts?.length ?? 0}</dd>
                </div>
              </dl>
              <p className="muted">{checkout.detail}</p>
              <button className="secondary-button" onClick={() => navigate('Commerce')}>
                Review authorization
              </button>
            </section>
          </div>
          <p className="commerce-capability-note">
            No custom domain, live payment provider or production checkout is enabled for this
            merchant app.
          </p>
        </div>
      )}

      {previewOpen && (
        <Overlay portal onClose={() => setPreviewOpen(false)}>
          <section
            className="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="storefront-draft-preview-title"
            style={{
              width: 'min(1040px, 95vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: 0,
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                background: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <strong id="storefront-draft-preview-title">
                  {settings?.name} — Interactive Storefront Preview
                </strong>
                <small style={{ display: 'block', color: '#94a3b8' }}>
                  {published
                    ? `Published v${store.data.publication?.version} + Live Draft Preview`
                    : 'Draft Mode — Inspect layout, theme & cart before publishing'}
                </small>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewDevice('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewDevice('mobile')}
                >
                  Mobile
                </button>
                {canWrite && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      go('storefront');
                      void prepareStorePublication();
                    }}
                  >
                    Prepare &amp; Publish
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div
              style={{
                maxWidth: previewDevice === 'mobile' ? '400px' : '100%',
                margin: '0 auto',
                padding: '28px 24px',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  padding: '24px',
                  borderRadius: '14px',
                  background: `linear-gradient(135deg, ${brandColor}22, #f8fafc)`,
                  marginBottom: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <span className="badge" style={{ marginBottom: '6px' }}>
                    /{settings?.slug}
                  </span>
                  <h2 style={{ margin: '4px 0' }}>{settingsDraft.name || settings?.name}</h2>
                  <p style={{ margin: 0, color: '#475569' }}>
                    {settingsDraft.description ||
                      settings?.description ||
                      'Explore our curated products below.'}
                  </p>
                </div>
                <div
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <small style={{ display: 'block', color: '#64748b' }}>Simulated Buyer Cart</small>
                  <strong>{money(previewCartTotal, currency)}</strong>
                  {previewCartTotal > 0 && (
                    <button
                      type="button"
                      className="quiet-button"
                      style={{ marginInlineStart: '8px' }}
                      onClick={() => setPreviewCart({})}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    previewDevice === 'mobile'
                      ? '1fr'
                      : 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '16px',
                }}
              >
                {previewableListings.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        height: '100px',
                        borderRadius: '8px',
                        background: `${brandColor}16`,
                        color: brandColor,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: '26px',
                      }}
                    >
                      {(item.data.title || item.canonical_product.name || 'P')
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <strong>{item.data.title || item.canonical_product.name}</strong>
                    <small style={{ color: '#64748b' }}>
                      {item.data.description || item.canonical_product.description || item.canonical_product.sku}
                    </small>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '6px',
                      }}
                    >
                      <strong>
                        {money(
                          item.canonical_product.sale_price_minor,
                          item.canonical_product.currency,
                        )}
                      </strong>
                      <button
                        type="button"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: brandColor,
                          color: '#ffffff',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onClick={() =>
                          setPreviewCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))
                        }
                      >
                        Add ({previewCart[item.id] || 0})
                      </button>
                    </div>
                  </article>
                ))}
                {!previewableListings.length && (
                  <p className="muted">
                    No active or draft listings yet. Close preview and click "+ Add product listing"
                    in Catalogue.
                  </p>
                )}
              </div>
            </div>
          </section>
        </Overlay>
      )}
    </div>
  );
}
