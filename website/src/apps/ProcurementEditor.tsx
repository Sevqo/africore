import { useEffect, useState } from 'react';
import { Field, Form, factor, money, type API } from '../operations/UI';
import { Overlay } from '../components/Overlay';
import { parseMoney, currencyDigits } from '../../../src/finance/money';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';
const blankLine = () => ({
  id: crypto.randomUUID(), product_id: '', warehouse_id: null,
  quantity_milli: 1000, quantity_input: '1', unit_price_minor: 0, price_input: '0',
});
function editLines(values: any[] = [], currency = 'KES') {
  return values.map(({ product_snapshot, amount_minor, ordered_milli, ...line }: any) => ({
    ...line,
    quantity_input: displayQuantity(line.quantity_milli),
    price_input: ((line.unit_price_minor || 0) / factor(currency)).toFixed(currencyDigits[currency]),
  }));
}
export function ProcurementEditor({
  api,
  type,
  record,
  defaultSource,
  onSaved,
  onClose,
}: {
  api: API;
  type: string;
  record?: any;
  defaultSource?: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<any>({}),
    [lines, setLines] = useState<any[]>(
      editLines(record?.data.lines, record?.data.currency || 'KES').length
        ? editLines(record?.data.lines, record?.data.currency || 'KES')
        : ['agreement', 'template'].includes(type) ? [blankLine()] : [],
    ),
    [source, setSource] = useState(
      record?.data.request_id || record?.data.order_id || record?.data.bill_id || defaultSource || '',
    ),
    [selectedSupplier, setSelectedSupplier] = useState(record?.data.supplier_id || ''),
    [templateId, setTemplateId] = useState(record?.data.template_id || ''),
    [currency, setCurrency] = useState(record?.data.currency || 'KES'),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const list = (t: string) => api('/procurement?type=' + t + '&limit=100').then((r) => r.data);
    Promise.all([
      api('/records/customers?limit=100'),
      api('/products'),
      api('/inventory/warehouses').catch((error) => ({ data: [], error: error?.message || 'Inventory service is unavailable.' })),
      list('supplier'),
      list('price'),
      list('agreement'),
      list('template'),
      list(
        type === 'order'
          ? 'rfq'
          : type === 'credit'
            ? 'bill'
            : type === 'bill'
              ? 'order'
              : 'request',
      ),
    ])
      .then(([c, p, w, s, prices, agreements, templates, r]) => {
        if (!live) return;
        const activeProducts = (p.data || []).filter((prod: any) => prod.status === 'active');
        const activeWarehouses = (w.data || []).filter((wh: any) => wh.status === 'active');
        setChoices({
          contacts: c.data,
          products: p.data,
          warehouses: w.data,
          suppliers: s,
          prices,
          agreements,
          templates,
          warehouseError: w.error || '',
          sources: r,
        });
        if (!record && type === 'request' && activeProducts.length > 0) {
          setLines((current) =>
            current.length > 0
              ? current
              : [
                  {
                    ...blankLine(),
                    product_id: activeProducts[0].id,
                    warehouse_id: activeProducts[0].track_inventory
                      ? activeWarehouses[0]?.id || null
                      : null,
                  },
                ],
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [type]);
  useEffect(() => {
    if (
      !defaultSource ||
      record ||
      !['rfq', 'bill'].includes(type) ||
      lines.length ||
      !choices.sources?.length
    )
      return;
    const src = choices.sources.find((v: any) => v.id === defaultSource);
    if (!src) return;
    setCurrency(src.data.currency);
    setLines(editLines(src.data.lines, src.data.currency));
  }, [choices, defaultSource, type]);
  async function selectSource(value: string) {
    setSource(value);
    if (!value || !['rfq', 'bill', 'credit'].includes(type)) return;
    const src = choices.sources.find((v: any) => v.id === value);
    if (src) {
      setCurrency(src.data.currency);
      if (['rfq', 'bill'].includes(type)) setLines(editLines(src.data.lines, src.data.currency));
    }
  }
  function lineValues() {
    return lines
      .filter((line) => !!line.product_id)
      .map((line) => {
        const { quantity_input, price_input, ...rest } = line;
        return {
          ...rest,
          quantity_milli: quantityMilli(quantity_input ?? displayQuantity(line.quantity_milli)),
          unit_price_minor: parseMoney(
            price_input ?? String((line.unit_price_minor || 0) / factor(currency)),
            currency,
          ),
        };
      });
  }
  async function applySupplierDefaults(productId: string, supplierId = selectedSupplier, quantity = 1000) {
    if (!supplierId) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const matchPrice = (prices: any[]) => prices.filter((row: any) =>
      row.status === 'active' && row.data.product_id === productId &&
      row.data.supplier_id === supplierId && row.data.currency === currency &&
      (!row.data.valid_from || row.data.valid_from <= today) &&
      (!row.data.valid_to || row.data.valid_to >= today),
    ).sort((a: any, b: any) => b.data.minimum_quantity_milli - a.data.minimum_quantity_milli);
    let candidates = matchPrice(choices.prices || []);
    if (!candidates.some((row: any) => row.data.minimum_quantity_milli <= quantity)) {
      try {
        const result = await api('/procurement?type=price&supplier=' + encodeURIComponent(supplierId) + '&search=' + encodeURIComponent(productId) + '&limit=100');
        candidates = matchPrice(result.data || []);
        setChoices((current: any) => ({ ...current, prices: [...(current.prices || []).filter((row: any) => !candidates.some((found: any) => found.id === row.id)), ...candidates] }));
      } catch { return; }
    }
    const match = candidates.find((row: any) => row.data.minimum_quantity_milli <= quantity);
    if (!match) return;
    setLines((items) => items.map((line) => line.product_id === productId
      ? { ...line, unit_price_minor: match.data.unit_price_minor, price_input: (match.data.unit_price_minor / factor(currency)).toFixed(currencyDigits[currency]) }
      : line));
  }
  function applyTemplate(value: string) {
    setTemplateId(value);
    const template = (choices.templates || []).find((row: any) => row.id === value && row.status === 'active');
    if (!template) return;
    if (template.data.currency !== currency) {
      setError('This template uses ' + template.data.currency + '. Change the request currency before applying it.');
      return;
    }
    const compatible = lines.map((line) => {
      const preset = template.data.lines.find((item: any) => item.product_id === line.product_id);
      return preset ? {
        ...line,
        unit_price_minor: preset.unit_price_minor,
        price_input: (preset.unit_price_minor / factor(currency)).toFixed(currencyDigits[currency]),
        warehouse_id: preset.warehouse_id || line.warehouse_id,
      } : line;
    });
    setLines(compatible);
    if (template.data.supplier_id) setSelectedSupplier(template.data.supplier_id);
    setError('');
  }
  function applyAgreement(value: string) {
    const agreement = (choices.agreements || []).find((row: any) => row.id === value && row.status === 'confirmed');
    if (!agreement) return;
    if (agreement.data.currency !== currency) {
      setError('This agreement uses ' + agreement.data.currency + '. Change the request currency before applying it.');
      return;
    }
    setSelectedSupplier(agreement.data.supplier_id);
    setLines((current) => current.map((line) => {
      const preset = agreement.data.lines.find((item: any) => item.product_id === line.product_id);
      if (!preset) return line;
      const quantity = Math.min(line.quantity_milli, preset.quantity_milli);
      return {
        ...line,
        quantity_milli: quantity,
        quantity_input: displayQuantity(quantity),
        unit_price_minor: preset.unit_price_minor,
        price_input: (preset.unit_price_minor / factor(currency)).toFixed(currencyDigits[currency]),
        warehouse_id: preset.warehouse_id,
      };
    }));
    setError('');
  }
  return (
    <Overlay onClose={onClose}>
      <section
        className="panel work-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-editor-title"
      >
        <h2 id="purchase-editor-title">
          {record ? 'Revise' : 'Create'} {type === 'rfq' ? 'supplier offer' : type}
        </h2>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <p>
          Review manually recorded facts. Saving does not send an order, pay a supplier or approve a
          financial entry.
        </p>
        {choices.warehouseError && (
          <p className="alert error" role="alert">
            Inventory warehouse lookup failed: {choices.warehouseError} Tracked goods need an active receiving warehouse. Activate Inventory or configure a warehouse before saving those lines; untracked service lines remain available.
          </p>
        )}
        <Form
          submit={async (d) => {
            if (error) throw new Error(error);
            const common = { type };
            let value: any;
            if (type === 'supplier')
              value = {
                ...common,
                contact_id: d.contact,
                terms: d.terms,
                lead_days: Number(d.lead),
                active: d.active === 'on',
              };
            else if (type === 'price')
              value = {
                ...common,
                supplier_id: d.supplier,
                product_id: d.product,
                vendor_sku: d.sku,
                currency,
                minimum_quantity_milli: quantityMilli(String(d.minimum_quantity)),
                unit_price_minor: parseMoney(String(d.unit_price), currency),
                lead_days: Number(d.lead_days),
                valid_from: d.valid_from || null,
                valid_to: d.valid_to || null,
              };
            else if (type === 'agreement')
              value = {
                ...common,
                title: d.title,
                supplier_id: d.supplier,
                currency,
                valid_from: d.valid_from,
                valid_to: d.valid_to,
                terms: d.terms,
                lines: lineValues(),
              };
            else if (type === 'template')
              value = {
                ...common,
                title: d.title,
                supplier_id: d.supplier || null,
                currency,
                payment_terms: d.payment_terms,
                terms: d.terms,
                lines: lineValues(),
                active: d.active === 'on',
              };
            else if (type === 'request')
              value = {
                ...common,
                title: d.title,
                reason: d.reason,
                currency,
                budget_minor: parseMoney(String(d.budget), currency),
                needed_on: d.needed,
                lines: lineValues(),
                suggestion_id: record?.data.suggestion_id || null,
              };
            else if (type === 'rfq')
              value = {
                ...common,
                request_id: source,
                supplier_id: d.supplier,
                reference: d.reference,
                vendor_reference: d.vendor_reference || '',
                currency,
                delivery_on: d.delivery,
                deadline_on: d.deadline || null,
                payment_terms: d.payment_terms || '',
                agreement_id: d.agreement || null,
                template_id: d.template || null,
                terms: d.terms,
                tax_minor: parseMoney(String(d.tax), currency),
                lines: lineValues(),
              };
            else if (type === 'order')
              value = { ...common, rfq_id: d.source, reference: d.reference };
            else if (type === 'bill')
              value = {
                ...common,
                order_id: source,
                reference: d.reference,
                issued_on: d.issued,
                due_on: d.due,
                tax_minor: parseMoney(String(d.tax), currency),
                variance_reason: d.reason,
                lines: lineValues(),
              };
            else
              value = {
                ...common,
                bill_id: d.source,
                reference: d.reference,
                issued_on: d.issued,
                amount_minor: parseMoney(String(d.amount), currency),
                reason: d.reason,
              };
            await api(
              '/procurement' + (record ? '/' + type + '/' + record.id : ''),
              record ? 'PUT' : 'POST',
              { expected_version: record?.version || 0, record: value },
            );
            onSaved();
          }}
        >
          {type === 'supplier' ? (
            <>
              <Field label="Shared contact">
                <select name="contact" required defaultValue={record?.data.contact_id}>
                  <option value="">Choose an existing contact</option>
                  {choices.contacts?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p>
                Add suppliers through the shared Customers service first. Supplier profiles reuse
                that contact.
              </p>
              <Field label="Payment and delivery terms">
                <textarea name="terms" defaultValue={record?.data.terms} />
              </Field>
              <Field label="Lead time in days">
                <input
                  name="lead"
                  type="number"
                  min={0}
                  max={3650}
                  defaultValue={record?.data.lead_days || 0}
                  required
                />
              </Field>
              <label className="checkbox-field">
                <input name="active" type="checkbox" defaultChecked={record?.data.active ?? true} />
                Active supplier
              </label>
            </>
          ) : type === 'price' ? (
            <>
              <Field label="Shared vendor">
                <select name="supplier" required defaultValue={record?.data.supplier_id}>
                  <option value="">Choose active vendor</option>
                  {choices.suppliers?.filter((s: any) => s.status === 'active').map((s: any) => (
                    <option key={s.id} value={s.id}>{s.data.contact_snapshot?.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Shared product">
                <select name="product" required defaultValue={record?.data.product_id}>
                  <option value="">Choose product</option>
                  {choices.products?.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.unit}</option>)}
                </select>
              </Field>
              <Field label="Vendor product code"><input name="sku" maxLength={120} defaultValue={record?.data.vendor_sku || ''} /></Field>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Minimum quantity">
                <input name="minimum_quantity" type="number" min="0.001" step="0.001" defaultValue={displayQuantity(record?.data.minimum_quantity_milli || 1000)} required />
              </Field>
              <Field label={'Unit price (' + currency + ')'}>
                <input name="unit_price" type="number" min="0" step={1 / factor(currency)} defaultValue={((record?.data.unit_price_minor || 0) / factor(currency)).toFixed(currencyDigits[currency])} required />
              </Field>
              <Field label="Lead time in days"><input name="lead_days" type="number" min="0" max="3650" defaultValue={record?.data.lead_days || 0} required /></Field>
              <Field label="Valid from (optional)"><input name="valid_from" type="date" defaultValue={record?.data.valid_from || ''} /></Field>
              <Field label="Valid through (optional)"><input name="valid_to" type="date" defaultValue={record?.data.valid_to || ''} /></Field>
            </>
          ) : type === 'agreement' || type === 'template' ? (
            <>
              <Field label={type === 'agreement' ? 'Agreement title' : 'Template name'}>
                <input name="title" required minLength={2} maxLength={500} defaultValue={record?.data.title} />
              </Field>
              <Field label={type === 'agreement' ? 'Shared vendor' : 'Preferred vendor (optional)'}>
                <select name="supplier" required={type === 'agreement'} defaultValue={record?.data.supplier_id || ''}>
                  <option value="">{type === 'agreement' ? 'Choose active vendor' : 'Any vendor'}</option>
                  {choices.suppliers?.filter((s: any) => s.status === 'active').map((s: any) => <option key={s.id} value={s.id}>{s.data.contact_snapshot?.name}</option>)}
                </select>
              </Field>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              {type === 'agreement' ? (
                <>
                  <Field label="Valid from"><input name="valid_from" type="date" required defaultValue={record?.data.valid_from} /></Field>
                  <Field label="Valid to"><input name="valid_to" type="date" required defaultValue={record?.data.valid_to} /></Field>
                </>
              ) : (
                <>
                  <Field label="Payment terms"><input name="payment_terms" maxLength={1000} defaultValue={record?.data.payment_terms} /></Field>
                  <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={record?.data.active ?? true} />Active template</label>
                </>
              )}
              <Field label="Terms and notes"><textarea name="terms" maxLength={2000} defaultValue={record?.data.terms} /></Field>
            </>
          ) : (
            <>
              {type === 'request' ? (
                <>
                  <Field label="Purchase request title">
                    <input
                      name="title"
                      defaultValue={record?.data.title}
                      required
                      maxLength={500}
                    />
                  </Field>
                  <Field label={'Proposed spending ceiling (' + currency + ')'}>
                    <input
                      name="budget"
                      type="number"
                      min={0}
                      step={1 / factor(currency)}
                      max={100000000000 / factor(currency)}
                      defaultValue={((record?.data.budget_minor || 0) / factor(currency)).toFixed(currencyDigits[currency])}
                      required
                    />
                  </Field>
                  <Field label="Needed on">
                    <input
                      name="needed"
                      type="date"
                      defaultValue={record?.data.needed_on}
                      required
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field
                    label={
                      type === 'rfq'
                        ? 'Approved purchase request'
                        : type === 'order'
                          ? 'Accepted supplier offer'
                          : type === 'bill'
                            ? 'Issued purchase order'
                            : 'Approved supplier bill'
                    }
                  >
                    <select
                      name="source"
                      required
                      value={['rfq', 'bill'].includes(type) ? source : undefined}
                      onChange={(e) => selectSource(e.target.value)}
                      defaultValue={
                        ['rfq', 'bill'].includes(type)
                          ? undefined
                          : record?.data.rfq_id || record?.data.bill_id || source || ''
                      }
                    >
                      <option value="">Choose a reviewed source</option>
                      {choices.sources
                        ?.filter((r: any) =>
                          type === 'order'
                            ? r.status === 'accepted'
                            : type === 'bill'
                              ? ['issued', 'confirmed', 'cancelled'].includes(r.status)
                              : r.status === 'approved',
                        )
                        .map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.data.title || r.data.reference} · {r.status}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={type === 'rfq' ? 'Internal quotation reference' : type === 'order' ? 'Purchase order reference' : 'Supplier document reference'}>
                    <input
                      name="reference"
                      defaultValue={record?.data.reference}
                      required
                      minLength={2}
                      maxLength={500}
                    />
                  </Field>
                </>
              )}
              {type === 'rfq' && (
                <>
                  <Field label="Supplier">
                    <select name="supplier" required value={selectedSupplier} onChange={(e) => {
                      const supplierId = e.target.value;
                      setSelectedSupplier(supplierId);
                      lines.forEach((line) => line.product_id && applySupplierDefaults(line.product_id, supplierId, line.quantity_milli));
                    }}>
                      <option value="">Choose active supplier</option>
                      {choices.suppliers
                        ?.filter((s: any) => s.status === 'active')
                        .map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.data.contact_snapshot.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Vendor quotation reference">
                    <input name="vendor_reference" maxLength={200} defaultValue={record?.data.vendor_reference || ''} />
                  </Field>
                  <Field label="Order deadline (optional)">
                    <input name="deadline" type="date" defaultValue={record?.data.deadline_on || ''} />
                  </Field>
                  <Field label="Purchase agreement (optional)">
                    <select name="agreement" defaultValue={record?.data.agreement_id || ''} onChange={(e) => applyAgreement(e.target.value)}>
                      <option value="">No agreement</option>
                      {choices.agreements?.filter((a: any) => a.status === 'confirmed').map((a: any) => <option key={a.id} value={a.id}>{a.data.title} · {a.data.supplier_snapshot?.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Purchase template (optional)">
                    <select name="template" value={templateId} disabled={!source} onChange={(e) => applyTemplate(e.target.value)}>
                      <option value="">No template</option>
                      {choices.templates?.filter((t: any) => t.status === 'active' && t.data.currency === currency && (!t.data.supplier_id || !selectedSupplier || t.data.supplier_id === selectedSupplier)).map((t: any) => <option key={t.id} value={t.id}>{t.data.title}</option>)}
                    </select>
                    {!source && <small>Choose the approved request first so the template can fill its matching lines.</small>}
                  </Field>
                  <Field label="Payment terms">
                    <input name="payment_terms" maxLength={1000} defaultValue={record?.data.payment_terms || ''} />
                  </Field>
                  <Field label="Offered delivery date">
                    <input
                      name="delivery"
                      type="date"
                      defaultValue={record?.data.delivery_on}
                      required
                    />
                  </Field>
                  <Field label="Offered terms">
                    <textarea name="terms" defaultValue={record?.data.terms} />
                  </Field>
                </>
              )}
              {['bill', 'credit'].includes(type) && (
                <Field label="Supplier issue date">
                  <input name="issued" type="date" defaultValue={record?.data.issued_on} required />
                </Field>
              )}
              {type === 'bill' && (
                <Field label="Bill due date">
                  <input name="due" type="date" defaultValue={record?.data.due_on} required />
                </Field>
              )}
              {type === 'credit' && (
                <Field label={'Credit amount (' + currency + ')'}>
                  <input
                    name="amount"
                    type="number"
                    min={1}
                    step={1 / factor(currency)}
                    max={100000000000 / factor(currency)}
                    defaultValue={record?.data.amount_minor === undefined ? undefined : (record.data.amount_minor / factor(currency)).toFixed(currencyDigits[currency])}
                    required
                  />
                </Field>
              )}
              {['request', 'rfq', 'bill', 'agreement', 'template'].includes(type) && (
                <>
                  <Field label="Currency">
                    <select
                      value={currency}
                      disabled={!['request', 'agreement', 'template'].includes(type)}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  {lines.map((l, i) => (
                    <fieldset key={l.id}>
                      <legend>Purchase line {i + 1}</legend>
                      <Field label="Shared product">
                        <select
                          value={l.product_id}
                          required
                          disabled={!['request', 'agreement', 'template'].includes(type)}
                          onChange={(e) => {
                            const productId = e.target.value;
                            const chosenProduct = choices.products?.find((p: any) => p.id === productId);
                            const defaultWh = chosenProduct?.track_inventory
                              ? choices.warehouses?.find((w: any) => w.status === 'active')?.id || null
                              : null;
                            setLines((v) =>
                              v.map((n) =>
                                n.id === l.id ? { ...n, product_id: productId, warehouse_id: defaultWh } : n,
                              ),
                            );
                            if (productId && ['rfq', 'agreement', 'template'].includes(type))
                              applySupplierDefaults(productId);
                          }}
                        >
                          <option value="">Choose product</option>
                          {choices.products?.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.unit}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Receiving warehouse for tracked goods">
                        <select
                          value={l.warehouse_id || ''}
                          required={!!choices.products?.find((p: any) => p.id === l.product_id)?.track_inventory}
                          disabled={!['request', 'agreement', 'template'].includes(type)}
                          onChange={(e) =>
                            setLines((v) =>
                              v.map((n) =>
                                n.id === l.id ? { ...n, warehouse_id: e.target.value || null } : n,
                              ),
                            )
                          }
                        >
                          <option value="">{choices.products?.find((p: any) => p.id === l.product_id)?.track_inventory ? 'Choose receiving warehouse' : 'Untracked service'}</option>
                          {choices.warehouses?.map((w: any) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={'Quantity (' + (choices.products?.find((p: any) => p.id === l.product_id)?.unit || 'unit') + ')'}>
                        <input
                          type="number"
                          value={l.quantity_input ?? displayQuantity(l.quantity_milli)}
                          min={1}
                          max={100000000}
                          step="0.001"
                          required
                          onChange={(e) => setLines((v) => v.map((n) => n.id === l.id ? { ...n, quantity_input: e.target.value } : n))}
                          onBlur={() => {
                            try {
                              const value = quantityMilli(l.quantity_input);
                              setLines((v) => v.map((n) => n.id === l.id ? { ...n, quantity_milli: value, quantity_input: displayQuantity(value) } : n));
                              setError('');
                              if (l.product_id) applySupplierDefaults(l.product_id, selectedSupplier, value);
                            } catch (error) { setError((error as Error).message); }
                          }}
                        />
                      </Field>
                      <Field label={'Price per unit (' + currency + ')'}>
                        <input
                          type="number"
                          value={l.price_input ?? (l.unit_price_minor / factor(currency)).toFixed(currencyDigits[currency])}
                          min={0}
                          max={100000000000 / factor(currency)}
                          step={1 / factor(currency)}
                          required
                          onChange={(e) => setLines((v) => v.map((n) => n.id === l.id ? { ...n, price_input: e.target.value } : n))}
                          onBlur={() => {
                            try {
                              const value = parseMoney(l.price_input ?? '0', currency);
                              setLines((v) => v.map((n) => n.id === l.id ? { ...n, unit_price_minor: value, price_input: (value / factor(currency)).toFixed(currencyDigits[currency]) } : n));
                              setError('');
                            } catch (error) { setError((error as Error).message); }
                          }}
                        />
                      </Field>
                      {['request', 'agreement', 'template'].includes(type) && (
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => setLines((v) => v.filter((n) => n.id !== l.id))}
                        >
                          Remove line
                        </button>
                      )}
                    </fieldset>
                  ))}
                  {['request', 'agreement', 'template'].includes(type) && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setLines((v) => [
                          ...v,
                          {
                            ...blankLine(),
                          },
                        ])
                      }
                    >
                      Add purchase line
                    </button>
                  )}
                  <p>
                    Subtotal shown:{' '}
                    {money(
                      lines.reduce(
                        (n, l) => n + Math.round((l.quantity_milli * l.unit_price_minor) / 1000),
                        0,
                      ),
                      currency,
                    )}
                    . The server checks exact integer rounding.
                  </p>
                </>
              )}
              {['rfq', 'bill'].includes(type) && (
                <Field label={'Total supplier tax (' + currency + ')'}>
                  <input
                    name="tax"
                    type="number"
                    min={0}
                    max={100000000000 / factor(currency)}
                    step={1 / factor(currency)}
                    defaultValue={((record?.data.tax_minor || 0) / factor(currency)).toFixed(currencyDigits[currency])}
                    required
                  />
                </Field>
              )}
              {['request', 'bill', 'credit'].includes(type) && (
                <Field
                  label={
                    type === 'bill'
                      ? 'Price or tax variance explanation (when applicable)'
                      : 'Business reason'
                  }
                >
                  <textarea
                    name="reason"
                    required={type !== 'bill'}
                    minLength={type === 'bill' ? 0 : 8}
                    maxLength={1000}
                    defaultValue={record?.data.reason || record?.data.variance_reason}
                  />
                </Field>
              )}
            </>
          )}
          <button className="button">
            Save {type === 'supplier' ? 'supplier profile' : 'draft for review'}
          </button>
        </Form>
        <button className="secondary-button" onClick={onClose}>
          Cancel editing
        </button>
      </section>
    </Overlay>
  );
}
