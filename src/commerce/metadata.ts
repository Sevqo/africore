export const commerceRouteKinds:Record<string,readonly string[]>={};
export const commercePolicies:Record<string,{services:string[]}>={};
commerceRouteKinds['GET /organizations/:org/commerce/stores/:id/orders']=['business'];
commercePolicies['GET /organizations/:org/commerce/stores/:id/orders']={services:['commerce']};
commerceRouteKinds['PUT /organizations/:org/commerce/stores/:id/checkout-policy']=['business'];
commercePolicies['PUT /organizations/:org/commerce/stores/:id/checkout-policy']={services:['commerce']};
for(const suffix of ['GET /stores/:id/publication-preview','POST /stores/:id/publish','POST /stores/:id/unpublish','POST /stores/:id/quote','GET /stores','POST /stores','PUT /stores/:id','GET /stores/:id/configuration','GET /stores/:id/history','PUT /stores/:id/rules','GET /stores/:id/listings','POST /stores/:id/listings','PUT /stores/:id/listings/:listing','POST /stores/:id/collections','PUT /stores/:id/collections/:collection']){const [method,path]=suffix.split(' '),key=method+' /organizations/:org/commerce'+path;commerceRouteKinds[key]=['business'];commercePolicies[key]={services:['commerce']};}
