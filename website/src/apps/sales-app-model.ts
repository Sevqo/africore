/** Pure Sales-app projections. Financial values stay integer minor units. */
export type SalesRecord = Record<string, any>;

export const quotationFilters = [
  { id: 'all', label: 'All quotations' },
  { id: 'draft', label: 'Draft quotations' },
  { id: 'shared', label: 'Sent quotations' },
  { id: 'accepted', label: 'Accepted quotations' },
  { id: 'converted', label: 'Converted to orders' },
  { id: 'to_invoice', label: 'To invoice' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

export const orderFilters = [
  { id: 'all', label: 'All orders' },
  { id: 'to_deliver', label: 'To deliver' },
  { id: 'to_invoice', label: 'To invoice' },
  { id: 'confirmed', label: 'Confirmed orders' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

export type QuotationFilter = (typeof quotationFilters)[number]['id'];
export type OrderFilter = (typeof orderFilters)[number]['id'];

export function activeInvoice(invoice: SalesRecord) {
  return invoice.status !== 'voided';
}

export function invoiceForOrder(invoices: SalesRecord[], orderId?: string | null) {
  if (!orderId) return null;
  return invoices.find((invoice) => invoice.order_id === orderId && activeInvoice(invoice)) || null;
}

export function orderIsConfirmed(order: SalesRecord) {
  return order.status !== 'draft' && order.status !== 'cancelled';
}

export function orderIsOpenForDelivery(order: SalesRecord) {
  return (
    orderIsConfirmed(order) &&
    order.fulfillment_status !== 'fulfilled' &&
    order.fulfillment_status !== 'cancelled'
  );
}

export function orderNeedsInvoice(order: SalesRecord, invoices: SalesRecord[]) {
  return orderIsConfirmed(order) && !invoiceForOrder(invoices, order.id);
}

export function quotationInvoiceState(quotation: SalesRecord, invoices: SalesRecord[]) {
  if (!quotation.order_id) return 'Nothing to invoice';
  const invoice = invoiceForOrder(invoices, quotation.order_id);
  if (!invoice) return 'To invoice';
  if (invoice.status === 'draft') return 'Draft invoice';
  return invoice.status.replaceAll('_', ' ');
}

export function salesDashboard(quotations: SalesRecord[], orders: SalesRecord[], invoices: SalesRecord[]) {
  return {
    toConfirm: quotations.filter((q) => ['draft', 'shared'].includes(q.status)).length,
    toDeliver: orders.filter(orderIsOpenForDelivery).length,
    toInvoice: orders.filter((order) => orderNeedsInvoice(order, invoices)).length,
  };
}

export function searchQuotations(
  quotations: SalesRecord[],
  query: string,
  customers: SalesRecord[],
  filter: QuotationFilter,
  invoices: SalesRecord[] = [],
) {
  const needle = query.trim().toLowerCase();
  return quotations.filter((quotation) => {
    const customer = customers.find((row) => row.id === quotation.customer_id);
    const text = `${quotation.reference || ''} ${quotation.order_id || ''} ${customer?.name || ''}`.toLowerCase();
    if (needle && !text.includes(needle)) return false;
    if (filter === 'all') return true;
    if (filter === 'to_invoice') {
      return quotation.status === 'converted' && quotationInvoiceState(quotation, invoices) === 'To invoice';
    }
    if (filter === 'cancelled') return quotation.status === 'cancelled';
    return quotation.status === filter;
  });
}

export function searchOrders(orders: SalesRecord[], query: string, customers: SalesRecord[], invoices: SalesRecord[], filter: OrderFilter) {
  const needle = query.trim().toLowerCase();
  return orders.filter((order) => {
    const customer = customers.find((row) => row.id === order.customer_id);
    const text = `${order.number || order.reference || ''} ${order.customer_id || ''} ${customer?.name || ''}`.toLowerCase();
    if (needle && !text.includes(needle)) return false;
    switch (filter) {
      case 'all':
        return true;
      case 'to_deliver':
        return orderIsOpenForDelivery(order);
      case 'to_invoice':
        return orderNeedsInvoice(order, invoices);
      case 'confirmed':
        return orderIsConfirmed(order);
      case 'cancelled':
        return order.status === 'cancelled';
      default:
        return true;
    }
  });
}

export function pageOf<T>(rows: T[], page: number, size = 20) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}

export function sumByCurrency(rows: SalesRecord[], amount: (row: SalesRecord) => number) {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = row.currency || 'KES';
    totals[currency] = (totals[currency] || 0) + Number(amount(row) || 0);
  }
  return totals;
}

export function formatTotals(totals: Record<string, number>, format: (amount: number, currency: string) => string) {
  const entries = Object.entries(totals);
  if (!entries.length) return '—';
  return entries.map(([currency, amount]) => format(amount, currency)).join(' · ');
}

export function withinDays(date: string | undefined, days: number, today: string) {
  if (!date) return false;
  const end = Date.parse(today + 'T00:00:00Z');
  const start = end - days * 86400000;
  const value = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(value) && value >= start && value <= end;
}

export function confirmedOrdersInRange(orders: SalesRecord[], days: number, today: string) {
  return orders.filter((order) => orderIsConfirmed(order) && withinDays(order.issue_date, days, today));
}

export function confirmedOrdersBetween(orders: SalesRecord[], from: string, to: string) {
  const start = Date.parse(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  return orders.filter((order) => {
    if (!orderIsConfirmed(order)) return false;
    const value = Date.parse(String(order.issue_date || '') + 'T00:00:00Z');
    return Number.isFinite(value) && value >= start && value <= end;
  });
}

export function salesComparison(orders: SalesRecord[], days: number, today: string) {
  const end = new Date(today + 'T00:00:00Z');
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
  const current = confirmedOrdersBetween(orders, start.toISOString().slice(0, 10), today);
  const previous = confirmedOrdersBetween(
    orders,
    previousStart.toISOString().slice(0, 10),
    previousEnd.toISOString().slice(0, 10),
  );
  return { current, previous };
}

export function toMinor(text: string, currency: string) {
  const clean = String(text ?? '').replace(/,/g, '').trim();
  if (!clean) return 0;
  const value = Number(clean);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * (['UGX', 'RWF'].includes(currency) ? 1 : 100));
}

export function quantityValue(text: string) {
  const value = Number(String(text ?? '').trim());
  return Number.isFinite(value) ? value : NaN;
}

export function lineAmountMinor(quantity: number, unitPriceMinor: number) {
  return Math.floor((Math.round(quantity * 1000) * unitPriceMinor + 500) / 1000);
}

export function documentTotals(lines: { quantity: number; priceMinor: number }[], discountMinor: number, taxBps: number) {
  const subtotal = lines.reduce((sum, line) => sum + lineAmountMinor(line.quantity, line.priceMinor), 0);
  const discount = Math.min(Math.max(0, discountMinor || 0), subtotal);
  const taxable = subtotal - discount;
  const tax = Math.floor((taxable * taxBps + 5000) / 10000);
  return { subtotal, discount, tax, total: taxable + tax };
}

export function monthKey(date: string | undefined) {
  return String(date || '').slice(0, 7);
}

export function reportSeries(orders: SalesRecord[], months = 6) {
  const groups = new Map<string, { month: string; orders: number; value: number }>();
  for (const order of orders.filter(orderIsConfirmed)) {
    const month = monthKey(order.issue_date);
    if (!month) continue;
    const row = groups.get(month) || { month, orders: 0, value: 0 };
    row.orders += 1;
    row.value += Number(order.total_minor || 0);
    groups.set(month, row);
  }
  return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-months);
}

export function salesSummary(orders: SalesRecord[]) {
  const confirmed = orders.filter(orderIsConfirmed);
  const totals = sumByCurrency(confirmed, (order) => order.total_minor);
  const amount = Object.values(totals)[0] || 0;
  return {
    orders: confirmed.length,
    totals,
    average: confirmed.length ? Math.round(amount / confirmed.length) : 0,
  };
}

export function reportByCustomer(orders: SalesRecord[], customers: SalesRecord[]) {
  const groups = new Map<string, { name: string; orders: number; value: number; currency: string }>();
  for (const order of orders.filter(orderIsConfirmed)) {
    const name = customers.find((row) => row.id === order.customer_id)?.name || 'Shared customer';
    const key = `${order.customer_id || name}:${order.currency || 'KES'}`;
    const row = groups.get(key) || { name, orders: 0, value: 0, currency: order.currency || 'KES' };
    row.orders += 1;
    row.value += Number(order.total_minor || 0);
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

export function reportByProduct(orders: SalesRecord[]) {
  const groups = new Map<string, { name: string; quantity: number; orders: number; value: number; currency: string }>();
  for (const order of orders.filter(orderIsConfirmed)) {
    const currency = order.currency || 'KES';
    for (const item of order.items || []) {
      const name = item.description || 'Line item';
      const key = `${name}:${currency}`;
      const row = groups.get(key) || { name, quantity: 0, orders: 0, value: 0, currency };
      row.quantity += Number(item.quantity || 0);
      row.value += Math.round(Number(item.quantity || 0) * Number(item.unit_price_minor || 0));
      row.orders += 1;
      groups.set(key, row);
    }
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

export function reportByStatus(orders: SalesRecord[]) {
  const groups = new Map<string, { status: string; orders: number; value: number; currency: string }>();
  for (const order of orders) {
    const status = `${order.status || 'unknown'} · ${order.fulfillment_status || 'unfulfilled'}`;
    const key = `${status}:${order.currency || 'KES'}`;
    const row = groups.get(key) || { status, orders: 0, value: 0, currency: order.currency || 'KES' };
    row.orders += 1;
    row.value += Number(order.total_minor || 0);
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.orders - a.orders);
}

export function monthGrid(month: string, records: SalesRecord[], dateField: string) {
  const first = new Date(month + '-01T00:00:00Z');
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const byDay = new Map<string, SalesRecord[]>();
  for (const record of records) {
    const day = String(record[dateField] || '').slice(0, 10);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) || []), record]);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    return { date: day, inMonth: day.slice(0, 7) === month, records: byDay.get(day) || [] };
  });
}

export function groupQuotations(quotations: SalesRecord[], customers: SalesRecord[], groupBy: string) {
  const groups = new Map<string, SalesRecord[]>();
  for (const quotation of quotations) {
    const customer = customers.find((row) => row.id === quotation.customer_id)?.name || 'Shared customer';
    const key =
      groupBy === 'customer'
        ? customer
        : groupBy === 'status'
          ? quotation.status
          : groupBy === 'issue_date'
            ? quotation.issue_date || 'No issue date'
            : 'All quotations';
    groups.set(key, [...(groups.get(key) || []), quotation]);
  }
  return [...groups.entries()];
}

export function salespersonCoverage() {
  return 'Quotation ownership is not exposed by the current Sales API. Salesperson filters, commissions and salesperson reports are therefore not shown.';
}
