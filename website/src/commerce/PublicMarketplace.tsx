import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api-client';
import { readApiResponse } from '../lib/api-response';
import { currencyDigits } from '../../../src/finance/money';
import './marketplace.css';

type MarketplaceProduct = {
  listing_id: string;
  product_id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  store_url: string;
  product_url: string;
  store_brand_color: string;
  store_location: string;
  store_verified: boolean;
  checkout_available: boolean;
  title: string;
  description: string;
  category: string;
  sku: string;
  variant: string;
  unit: string;
  currency: string;
  unit_price_minor: number;
  compare_at_minor: number | null;
  discount_pct: number;
  image_url: string | null;
  image_alt: string;
  in_stock: boolean;
  minimum_quantity_milli: number;
  rating_avg: number;
  review_count: number;
};

type MarketplaceStore = {
  store_id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  location: string;
  currency: string;
  brand_color: string;
  logo_url: string | null;
  banner_url: string | null;
  store_url: string;
  checkout_available: boolean;
  verified: boolean;
  product_count: number;
  rating_avg: number;
  review_count: number;
};

type BagEntry = {
  store_slug: string;
  store_name: string;
  store_url: string;
  product_id: string;
  listing_id: string;
  title: string;
  currency: string;
  unit_price_minor: number;
  quantity: number;
};

const formatMoney = (amountMinor: number, currency: string) => {
  const digits = currencyDigits[currency as keyof typeof currencyDigits] ?? 2;
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
    }).format(amountMinor / 10 ** digits);
  } catch {
    return `${currency} ${(amountMinor / 10 ** digits).toFixed(digits)}`;
  }
};

function StarRating({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="mp-stars" style={{ color: '#64748b' }}>New listing</span>;
  const full = Math.round(avg);
  return (
    <span className="mp-stars" aria-label={`${avg} out of 5 stars from ${count} reviews`}>
      {'★'.repeat(full)}
      {'☆'.repeat(Math.max(0, 5 - full))} {avg.toFixed(1)} ({count})
    </span>
  );
}

export function PublicMarketplace({ environment = 'production' }: { environment?: 'production' | 'sandbox' }) {
  const [env, setEnv] = useState<'production' | 'sandbox'>(environment);
  const [tab, setTab] = useState<'products' | 'deals' | 'stores'>('products');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [dealsOnly, setDealsOnly] = useState(false);
  const [sort, setSort] = useState<'featured' | 'price_asc' | 'price_desc' | 'newest' | 'rating'>('featured');
  const [offset, setOffset] = useState(0);

  const [featured, setFeatured] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [storeList, setStoreList] = useState<MarketplaceStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [quickProduct, setQuickProduct] = useState<MarketplaceProduct | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewForm, setReviewForm] = useState({ reviewer_name: '', rating: 5, title: '', body: '' });
  const [reviewBusy, setReviewBusy] = useState(false);

  const [bagOpen, setBagOpen] = useState(false);
  const [bag, setBag] = useState<BagEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('africore_marketplace_bag_' + environment) || '[]');
    } catch {
      return [];
    }
  });
  const [addingId, setAddingId] = useState('');

  useEffect(() => {
    setEnv(environment);
  }, [environment]);

  useEffect(() => {
    document.title =
      env === 'sandbox'
        ? 'AfriCore Marketplace (Sandbox) · Shop Independent Stores'
        : 'AfriCore Marketplace · Shop Independent Merchant Stores';
  }, [env]);

  useEffect(() => {
    try {
      localStorage.setItem('africore_marketplace_bag_' + env, JSON.stringify(bag));
    } catch {
      // Ignore storage quota errors.
    }
  }, [bag, env]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/v1/marketplace/${env}/featured`, { signal: controller.signal })
      .then(readApiResponse)
      .then((res) => {
        if (!controller.signal.aborted) setFeatured(res);
      })
      .catch(() => {});
    apiFetch(`/api/v1/marketplace/${env}/stores?limit=40`, { signal: controller.signal })
      .then(readApiResponse)
      .then((res) => {
        if (!controller.signal.aborted) setStoreList(res.stores || []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [env]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      q: query,
      sort,
      offset: String(offset),
      limit: '24',
    });
    if (category) params.set('category', category);
    if (storeFilter) params.set('store', storeFilter);
    if (dealsOnly || tab === 'deals') params.set('deals_only', '1');
    if (minPrice.trim() && Number(minPrice) >= 0)
      params.set('min_price', String(Math.round(Number(minPrice) * 100)));
    if (maxPrice.trim() && Number(maxPrice) >= 0)
      params.set('max_price', String(Math.round(Number(maxPrice) * 100)));

    apiFetch(`/api/v1/marketplace/${env}/products?${params}`, { signal: controller.signal })
      .then(readApiResponse)
      .then((res) => {
        if (!controller.signal.aborted) setCatalog(res);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [env, query, category, storeFilter, minPrice, maxPrice, dealsOnly, tab, sort, offset]);

  useEffect(() => {
    if (!quickProduct) {
      setReviews([]);
      return;
    }
    const controller = new AbortController();
    apiFetch(
      `/api/v1/storefronts/${env}/${encodeURIComponent(quickProduct.store_slug)}/reviews?listing_id=${encodeURIComponent(quickProduct.listing_id)}`,
      { signal: controller.signal },
    )
      .then(readApiResponse)
      .then((res) => {
        if (!controller.signal.aborted) setReviews(res.data || []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReviews([]);
      });
    return () => controller.abort();
  }, [quickProduct?.listing_id, env]);

  async function addDirectToSellerCart(product: MarketplaceProduct) {
    setAddingId(product.listing_id);
    setStatusMessage('');
    try {
      // Directly populate this independent merchant's storefront cart cookie using the exact
      // 2-step storefront cart protocol (POST {} to create/load cart -> PUT updated items) so
      // checkout stays 100% tenant-isolated inside that seller's workspace.
      const cartUrl = `/api/v1/storefronts/${env}/${encodeURIComponent(product.store_slug)}/cart`;
      const createdRes = await apiFetch(cartUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (createdRes.ok) {
        const currentCart = await createdRes.json();
        const prevItems: Array<{ product_id: string; quantity_milli: number }> =
          currentCart?.cart?.items || [];
        const addQty = product.minimum_quantity_milli || 1000;
        const mergedItems = prevItems.some((i) => i.product_id === product.product_id)
          ? prevItems.map((i) =>
              i.product_id === product.product_id
                ? { ...i, quantity_milli: i.quantity_milli + addQty }
                : i,
            )
          : [...prevItems, { product_id: product.product_id, quantity_milli: addQty }];
        const putRes = await apiFetch(cartUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            expected_version: Number(currentCart?.version || 1),
            cart: {
              items: mergedItems,
              discount_code: currentCart?.cart?.discount_code || '',
              shipping_option_id:
                currentCart?.cart?.shipping_option_id ||
                currentCart?.shipping_options?.[0]?.id ||
                null,
            },
            country: currentCart?.country || 'KE',
          }),
        });
        if (putRes.ok) {
          setStatusMessage(
            `Added "${product.title}" directly to ${product.store_name}'s checkout cart.`,
          );
        } else {
          setStatusMessage(
            `Saved "${product.title}" in your Marketplace Bag. Visit ${product.store_name} to complete checkout.`,
          );
        }
      } else {
        setStatusMessage(
          `Saved "${product.title}" in your Marketplace Bag. Visit ${product.store_name} to complete checkout.`,
        );
      }
    } catch {
      setStatusMessage(`Saved "${product.title}" in your Marketplace Bag.`);
    } finally {
      setBag((current) => {
        const existing = current.find(
          (item) =>
            item.store_slug === product.store_slug && item.product_id === product.product_id,
        );
        if (existing) {
          return current.map((item) =>
            item.store_slug === product.store_slug && item.product_id === product.product_id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }
        return [
          ...current,
          {
            store_slug: product.store_slug,
            store_name: product.store_name,
            store_url: product.store_url,
            product_id: product.product_id,
            listing_id: product.listing_id,
            title: product.title,
            currency: product.currency,
            unit_price_minor: product.unit_price_minor,
            quantity: 1,
          },
        ];
      });
      setAddingId('');
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!quickProduct) return;
    setReviewBusy(true);
    try {
      const created = await readApiResponse(
        await apiFetch(
          `/api/v1/storefronts/${env}/${encodeURIComponent(quickProduct.store_slug)}/reviews`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listing_id: quickProduct.listing_id,
              product_id: quickProduct.product_id,
              reviewer_name: reviewForm.reviewer_name,
              rating: Number(reviewForm.rating),
              title: reviewForm.title,
              body: reviewForm.body,
            }),
          },
        ),
      );
      setReviews((cur) => [created, ...cur]);
      setReviewForm({ reviewer_name: '', rating: 5, title: '', body: '' });
      setStatusMessage('Thank you! Your product review has been published.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }

  const bagGroups = useMemo(() => {
    const groups = new Map<string, { store_name: string; store_url: string; currency: string; items: BagEntry[] }>();
    for (const entry of bag) {
      const cur = groups.get(entry.store_slug) || {
        store_name: entry.store_name,
        store_url: entry.store_url,
        currency: entry.currency,
        items: [],
      };
      cur.items.push(entry);
      groups.set(entry.store_slug, cur);
    }
    return [...groups.entries()];
  }, [bag]);

  const bagCount = bag.reduce((sum, item) => sum + item.quantity, 0);
  const categories = catalog?.facets?.categories || featured?.categories || [];
  const sellerFacets = catalog?.facets?.stores || [];
  const products: MarketplaceProduct[] = catalog?.products || [];

  return (
    <div className="mp-shell">
      <div className="mp-trust-strip">
        <div className="mp-trust-inner">
          <span>
            <strong>AfriCore Multi-Vendor Marketplace</strong> · Independent stores own 100% of
            their products, pricing &amp; fulfillment. AfriCore owns zero inventory.
          </span>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <a href="/app?app=commerce">Open your free store →</a>
            <a
              href={env === 'production' ? '/marketplace/sandbox' : '/marketplace'}
              onClick={(e) => {
                e.preventDefault();
                const next = env === 'production' ? 'sandbox' : 'production';
                setEnv(next);
                history.pushState(null, '', next === 'sandbox' ? '/marketplace/sandbox' : '/marketplace');
              }}
            >
              {env === 'sandbox' ? 'Switch to Live Marketplace' : 'View Sandbox Stores'}
            </a>
          </div>
        </div>
      </div>

      <header className="mp-topbar">
        <div className="mp-topbar-inner">
          <a className="mp-brand" href="/marketplace">
            <span className="mp-brand-mark">A</span>
            <span>
              AfriCore <span style={{ color: '#047857' }}>Marketplace</span>
            </span>
          </a>

          <form
            className="mp-search-bar"
            role="search"
            aria-label="Search marketplace products"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(searchInput.trim());
              setTab('products');
              setOffset(0);
            }}
          >
            <select
              aria-label="Filter department"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All Departments</option>
              {categories.map((c: any) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search products, brands, SKUs, or independent stores…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          <div className="mp-topbar-actions">
            <a className="mp-pill-btn" href="/app?app=commerce">
              Sell on AfriCore
            </a>
            <button
              type="button"
              className="mp-pill-btn primary"
              onClick={() => setBagOpen(true)}
            >
              Marketplace Bag ({bagCount})
            </button>
          </div>
        </div>

        <nav className="mp-dept-bar" aria-label="Marketplace departments">
          <div className="mp-dept-inner">
            <button
              type="button"
              className={`mp-dept-pill ${tab === 'products' && !category && !dealsOnly ? 'is-active' : ''}`}
              onClick={() => {
                setTab('products');
                setCategory('');
                setStoreFilter('');
                setDealsOnly(false);
                setOffset(0);
              }}
            >
              All Products
            </button>
            <button
              type="button"
              className={`mp-dept-pill ${tab === 'deals' ? 'is-active' : ''}`}
              onClick={() => {
                setTab('deals');
                setOffset(0);
              }}
            >
              Today’s Deals
            </button>
            <button
              type="button"
              className={`mp-dept-pill ${tab === 'stores' ? 'is-active' : ''}`}
              onClick={() => setTab('stores')}
            >
              Independent Stores ({featured?.stats?.store_count ?? storeList.length})
            </button>
            {categories.slice(0, 8).map((c: any) => (
              <button
                key={c.name}
                type="button"
                className={`mp-dept-pill ${tab === 'products' && category === c.name ? 'is-active' : ''}`}
                onClick={() => {
                  setTab('products');
                  setCategory(c.name);
                  setOffset(0);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mp-main">
        {env === 'sandbox' && (
          <p
            role="status"
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '10px 16px',
              borderRadius: '12px',
              marginTop: 0,
              fontSize: '13px',
            }}
          >
            <strong>Sandbox Marketplace</strong> — Showing participating sandbox stores for testing
            and store evaluation. Orders placed here are test orders only.
          </p>
        )}

        <section className="mp-hero">
          <div>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.16)',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              DIRECT-TO-MERCHANT MARKETPLACE
            </span>
            <h1>Discover &amp; buy directly from independent stores.</h1>
            <p>
              Every product you find here is listed, priced, and fulfilled directly by its
              independent business owner using AfriCore Commerce. Search once across every opted-in
              storefront and check out straight with the seller.
            </p>
          </div>
          <div className="mp-hero-stats">
            <div className="mp-hero-stat">
              <strong>{featured?.stats?.store_count ?? storeList.length}</strong>
              <span>Independent stores</span>
            </div>
            <div className="mp-hero-stat">
              <strong>{featured?.stats?.product_count ?? catalog?.total ?? 0}</strong>
              <span>Listed products</span>
            </div>
            <div className="mp-hero-stat">
              <strong>{featured?.stats?.category_count ?? categories.length}</strong>
              <span>Departments</span>
            </div>
          </div>
        </section>

        {statusMessage && (
          <p
            role="status"
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              padding: '10px 16px',
              borderRadius: '12px',
              marginBottom: '16px',
              fontSize: '13.5px',
            }}
          >
            {statusMessage}
          </p>
        )}
        {error && (
          <p
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '10px 16px',
              borderRadius: '12px',
              marginBottom: '16px',
            }}
          >
            {error}
          </p>
        )}

        {tab === 'stores' ? (
          <section aria-label="Independent merchant stores">
            <div className="mp-results-bar">
              <strong>{storeList.length} participating independent store(s)</strong>
              <a className="mp-pill-btn primary" href="/app?app=commerce">
                + List Your Store Free
              </a>
            </div>
            {storeList.length ? (
              <div className="mp-stores-grid">
                {storeList.map((st) => (
                  <article key={st.store_id} className="mp-store-card">
                    <div
                      className="mp-store-banner"
                      style={{
                        background: st.banner_url
                          ? `linear-gradient(180deg, rgba(15,23,42,0.15), rgba(15,23,42,0.7)), url(${st.banner_url}) center/cover`
                          : `linear-gradient(135deg, ${st.brand_color}, #0f172a)`,
                      }}
                    >
                      <strong>{st.name}</strong>
                      <span
                        style={{
                          fontSize: '11px',
                          background: 'rgba(255,255,255,0.2)',
                          padding: '2px 9px',
                          borderRadius: '999px',
                        }}
                      >
                        {st.category}
                      </span>
                    </div>
                    <div className="mp-store-content">
                      <div className="mp-seller-line">
                        <span>{st.location || 'Independent Merchant'}</span>
                        <StarRating avg={st.rating_avg} count={st.review_count} />
                      </div>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#475569' }}>
                        {st.tagline || st.description || 'Shop directly from this independent merchant.'}
                      </p>
                      <small style={{ color: '#64748b' }}>
                        {st.product_count} published product{st.product_count === 1 ? '' : 's'} ·{' '}
                        {st.currency}
                        {st.checkout_available ? ' · Online checkout ready' : ''}
                      </small>
                      <div className="mp-card-actions">
                        <a className="mp-pill-btn primary" href={st.store_url}>
                          Visit Storefront ↗
                        </a>
                        <button
                          type="button"
                          className="mp-pill-btn"
                          onClick={() => {
                            setStoreFilter(st.slug);
                            setTab('products');
                            setOffset(0);
                          }}
                        >
                          Filter Products
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '36px',
                  textAlign: 'center',
                }}
              >
                <h2>No stores have opted into the {env} marketplace yet</h2>
                <p style={{ color: '#475569', maxWidth: '520px', margin: '8px auto 18px' }}>
                  Merchants create stores in AfriCore Commerce and opt in under Store Settings →
                  List on AfriCore Marketplace to appear here automatically.
                </p>
                <a className="mp-pill-btn primary" href="/app?app=commerce">
                  Create &amp; List Your Store
                </a>
              </div>
            )}
          </section>
        ) : (
          <div className="mp-layout">
            <aside className="mp-sidebar" aria-label="Marketplace filters">
              <div className="mp-filter-group">
                <h3>Department</h3>
                <button
                  type="button"
                  className={`mp-filter-link ${!category ? 'is-active' : ''}`}
                  onClick={() => {
                    setCategory('');
                    setOffset(0);
                  }}
                >
                  <span>All Departments</span>
                  <span>{catalog?.total ?? 0}</span>
                </button>
                {categories.map((c: any) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`mp-filter-link ${category === c.name ? 'is-active' : ''}`}
                    onClick={() => {
                      setCategory(c.name);
                      setOffset(0);
                    }}
                  >
                    <span>{c.name}</span>
                    <span>{c.count}</span>
                  </button>
                ))}
              </div>

              <div className="mp-filter-group">
                <h3>Price Range</h3>
                <div className="mp-price-inputs">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    aria-label="Minimum price"
                    value={minPrice}
                    onChange={(e) => {
                      setMinPrice(e.target.value);
                      setOffset(0);
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    aria-label="Maximum price"
                    value={maxPrice}
                    onChange={(e) => {
                      setMaxPrice(e.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={dealsOnly || tab === 'deals'}
                    onChange={(e) => {
                      setDealsOnly(e.target.checked);
                      if (!e.target.checked && tab === 'deals') setTab('products');
                      setOffset(0);
                    }}
                  />
                  Deals &amp; discounts only
                </label>
              </div>

              {sellerFacets.length > 0 && (
                <div className="mp-filter-group">
                  <h3>Independent Sellers</h3>
                  <button
                    type="button"
                    className={`mp-filter-link ${!storeFilter ? 'is-active' : ''}`}
                    onClick={() => {
                      setStoreFilter('');
                      setOffset(0);
                    }}
                  >
                    <span>All Sellers</span>
                    <span>{sellerFacets.length}</span>
                  </button>
                  {sellerFacets.map((st: any) => (
                    <button
                      key={st.slug}
                      type="button"
                      className={`mp-filter-link ${storeFilter === st.slug ? 'is-active' : ''}`}
                      onClick={() => {
                        setStoreFilter(st.slug);
                        setOffset(0);
                      }}
                    >
                      <span>{st.name}</span>
                      <span>{st.product_count}</span>
                    </button>
                  ))}
                </div>
              )}

              {(query || category || storeFilter || minPrice || maxPrice || dealsOnly) && (
                <button
                  type="button"
                  className="mp-pill-btn"
                  onClick={() => {
                    setSearchInput('');
                    setQuery('');
                    setCategory('');
                    setStoreFilter('');
                    setMinPrice('');
                    setMaxPrice('');
                    setDealsOnly(false);
                    setTab('products');
                    setOffset(0);
                  }}
                >
                  Clear all filters
                </button>
              )}
            </aside>

            <section aria-label="Marketplace products">
              <div className="mp-results-bar">
                <span style={{ fontSize: '13.5px', color: '#334155' }}>
                  {loading
                    ? 'Searching independent stores…'
                    : `${catalog?.total ?? 0} product${(catalog?.total ?? 0) === 1 ? '' : 's'} across participating stores`}
                  {query ? ` for “${query}”` : ''}
                  {storeFilter ? ` · Store: ${storeFilter}` : ''}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <span>Sort by</span>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as any);
                      setOffset(0);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                    }}
                  >
                    <option value="featured">Featured</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="rating">Customer Rating</option>
                    <option value="newest">Newest Arrivals</option>
                  </select>
                </label>
              </div>

              {products.length > 0 ? (
                <div className="mp-product-grid">
                  {products.map((p) => (
                    <article key={p.listing_id} className="mp-product-card">
                      <div
                        className="mp-product-media"
                        style={{ background: `${p.store_brand_color}14` }}
                        onClick={() => setQuickProduct(p)}
                      >
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.image_alt} loading="lazy" />
                        ) : (
                          <span
                            className="mp-product-monogram"
                            style={{ color: p.store_brand_color }}
                          >
                            {p.title.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {p.discount_pct > 0 && (
                          <span className="mp-deal-badge">-{p.discount_pct}%</span>
                        )}
                      </div>
                      <div className="mp-product-body">
                        <div className="mp-seller-line">
                          <a href={p.store_url}>
                            {p.store_name} {p.store_verified ? '✓' : ''}
                          </a>
                          <span>{p.category}</span>
                        </div>
                        <h3 className="mp-product-title" onClick={() => setQuickProduct(p)}>
                          {p.title}
                        </h3>
                        <StarRating avg={p.rating_avg} count={p.review_count} />
                        <div className="mp-price-row">
                          <strong>{formatMoney(p.unit_price_minor, p.currency)}</strong>
                          {p.compare_at_minor && (
                            <s>{formatMoney(p.compare_at_minor, p.currency)}</s>
                          )}
                        </div>
                        <small style={{ color: '#64748b' }}>
                          Sold &amp; fulfilled directly by {p.store_name}
                          {p.store_location ? ` · ${p.store_location}` : ''}
                        </small>
                        <div className="mp-card-actions">
                          <button
                            type="button"
                            className="mp-pill-btn primary"
                            disabled={addingId === p.listing_id}
                            onClick={() => void addDirectToSellerCart(p)}
                          >
                            {addingId === p.listing_id ? 'Adding…' : 'Add to Cart'}
                          </button>
                          <a className="mp-pill-btn" href={p.store_url}>
                            Store ↗
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                !loading && (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '40px 24px',
                      textAlign: 'center',
                    }}
                  >
                    <h2 style={{ marginTop: 0 }}>No marketplace products found yet</h2>
                    <p style={{ color: '#475569', maxWidth: '520px', margin: '0 auto 18px' }}>
                      {query || category || storeFilter
                        ? 'Try clearing your search or price filters to browse all participating stores.'
                        : `Be the first merchant to list your ${env} store on AfriCore Marketplace — toggle "List on AfriCore Marketplace" in Commerce and publish your store!`}
                    </p>
                    <a className="mp-pill-btn primary" href="/app?app=commerce">
                      Open Commerce &amp; List Your Store
                    </a>
                  </div>
                )
              )}

              {(offset > 0 || catalog?.has_more) && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '12px',
                    marginTop: '20px',
                  }}
                >
                  <button
                    type="button"
                    className="mp-pill-btn"
                    disabled={offset === 0}
                    onClick={() => setOffset((v) => Math.max(0, v - 24))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="mp-pill-btn"
                    disabled={!catalog?.has_more}
                    onClick={() => setOffset((v) => v + 24)}
                  >
                    Next Page
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {quickProduct && (
        <div className="mp-drawer-backdrop" onClick={() => setQuickProduct(null)}>
          <aside
            className="mp-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={quickProduct.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#047857' }}>
                SOLD BY {quickProduct.store_name.toUpperCase()}
              </span>
              <button
                type="button"
                className="mp-pill-btn"
                onClick={() => setQuickProduct(null)}
              >
                Close
              </button>
            </div>

            {quickProduct.image_url && (
              <img
                src={quickProduct.image_url}
                alt={quickProduct.image_alt}
                style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '14px' }}
              />
            )}

            <div>
              <h2 style={{ margin: '0 0 6px' }}>{quickProduct.title}</h2>
              <StarRating avg={quickProduct.rating_avg} count={quickProduct.review_count} />
              <div className="mp-price-row">
                <strong>{formatMoney(quickProduct.unit_price_minor, quickProduct.currency)}</strong>
                {quickProduct.compare_at_minor && (
                  <s>{formatMoney(quickProduct.compare_at_minor, quickProduct.currency)}</s>
                )}
              </div>
              <p style={{ color: '#475569', fontSize: '14px', lineHeight: 1.55 }}>
                {quickProduct.description || 'Direct merchant listing on AfriCore Marketplace.'}
              </p>
              <small style={{ color: '#64748b' }}>
                SKU: {quickProduct.sku || '—'} · Unit: {quickProduct.unit} · Department:{' '}
                {quickProduct.category}
              </small>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mp-pill-btn primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => void addDirectToSellerCart(quickProduct)}
              >
                Add to Seller Cart
              </button>
              <a
                className="mp-pill-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                href={quickProduct.store_url + '#store-cart'}
              >
                Buy Direct at {quickProduct.store_name} ↗
              </a>
            </div>

            <div className="mp-review-box">
              <h3 style={{ margin: 0, fontSize: '15px' }}>Customer Reviews ({reviews.length})</h3>
              {reviews.map((rev) => (
                <div key={rev.id} className="mp-review-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{rev.reviewer_name}</strong>
                    <span style={{ color: '#b45309' }}>{'★'.repeat(rev.rating)}</span>
                  </div>
                  {rev.title && <div style={{ fontWeight: 600, marginTop: '2px' }}>{rev.title}</div>}
                  <p style={{ margin: '4px 0 0', color: '#475569' }}>{rev.body}</p>
                </div>
              ))}
              {!reviews.length && (
                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                  No reviews yet — be the first to review this product.
                </p>
              )}

              <form onSubmit={submitReview} style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                <strong style={{ fontSize: '13.5px' }}>Write a customer review</strong>
                <input
                  required
                  minLength={2}
                  placeholder="Your name"
                  value={reviewForm.reviewer_name}
                  onChange={(e) => setReviewForm((f) => ({ ...f, reviewer_name: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
                <select
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                >
                  <option value={5}>★★★★★ (5 - Excellent)</option>
                  <option value={4}>★★★★☆ (4 - Very Good)</option>
                  <option value={3}>★★★☆☆ (3 - Good)</option>
                  <option value={2}>★★☆☆☆ (2 - Fair)</option>
                  <option value={1}>★☆☆☆☆ (1 - Poor)</option>
                </select>
                <input
                  placeholder="Headline (optional)"
                  value={reviewForm.title}
                  onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  placeholder="Share your experience with this product & merchant…"
                  value={reviewForm.body}
                  onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
                <button type="submit" className="mp-pill-btn primary" disabled={reviewBusy}>
                  {reviewBusy ? 'Submitting…' : 'Submit Review'}
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}

      {bagOpen && (
        <div className="mp-drawer-backdrop" onClick={() => setBagOpen(false)}>
          <aside
            className="mp-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Marketplace Bag"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Marketplace Bag ({bagCount})</h2>
              <button type="button" className="mp-pill-btn" onClick={() => setBagOpen(false)}>
                Close
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
              Each store is an independent business. Checkout happens directly with each seller so
              they own their order, invoice, and fulfillment.
            </p>
            {bagGroups.length ? (
              bagGroups.map(([slug, group]) => {
                const subtotal = group.items.reduce(
                  (acc, i) => acc + i.unit_price_minor * i.quantity,
                  0,
                );
                return (
                  <div key={slug} className="mp-seller-bag-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{group.store_name}</strong>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>
                        {formatMoney(subtotal, group.currency)}
                      </span>
                    </div>
                    {group.items.map((item) => (
                      <div key={item.product_id} className="mp-bag-item">
                        <span>
                          {item.title} × {item.quantity}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong>{formatMoney(item.unit_price_minor * item.quantity, item.currency)}</strong>
                          <button
                            type="button"
                            className="mp-pill-btn"
                            style={{ padding: '3px 8px', fontSize: '11.5px' }}
                            onClick={() =>
                              setBag((cur) =>
                                cur.filter(
                                  (x) =>
                                    !(x.store_slug === slug && x.product_id === item.product_id),
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <a
                      className="mp-pill-btn primary"
                      style={{ justifyContent: 'center' }}
                      href={group.store_url + '#store-cart'}
                    >
                      Checkout directly with {group.store_name} →
                    </a>
                  </div>
                );
              })
            ) : (
              <p style={{ color: '#64748b' }}>
                Your Marketplace Bag is empty. Add items from any participating store to start
                shopping.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
