export const accountingSections = [
  { section: 'dashboard', label: 'Dashboard' },
  { section: 'customers', label: 'Customers' },
  { section: 'vendors', label: 'Vendors' },
  { section: 'accounting', label: 'Accounting' },
  { section: 'review', label: 'Review' },
  { section: 'reporting', label: 'Reporting' },
  { section: 'configuration', label: 'Configuration' },
] as const;

export const accountingViews = [
  'dashboard',
  'invoices',
  'credit-notes',
  'customer-payments',
  'customers',
  'receivables',
  'bills',
  'vendor-credits',
  'vendor-payments',
  'vendors',
  'payables',
  'entries',
  'items',
  'ledger',
  'coa',
  'bank',
  'assets',
  'asset-models',
  'depreciation-board',
  'deferred-expenses',
  'deferred-revenue',
  'deferral-models',
  'deferred-expense-report',
  'deferred-revenue-report',
  'periods',
  'review',
  'reconciliation',
  'closing',
  'profit-loss',
  'balance-sheet',
  'trial-balance',
  'aged',
  'tax',
  'settings',
  'journals',
  'tax-codes',
] as const;
export type AccountingView = (typeof accountingViews)[number];

export const defaultViewForSection: Record<string, AccountingView> = {
  dashboard: 'dashboard',
  customers: 'invoices',
  vendors: 'bills',
  accounting: 'entries',
  review: 'review',
  reporting: 'profit-loss',
  configuration: 'settings',
};

export const viewsForSection: Record<string, AccountingView[]> = {
  dashboard: ['dashboard'],
  customers: ['invoices', 'credit-notes', 'customer-payments', 'customers', 'receivables'],
  vendors: ['bills', 'vendor-credits', 'vendor-payments', 'vendors', 'payables'],
  accounting: [
    'entries',
    'items',
    'ledger',
    'coa',
    'bank',
    'assets',
    'asset-models',
    'depreciation-board',
    'deferred-expenses',
    'deferred-revenue',
    'deferral-models',
    'periods',
  ],
  review: ['review', 'reconciliation', 'closing'],
  reporting: [
    'profit-loss',
    'balance-sheet',
    'trial-balance',
    'ledger',
    'aged',
    'tax',
    'deferred-expense-report',
    'deferred-revenue-report',
  ],
  configuration: ['settings', 'coa', 'journals', 'periods', 'tax-codes'],
};

export function sectionForView(view: AccountingView): string {
  return (
    Object.entries(viewsForSection).find(([, views]) => views.includes(view))?.[0] || 'dashboard'
  );
}

export const viewTitles: Record<AccountingView, string> = {
  dashboard: 'Accounting',
  invoices: 'Invoices',
  'credit-notes': 'Credit notes',
  'customer-payments': 'Customer payments',
  customers: 'Customers',
  receivables: 'Aged receivables',
  bills: 'Vendor bills',
  'vendor-credits': 'Vendor credits',
  'vendor-payments': 'Vendor payments',
  vendors: 'Vendors',
  payables: 'Aged payables',
  entries: 'Journal entries',
  items: 'Journal items',
  ledger: 'General Ledger',
  coa: 'Chart of Accounts',
  bank: 'Bank and Cash',
  assets: 'Assets',
  'asset-models': 'Depreciation Models',
  'depreciation-board': 'Depreciation Board',
  'deferred-expenses': 'Deferred Expenses',
  'deferred-revenue': 'Deferred Revenue',
  'deferral-models': 'Deferral Models',
  'deferred-expense-report': 'Deferred Expense Report',
  'deferred-revenue-report': 'Deferred Revenue Report',
  periods: 'Lock Dates',
  review: 'Review',
  reconciliation: 'Reconciliation',
  closing: 'Closing checklist',
  'profit-loss': 'Profit and Loss',
  'balance-sheet': 'Balance Sheet',
  'trial-balance': 'Trial Balance',
  aged: 'Aged reports',
  tax: 'Tax Report',
  settings: 'Accounting Settings',
  journals: 'Journals',
  'tax-codes': 'Taxes',
};

const journalTypeNames: Record<string, string> = {
  SALES: 'sales',
  PURCHASE: 'purchase',
  CASH: 'cash',
  BANK: 'bank',
  GENERAL: 'miscellaneous',
};

export function journalType(journal: { code?: string; name?: string }): string {
  const code = String(journal.code || '').toUpperCase();
  if (journalTypeNames[code]) return journalTypeNames[code];
  const name = String(journal.name || '').toLowerCase();
  if (name.includes('sale')) return 'sales';
  if (name.includes('purchase')) return 'purchase';
  if (name.includes('cash')) return 'cash';
  if (name.includes('bank')) return 'bank';
  return 'miscellaneous';
}

export function journalLabel(type: string): string {
  return (
    (
      {
        sales: 'Sales',
        purchase: 'Purchases',
        cash: 'Cash',
        bank: 'Bank',
        miscellaneous: 'Miscellaneous Operations',
      } as Record<string, string>
    )[type] || 'Miscellaneous Operations'
  );
}

export function recordData(record: any): any {
  return record?.data && typeof record.data === 'object' ? record.data : record || {};
}

export function invoiceTotal(invoice: any): number {
  const d = recordData(invoice);
  return Number(d.total_minor ?? d.amount_minor ?? 0);
}
export function invoiceOutstanding(invoice: any): number {
  const d = recordData(invoice);
  return Number(
    d.outstanding_minor ?? Math.max(0, invoiceTotal(invoice) - Number(d.paid_minor || 0)),
  );
}
export function invoiceStatus(invoice: any): string {
  return String(recordData(invoice).status || invoice.status || 'draft');
}
export function invoiceCurrency(invoice: any): string {
  return String(recordData(invoice).currency || invoice.currency || 'KES');
}
export function invoiceDue(invoice: any): string {
  const d = recordData(invoice);
  return String(d.due_date || d.due_on || invoice.due_date || '');
}
export function invoiceCustomer(invoice: any): string {
  const d = recordData(invoice);
  return String(
    d.customer_name || d.customer || d.customer_id || invoice.customer_id || 'Canonical customer',
  );
}

export function billTotal(bill: any): number {
  const d = recordData(bill);
  const explicit = Number(d.amount_minor ?? d.total_minor);
  if (Number.isFinite(explicit)) return explicit;
  const lines = Array.isArray(d.lines) ? d.lines : [];
  const subtotal = lines.reduce(
    (sum: number, line: any) =>
      sum +
      Number(
        line.amount_minor ??
          Math.floor(
            (Number(line.quantity_milli || 0) * Number(line.unit_price_minor || 0) + 500) / 1000,
          ),
      ),
    0,
  );
  return subtotal + Number(d.tax_minor || 0);
}
export function billCurrency(bill: any): string {
  return String(recordData(bill).currency || bill.currency || 'KES');
}
export function billStatus(bill: any): string {
  return String(recordData(bill).status || bill.status || 'draft');
}

export function sumAmounts(rows: any[], picker: (row: any) => number): number {
  return rows.reduce((sum, row) => sum + picker(row), 0);
}

export function dashboardCounts(state: {
  entries?: any[];
  invoices?: any[];
  bills?: any[];
  events?: any[];
  periods?: any[];
}) {
  const entries = state.entries || [],
    invoices = state.invoices || [],
    bills = state.bills || [],
    events = state.events || [];
  return {
    draftEntries: entries.filter((e) => e.status === 'draft').length,
    postedEntries: entries.filter((e) => e.status === 'posted').length,
    draftInvoices: invoices.filter((i) => ['draft', 'issued'].includes(invoiceStatus(i))).length,
    unpaidInvoices: invoices.filter(
      (i) => ['issued', 'partially_paid'].includes(invoiceStatus(i)) && invoiceOutstanding(i) > 0,
    ).length,
    overdueInvoices: invoices.filter(
      (i) =>
        invoiceDue(i) &&
        invoiceDue(i) < new Date().toISOString().slice(0, 10) &&
        invoiceOutstanding(i) > 0,
    ).length,
    unpaidBills: bills.filter((b) => billStatus(b) === 'approved').length,
    pendingEvents: events.filter((e) => e.status === 'succeeded' && !e.allocated_at).length,
    openPeriods: (state.periods || []).filter((p) => p.status === 'open').length,
  };
}

export const reportGroups = [
  { key: 'revenue', label: 'Revenue', types: ['revenue'] },
  { key: 'expenses', label: 'Expenses', types: ['expense'] },
  { key: 'assets', label: 'Assets', types: ['asset'] },
  { key: 'liabilities', label: 'Liabilities', types: ['liability'] },
  { key: 'equity', label: 'Equity', types: ['equity'] },
] as const;

export function groupedReportLines(lines: any[]) {
  return Object.fromEntries(
    reportGroups.map((group) => [
      group.key,
      lines.filter((line) => (group.types as readonly string[]).includes(line.type)),
    ]),
  );
}

export function profitLines(report: any) {
  const revenue = (report?.profit_loss || []).filter((line: any) => line.type === 'revenue');
  const expenses = (report?.profit_loss || []).filter((line: any) => line.type === 'expense');
  return {
    revenue,
    expenses,
    gross: revenue.reduce((sum: number, line: any) => sum - line.net_debit_minor, 0),
    net: Number(report?.net_profit_minor || 0),
  };
}

export function balanceTotals(report: any) {
  const lines = report?.balance_sheet || [];
  const assets = lines
    .filter((line: any) => line.type === 'asset')
    .reduce((sum: number, line: any) => sum + line.net_debit_minor, 0);
  const liabilities = lines
    .filter((line: any) => line.type === 'liability')
    .reduce((sum: number, line: any) => sum - line.net_debit_minor, 0);
  const equity =
    lines
      .filter((line: any) => line.type === 'equity')
      .reduce((sum: number, line: any) => sum - line.net_debit_minor, 0) +
    Number(report?.retained_earnings_minor || 0);
  return { assets, liabilities, equity, difference: assets - (liabilities + equity) };
}
