import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handle } from './worker.mjs';
const env = { BACKEND_ORIGIN:'https://africore-api.example', AFRICORE_GATEWAY_SECRET:'x'.repeat(40), NEON_AUTH_ORIGIN:'https://auth.example', ASSETS:{ fetch:async () => new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}}) } };
test('known public education pages remain available while unknown pages and missing assets return 404',async()=>{
 for(const path of ['/learn/freelancer-starter','/products/assistant','/solutions/freelancers','/how-it-works'])assert.equal((await handle(new Request('https://africore.example'+path),env)).status,200,path);
 for(const path of ['/missing-page','/products/not-a-service','/learn/missing-lesson','/assets/missing.js'])assert.equal((await handle(new Request('https://africore.example'+path),env)).status,404,path);
 const cssEnv={...env,ASSETS:{fetch:async()=>new Response('body{}',{headers:{'Content-Type':'text/css'}})}};
 assert.equal((await handle(new Request('https://africore.example/assets/valid.css'),cssEnv)).status,200);
});
test('API paths preserve method, exact query, body and identity without leaking the gateway credential',async()=>{
  let seen;
  const response=await handle(new Request('https://africore.example/api/v1/organizations/fixture/records?cursor=a%2Fb',{method:'POST',headers:{authorization:'Bearer user-jwt',origin:'https://africore.example','x-africore-gateway-secret':'spoof','x-africore-client-ip':'spoof','x-forwarded-for':'spoof','CF-Connecting-IP':'192.0.2.1'},body:'{"amount":100}'}),env,async request=>{seen=request;return Response.json({ok:true});});
  assert.equal(seen.url,'https://africore-api.example/api/v1/organizations/fixture/records?cursor=a%2Fb'); assert.equal(seen.headers.get('authorization'),'Bearer user-jwt'); assert.equal(seen.headers.get('origin'),'https://africore.example'); assert.equal(seen.headers.get('x-forwarded-for'),'192.0.2.1');assert.equal(seen.headers.get('x-africore-client-ip'),'192.0.2.1'); assert.equal(seen.headers.get('x-africore-gateway-secret'),env.AFRICORE_GATEWAY_SECRET); assert.equal(await seen.text(),'{"amount":100}'); assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('x-africore-gateway-secret'),null);
});
test('public gateway default-denies legacy, internal and encoded route variants without contacting origin',async()=>{
 let calls=0;const upstream=async()=>{calls++;return Response.json({});};
 for(const path of ['/v1/clients','/v1/consents','/v1/orbit','/v1/businesses','/api/v1/internal/trust/operations','/api/v1/%69nternal','/api/v1/organizations/a/%2e%2e/internal','/api//v1/internal','/api/v1/unknown'])assert.equal((await handle(new Request('https://africore.example'+path),env,upstream)).status,404,path);
 assert.equal(calls,0);
 for(const path of ['/api/auth/account','/api/v1/organizations/a/report','/api/v1/trust/verify','/api/v1/checkout/capability','/v1/health'])assert.equal((await handle(new Request('https://africore.example'+path),env,upstream)).status,200,path);
});
test('HTML backend wake-up pages, redirects, malformed origins and failures are never SPA API successes',async()=>{
  for(const upstream of [()=>new Response('loading',{headers:{'Content-Type':'text/html'}}),()=>Response.redirect('https://other.example'),()=>{throw Error('private details');}]){const response=await handle(new Request('https://africore.example/api/auth/config'),env,upstream);assert.equal(response.status,503);assert.equal((await response.json()).error,'backend_unavailable');}
  for(const invalid of [{...env,BACKEND_ORIGIN:'http://localhost'},{...env,AFRICORE_GATEWAY_SECRET:''}])assert.equal((await handle(new Request('https://africore.example/v1/health'),invalid)).status,503);
});
test('direct workspace refresh uses static fallback with auth CSP; internal paths and non-GET assets are denied',async()=>{
  const response=await worker.fetch(new Request('https://africore.example/app/personal'),env,{}); assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/https:\/\/auth.example/);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await handle(new Request('https://africore.example/internal/jobs'),env)).status,404);
  assert.equal((await handle(new Request('https://africore.example/app',{method:'POST'}),env)).status,405);
  assert.equal((await handle(new Request('http://africore.example/login'),env)).status,308);
});

test('published storefront entry paths and public catalog API have explicit gateway routes',async()=>{
 const page=await handle(new Request('https://africore.example/s/sandbox/fictional-shop'),env);assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);
 for(const path of ['/s/unknown/fictional-shop','/s/sandbox/fictional-shop/private','/api/v1/storefronts/sandbox/%2Fprivate'])assert.equal((await handle(new Request('https://africore.example'+path),env)).status,404,path);
 let called=false;const response=await handle(new Request('https://africore.example/api/v1/storefronts/sandbox/fictional-shop?q=example'),env,async request=>{called=true;assert.equal(new URL(request.url).pathname,'/api/v1/storefronts/sandbox/fictional-shop');return Response.json({products:[]});});assert.equal(called,true);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('x-africore-gateway-secret'),null);
});

test('storefront cart cookies and confirmation bodies cross the gateway without caching or capability expansion',async()=>{
 const cookie='africore_cart_fixture='+'a'.repeat(64),path='/api/v1/storefronts/sandbox/fictional-shop/cart/confirm',body=JSON.stringify({expected_version:2,quote_hash:'b'.repeat(64),acknowledge_test_purchase:true});
 const r=await handle(new Request('https://africore.example'+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':'fictional-intent','Sec-Fetch-Site':'same-origin'},body}),env,async request=>{assert.equal(new URL(request.url).pathname,path);assert.equal(request.headers.get('cookie'),cookie);assert.equal(request.headers.get('idempotency-key'),'fictional-intent');assert.equal(request.headers.get('sec-fetch-site'),'same-origin');assert.equal(await request.text(),body);return Response.json({status:'converted'},{headers:{'Set-Cookie':cookie+'; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/storefronts/sandbox/fictional-shop'}});});
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(r.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('x-africore-gateway-secret'),null);
});

test('published raster responses retain exact binary bytes and private response safeguards',async()=>{
 const bytes=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]);
 const r=await handle(new Request('https://africore.example/api/v1/storefronts/sandbox/fictional-shop/assets/12345678-1234-4123-8123-123456789012'),env,async()=>new Response(bytes,{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="public-image.webp"'}}));
 assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/webp');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
});

test('Render hibernation throttling becomes a bounded startup failure while genuine application 429s remain unchanged',async()=>{
 const response=await handle(new Request('https://africore.example/api/auth/config'),env,async()=>new Response('Too Many Requests\n',{status:429,headers:{'Content-Type':'text/plain','x-render-routing':'hibernate-rate-limited'}}));assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'20');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Frame-Options'),'DENY');assert.equal((await response.json()).error,'backend_starting');
 const limited=await handle(new Request('https://africore.example/api/auth/config'),env,async()=>Response.json({error:'rate_limited'},{status:429,headers:{'Retry-After':'4'}}));assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'4');assert.equal((await limited.json()).error,'rate_limited');
});

test('public managed-provider discovery remains available during backend sleep and requires matching trusted origin',async()=>{
 const auth='https://ep-fixture.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth',configured={...env,NEON_AUTH_BASE_URL:auth,NEON_AUTH_ORIGIN:new URL(auth).origin};let calls=0;const sleeping=async()=>{calls++;return new Response('Too Many Requests',{status:429,headers:{'x-render-routing':'hibernate-rate-limited'}});};const r=await handle(new Request('https://africore.example/api/auth/config'),configured,sleeping);assert.equal(r.status,200);assert.deepEqual(await r.json(),{provider:'neon',auth_url:auth});assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(calls,0);
 for(const base of ['https://attacker.example/auth',auth+'?secret=unexpected','http://ep-fixture.neonauth.c-6.us-east-2.aws.neon.tech/auth']){const denied=await handle(new Request('https://africore.example/api/auth/config'),{...configured,NEON_AUTH_BASE_URL:base},sleeping);assert.equal(denied.status,503);}assert.equal(calls,0);
 const account=await handle(new Request('https://africore.example/api/auth/account'),configured,sleeping);assert.equal(account.status,503);assert.equal((await account.json()).error,'backend_starting');assert.equal(calls,1);
});
