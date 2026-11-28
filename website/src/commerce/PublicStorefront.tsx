import { Icon } from '../components/Icon';
import { useEffect, useState, type CSSProperties } from 'react';
import { apiFetch } from '../lib/api-client';
import { readApiResponse } from '../lib/api-response';
import { currencyDigits } from '../../../src/finance/money';
import './storefront.css';
import { PublicCart, usePublicCart, type DeliveryOption } from './PublicCart';

interface ImageAsset {
  id: string;
  alt: string;
  width: number;
  height: number;
}
interface Product {
  product_id: string;
  listing_id: string;
  name: string;
  description: string;
  sku: string;
  variant: string;
  category?: string;
  unit: string;
  unit_price_minor: number;
  compare_at_minor: number | null;
  currency: string;
  minimum_quantity_milli: number;
  rating_avg?: number;
  review_count?: number;
  images: ImageAsset[];
}
interface Catalog {
  name: string;
  description: string;
  announcement_bar?: string;
  marketplace_listed?: boolean;
  marketplace_location?: string;
  brand_color: string;
  theme: string;
  currency: string;
  environment: string;
  publication_version: number;
  published_at: string;
  navigation: { label: string; href: string }[];
  seo: { title: string; description: string };
  collections: { id: string; name: string }[];
  products: Product[];
  total: number;
  has_more: boolean;
  coverage: string;
  payment_readiness: string;
  checkout_available: boolean;
  shipping_options: DeliveryOption[];
  logo_asset: ImageAsset | null;
  banner_asset?: ImageAsset | null;
}
const price = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: currencyDigits[currency],
  }).format(amount / 10 ** currencyDigits[currency]);
function StoreProductImage({
  asset,
  path,
  name,
}: {
  asset: ImageAsset | undefined;
  path: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  return asset && !failed ? (
    <div className="merchant-product-media">
      <img
        src={path + '/assets/' + asset.id}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  ) : (
    <div className="merchant-product-mark" aria-hidden="true">
      {name.slice(0, 1).toLocaleUpperCase()}
    </div>
  );
}
export function PublicStorefront({
  environment,
  slug,
  initialListingId = '',
}: {
  environment: string;
  slug: string;
  initialListingId?: string;
}) {
  const [data, setData] = useState<Catalog | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [collection, setCollection] = useState(''),
    [sort, setSort] = useState<'featured' | 'price_asc' | 'price_desc' | 'name'>('featured'),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [expanded, setExpanded] = useState(initialListingId),
    [reviewsByListing, setReviewsByListing] = useState<Record<string, any[]>>({}),
    [reviewDraft, setReviewDraft] = useState({ name: '', rating: 5, title: '', body: '' }),
    [reviewBusy, setReviewBusy] = useState(false),
    [reviewNotice, setReviewNotice] = useState('');
  const buyerCart = usePublicCart(environment, slug, data?.shipping_options || []);
  const imagePath = '/api/v1/storefronts/' + environment + '/' + slug;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const parameters = new URLSearchParams({
      q: query,
      sort,
      offset: String(offset),
      ...(collection ? { collection } : {}),
    });
    apiFetch('/api/v1/storefronts/' + environment + '/' + slug + '?' + parameters, {
      signal: controller.signal,
    })
      .then(readApiResponse)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (
            !Array.isArray(result.products) ||
            !Array.isArray(result.collections) ||
            typeof result.name !== 'string'
          )
            throw new Error('The store returned an unreadable catalog. Please retry.');
          setData(result);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [environment, slug, query, collection, sort, offset, revision]);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    apiFetch(imagePath + '/reviews?listing_id=' + encodeURIComponent(expanded), {
      signal: controller.signal,
    })
      .then(readApiResponse)
      .then((res) => {
        if (!controller.signal.aborted) {
          setReviewsByListing((cur) => ({ ...cur, [expanded]: res.data || [] }));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [expanded, imagePath]);
  async function submitProductReview(product: Product) {
    setReviewBusy(true);
    setReviewNotice('');
    try {
      const created = await readApiResponse(
        await apiFetch(imagePath + '/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: product.listing_id,
            product_id: product.product_id,
            reviewer_name: reviewDraft.name,
            rating: Number(reviewDraft.rating),
            title: reviewDraft.title,
            body: reviewDraft.body,
          }),
        }),
      );
      setReviewsByListing((cur) => ({
        ...cur,
        [product.listing_id]: [created, ...(cur[product.listing_id] || [])],
      }));
      setReviewDraft({ name: '', rating: 5, title: '', body: '' });
      setReviewNotice('Review published! Thank you for sharing your feedback.');
      setRevision((v) => v + 1);
    } catch (e) {
      setReviewNotice((e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }
  useEffect(() => {
    if (!data) return;
    document.title = data.seo.title || data.name;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', data.seo.description || data.description);
  }, [data?.seo.title, data?.seo.description, data?.name, data?.description]);
  return (
    <div
      className={'merchant-store theme-' + (data?.theme || 'market')}
      style={{ '--merchant-accent': data?.brand_color || '#78a800' } as CSSProperties}
    >
      <a className="store-skip" href="#store-products">
        Skip to products
      </a>
      <header className="merchant-header">
        <a className="merchant-name" href={'/s/' + environment + '/' + slug}>
          {data?.logo_asset && (
            <img
              className="merchant-logo"
              src={imagePath + '/assets/' + data.logo_asset.id}
              alt={data.logo_asset.alt}
              width={36}
              height={36}
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
            />
          )}
          {data?.name || 'Storefront'}
        </a>
        <nav aria-label="Store navigation">
          {data?.navigation.map((link, n) => (
            <a
              key={n}
              href={link.href}
              rel={link.href.startsWith('https:') ? 'noreferrer' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a href="#store-cart">Cart</a>
        <a href={environment === 'sandbox' ? '/marketplace/sandbox' : '/marketplace'}>
          Marketplace
        </a>
        <a className="store-platform" href="/">
          AfriCore
        </a>
      </header>
      <aside className="merchant-sidebar">
        <a className="merchant-sidebar-brand" href={'/s/' + environment + '/' + slug}>
          {data?.name || 'Storefront'}
        </a>
        <nav aria-label="Shop navigation">
          <a href="#store-products">
            <Icon name="home" />
            Shop home
          </a>
          <a href="#store-collections">
            <Icon name="grid" />
            Collections
          </a>
          <a href="#store-cart">
            <Icon name="bag" />
            Your cart
          </a>
          <a href="#store-ordering">
            <Icon name="document" />
            Ordering information
          </a>
        </nav>
        <div>
          <span>Merchant-owned storefront</span>
          <a href="/">Powered by AfriCore</a>
        </div>
      </aside>
      <main className="merchant-main">
        {data?.announcement_bar && (
          <p
            style={{
              background: data.brand_color || '#047857',
              color: '#ffffff',
              textAlign: 'center',
              padding: '8px 16px',
              margin: '0 0 12px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {data.announcement_bar}
          </p>
        )}
        {environment === 'sandbox' && (
          <p className="store-environment">
            Sandbox storefront · Test orders only. No real funds move.
          </p>
        )}

        {error && (
          <section role="alert" className="store-error">
            <h1>{data ? 'Catalog unavailable' : 'Store unavailable'}</h1>
            <p>{error}</p>
            <button onClick={() => setRevision((v) => v + 1)}>Retry catalog</button>
          </section>
        )}
        {!data && loading && <p role="status">Loading the published store…</p>}
        {data && (
          <>
            <section className="merchant-catalog-toolbar" aria-label="Find products">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(search.trim());
                  setOffset(0);
                  setExpanded('');
                }}
              >
                <label htmlFor="store-search">Search products</label>
                <div>
                  <input
                    id="store-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={100}
                  />
                  <button>Search</button>
                </div>
              </form>
              <label>
                Collection
                <select
                  value={collection}
                  onChange={(e) => {
                    setCollection(e.target.value);
                    setOffset(0);
                    setExpanded('');
                  }}
                >
                  <option value="">All collections</option>
                  {data.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as any);
                    setOffset(0);
                  }}
                >
                  <option value="featured">Featured</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
              <p>
                {data.total} published {data.total === 1 ? 'product' : 'products'} · {data.currency}
              </p>
            </section>
            <nav
              id="store-collections"
              className="merchant-collections"
              aria-label="Product collections"
            >
              <button
                aria-pressed={!collection}
                onClick={() => {
                  setCollection('');
                  setOffset(0);
                }}
              >
                <Icon name="grid" />
                All products
              </button>
              {data.collections.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={collection === c.id}
                  onClick={() => {
                    setCollection(c.id);
                    setOffset(0);
                  }}
                >
                  <Icon name="bag" />
                  {c.name}
                </button>
              ))}
            </nav>
            <section className="merchant-intro">
              <div>
                <p className="store-eyebrow">Explore the collection</p>
                <h1>{data.name}</h1>
                <p>{data.description}</p>
                <a className="merchant-shop-action" href="#store-products">
                  Shop the collection <Icon name="right" />
                </a>
              </div>
              {data.products[0]?.images?.[0] && (
                <StoreProductImage
                  asset={data.products[0].images[0]}
                  path={imagePath}
                  name={data.products[0].name}
                />
              )}
            </section>
            <section id="store-products" aria-label="Published products" aria-busy={loading}>
              <h2 className="store-sr-only">Published products</h2>
              {loading && <p role="status">Updating the catalog…</p>}
              <div className="merchant-product-grid">
                {data.products.map((product) => (
                  <article className="merchant-product" key={product.listing_id}>
                    <StoreProductImage
                      key={product.images?.[0]?.id || 'none'}
                      asset={product.images?.[0]}
                      path={imagePath}
                      name={product.name}
                    />
                    <div className="merchant-product-copy">
                      <p className="store-eyebrow">{product.variant || product.category || product.unit}</p>
                      <h3>{product.name}</h3>
                      {(product.review_count || 0) > 0 && (
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
                          {'★'.repeat(Math.round(product.rating_avg || 0))} {(product.rating_avg || 0).toFixed(1)} ({product.review_count})
                        </p>
                      )}
                      <p className="merchant-price">
                        {price(product.unit_price_minor, product.currency)}{' '}
                        <small>per {product.unit}</small>
                      </p>
                      {product.compare_at_minor && (
                        <p className="merchant-comparison">
                          Merchant comparison price:{' '}
                          <s>{price(product.compare_at_minor, product.currency)}</s>
                        </p>
                      )}
                      {data.checkout_available && (
                        <button
                          className="merchant-add-button"
                          disabled={buyerCart.busy || buyerCart.cart?.status === 'converted'}
                          onClick={() =>
                            buyerCart.add(product.product_id, product.minimum_quantity_milli)
                          }
                        >
                          Add to cart
                        </button>
                      )}
                      <button
                        className="merchant-details-button"
                        aria-expanded={expanded === product.listing_id}
                        onClick={() =>
                          setExpanded((v) => (v === product.listing_id ? '' : product.listing_id))
                        }
                      >
                        {expanded === product.listing_id
                          ? 'Hide product details'
                          : 'View product details'}
                      </button>
                      {expanded === product.listing_id && (
                        <div className="merchant-product-description">
                          <p>
                            {product.description ||
                              'No further product description has been published.'}
                          </p>
                          <p>SKU {product.sku}</p>
                          {product.images?.length > 1 && (
                            <div className="merchant-product-gallery">
                              {product.images.slice(1).map((asset) => (
                                <StoreProductImage
                                  key={asset.id}
                                  asset={asset}
                                  path={imagePath}
                                  name={product.name}
                                />
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                            <strong>Customer Reviews ({(reviewsByListing[product.listing_id] || []).length})</strong>
                            {(reviewsByListing[product.listing_id] || []).map((rev: any) => (
                              <div key={rev.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '12.5px' }}>
                                <strong>{rev.reviewer_name}</strong> · <span style={{ color: '#b45309' }}>{'★'.repeat(rev.rating)}</span>
                                {rev.title && <div><em>{rev.title}</em></div>}
                                <p style={{ margin: '2px 0 0' }}>{rev.body}</p>
                              </div>
                            ))}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void submitProductReview(product);
                              }}
                              style={{ display: 'grid', gap: '6px', marginTop: '8px' }}
                            >
                              <input
                                required
                                minLength={2}
                                placeholder="Your name"
                                value={reviewDraft.name}
                                onChange={(e) => setReviewDraft((d) => ({ ...d, name: e.target.value }))}
                              />
                              <select
                                value={reviewDraft.rating}
                                onChange={(e) => setReviewDraft((d) => ({ ...d, rating: Number(e.target.value) }))}
                              >
                                <option value={5}>★★★★★ (5)</option>
                                <option value={4}>★★★★☆ (4)</option>
                                <option value={3}>★★★☆☆ (3)</option>
                                <option value={2}>★★☆☆☆ (2)</option>
                                <option value={1}>★☆☆☆☆ (1)</option>
                              </select>
                              <textarea
                                required
                                minLength={5}
                                rows={2}
                                placeholder="Write a short review…"
                                value={reviewDraft.body}
                                onChange={(e) => setReviewDraft((d) => ({ ...d, body: e.target.value }))}
                              />
                              <button type="submit" disabled={reviewBusy}>
                                {reviewBusy ? 'Submitting…' : 'Submit review'}
                              </button>
                              {reviewNotice && <small role="status">{reviewNotice}</small>}
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!loading && !data.products.length && (
                <p>No published products match these filters. Try another search or collection.</p>
              )}
            </section>
            <nav className="merchant-pagination" aria-label="Catalog pages">
              <button
                disabled={loading || offset === 0}
                onClick={() => {
                  setOffset((v) => Math.max(0, v - 24));
                  setExpanded('');
                }}
              >
                Previous products
              </button>
              <span>Page {Math.floor(offset / 24) + 1}</span>
              <button
                disabled={loading || !data.has_more}
                onClick={() => {
                  setOffset((v) => v + 24);
                  setExpanded('');
                }}
              >
                More products
              </button>
            </nav>
            <section id="store-ordering" className="merchant-readiness">
              <h2>Ordering and availability</h2>
              <p>{data.payment_readiness}</p>
              <p>{data.coverage}</p>
            </section>
          </>
        )}
        <PublicCart
          state={buyerCart}
          options={data?.shipping_options || []}
          enabled={!!data?.checkout_available}
        />
      </main>
      <footer className="merchant-footer">
        <span>{data?.name || 'Storefront'}</span>
        <p>
          Published with AfriCore. Store content is supplied by the merchant; publication does not
          establish independent business verification.
        </p>
      </footer>
    </div>
  );
}
