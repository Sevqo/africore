const kinds = ['business', 'personal', 'developer'] as const;
export const appRouteKinds: Record<string, readonly string[]> = {
  'GET /organizations/:org/apps': kinds,
  'GET /organizations/:org/apps/:app/installation-preview': kinds,
  'POST /organizations/:org/apps/:app/install': kinds,
  'GET /organizations/:org/apps/:app/uninstallation-preview': kinds,
  'POST /organizations/:org/apps/:app/uninstall': kinds,
  'PATCH /organizations/:org/apps/:app/preferences': kinds,
  'GET /organizations/:org/apps/:app/history': kinds,
};
export const appPolicies = Object.fromEntries(
  Object.keys(appRouteKinds).map((key) => [key, { services: [] as string[] }]),
);
appRouteKinds['GET /organizations/:org/website/forms'] = ['business', 'personal'];
appPolicies['GET /organizations/:org/website/forms'] = { services: ['website'] };
appRouteKinds['POST /organizations/:org/website/forms/:submission/convert-to-crm'] = ['business'];
appPolicies['POST /organizations/:org/website/forms/:submission/convert-to-crm'] = {
  services: ['website', 'crm'],
};
