export const posRouteKinds:Record<string,readonly string[]>={};
export const posPolicies:Record<string,{services:string[]}>={};
for(const suffix of ['GET /registers','POST /registers','PUT /registers/:id','POST /registers/:id/authorize','GET /registers/:id','GET /registers/:id/products','GET /registers/:id/sales','POST /registers/:id/sessions','GET /sessions/:id','POST /sessions/:id/adjustments','POST /sessions/:id/close','POST /sessions/:id/drafts','GET /sales/:id/draft','PUT /sales/:id/draft','GET /sales/:id/quote','GET /sales/:id/receipt','POST /sales/:id/confirm','POST /sales/:id/handover','POST /sales/:id/cash-return','POST /sales/:id/stock-return']){
 const [method,path]=suffix.split(' '),key=method+' /organizations/:org/pos'+path;posRouteKinds[key]=['business'];posPolicies[key]={services:['pos']};
}
