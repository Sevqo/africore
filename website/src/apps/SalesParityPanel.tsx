import { useEffect, useState, type ReactNode } from 'react';
import { Field as BaseField, Form as BaseForm, money, today, type API } from '../operations/UI';
import { AppControlPanel, KpiStrip } from './MinimalAppChrome';

type Tab = 'promos' | 'signatures' | 'commissions' | 'shipping' | 'matrix' | 'warnings';

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <BaseField label={label}>
      <input name={name} type={type} defaultValue={defaultValue} required={required} />
    </BaseField>
  );
}

function Form({
  submit,
  label,
  children,
}: {
  submit: (d: any) => Promise<any>;
  label: string;
  children: ReactNode;
}) {
  return (
    <BaseForm submit={submit}>
      {children}
      <button className="button" type="submit">
        {label}
      </button>
    </BaseForm>
  );
}

function useSalesData(api: API, path: string, rev: number): { data?: any; error?: string } {
  const [state, setState] = useState<{ path: string; data?: any; error?: string }>({ path: '' });
  useEffect(() => {
    if (!path) return;
    let live = true;
    api(path).then(
      (data) => {
        if (live) setState({ path, data });
      },
      (error) => {
        if (live) setState({ path, error: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [api, path, rev]);
  return state.path === path ? state : {};
}

const TAB_TITLES: Record<Tab, { parent: string; title: string }> = {
  promos: { parent: 'Products', title: 'Promotions & Discounts' },
  signatures: { parent: 'Orders', title: 'Quote E-Signatures' },
  commissions: { parent: 'Reporting', title: 'Sales Commissions' },
  shipping: { parent: 'Configuration', title: 'Shipping Methods' },
  matrix: { parent: 'Products', title: 'Product Variant Matrix' },
  warnings: { parent: 'Configuration', title: 'Order Warnings' },
};

export function SalesParityPanel({
  api,
  writable,
  initialTab = 'promos',
}: {
  api: API;
  writable: boolean;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rev, setRev] = useState(0);
  const [notice, setNotice] = useState('');
  const [matrixResult, setMatrixResult] = useState<any>(null);

  useEffect(() => {
    setTab(initialTab);
    setNotice('');
  }, [initialTab]);

  const promos = useSalesData(api, '/sales/promos', rev);
  const signatures = useSalesData(api, '/sales/signatures', rev);
  const commissions = useSalesData(api, '/sales/commissions/plans', rev);
  const shipping = useSalesData(api, '/sales/shipping-methods', rev);
  const warnings = useSalesData(api, '/sales/warnings', rev);

  const refresh = (msg: string) => {
    setRev((n) => n + 1);
    setNotice(msg);
  };

  const meta = TAB_TITLES[tab];

  return (
    <div className="stack">
      <AppControlPanel
        parent={meta.parent}
        title={meta.title}
        views={[
          { id: 'promos', label: 'Promos' },
          { id: 'signatures', label: 'E-Signatures' },
          { id: 'commissions', label: 'Commissions' },
          { id: 'shipping', label: 'Shipping' },
          { id: 'matrix', label: 'Variant Matrix' },
          { id: 'warnings', label: 'Warnings' },
        ]}
        activeView={tab}
        onViewChange={(id) => {
          setTab(id as Tab);
          setNotice('');
        }}
      />
      <KpiStrip
        items={[
          { label: 'Active Promos', value: (promos.data?.data || []).length },
          { label: 'Signed Quotes', value: (signatures.data?.data || []).length, delta: 'SHA-256' },
          { label: 'Commission Plans', value: (commissions.data?.data || []).length },
          { label: 'Shipping Rules', value: (shipping.data?.data || []).length },
          { label: 'Sales Warnings', value: (warnings.data?.data || []).length },
        ]}
      />
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}

      {tab === 'promos' && (
        <div className="ac-split-grid">
          <section className="panel">
            <h3>Promo Codes &amp; Loyalty Discounts</h3>
            <div className="ac-record-list">
              {(promos.data?.data || []).map((p: any) => (
                <div className="ac-record-row" key={p.id}>
                  <div className="ac-record-main">
                    <span className="ac-record-title">
                      <code>{p.code}</code> · {p.name}
                    </span>
                    <span className="ac-record-meta">
                      {p.discount_type} · Uses: {p.uses_count || 0}
                    </span>
                  </div>
                  <span className="badge">{p.status}</span>
                </div>
              ))}
            </div>
          </section>
          {writable && (
            <section className="panel">
              <h3>New Promo Code</h3>
              <Form
                label="Create promo code"
                submit={async (d) => {
                  await api('/sales/promos', 'POST', {
                    code: d.code,
                    name: d.name,
                    currency: d.currency || 'KES',
                    discount_type: 'percent_bps',
                    value: Math.round(Number(d.pct || 10) * 100),
                    min_order_minor: Math.round(Number(d.min_order || 0) * 100),
                    valid_until: d.valid_until || null,
                  });
                  refresh('Promo code created.');
                }}
              >
                <Field name="code" label="Promo code" defaultValue="SAVE15" required />
                <Field name="name" label="Campaign name" defaultValue="15% Seasonal Discount" required />
                <Field name="pct" label="Discount (%)" type="number" defaultValue="15" required />
                <Field name="min_order" label="Minimum order" type="number" defaultValue="5000" />
                <Field name="valid_until" label="Valid until" type="date" defaultValue={today()} />
              </Form>
            </section>
          )}
        </div>
      )}

      {tab === 'signatures' && (
        <div className="ac-split-grid">
          <section className="panel">
            <h3>Electronically Signed Quotations</h3>
            <div className="ac-record-list">
              {(signatures.data?.data || []).map((s: any) => (
                <div className="ac-record-row" key={s.id}>
                  <div className="ac-record-main">
                    <span className="ac-record-title">
                      {s.quotation_ref} · {s.signer_name}
                    </span>
                    <span className="ac-record-meta">
                      {money(s.agreed_total_minor, s.currency)} · SHA-256: <code>{String(s.signature_sha256).slice(0, 14)}</code>
                    </span>
                  </div>
                  <span className="badge">{s.status}</span>
                </div>
              ))}
            </div>
          </section>
          {writable && (
            <section className="panel">
              <h3>Record Online Quote E-Signature</h3>
              <Form
                label="Sign quotation"
                submit={async (d) => {
                  await api('/sales/signatures', 'POST', {
                    quotation_ref: d.ref,
                    signer_name: d.signer_name,
                    signer_email: d.signer_email,
                    agreed_total_minor: Math.round(Number(d.total || 0) * 100),
                    currency: d.currency || 'KES',
                    signature_text: d.signature_text,
                  });
                  refresh('Quotation electronically signed with SHA-256 proof.');
                }}
              >
                <Field name="ref" label="Quotation ref" defaultValue="QT-2026-001" required />
                <Field name="signer_name" label="Signer full name" defaultValue="Jane Wambui" required />
                <Field name="signer_email" label="Signer email" type="email" defaultValue="jane@client.test" required />
                <Field name="total" label="Agreed total" type="number" defaultValue="125000" required />
                <Field name="signature_text" label="Typed signature" defaultValue="/s/ Jane Wambui" required />
              </Form>
            </section>
          )}
        </div>
      )}

      {tab === 'commissions' && (
        <div className="ac-split-grid">
          <section className="panel">
            <h3>Commission Plans</h3>
            <div className="ac-record-list">
              {(commissions.data?.data || []).map((c: any) => (
                <div className="ac-record-row" key={c.id}>
                  <div className="ac-record-main">
                    <span className="ac-record-title">{c.name}</span>
                    <span className="ac-record-meta">
                      Quota: {money(c.quota_minor, c.currency)} · {(c.tiers || []).length} tier(s)
                    </span>
                  </div>
                  <span className="badge">{c.status}</span>
                </div>
              ))}
            </div>
          </section>
          {writable && (
            <section className="panel">
              <h3>New Commission Plan</h3>
              <Form
                label="Create commission plan"
                submit={async (d) => {
                  await api('/sales/commissions/plans', 'POST', {
                    name: d.name,
                    currency: d.currency || 'KES',
                    quota_minor: Math.round(Number(d.quota || 0) * 100),
                    tiers: [
                      { up_to_minor: Math.round(Number(d.quota || 100000) * 100), rate_bps: 500 },
                      { up_to_minor: null, rate_bps: 1000 },
                    ],
                  });
                  refresh('Tiered commission plan created.');
                }}
              >
                <Field name="name" label="Plan name" defaultValue="Field Sales Q4 Accelerator" required />
                <Field name="quota" label="Monthly quota" type="number" defaultValue="1000000" required />
                <Field name="currency" label="Currency" defaultValue="KES" required />
              </Form>
            </section>
          )}
        </div>
      )}

      {tab === 'shipping' && (
        <div className="ac-split-grid">
          <section className="panel">
            <h3>Shipping &amp; Delivery Methods</h3>
            <div className="ac-record-list">
              {(shipping.data?.data || []).map((s: any) => (
                <div className="ac-record-row" key={s.id}>
                  <div className="ac-record-main">
                    <span className="ac-record-title">
                      {s.name} ({s.carrier_name})
                    </span>
                    <span className="ac-record-meta">
                      Base: {money(s.base_fee_minor, s.currency)} · {s.pricing_mode}
                    </span>
                  </div>
                  <span className="badge">{s.status}</span>
                </div>
              ))}
            </div>
          </section>
          {writable && (
            <section className="panel">
              <h3>New Shipping Rule</h3>
              <Form
                label="Create shipping method"
                submit={async (d) => {
                  await api('/sales/shipping-methods', 'POST', {
                    name: d.name,
                    carrier_name: d.carrier,
                    currency: 'KES',
                    pricing_mode: 'weight_based',
                    base_fee_minor: Math.round(Number(d.base_fee || 0) * 100),
                    per_kg_minor: Math.round(Number(d.per_kg || 0) * 100),
                    free_over_minor: Math.round(Number(d.free_over || 0) * 100) || null,
                  });
                  refresh('Shipping rate rule created.');
                }}
              >
                <Field name="name" label="Method name" defaultValue="Same-Day Courier" required />
                <Field name="carrier" label="Carrier" defaultValue="AfriCore Fleet" required />
                <Field name="base_fee" label="Base fee" type="number" defaultValue="500" required />
                <Field name="per_kg" label="Per-kg fee" type="number" defaultValue="150" required />
                <Field name="free_over" label="Free shipping over" type="number" defaultValue="25000" />
              </Form>
            </section>
          )}
        </div>
      )}

      {tab === 'matrix' && (
        <section className="panel">
          <h3>Product Variant Matrix</h3>
          <Form
            label="Expand variant grid"
            submit={async (d) => {
              const res = await api('/sales/variant-matrix/expand', 'POST', {
                base_sku: d.sku,
                base_name: d.name,
                base_price_minor: Math.round(Number(d.price || 0) * 100),
                cells: [
                  { row_value: 'M', col_value: 'Black', quantity: Number(d.qty_m || 2), price_delta_minor: 0 },
                  { row_value: 'XL', col_value: 'Forest', quantity: Number(d.qty_xl || 3), price_delta_minor: 25000 },
                ],
              });
              setMatrixResult(res);
              refresh(`Expanded ${res.line_count} variant lines (${res.total_quantity} units).`);
            }}
          >
            <Field name="sku" label="Base SKU" defaultValue="POLO" required />
            <Field name="name" label="Product name" defaultValue="AfriCore Staff Polo" required />
            <Field name="price" label="Base price" type="number" defaultValue="2000" required />
            <Field name="qty_m" label="Qty (M / Black)" type="number" defaultValue="2" required />
            <Field name="qty_xl" label="Qty (XL / Forest)" type="number" defaultValue="3" required />
          </Form>
          {matrixResult && (
            <div className="ac-record-list">
              {(matrixResult.lines || []).map((l: any) => (
                <div className="ac-record-row" key={l.sku}>
                  <span className="ac-record-title">
                    <code>{l.sku}</code> · {l.description}
                  </span>
                  <span>
                    {l.quantity} × {money(l.unit_price_minor, 'KES')} = <strong>{money(l.line_total_minor, 'KES')}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'warnings' && (
        <div className="ac-split-grid">
          <section className="panel">
            <h3>Customer &amp; Product Sales Warnings</h3>
            <div className="ac-record-list">
              {(warnings.data?.data || []).map((w: any) => (
                <div className="ac-record-row" key={w.id}>
                  <div className="ac-record-main">
                    <span className="ac-record-title">
                      [{w.target_type}] {w.target_ref}
                    </span>
                    <span className="ac-record-meta">{w.message}</span>
                  </div>
                  <span className="badge">{w.severity}</span>
                </div>
              ))}
            </div>
          </section>
          {writable && (
            <section className="panel">
              <h3>Add Warning / Block Rule</h3>
              <Form
                label="Save warning rule"
                submit={async (d) => {
                  await api('/sales/warnings', 'POST', {
                    target_type: 'customer',
                    target_ref: d.target_ref,
                    severity: 'blocking',
                    message: d.message,
                  });
                  refresh('Sales warning rule saved.');
                }}
              >
                <Field name="target_ref" label="Customer / SKU ref" defaultValue="OVERDUE-CLIENT-01" required />
                <Field name="message" label="Warning / block message" defaultValue="Account on credit hold — require prepayment before confirming." required />
              </Form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
