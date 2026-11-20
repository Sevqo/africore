export const erpRouteKinds: Record<string, readonly string[]> = {};
export const erpPolicies: Record<string, { services: string[] }> = {};
for (const [suffix, service] of [
  ['GET /calendar/events','calendar'],['POST /calendar/events','calendar'],
  ['PUT /calendar/events/:id','calendar'],['POST /calendar/events/:id/respond','calendar'],
  ['POST /calendar/events/:id/cancel','calendar'],['GET /website/pages','website'],
  ['POST /website/pages','website'],['PUT /website/pages/:id','website'],
  ['POST /website/pages/:id/publish','website'],
  ['POST /website/pages/:id/unpublish','website'],
] as const) {
  const [method,path]=suffix.split(' '), key=method+' /organizations/:org'+path;
  erpRouteKinds[key]=['business']; erpPolicies[key]={services:[service]};
}
erpRouteKinds['POST /organizations/:org/accounting/sources'] = ['business'];
erpPolicies['POST /organizations/:org/accounting/sources'] = { services: ['accounting'] };
erpRouteKinds['GET /organizations/:org/accounting/sources'] = ['business'];
erpPolicies['GET /organizations/:org/accounting/sources'] = { services: ['accounting'] };
for (const suffix of [
  'GET /accounting/tax-codes',
  'POST /accounting/tax-codes',
  'PUT /accounting/tax-codes/:id',
  'POST /accounting/tax-preview',
  'POST /accounting/tax-entries',
  'GET /accounting/aging',
  'GET /accounting/configuration',
  'POST /accounting/setup',
  'POST /accounting/accounts',
  'PUT /accounting/accounts/:id',
  'POST /accounting/journals',
  'PUT /accounting/journals/:id',
  'POST /accounting/periods',
  'PUT /accounting/periods/:id/state',
  'GET /accounting/entries',
  'GET /accounting/items',
  'GET /accounting/entries/:id',
  'POST /accounting/entries',
  'PUT /accounting/entries/:id',
  'POST /accounting/entries/:id/review',
  'POST /accounting/entries/:id/post',
  'POST /accounting/entries/:id/reverse',
  'GET /accounting/report',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org' + path;
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['accounting'] };
}
for (const suffix of [
  'GET /work/projects/:id/workflows',
  'PUT /work/projects/:id/workflows',
  'GET /work/templates',
  'GET /work/sales-sources',
  'PUT /work/projects/:id/template',
  'POST /work/from-sales',
  'POST /work/projects/:id/review',
  'GET /work/my-work',
  'GET /work/target/:id',
  'GET /work/projects',
  'POST /work/projects',
  'GET /work/projects/:id',
  'PUT /work/projects/:id',
  'POST /work/projects/:id/tasks',
  'PUT /work/projects/:id/tasks/:task',
  'POST /work/projects/:id/move',
  'POST /work/projects/:id/messages',
  'GET /work/projects/:id/history/:resource',
  'GET /work/timesheets',
  'POST /work/timesheets',
  'PUT /work/timesheets/:entry',
  'POST /work/timesheets/:entry/submit',
  'POST /work/timesheets/:entry/review',
  'POST /work/timers',
  'POST /work/timers/:timer/stop',
  'POST /work/timers/:timer/discard',
  'GET /work/projects/:id/reports/progress',
  'GET /work/projects/:id/reports/tasks',
  'GET /work/projects/:id/reports/timesheets',
  'POST /work/projects/:id/schedule/preview',
  'POST /work/projects/:id/schedule/apply',
  'GET /work/projects/:id/updates',
  'POST /work/projects/:id/updates',
  'POST /work/projects/:id/tasks/:task/recurrence/generate',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org' + path;
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['work'] };
}

for (const suffix of [
  'POST /people/employees/:id/onboarding-project',
  'GET /people/org-chart',
  'GET /people/report',
  'GET /people/configuration',
  'PUT /people/configuration',
  'GET /people/departments',
  'POST /people/departments',
  'PUT /people/departments/:id',
  'GET /people/employees',
  'POST /people/employees',
  'GET /people/employees/:id',
  'PUT /people/employees/:id',
  'GET /people/employees/:id/history',
  'GET /people/employees/:id/compensation',
  'POST /people/employees/:id/compensation',
  'GET /people/leave-types',
  'POST /people/leave-types',
  'PUT /people/leave-types/:id',
  'GET /people/employees/:id/leave-balances',
  'POST /people/employees/:id/leave-preview',
  'POST /people/employees/:id/leave',
  'POST /people/employees/:id/leave-adjustments',
  'GET /people/leave',
  'POST /people/leave/:id/cancel',
  'GET /people/attendance',
  'POST /people/employees/:id/check-in',
  'POST /people/employees/:id/check-out',
  'POST /people/attendance/:id/correct',
  'GET /people/positions',
  'POST /people/positions',
  'PUT /people/positions/:id',
  'GET /people/skills',
  'POST /people/skills',
  'PUT /people/skills/:id',
  'GET /people/employees/:id/private-profile',
  'PUT /people/employees/:id/private-profile',
  'GET /people/employees/:id/resume',
  'POST /people/employees/:id/resume',
  'PUT /people/employees/:id/resume/:entry',
  'GET /people/employees/:id/skills',
  'POST /people/employees/:id/skills',
  'PUT /people/employees/:id/skills/:skill',
  'GET /people/employees/:id/certifications',
  'POST /people/employees/:id/certifications',
  'PUT /people/employees/:id/certifications/:certification',
  'GET /people/leave-calendar',
  'GET /people/attendance/analysis',
  'GET /people/recruitment/openings',
  'POST /people/recruitment/openings',
  'PUT /people/recruitment/openings/:id',
  'GET /people/recruitment/candidates',
  'POST /people/recruitment/candidates',
  'PUT /people/recruitment/candidates/:id',
  'GET /people/recruitment/applications',
  'POST /people/recruitment/applications',
  'PUT /people/recruitment/applications/:id',
  'POST /people/recruitment/applications/:id/hire',
  'GET /people/goals',
  'POST /people/goals',
  'PUT /people/goals/:id',
  'POST /people/goals/:id/progress',
  'GET /people/appraisals',
  'POST /people/appraisals',
  'PUT /people/appraisals/:id',
  'POST /people/appraisals/:id/self-assessment',
  'GET /people/lifecycle/plans',
  'POST /people/lifecycle/plans',
  'PUT /people/lifecycle/plans/:id',
  'GET /people/lifecycle/cases',
  'POST /people/lifecycle/cases',
  'PUT /people/lifecycle/cases/:id/tasks',
  'POST /people/lifecycle/cases/:id/complete',
  'GET /people/report/expansion',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org' + path;
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['people'] };
}

for (const suffix of [
  'GET /documents',
  'POST /documents',
  'GET /documents/:id',
  'PUT /documents/:id',
  'PUT /documents/:id/policy',
  'POST /documents/:id/versions',
  'GET /documents/:id/versions',
  'GET /documents/:id/content',
  'POST /documents/:id/copy',
  'PUT /documents/:id/state',
  'PUT /documents/:id/star',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org' + path;
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['documents'] };
}

for (const key of [
  'POST /organizations/:org/documents/:id/links',
  'GET /organizations/:org/document-attachments',
  'GET /organizations/:org/document-source-options',
]) {
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['documents'] };
}

erpRouteKinds['POST /organizations/:org/documents/:id/review'] = ['business'];
erpPolicies['POST /organizations/:org/documents/:id/review'] = { services: ['documents'] };
erpRouteKinds['GET /organizations/:org/documents/:id/reviewers'] = ['business'];
erpPolicies['GET /organizations/:org/documents/:id/reviewers'] = { services: ['documents'] };

for (const key of [
  'GET /organizations/:org/document-request-assignees',
  'GET /organizations/:org/document-requests',
  'POST /organizations/:org/document-requests',
  'POST /organizations/:org/document-requests/:id/submit',
  'POST /organizations/:org/document-requests/:id/cancel',
]) {
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['documents'] };
}

for (const suffix of [
  'GET /procurement-approvals',
  'GET /procurement-report',
  'POST /procurement/orders/:id/amend',
  'GET /procurement',
  'POST /procurement',
  'GET /procurement/:type/:id',
  'PUT /procurement/:type/:id',
  'POST /procurement/:type/:id/decision',
  'POST /procurement/orders/:id/receive',
  'GET /procurement/bills/:id/balance',
  'POST /procurement/bills/:id/payment',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org' + path;
  erpRouteKinds[key] = ['business'];
  erpPolicies[key] = { services: ['procurement'] };
}
