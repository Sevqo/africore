// Editorial additions only. Names, eligibility, dependencies and meters stay in the shared catalog.
export const serviceEducation: Record<
  string,
  {
    route: string;
    problem: string;
    example: string;
    input: string;
    limit: string;
  }
> = {
  customers: {
    route: '/products/customers',
    problem: 'Find the person behind an invoice without searching several notebooks.',
    example:
      'A fictional clothing shop records Amina as a customer, then uses that contact on a new quotation, order and invoice. The contact does not prove that Amina has paid.',
    input:
      'Provide only necessary contact details, with appropriate permission. Customer entry is shared across CRM, Sales, Invoicing and Orders.',
    limit:
      'Related orders and invoice balances are separate records with their own access rules. A saved contact is not identity verification.',
  },
  products: {
    route: '/products/catalog',
    problem: 'Maintain one canonical SKU, variant and price catalog across every sales channel.',
    example:
      'A fictional hardware distributor defines SKU-cement-50kg once with unit prices and attributes, then reuses it in Sales quotations, POS registers, Inventory warehouses and Commerce.',
    input:
      'Enter SKU codes, product names, units of measure and reference prices in minor currency units.',
    limit:
      'Reference catalog prices guide new documents; updating a product never rewrites historical issued invoices or posted stock valuations.',
  },
  orders: {
    route: '/products/orders',
    problem: 'Keep the agreement separate from its payment and delivery.',
    example:
      'A fictional shop agrees to supply three desks. The order describes the goods. A separate payment result and shipment history show what happened later.',
    input:
      'Choose a customer, currency, items, quantities and prices. Review the order before issuing it.',
    limit:
      'Confirmed order, confirmed payment and delivered shipment mean different things. No courier feed is implied.',
  },
  sales: {
    route: '/products/sales',
    problem: 'Move smoothly from customer quotations and price lists to confirmed orders and draft invoices.',
    example:
      'A fictional wholesaler prepares a tiered quotation with a seasonal promo code, records customer signature approval, reserves stock and prepares a draft invoice.',
    input:
      'Select a shared customer, canonical products, optional price list or promo rules, and delivery terms.',
    limit:
      'Confirming a quotation creates an order and optional draft invoice according to policy; it never fabricates payment confirmation.',
  },
  crm: {
    route: '/products/crm',
    problem: 'Track leads, pipeline stages, sales quotas and follow-up activities without losing context.',
    example:
      'A fictional B2B supplier routes an incoming lead to a regional rep, schedules a follow-up call and converts the won opportunity directly into a Sales quotation.',
    input:
      'Link a shared customer or prospect, expected deal value, pipeline stage and next scheduled activity.',
    limit:
      'Expected pipeline value is a sales forecast, not recognized accounting revenue or a receivable.',
  },
  pos: {
    route: '/products/pos',
    problem: 'Run counted retail or restaurant shifts connected to shared stock and customer invoices.',
    example:
      'A fictional counter cashier opens a counted cash float, rings up a split-bill order from the shared catalog and reconciles closing cash at shift end.',
    input:
      'Configure a register, assign authorized human cashiers, open a counted shift and select canonical products.',
    limit:
      'Sandbox evaluation requires a network connection; live card terminals, offline queues and hardware fiscal printers are not enabled.',
  },
  commerce: {
    route: '/products/commerce',
    problem: 'Publish an online storefront backed by your real product catalog, stock rules and order queue.',
    example:
      'A fictional merchant publishes selected catalog items to a storefront slug, tracks cart checkouts in sandbox and fulfills orders from the same warehouse.',
    input:
      'Configure your store profile, select reviewed products for publication and review checkout settings.',
    limit:
      'Storefront checkout runs in sandbox mode only; custom external domains and live payment settlement remain gated.',
  },
  inventory: {
    route: '/products/inventory',
    problem: 'Track on-hand, reserved and incoming stock accurately across warehouses, lots and bins.',
    example:
      'A fictional distributor receives 100 units into Nairobi Warehouse, reserves 25 for a confirmed Sales order and triggers an automatic purchase request when stock hits minimum rules.',
    input:
      'Configure warehouses, locations and tracked products, then post authorized receipts, transfers, wave picks or cycle counts.',
    limit:
      'Physical stock movements and accounting ledger postings keep explicit approval boundaries.',
  },
  procurement: {
    route: '/products/procurement',
    problem: 'Control purchasing from internal requisitions and supplier RFQs to three-way bill matching.',
    example:
      'A fictional operations lead compares two supplier bids, issues an approved purchase order, inspects delivered quantities and matches the vendor bill before payment.',
    input:
      'Create a purchase request or RFQ, record supplier offers, inspect received goods and review vendor bills with separate-person approval.',
    limit:
      'Supplier bills and payment observations record obligations and evidence; AfriCore does not initiate bank transfers to suppliers.',
  },
  fulfillment: {
    route: '/products/fulfillment',
    problem: 'Follow the work after an order has been accepted.',
    example:
      'A fictional supplier records goods packed, dispatched and delivered, retaining relevant evidence for each supported transition.',
    input: 'Choose the related order and provide the permitted shipment details and evidence.',
    limit:
      'Merchant-recorded delivery is not live courier tracking, customer acceptance or permission to release protected funds.',
  },
  accounting: {
    route: '/products/accounting',
    problem: 'Maintain balanced double-entry journals, tax schedules, fixed assets and period-close controls.',
    example:
      'A fictional accountant reviews source-linked invoice journals, runs straight-line asset depreciation, evaluates budget variance and posts approved entries.',
    input:
      'Set your accounting start boundary, chart of accounts and journals; require second-person approval to post entries.',
    limit:
      'Provides operational double-entry accounting records; statutory tax e-filing and certified external audit sign-off remain separate.',
  },
  income: {
    route: '/products/income',
    problem: 'Record the money you received from your own work.',
    example:
      'A fictional freelancer records KSh 8,000 for completed repairs, with the date and category, then reviews covered income for the month.',
    input:
      'Enter an amount, currency, occurrence date and useful category. Keep sensitive information out of descriptions.',
    limit:
      'A manual income entry is your statement, not independently confirmed provider evidence or a complete tax account.',
  },
  expenses: {
    route: '/products/expenses',
    problem: 'See which recorded costs contribute to your outgoings.',
    example:
      'A fictional shop records KSh 20,000 rent, KSh 5,000 transport and KSh 3,000 electricity. Covered expenses total KSh 28,000.',
    input:
      'Provide the amount, currency, date and category. Record corrections through the supported lifecycle rather than inventing a provider refund.',
    limit:
      'Recording a cost does not initiate a payment or independently prove that it was paid. Future obligations are separate.',
  },
  people: {
    route: '/products/people',
    problem: 'Manage private employee records, departments, leave balances and attendance with strict HR boundaries.',
    example:
      'A fictional HR manager maintains department reporting lines, approves annual leave requests and reviews monthly attendance logs without exposing compensation to general staff.',
    input:
      'Configure employer leave policies, departments and authorized HR/manager roles before adding employee profiles.',
    limit:
      'Employee profiles are separate from workspace login accounts; automated statutory filings and live salary disbursement are disabled.',
  },
  work: {
    route: '/products/work',
    problem: 'Coordinate participant-scoped projects, Kanban tasks, dependencies, milestones and timesheets.',
    example:
      'A fictional delivery team breaks a client rollout into milestone tasks with dependency checks, logs hours on timesheets and posts weekly status updates.',
    input:
      'Create a project, invite workspace participants, define task stages and link optional customer or order context.',
    limit:
      'Project participation grants access only to that project, never to confidential Finance or HR records.',
  },
  documents: {
    route: '/products/documents',
    problem: 'Keep contracts, receipts and company files encrypted with explicit per-file sharing and e-signatures.',
    example:
      'A fictional operations manager uploads a supplier contract, retains version history and collects cryptographic e-signatures from two approvers.',
    input:
      'Upload permitted files within workspace storage bounds and grant explicit access to named members.',
    limit:
      'Files start private by default; personnel files additionally require current HR authority.',
  },
  calendar: {
    route: '/products/calendar',
    problem: 'Schedule timezone-aware team meetings and appointment slots with instant workspace notifications.',
    example:
      'A fictional team lead schedules a Weekly Operations Sync in Africa/Nairobi; workspace teammates see the shared slot and receive an in-app notice.',
    input:
      'Set event start/end times, timezone, visibility and attendees or publish bounded booking availability.',
    limit:
      'Invitations and reminders are delivered in-app to workspace members; external Google/Outlook calendar sync is not configured.',
  },
  website: {
    route: '/products/website',
    problem: 'Build structured public business pages, menus, SEO metadata and lead forms with reviewed snapshots.',
    example:
      'A fictional consultancy composes typed hero, service and contact blocks, previews changes safely and publishes an immutable public snapshot.',
    input:
      'Choose a site slug, edit typed content sections and explicitly publish reviewed page versions.',
    limit:
      'Published pages expose only validated content blocks; product checkout authority stays in Commerce.',
  },
  forecasting: {
    route: '/products/forecasting',
    problem: 'Model 7-to-90-day cash and collection scenarios with transparent, adjustable assumptions.',
    example:
      'A fictional owner compares an on-time collection scenario against a 15-day receivable delay before committing to new equipment spending.',
    input:
      'Select a currency, forecast horizon and explicit collection-rate or expense-timing assumptions.',
    limit:
      'Forecasts are mathematical scenario projections from recorded data, never guaranteed future bank balances.',
  },
  assistant: {
    route: '/products/assistant',
    problem: 'Ask a bounded question and inspect the records behind its answer.',
    example:
      'A fictional contractor has issued KSh 50,000 and received KSh 30,000 in allocated test receipts. The remaining receivable is KSh 20,000.',
    input:
      'Choose a supported question. An external model explanation additionally requires explicit consent to send minimized evidence and an available configured provider.',
    limit:
      'Internal evidence and private history work independently of external explanations. The assistant cannot send payments, execute arbitrary SQL or make credit decisions.',
  },
  developer_api: {
    route: '/products/developer-api',
    problem: 'Integrate external software with scoped REST keys, idempotency guarantees and environment isolation.',
    example:
      'A fictional merchant app creates a scoped sandbox API credential, queries canonical customer and invoice endpoints and inspects request logs.',
    input:
      'Create a developer application in your workspace, generate a least-privilege key and pass X-Environment headers.',
    limit:
      'API keys are shown once, hashed at rest and bounded strictly to active workspace entitlements and permissions.',
  },
  webhooks: {
    route: '/products/webhooks',
    problem: 'Let your server hear about supported events without repeatedly asking for updates.',
    example:
      'A fictional application receives a signed invoice event, checks the timestamp and raw-body signature, deduplicates its delivery ID and updates its own test record.',
    input:
      'Configure an approved HTTPS receiver, select permitted events and keep the signing secret on your server.',
    limit:
      'Hosted delivery is disabled until receiver configuration and authorization are complete. At-least-once delivery means duplicates must be handled; a browser demonstration sends no event.',
  },
};
