const business = ['business'] as const,
  products = ['business', 'developer'] as const,
  all = ['business', 'personal', 'developer'] as const;
export const businessRouteKinds: Record<string, readonly string[]> = {};
export const businessPolicies: Record<string, { services: string[]; meter?: string }> = {};
function bind(
  paths: string[],
  services: string[],
  kinds: readonly string[] = business,
  meter?: string,
) {
  for (const path of paths) {
    const [method, suffix] = path.split(' '),
      key = method + ' /organizations/:org' + suffix;
    businessRouteKinds[key] = kinds;
    businessPolicies[key] = { services, meter: method === 'GET' ? undefined : meter };
  }
}
bind(
  ['GET /products', 'GET /products/:id', 'POST /products', 'PATCH /products/:id'],
  ['products'],
  products,
);
bind(
  [
    'GET /inventory/stock-counts/preview',
    'POST /inventory/stock-counts',
    'GET /inventory',
    'GET /inventory/warehouses',
    'POST /inventory/warehouses',
    'POST /inventory/warehouses/:id/locations',
    'GET /inventory/movements',
    'POST /inventory/movements',
    'GET /inventory/reservations',
    'GET /inventory/incoming',
    'POST /inventory/incoming',
    'POST /inventory/incoming/:id/action',
    'POST /inventory/adjustment-approvals',
    'GET /inventory/lots',
    'POST /inventory/lots',
    'PATCH /inventory/lots/:id',
    'GET /inventory/scraps',
    'POST /inventory/scraps',
    'GET /inventory/valuation',
    'PUT /inventory/valuation/policy',
    'GET /inventory/landed-costs',
    'POST /inventory/landed-costs/preview',
    'POST /inventory/landed-costs',
  ],
  ['inventory'],
  products,
);
bind(
  [
    'GET /crm/activity-report',
    'GET /crm/duplicates',
    'POST /crm/import/preview',
    'POST /crm/merge',
    'GET /crm/activity-plans',
    'POST /crm/activity-plans',
    'PUT /crm/activity-plans/:id',
    'POST /crm/activity-plans/:id/duplicate',
    'POST /crm/activity-plans/apply',
    'GET /crm/forecast',
    'GET /crm/forecast/report',
    'GET /crm/forecast/pivot',
    'GET /crm/pipeline-report',
    'GET /crm/report',
    'GET /crm/export',
    'POST /crm/import',
    'GET /crm/configuration',
    'PUT /crm/configuration',
    'GET /crm/entries/:id/history',
    'GET /crm',
    'GET /crm/entries',
    'POST /crm/entries',
    'PATCH /crm/entries/:id',
    'POST /crm/entries/:id/convert',
    'POST /crm/entries/:id/qualify',
    'GET /crm/companies',
    'GET /crm/customers/:id',
    'PUT /crm/customers/:id',
    'GET /crm/customers/:id/activity',
  ],
  ['crm'],
);
bind(
  [
    'GET /sales/templates',
    'POST /sales/templates',
    'PUT /sales/templates/:id',
    'GET /sales/price-lists',
    'POST /sales/price-lists',
    'PUT /sales/price-lists/:id',
    'POST /sales/pricing-preview',
    'GET /sales/quotations/:id/history',
    'GET /sales/quotations',
    'GET /sales/quotations/:id',
    'POST /sales/quotations',
    'PATCH /sales/quotations/:id',
    'POST /sales/quotations/:id/action',
    'POST /sales/quotations/:id/discount-approvals',
    'GET /sales/margin-report',
    'GET /sales/down-payments',
    'POST /sales/down-payments/preview',
    'POST /sales/down-payments',
    'GET /sales/optional-products',
    'POST /sales/optional-products',
    'PATCH /sales/optional-products/:id',
  ],
  ['sales'],
);
bind(['GET /business/policy', 'PUT /business/policy', 'GET /business/approvals'], []);
bind(['POST /business/invoices/:id/correction-review'], ['invoicing']);
bind(
  ['GET /notifications/summary', 'POST /notifications/read-all', 'POST /notifications/:id/dismiss'],
  [],
  all,
);
bind(
  [
    'GET /business/analytics',
    'GET /business/analytics/export',
    'GET /business/analytics/export-data',
    'GET /business/analytics/registry',
    'GET /business/analytics/report',
    'GET /business/analytics/report/export',
    'GET /business/analytics/report/export-data',
    'GET /business/analytics/pivot',
    'GET /business/analytics/pivot/export-data',
    'GET /business/analytics/dashboards',
    'POST /business/analytics/dashboards',
    'PATCH /business/analytics/dashboards/:id',
    'POST /business/analytics/dashboards/:id/duplicate',
    'DELETE /business/analytics/dashboards/:id',
    'GET /business/saved-reports',
    'POST /business/saved-reports',
    'DELETE /business/saved-reports/:id',
  ],
  [],
  all,
);

bind(['POST /business/workflows/:id/test'], ['automations'], products);

bind(['PATCH /inventory/warehouses/:id'], ['inventory'], products);

bind(['GET /business/orders/:id/draft', 'POST /business/orders/:id/draft'], ['orders'], products);

bind(['GET /notifications/preferences', 'PUT /notifications/preferences'], [], all);

bind(['GET /business/analytics/records'], [], all);

bind(
  [
    'GET /inventory/replenishment-suggestions',
    'POST /inventory/replenishment-suggestions/:id/review',
  ],
  ['inventory'],
  products,
);
