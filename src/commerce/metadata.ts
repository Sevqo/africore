export const commerceRouteKinds: Record<string, readonly string[]> = {};
export const commercePolicies: Record<string, { services: string[] }> = {};
for (const route of [
  'GET /organizations/:org/commerce/assets',
  'POST /organizations/:org/commerce/assets',
  'POST /organizations/:org/commerce/assets/:id/withdraw',
  'GET /organizations/:org/commerce/assets/:id/content',
]) {
  commerceRouteKinds[route] = ['business', 'personal'];
  commercePolicies[route] = { services: ['commerce', 'website'] };
}
commercePolicies['POST /organizations/:org/commerce/assets/:id/withdraw'] = {
  services: ['commerce', 'website'],
};
commercePolicies['GET /organizations/:org/commerce/assets/:id/content'] = {
  services: ['commerce', 'website'],
};
commerceRouteKinds['GET /organizations/:org/commerce/assets/:id/preview'] = ['business', 'personal'];
commercePolicies['GET /organizations/:org/commerce/assets/:id/preview'] = {
  services: ['commerce', 'website'],
};
commerceRouteKinds['GET /organizations/:org/commerce/stores/:id/orders'] = ['business'];
commercePolicies['GET /organizations/:org/commerce/stores/:id/orders'] = { services: ['commerce'] };
commerceRouteKinds['PUT /organizations/:org/commerce/stores/:id/checkout-policy'] = ['business'];
commercePolicies['PUT /organizations/:org/commerce/stores/:id/checkout-policy'] = {
  services: ['commerce'],
};
for (const suffix of [
  'GET /stores/:id/publication-preview',
  'POST /stores/:id/publish',
  'POST /stores/:id/unpublish',
  'POST /stores/:id/quote',
  'GET /stores',
  'POST /stores',
  'PUT /stores/:id',
  'GET /stores/:id/configuration',
  'GET /stores/:id/history',
  'PUT /stores/:id/rules',
  'GET /stores/:id/listings',
  'POST /stores/:id/listings',
  'PUT /stores/:id/listings/:listing',
  'POST /stores/:id/collections',
  'PUT /stores/:id/collections/:collection',
  'GET /stores/:id/abandoned-carts',
  'GET /stores/:id/reviews',
  'POST /stores/:id/reviews/:reviewId/status',
]) {
  const [method, path] = suffix.split(' '),
    key = method + ' /organizations/:org/commerce' + path;
  commerceRouteKinds[key] = ['business'];
  commercePolicies[key] = { services: ['commerce'] };
}
