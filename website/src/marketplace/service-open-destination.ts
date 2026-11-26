import { workspaceTabs, type WorkspaceKind } from '../workspace-navigation.ts';

export type ServiceOpenDestination = { tab: string; app?: string; section?: string };

/** Where each registered service opens on its own. A missing entry never falls
 * back to an unrelated workspace: the service's registered tab is used, and an
 * unknown service without a usable tab returns to the service catalogue. */
const destinations: Record<string, ServiceOpenDestination> = {
  customers: { tab: 'Customers' },
  products: { tab: 'Products' },
  crm: { tab: 'Customer Relationships' },
  orders: { tab: 'Orders' },
  sales: { tab: 'Quotations' },
  invoicing: { tab: 'Invoices' },
  inventory: { tab: 'Inventory' },
  fulfillment: { tab: 'Fulfillment' },
  income: { tab: 'Income' },
  expenses: { tab: 'Expenses' },
  cash_flow: { tab: 'Cash Flow' },
  payments: { tab: 'Payments' },
  reconciliation: { tab: 'Reconciliation' },
  accounting: { tab: 'Accounting' },
  protected_payments: { tab: 'Protected Payments' },
  pos: { tab: 'Point of Sale' },
  commerce: { tab: 'Commerce' },
  procurement: { tab: 'Procurement' },
  documents: { tab: 'Documents' },
  people: { tab: 'People' },
  work: { tab: 'Work' },
  automations: { tab: 'Automations' },
  intelligence: { tab: 'Intelligence' },
  forecasting: { tab: 'Forecasts' },
  assistant: { tab: 'Assistant' },
  data: { tab: 'Data' },
  connect: { tab: 'Connect' },
  passport: { tab: 'Business Passport', section: 'Overview' },
  verification: { tab: 'Business Passport', section: 'Verification Requests' },
  credentials: { tab: 'Business Passport', section: 'Credentials' },
  trust_network: { tab: 'Business Passport', section: 'Business Network' },
  blockchain: { tab: 'Business Passport', section: 'Credentials' },
  developer_api: { tab: 'Developers' },
  webhooks: { tab: 'Webhooks' },
  verification_api: { tab: 'Verification APIs' },
  calendar: { tab: 'Apps', app: 'calendar', section: 'calendar' },
  website: { tab: 'Apps', app: 'website', section: 'overview' },
};

/** Personal workspaces use bundled service interfaces directly (no separate Apps store). */
const personalDestinations: Record<string, ServiceOpenDestination> = {
  customers: { tab: 'Clients' },
  payments: { tab: 'Payment Records' },
  reconciliation: { tab: 'Payment Records' },
  calendar: { tab: 'Calendar' },
  documents: { tab: 'Documents' },
  website: { tab: 'Website' },
};

/** The developer console bundles service tools directly (no separate Apps store). */
const developerDestinations: Record<string, ServiceOpenDestination> = {
  customers: { tab: 'API Explorer' },
  orders: { tab: 'API Explorer' },
  invoicing: { tab: 'API Explorer' },
  payments: { tab: 'API Explorer' },
  reconciliation: { tab: 'API Explorer' },
  connect: { tab: 'Integrations Hub' },
  inventory: { tab: 'API Explorer' },
  fulfillment: { tab: 'API Explorer' },
  expenses: { tab: 'API Explorer' },
  intelligence: { tab: 'Usage & Limits' },
  automations: { tab: 'Automations' },
  developer_api: { tab: 'My Applications' },
};

export function serviceOpenDestination(
  service: { id: string; tabs?: readonly string[] },
  kind: WorkspaceKind = 'business',
): ServiceOpenDestination {
  const override =
    kind === 'personal'
      ? personalDestinations[service.id]
      : kind === 'developer'
        ? developerDestinations[service.id]
        : undefined;
  const destination = override ||
    destinations[service.id] || { tab: service.tabs?.[0] || 'My Services' };
  return workspaceTabs[kind].includes(destination.tab) ? destination : { tab: 'My Services' };
}
