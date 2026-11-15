import { useEffect, useState } from 'react';
import { money, type API } from '../operations/UI';
import { posCategoryTone, posProductInitials } from './pos-app-model';

export function POSAppProducts({
  api,
  registers,
  online,
  navigate,
}: {
  api: API;
  registers: any[];
  online: boolean;
  navigate: (tab: string) => void;
}) {
  const [registerId, setRegisterId] = useState(registers[0]?.id || ''),
    [rows, setRows] = useState<any>(null),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!registerId && registers[0]) setRegisterId(registers[0].id);
  }, [registers, registerId]);
  useEffect(() => {
    let current = true;
    if (!registerId || !online) return;
    setLoading(true);
    setError('');
    api(
      '/pos/registers/' +
        registerId +
        '/products?' +
        new URLSearchParams({ q: search, offset: String(offset), category }),
    )
      .then((value) => {
        if (current) setRows(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, registerId, search, offset, category, online]);
  const register = registers.find((row: any) => row.id === registerId),
    currency = register?.data?.currency || 'KES';
  return (
    <div className="pos-app-products">
      <header className="pos-app-page-head">
        <div>
          <span className="eyebrow">Products</span>
          <h2>Counter catalog</h2>
          <p>
            Read-only projection of the canonical product catalog. Prices and stock are revalidated
            when a sale is quoted.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={() => navigate('Products')}>
          Manage canonical products
        </button>
      </header>
      <div className="pos-app-toolbar">
        <label className="pos-app-filter-search">
          <span>Register</span>
          <select
            value={registerId}
            onChange={(e) => {
              setRegisterId(e.target.value);
              setOffset(0);
            }}
          >
            {registers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.data.name}
              </option>
            ))}
          </select>
        </label>
        <div className="pos-app-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(query);
                setOffset(0);
              }
            }}
            placeholder="Search name, SKU or barcode"
          />
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSearch(query);
            setOffset(0);
          }}
        >
          Search
        </button>
      </div>
      <div className="pos-catalog-categories">
        {[
          ['', 'All products'],
          ...(rows?.categories || []).map((name: string) => [name, name]),
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={category === value ? 'active' : ''}
            onClick={() => {
              setCategory(value);
              setOffset(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading && !rows && <p role="status">Loading catalog…</p>}
      {rows && (
        <>
          <div className="posc-product-grid">
            {rows.data.map((product: any) => (
              <article className="posc-product-card" key={product.id}>
                <span
                  className="posc-product-visual"
                  style={{ background: posCategoryTone(product.category) }}
                >
                  {posProductInitials(product.name)}
                </span>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {product.sku}
                    {product.variant ? ' · ' + product.variant : ''}
                  </small>
                  <p>{product.category || 'Uncategorised'}</p>
                </div>
                <div className="posc-product-meta">
                  <strong>{money(product.sale_price_minor, product.currency || currency)}</strong>
                  <span>{product.track_inventory ? 'Stock tracked' : 'Not tracked'}</span>
                  <span>{product.unit || 'unit'}</span>
                </div>
              </article>
            ))}
          </div>
          {!rows.data.length && (
            <div className="pos-app-empty small">
              <p>No matching active products in {currency}.</p>
            </div>
          )}
          <p className="pos-app-note">
            Product images and per-location stock are not part of this catalog projection. Open
            shared Inventory for exact balances.
          </p>
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
              disabled={!rows.has_more}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
