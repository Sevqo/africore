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
};

/** Personal workspaces use different tab labels for the same canonical records. */
const personalDestinations: Record<string, ServiceOpenDestination> = {
  customers: { tab: 'Clients' },
  payments: { tab: 'Payment Records' },
  reconciliation: { tab: 'Payment Records' },
};

/** The developer console is an API console, not a merchant workspace. Business
 * services reachable by a Developer container open the sandbox API surface; the
 * documented synthetic invoice/payment/reconciliation contract lives there. */
const developerDestinations: Record<string, ServiceOpenDestination> = {
  customers: { tab: 'API Explorer' },
  orders: { tab: 'API Explorer' },
  invoicing: { tab: 'API Explorer' },
  payments: { tab: 'API Explorer' },
  reconciliation: { tab: 'API Explorer' },
  connect: { tab: 'API Explorer' },
  developer_api: { tab: 'My Applications' },
};

export function serviceOpenDestination(
  service: { id: string; tabs?: readonly string[] },
  kind: WorkspaceKind = 'business',
): ServiceOpenDestination {
  const override = kind === 'personal' ? personalDestinations[service.id] : kind === 'developer' ? developerDestinations[service.id] : undefined;
  const destination = override || destinations[service.id] || { tab: service.tabs?.[0] || 'My Services' };
  return workspaceTabs[kind].includes(destination.tab) ? destination : { tab: 'My Services' };
}
