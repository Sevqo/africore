import type { WorkspaceKind } from './catalog';

/** Presentation grouping only. Entitlements and billing remain service scoped. */
export interface ServiceFamily {
  id: string;
  name: string;
  icon: string;
  description: string;
  services: readonly string[];
  order: number;
  recommendedApps: readonly string[];
  kinds: readonly WorkspaceKind[];
}
const all: readonly WorkspaceKind[] = ['personal', 'business', 'developer'];
const business: readonly WorkspaceKind[] = ['business'];
export const serviceFamilies: readonly ServiceFamily[] = [
  { id: 'finance-payments', name: 'Finance & Payments', icon: 'chart', description: 'Invoices, payments, expenses, cash flow and accounting.', services: ['income','expenses','cash_flow','payments','reconciliation','protected_payments','invoicing','accounting'], order: 1, recommendedApps: ['finance','accounting'], kinds: all },
  { id: 'commerce-customers', name: 'Commerce & Customers', icon: 'bag', description: 'Products, customers, orders, sales and customer relationships.', services: ['commerce','products','customers','orders','sales','crm','pos'], order: 2, recommendedApps: ['commerce','sales','crm','pos'], kinds: business },
  { id: 'inventory-supply', name: 'Inventory & Supply', icon: 'box', description: 'Inventory, procurement and fulfillment operations.', services: ['inventory','procurement','fulfillment'], order: 3, recommendedApps: ['inventory','procurement'], kinds: business },
  { id: 'people-work', name: 'People & Work', icon: 'users', description: 'Workforce, projects, tasks and scheduling capabilities.', services: ['people','work','calendar'], order: 4, recommendedApps: ['people','work','calendar'], kinds: business },
  { id: 'intelligence-automation', name: 'Intelligence & Automation', icon: 'bolt', description: 'Reporting, forecasts, assistance and authorized workflows.', services: ['intelligence','forecasting','assistant','automations'], order: 5, recommendedApps: ['analytics','automations'], kinds: business },
  { id: 'identity-trust', name: 'Business Identity & Trust', icon: 'shield', description: 'Passports, evidence, verification, credentials and trust.', services: ['passport','verification','credentials','trust_network','blockchain'], order: 6, recommendedApps: ['business_id'], kinds: business },
  { id: 'data-integrations', name: 'Data & Integrations', icon: 'code', description: 'Data tools, connectors, developer APIs and public publishing.', services: ['data','connect','developer_api','webhooks','verification_api','website'], order: 7, recommendedApps: ['website'], kinds: ['business','developer'] },
  { id: 'documents', name: 'Documents', icon: 'document', description: 'Protected documents with independent sharing and version authority.', services: ['documents'], order: 8, recommendedApps: ['documents'], kinds: business },
];
export const serviceFamilyFor = (serviceId: string) => serviceFamilies.find((family) => family.services.includes(serviceId));
