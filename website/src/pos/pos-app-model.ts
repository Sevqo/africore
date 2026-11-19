export type POSAppSection = 'dashboard' | 'orders' | 'products' | 'reporting' | 'configuration';
export type POSAppView = POSAppSection | 'cashier';
export const posAppSections: { section: POSAppSection; label: string }[] = [
  { section: 'dashboard', label: 'Dashboard' },
  { section: 'orders', label: 'Orders' },
  { section: 'products', label: 'Products' },
  { section: 'reporting', label: 'Reporting' },
  { section: 'configuration', label: 'Configuration' },
];
export const posAppViews: POSAppView[] = [
  'dashboard',
  'cashier',
  'orders',
  'products',
  'reporting',
  'configuration',
];
export const posReportMeasures = [
  ['invoice_total_minor', 'Invoice total'],
  ['transaction_count', 'Transactions'],
  ['paid_minor', 'Paid allocations'],
  ['outstanding_minor', 'Outstanding'],
  ['credited_minor', 'Credits'],
  ['recorded_cash_minor', 'Recorded cash'],
  ['simulated_electronic_minor', 'Electronic allocations'],
  ['cash_returned_minor', 'Cash returned'],
  ['discount_minor', 'Discounts'],
  ['tax_minor', 'Tax'],
  ['product_quantity_milli', 'Product quantity'],
  ['product_subtotal_minor', 'Product line subtotal'],
] as const;
export type POSReportMeasureKey = (typeof posReportMeasures)[number][0];
const posLineBreakdownMeasureKeys: POSReportMeasureKey[] = [
  'transaction_count',
  'product_quantity_milli',
  'product_subtotal_minor',
];
export function posReportMeasuresForGroup(groupBy: string) {
  return groupBy === 'product' || groupBy === 'category'
    ? posReportMeasures.filter(([key]) => posLineBreakdownMeasureKeys.includes(key))
    : posReportMeasures;
}
export function posReportMeasureForGroup(groupBy: string, measure: POSReportMeasureKey) {
  return posReportMeasuresForGroup(groupBy).some(([key]) => key === measure)
    ? measure
    : 'product_subtotal_minor';
}
export const posSectionForView = (view: POSAppView): POSAppSection =>
  view === 'cashier' ? 'dashboard' : view;
export function posRegisterState(register: any, overview: any) {
  if (!register) return { id: 'none', label: 'No register', tone: 'quiet' };
  if (register.status !== 'active') return { id: 'inactive', label: 'Inactive', tone: 'quiet' };
  if (overview?.occupied) return { id: 'open', label: 'Open shift', tone: 'positive' };
  return { id: 'ready', label: 'Ready to open', tone: 'attention' };
}
export function posPaymentState(row: any) {
  if (row.status === 'draft') return { id: 'draft', label: 'Draft' };
  if (row.outstanding_minor === 0) return { id: 'paid', label: 'Paid' };
  if (row.payment_status === 'partially_paid') return { id: 'partial', label: 'Partially paid' };
  if (row.payment_status === 'pending') return { id: 'pending', label: 'Payment pending' };
  if (row.payment_status === 'paid') return { id: 'paid', label: 'Paid' };
  if (row.outstanding_minor !== null && row.outstanding_minor > 0)
    return { id: 'unpaid', label: 'Unpaid' };
  return { id: 'settled', label: 'Recorded' };
}
export function posReference(row: any) {
  return row.status === 'confirmed'
    ? 'POS-' + String(row.id).replaceAll('-', '').slice(0, 12).toUpperCase()
    : 'DRAFT-' + String(row.id).slice(0, 8).toUpperCase();
}
export function posHandoverLabel(value: string) {
  return value === 'recorded'
    ? 'Handed over'
    : value === 'not_recorded'
      ? 'Not handed over'
      : 'Pending';
}
export function posCategoryTone(category: string) {
  const palette = [
    '#5d8aa8',
    '#c98b8b',
    '#7f9c7a',
    '#a58bba',
    '#c7a15a',
    '#6a9c9b',
    '#b07a9a',
    '#8a9bb5',
  ];
  if (!category) return palette[0];
  let hash = 0;
  for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
export function posProductImage(product: any) {
  return product?.image_url || product?.image || null;
}
export function posProductInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || '')
      .join('') || '—'
  );
}
export function posReportBars(products: any[]) {
  const rows = (products || []).slice(0, 8).map((item) => ({
    label: item.name || item.product_id || 'Product',
    value: Number(item.amount_minor || item.sales_minor || item.total_minor || 0),
  }));
  const max = Math.max(1, ...rows.map((item) => item.value));
  return rows.map((item) => ({
    ...item,
    height: Math.max(2, Math.round((item.value / max) * 100)),
  }));
}
export function posSuggestedCashInput(amountMinor: number, currency: string) {
  return (amountMinor / (['UGX', 'RWF'].includes(currency) ? 1 : 100)).toFixed(
    ['UGX', 'RWF'].includes(currency) ? 0 : 2,
  );
}
export function posRegisterLabel(register: any) {
  return register?.data?.name || register?.name || 'Register';
}
export function posSessionLabel(session: any) {
  if (!session) return 'No shift selected';
  return session.status === 'open'
    ? 'Open since ' + new Date(session.data?.opened_at || session.created_at).toLocaleString()
    : 'Closed ' + new Date(session.data?.closed_at || session.created_at).toLocaleString();
}
export function posCanConfigure(directory: any) {
  return !!directory?.permissions?.configure;
}
export function posRegisterProductsLabel(count: number) {
  return count === 1 ? '1 product' : count + ' products';
}
