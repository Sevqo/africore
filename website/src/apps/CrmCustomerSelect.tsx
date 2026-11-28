import { useEffect, useState } from 'react';
import type { API } from '../operations/UI';

export function CrmCustomerSelect({
  api,
  name,
  defaultValue = '',
  required = false,
  companyOnly = false,
  excludeId,
}: {
  api: API;
  name: string;
  defaultValue?: string;
  required?: boolean;
  companyOnly?: boolean;
  excludeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    let current = true;
    if (!defaultValue) {
      setSelected(null);
      return;
    }
    api('/records/customers/' + defaultValue)
      .then((customer) => current && setSelected(customer))
      .catch((e) => current && setError((e as Error).message));
    return () => {
      current = false;
    };
  }, [api, defaultValue]);
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      setError('');
      setLoading(true);
      api(
        companyOnly
          ? '/crm/companies?' + new URLSearchParams({ limit: '20', q: search })
          : '/records/customers?' + new URLSearchParams({ limit: '20', q: search }),
      )
        .then((result) => current && setResults((result.data || []).filter((customer: any) => customer.id !== excludeId)))
        .catch((e) => current && setError((e as Error).message))
        .finally(() => current && setLoading(false));
    }, 160);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, search, companyOnly, excludeId]);
  return (
    <div className="crm-customer-picker">
      <input
        type="hidden"
        name={name}
        value={selected?.id || ''}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        type="search"
        role="combobox"
        aria-label="Search shared customers"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={name + '-customer-options'}
        aria-activedescendant={open && results[activeIndex] ? name + '-customer-option-' + results[activeIndex].id : undefined}
        autoComplete="off"
        value={open ? search : selected?.name || search}
        placeholder="Search name, email or phone"
        required={required}
        onFocus={() => {
          setSearch(selected?.name || '');
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            if (!selected && search.trim()) {
              const q = search.trim().toLowerCase();
              const exact =
                results.find((c) => String(c.name || '').trim().toLowerCase() === q) ||
                (results.length === 1 ? results[0] : null);
              if (exact) {
                setSelected(exact);
                setSearch('');
              }
            }
          }, 160);
        }}
        onChange={(event) => {
          setSelected(null);
          setSearch(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && results[activeIndex]) {
            event.preventDefault();
            setSelected(results[activeIndex]);
            setSearch('');
            setOpen(false);
          }
        }}
      />
      {open && (
        <div id={name + '-customer-options'} className="crm-customer-options" role="listbox">
          {error && <p role="alert">Customer search failed: {error}</p>}
          {loading && <p role="status">Searching authorized customers…</p>}
          {results.map((customer, index) => (
            <button
              type="button"
              role="option"
              id={name + '-customer-option-' + customer.id}
              aria-selected={selected?.id === customer.id}
              className={activeIndex === index ? 'is-active' : ''}
              key={customer.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSelected(customer);
                setSearch('');
                setOpen(false);
              }}
            >
              <strong>{customer.name}</strong>
              <small>{customer.email || customer.phone || 'No contact details'}</small>
            </button>
          ))}
          {!loading && !error && !results.length && (
            <p role="status">
              {companyOnly ? 'No eligible active companies match this search.' : 'No matching active customers.'}
            </p>
          )}
        </div>
      )}
      {selected && !open && <small className="crm-selected-customer">{selected.name}</small>}
    </div>
  );
}
