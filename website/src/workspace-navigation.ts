export type WorkspaceKind = 'personal' | 'business' | 'developer';

export const marketTabs = ['My Services', 'Explore Services', 'Usage & Billing'];

export const directAppTabs = [
  'Point of Sale', 'Commerce', 'Procurement', 'Customer Relationships', 'Products',
  'Inventory', 'Quotations', 'Work', 'Accounting', 'People', 'Documents',
];

export const businessNavigationGroups: { label: string; icon: string; items: string[] }[] = [
  {
    label: 'Workspace',
    icon: 'grid',
    items: ['Overview', 'Apps', 'My Services', 'Customer Relationships', 'Products', 'Inventory', 'Quotations', ...marketTabs, 'Customers', 'Orders', 'Invoices', 'Payments'],
  },
  {
    label: 'Finance & intelligence',
    icon: 'chart',
    items: ['Intelligence', 'Cash Flow', 'Expenses', 'Forecasts', 'Transactions', 'Reconciliation', 'Reports', 'Assistant'],
  },
  {
    label: 'Operations',
    icon: 'document',
    items: ['Automations', 'Notifications', 'Approvals', 'Fulfillment', 'Protected Payments', 'Disputes'],
  },
  {
    label: 'Business trust',
    icon: 'shield',
    items: ['Business Passport', 'Risk Review'],
  },
  {
    label: 'Build & connect',
    icon: 'code',
    items: ['Connect', 'Data', 'Integrations', 'Developers', 'Webhooks', 'Verification APIs', 'Engineering'],
  },
  { label: 'Administration', icon: 'settings', items: ['Team', 'Settings'] },
];

export const businessTabs = [
  ...new Set([...businessNavigationGroups.flatMap((group) => group.items), ...directAppTabs]),
];

export const personalTabs = [
  'Overview', 'Apps', 'Notifications', ...marketTabs, 'Assistant', 'Income', 'Expenses',
  'Invoices', 'Clients', 'Payment Records', 'Cash Flow', 'Reports', 'Learn', 'Settings',
];

export const developerTabs = [
  'Overview', 'Notifications', 'Products', ...marketTabs, 'Assistant', 'Data',
  'My Applications', 'API Keys', 'API Explorer', 'Sandbox', 'Webhooks', 'Request Logs',
  'Usage & Limits', 'API Documentation', 'SDKs & Examples', 'Verification APIs',
  'Settings', 'Support',
];

export const workspaceTabs: Record<WorkspaceKind, string[]> = {
  personal: personalTabs,
  business: businessTabs,
  developer: developerTabs,
};

// Installed apps normally share canonical service tabs, but an app with its own
// operational sections (currently Commerce) must keep sidebar navigation inside
// the app workspace instead of leaving for the standalone service.
export function appSectionTarget(app: { id: string }, section: string, direct: Record<string, string>): string {
  return app.id === 'commerce' ? 'Apps' : direct[section] || 'Apps';
}

export function appSectionActive(
  app: { id: string },
  section: string,
  tab: string,
  selectedSection: string,
  direct: Record<string, string>,
): boolean {
  if (app.id === 'commerce') return tab === 'Apps' && selectedSection === section;
  return direct[section] ? tab === direct[section] : tab === 'Apps' && selectedSection === section;
}
