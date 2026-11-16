import { useEffect, useState } from 'react';
import { Field, type API } from '../operations/UI';
export function WorkRecordLinks({ api, project }: { api: API; project?: any }) {
  const [customers, setCustomers] = useState<any[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [query, setQuery] = useState(''),
    [customer, setCustomer] = useState(project?.data.customer_id || ''),
    [order, setOrder] = useState(project?.data.order_id || ''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setErrors({});
    for (const [kind, set] of [
      ['customers', setCustomers],
      ['orders', setOrders],
    ] as const)
      api('/records/' + kind + '?limit=100&q=' + encodeURIComponent(query))
        .then((r) => {
          if (live) set(r.data);
        })
        .catch((e) => {
          if (live) setErrors((v) => ({ ...v, [kind]: e.message }));
        });
    return () => {
      live = false;
    };
  }, [api, query, revision]);
  return (
    <>
      <Field label="Find customers or orders">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shared records"
        />
      </Field>
      {Object.entries(errors).map(([kind, error]) => (
        <p role="status" key={kind}>
          {kind}: {error}{' '}
          <button type="button" className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>{' '}
          <a
            href={(() => {
              const url = new URL(location.href);
              url.searchParams.delete('app');
              url.searchParams.delete('section');
              url.hash = 'Explore Services';
              return url.pathname + url.search + url.hash;
            })()}
          >
            Review service availability
          </a>
        </p>
      ))}
      <Field label="Customer">
        <select
          name="customer"
          value={customer}
          onChange={(e) => {
            setCustomer(e.target.value);
            setOrder('');
          }}
        >
          <option value="">No customer relationship</option>
          {customer && !customers.some((c) => c.id === customer) && (
            <option value={customer}>Retain current customer relationship</option>
          )}
          {customers
            .filter((c) => c.status !== 'archived')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Sales order">
        <select name="order" value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="">No order relationship</option>
          {order &&
            !orders.some((o) => o.id === order && (!customer || o.customer_id === customer)) && (
              <option value={order}>Retain current order relationship</option>
            )}
          {orders
            .filter((o) => !customer || o.customer_id === customer)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.reference || o.number || 'Order'} · {o.status}
              </option>
            ))}
        </select>
      </Field>
      <small>
        Up to 100 matching shared records. Existing links remain available when a related service
        cannot be read.
      </small>
    </>
  );
}
