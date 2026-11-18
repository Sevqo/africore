export const procurementSections = [
  { label: 'Purchase', section: 'dashboard' },
  { label: 'Orders', section: 'orders' },
  { label: 'Products', section: 'products' },
  { label: 'Reporting', section: 'reporting' },
  { label: 'Configuration', section: 'configuration' },
];

export const procurementViews = [
  'dashboard',
  'requests',
  'rfqs',
  'orders',
  'approvals',
  'receipts',
  'bills',
  'payments',
  'credits',
  'agreements',
  'templates',
  'vendors',
  'products',
  'pricelists',
  'replenishment',
  'analysis',
  'vendor-report',
  'product-report',
  'approval-report',
  'receipt-report',
  'settings',
] as const;

export type ProcurementView = (typeof procurementViews)[number];

export const defaultViewForSection: Record<string, ProcurementView> = {
  dashboard: 'dashboard',
  orders: 'rfqs',
  products: 'products',
  reporting: 'analysis',
  configuration: 'settings',
};

export const viewsForSection: Record<string, ProcurementView[]> = {
  dashboard: ['dashboard'],
  orders: [
    'requests',
    'rfqs',
    'orders',
    'approvals',
    'receipts',
    'bills',
    'payments',
    'credits',
    'vendors',
    'agreements',
  ],
  products: ['products', 'pricelists', 'replenishment'],
  reporting: ['analysis', 'vendor-report', 'product-report', 'approval-report', 'receipt-report'],
  configuration: ['settings', 'templates'],
};

export function sectionForView(view: ProcurementView): string {
  return (
    procurementSections.find((item) => viewsForSection[item.section]?.includes(view))?.section ||
    'dashboard'
  );
}

export const procurementViewTitles: Record<ProcurementView, string> = {
  dashboard: 'Purchase',
  requests: 'Purchase Requests',
  rfqs: 'Requests for Quotation',
  orders: 'Purchase Orders',
  approvals: 'Awaiting Approval',
  receipts: 'Receipts',
  bills: 'Vendor Bills',
  payments: 'Payment Observations',
  credits: 'Supplier Credits',
  agreements: 'Purchase Agreements',
  templates: 'Purchase Templates',
  vendors: 'Vendors',
  products: 'Products',
  pricelists: 'Vendor Pricelists',
  replenishment: 'Replenishment Requirements',
  analysis: 'Purchase Analysis',
  'vendor-report': 'Purchases by Vendor',
  'product-report': 'Purchases by Product',
  'approval-report': 'Approval Performance',
  'receipt-report': 'Receipt Performance',
  settings: 'Purchasing Settings',
};

export const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for approval',
  rejected: 'Rejected',
  approved: 'Awaiting Issue',
  accepted: 'Accepted',
  issued: 'Purchase Order',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  posting: 'Posting',
  posted: 'Posted',
  recorded: 'Recorded',
  active: 'Active',
  archived: 'Archived',
};

export function labelForStatus(status: string) {
  return statusLabels[status] || status.replaceAll('_', ' ');
}

export function lineTotal(line: any): number {
  return (
    line?.amount_minor ??
    Math.round((Number(line?.quantity_milli || 0) * Number(line?.unit_price_minor || 0)) / 1000)
  );
}

export function recordTotal(record: any): number | null {
  const data = record?.data;
  if (!data) return null;
  if (data.total_minor !== undefined) return data.total_minor;
  if (data.amount_minor !== undefined) return data.amount_minor;
  if (data.budget_minor !== undefined) return data.budget_minor;
  return null;
}

export function filterRecords(records: any[], query: string, status = 'all') {
  const needle = query.trim().toLowerCase();
  return records.filter((record) => {
    if (status !== 'all' && record.status !== status) return false;
    if (!needle) return true;
    const data = record.data || {};
    return [
      data.reference,
      data.title,
      data.supplier_snapshot?.name,
      data.contact_snapshot?.name,
      record.status,
    ]
      .filter(Boolean)
      .some((value: string) => String(value).toLowerCase().includes(needle));
  });
}

export function pageSlice<T>(rows: T[], page: number, size = 15) {
  return rows.slice(page * size, (page + 1) * size);
}
export function pageCount(total: number, size = 15) {
  return Math.max(1, Math.ceil(total / size));
}

export function requestForRfq(rfqs: any[], requestId: string) {
  return rfqs.find((r) => r.id === requestId) || null;
}
export function rfqForOrder(orders: any[], order: any) {
  return orders.find((r) => r.id === order?.data?.rfq_id) || null;
}

export function receivedForOrder(detail: any, lineId: string): number {
  return Number(detail?.received?.[lineId] || 0);
}

export function orderOpenQuantity(order: any, detail: any) {
  const lines = order?.data?.lines || [];
  return lines.reduce(
    (total: number, line: any) =>
      total + Math.max(0, Number(line.quantity_milli || 0) - receivedForOrder(detail, line.id)),
    0,
  );
}

export function orderHasOpenReceipt(order: any, detail: any) {
  if (!order || !['issued', 'confirmed'].includes(order.status)) return false;
  return (order.data?.lines || []).some(
    (line: any) =>
      line.product_snapshot?.track_inventory &&
      receivedForOrder(detail, line.id) < Number(line.quantity_milli || 0),
  );
}

export function billForOrder(bills: any[], orderId: string) {
  return bills.find((bill) => bill?.data?.order_id === orderId) || null;
}

export function dashboardCounts(input: {
  requests: any[];
  rfqs: any[];
  orders: any[];
  receipts: any[];
  bills: any[];
}) {
  const { requests, rfqs, orders, receipts, bills } = input;
  return {
    newRfqs: rfqs.filter((r) => r.status === 'draft').length,
    sentRfqs: rfqs.filter((r) => r.status === 'accepted').length,
    awaitingApproval:
      requests.filter((r) => r.status === 'draft').length +
      orders.filter((o) => o.status === 'draft').length +
      bills.filter((b) => b.status === 'draft').length,
    lateReceipts: orders.filter((order) => lateReceipt(order)).length,
    confirmedOrders: orders.filter((o) => ['issued', 'confirmed'].includes(o.status)).length,
    received: receipts.filter((r) => r.status === 'posted').length,
    vendorCount: new Set(requests.map((r) => r.data?.supplier_snapshot?.id).filter(Boolean)).size,
  };
}

export function dateOnly(value: any) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function lateReceipt(order: any, rfq?: any) {
  if (!order || !['issued', 'confirmed'].includes(order.status)) return false;
  const delivery = dateOnly(order.data?.delivery_on || rfq?.data?.delivery_on);
  if (!delivery) return false;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (delivery >= today) return false;
  return (order.data?.lines || []).some((line: any) => line.product_snapshot?.track_inventory);
}

export function confirmedMetrics(orders: any[]) {
  const rows = orders.filter((o) => ['issued', 'confirmed'].includes(o.status));
  const byCurrency: Record<string, { orders: number; value_minor: number }> = {};
  for (const order of rows) {
    const currency = order.data?.currency || 'KES';
    byCurrency[currency] ||= { orders: 0, value_minor: 0 };
    byCurrency[currency].orders += 1;
    byCurrency[currency].value_minor += Number(order.data?.total_minor || 0);
  }
  return byCurrency;
}

export function comparisonRows(offers: any[]) {
  const groups: Record<string, { product: string; sku: string; unit: string; offers: any[] }> = {};
  for (const offer of offers) {
    for (const line of offer.data?.lines || []) {
      const key = line.product_id || line.product_snapshot?.id || line.id;
      groups[key] ||= {
        product: line.product_snapshot?.name || 'Product',
        sku: line.product_snapshot?.sku || '',
        unit: line.product_snapshot?.unit || 'unit',
        offers: [],
      };
      groups[key].offers.push({
        offer_id: offer.id,
        reference: offer.data?.reference,
        supplier: offer.data?.supplier_snapshot?.name,
        status: offer.status,
        delivery_on: offer.data?.delivery_on,
        quantity_milli: line.quantity_milli,
        unit_price_minor: line.unit_price_minor,
        amount_minor: lineTotal(line),
        currency: offer.data?.currency,
      });
    }
  }
  return Object.values(groups).map((group) => ({
    ...group,
    offers: group.offers.sort((a, b) =>
      a.currency === b.currency
        ? a.unit_price_minor - b.unit_price_minor
        : String(a.currency).localeCompare(String(b.currency)),
    ),
  }));
}

export function reportByVendor(orders: any[]) {
  const rows: Record<
    string,
    { vendor: string; orders: number; value_minor: number; currency: string; open_orders: number }
  > = {};
  for (const order of orders.filter((o) => ['issued', 'confirmed'].includes(o.status))) {
    const name = order.data?.supplier_snapshot?.name || 'Unknown vendor';
    const currency = order.data?.currency || 'KES';
    const key = name + '|' + currency;
    rows[key] ||= { vendor: name, orders: 0, value_minor: 0, currency, open_orders: 0 };
    rows[key].orders += 1;
    rows[key].value_minor += Number(order.data?.total_minor || 0);
    if (order.status !== 'cancelled') rows[key].open_orders += 1;
  }
  return Object.values(rows).sort((a, b) => b.value_minor - a.value_minor);
}

export function reportByProduct(orders: any[]) {
  const rows: Record<
    string,
    {
      product: string;
      sku: string;
      unit: string;
      quantity_milli: number;
      value_minor: number;
      currency: string;
    }
  > = {};
  for (const order of orders.filter((o) => ['issued', 'confirmed'].includes(o.status))) {
    for (const line of order.data?.lines || []) {
      const name = line.product_snapshot?.name || 'Product';
      const currency = order.data?.currency || 'KES';
      const key = (line.product_id || name) + '|' + currency;
      rows[key] ||= {
        product: name,
        sku: line.product_snapshot?.sku || '',
        unit: line.product_snapshot?.unit || 'unit',
        quantity_milli: 0,
        value_minor: 0,
        currency,
      };
      rows[key].quantity_milli += Number(line.quantity_milli || 0);
      rows[key].value_minor += lineTotal(line);
    }
  }
  return Object.values(rows).sort((a, b) => b.value_minor - a.value_minor);
}

export function approvalCounts(input: {
  requests: any[];
  rfqs: any[];
  orders: any[];
  bills: any[];
  credits: any[];
}) {
  const all = [...input.requests, ...input.rfqs, ...input.orders, ...input.bills, ...input.credits];
  return {
    drafts: all.filter((r) => r.status === 'draft').length,
    approved: all.filter((r) => r.status === 'approved').length,
    accepted: input.rfqs.filter((r) => r.status === 'accepted').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
    cancelled: all.filter((r) => r.status === 'cancelled').length,
  };
}

export function purchaseHistoryForProduct(orders: any[], productId: string) {
  const rows: any[] = [];
  for (const order of orders) {
    for (const line of order.data?.lines || []) {
      if (line.product_id === productId)
        rows.push({
          order_id: order.id,
          reference: order.data?.reference,
          status: order.status,
          vendor: order.data?.supplier_snapshot?.name,
          delivery_on: order.data?.delivery_on,
          quantity_milli: line.quantity_milli,
          unit_price_minor: line.unit_price_minor,
          currency: order.data?.currency,
          amount_minor: lineTotal(line),
        });
    }
  }
  return rows.slice(0, 20);
}

export function procurementPipeline(_status: string, type: string) {
  if (type === 'request') return ['draft', 'approved'];
  if (type === 'rfq') return ['draft', 'accepted'];
  if (type === 'order') return ['draft', 'approved', 'issued', 'confirmed'];
  if (type === 'bill' || type === 'credit') return ['draft', 'approved'];
  return ['posted'];
}

export function orderBillingStatus(order: any, bills: any[]) {
  const bill = billForOrder(bills, order?.id);
  if (!bill) return 'Nothing to bill';
  if (bill.status === 'approved') return 'Billed';
  if (bill.status === 'cancelled') return 'Bill cancelled';
  return 'Draft bill';
}
