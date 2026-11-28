import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv, productFixtureBody } from './helpers';
configureTestEnv('apps-wcmp');
import { migrate, closeDb } from '../db';
import { createApp } from '../app';

let server: any, base: string, cookie: string, org: string;
const runSuffix = randomUUID().slice(0, 8);
const root = () => '/api/v1/organizations/' + org;

async function api(
  path: string,
  method = 'GET',
  body?: any,
  key = randomUUID(),
  environment = 'sandbox',
  extraCookie?: string,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: extraCookie !== undefined ? extraCookie : cookie || '',
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      'X-Environment': environment,
    },
    body: body === undefined ? undefined : JSON.stringify(productFixtureBody(path, method, body)),
  });
  const text = await response.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain text or html
  }
  return {
    status: response.status,
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const signup = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-wcmp-fixture-2026!',
  });
  cookie = signup.cookie;
  await api('/api/auth/verify', 'POST', { token: signup.data.verification_token });
  const workspace = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Savannah Craft & Retail',
    country: 'KE',
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    display_name: 'Merchant Owner',
  });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.data));
  org = workspace.data.id;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
});

test('Website app supports new blocks, starter template IDs, cross-app links, and draft deletion', async () => {
  const created = await api(root() + '/website/pages', 'POST', {
    title: 'Savannah Home',
    slug: 'savannah-home-' + runSuffix,
    template: 'retail-storefront',
    meta_title: 'Savannah Craft Home',
    meta_description: 'Handcrafted essentials shipped nationwide.',
    noindex: false,
    sections: [
      { type: 'announcement', title: 'Free Nairobi delivery over KES 5,000', body: '' },
      {
        type: 'hero',
        title: 'Crafted to last',
        body: 'Direct from local artisans.',
        button_label: 'Browse Marketplace',
        button_url: '/marketplace/sandbox',
      },
      { type: 'stats', title: 'Numbers', body: '10,000+ :: Orders\n4.9/5 :: Rating' },
      { type: 'team', title: 'Founders', body: 'Amara | Founder | Product design' },
      {
        type: 'booking',
        title: 'Book Showroom Visit',
        body: 'Pick a time.',
        button_label: 'Book Now',
        booking_url: 'https://example.com/book',
      },
      { type: 'newsletter', title: 'Stay updated', body: 'Weekly drops.' },
    ],
    menus: [
      { label: 'Home', url: '/', parent_index: null },
      { label: 'Marketplace', url: '/marketplace/sandbox', parent_index: null },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.data.template, 'retail-storefront');
  assert.equal(created.data.data.sections.length, 6);

  // Publish succeeds even with /marketplace/sandbox cross-app link
  const pub = await api(root() + '/website/pages/' + created.data.id + '/publish', 'POST', {
    expected_version: created.data.version,
  });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));

  // Actively published page cannot be deleted until unpublished
  const blockedDelete = await api(
    root() + '/website/pages/' + created.data.id,
    'DELETE',
    { expected_version: created.data.version },
  );
  assert.equal(blockedDelete.status, 409);

  // Unpublish then delete succeeds
  const unpub = await api(root() + '/website/pages/' + created.data.id + '/unpublish', 'POST', {
    expected_version: created.data.version,
  });
  assert.equal(unpub.status, 200);

  const deleted = await api(root() + '/website/pages/' + created.data.id, 'DELETE', {
    expected_version: created.data.version,
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal(deleted.data.deleted, true);

  const listed = await api(root() + '/website/pages');
  assert.equal(
    listed.data.data.some((p: any) => p.id === created.data.id),
    false,
  );
});

test('Commerce + Amazon-style Multi-Vendor Marketplace: opt-in indexing, search, deals, reviews, direct checkout & unpublish removal', async () => {
  const inSlug = 'nyeri-roasters-' + runSuffix;
  const outSlug = 'private-wholesale-' + runSuffix;
  // 1. Create two stores: one opted IN to Marketplace, one opted OUT
  const optedIn = await api(root() + '/commerce/stores', 'POST', {
    expected_version: 0,
    store: {
      name: 'Nyeri Roasters',
      slug: inSlug,
      currency: 'KES',
      theme: 'market',
      marketplace_listed: true,
      marketplace_category: 'Food & Beverages',
      marketplace_tagline: 'Single-origin highland coffee',
      marketplace_location: 'Nairobi, Kenya',
      announcement_bar: 'Fresh roast every Monday',
    },
  });
  assert.equal(optedIn.status, 201, JSON.stringify(optedIn.data));
  const storeId = optedIn.data.id;

  const optedOut = await api(root() + '/commerce/stores', 'POST', {
    expected_version: 0,
    store: {
      name: 'Private Wholesale Hub',
      slug: outSlug,
      currency: 'KES',
      theme: 'compact',
      marketplace_listed: false,
    },
  });
  assert.equal(optedOut.status, 201);

  // 2. Add shipping + coupon rules and enable sandbox checkout on optedIn store
  const shippingId = randomUUID();
  const rulesRes = await api(root() + '/commerce/stores/' + storeId + '/rules', 'PUT', {
    expected_version: optedIn.data.version,
    shipping: [
      {
        id: shippingId,
        name: 'Nairobi Same-Day',
        kind: 'shipping',
        countries: ['KE'],
        rate_minor: 30000,
        free_above_minor: 500000,
        active: true,
      },
    ],
    discounts: [
      {
        code: 'ROAST10',
        kind: 'percentage',
        value: 1000,
        minimum_subtotal_minor: 0,
        maximum_discount_minor: null,
        starts_at: new Date(Date.now() - 60000).toISOString(),
        ends_at: new Date(Date.now() + 86400000 * 30).toISOString(),
        active: true,
      },
    ],
  });
  assert.equal(rulesRes.status, 200, JSON.stringify(rulesRes.data));

  const checkoutPolicy = await api(
    root() + '/commerce/stores/' + storeId + '/checkout-policy',
    'PUT',
    {
      expected_version: rulesRes.data.version,
      enabled: true,
      consent_notice_version: 'v1',
      acknowledge_automated_invoicing: true,
      acknowledge_sandbox_only: true,
    },
  );
  assert.equal(checkoutPolicy.status, 200, JSON.stringify(checkoutPolicy.data));

  // 3. Create canonical products and listings
  const prodA = await api(root() + '/products', 'POST', {
    sku: 'NYR-AA-500',
    name: 'Nyeri AA Whole Bean 500g',
    sale_price_minor: 180000,
    purchase_cost_minor: 90000,
    currency: 'KES',
    category: 'Food & Beverages',
    track_inventory: false,
  });
  assert.equal(prodA.status, 201, JSON.stringify(prodA.data));

  const listingA = await api(root() + '/commerce/stores/' + storeId + '/listings', 'POST', {
    expected_version: 0,
    product_id: prodA.data.id,
    expected_product_version: prodA.data.version,
    title: 'Nyeri AA Whole Bean 500g',
    description: 'Washed single-origin AA roast with bright citrus notes.',
    state: 'active',
    compare_at_minor: 220000,
    category: 'Food & Beverages',
    marketplace_visible: true,
  });
  assert.equal(listingA.status, 201, JSON.stringify(listingA.data));

  const listingPrivate = await api(
    root() + '/commerce/stores/' + optedOut.data.id + '/listings',
    'POST',
    {
      expected_version: 0,
      product_id: prodA.data.id,
      expected_product_version: prodA.data.version,
      title: 'Private Catalog Item',
      description: 'Should never appear on public marketplace.',
      state: 'active',
    },
  );
  assert.equal(listingPrivate.status, 201);

  // 4. Publish both stores
  const prevIn = await api(root() + '/commerce/stores/' + storeId + '/publication-preview');
  const pubIn = await api(root() + '/commerce/stores/' + storeId + '/publish', 'POST', {
    expected_version: prevIn.data.expected_version,
    review_hash: prevIn.data.review_hash,
    acknowledge_publication: true,
  });
  assert.equal(pubIn.status, 200, JSON.stringify(pubIn.data));
  assert.equal(pubIn.data.marketplace_indexed, true);
  assert.equal(pubIn.data.marketplace_product_count, 1);

  const prevOut = await api(
    root() + '/commerce/stores/' + optedOut.data.id + '/publication-preview',
  );
  const pubOut = await api(root() + '/commerce/stores/' + optedOut.data.id + '/publish', 'POST', {
    expected_version: prevOut.data.expected_version,
    review_hash: prevOut.data.review_hash,
    acknowledge_publication: true,
  });
  assert.equal(pubOut.status, 200);
  assert.equal(pubOut.data.marketplace_indexed, false);

  // 5. Public Marketplace search & filters: only Nyeri Roasters appears, never Private Wholesale Hub!
  const mpSearch = await api(
    `/api/v1/marketplace/sandbox/products?q=Nyeri&store=${inSlug}&deals_only=1&sort=price_asc`,
    'GET',
    undefined,
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(mpSearch.status, 200, JSON.stringify(mpSearch.data));
  assert.equal(mpSearch.data.total, 1);
  assert.equal(mpSearch.data.products[0].store_slug, inSlug);
  assert.equal(mpSearch.data.products[0].discount_pct, 18);
  assert.equal(mpSearch.data.products[0].checkout_available, true);

  const mpStores = await api(
    '/api/v1/marketplace/sandbox/stores',
    'GET',
    undefined,
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(mpStores.status, 200);
  assert.equal(
    mpStores.data.stores.some((s: any) => s.slug === outSlug),
    false,
  );
  assert.equal(
    mpStores.data.stores.some((s: any) => s.slug === inSlug),
    true,
  );

  // 6. Customer review submission updates Marketplace ratings; moderation hides review cleanly
  const rev = await api(
    `/api/v1/storefronts/sandbox/${inSlug}/reviews`,
    'POST',
    {
      listing_id: listingA.data.id,
      product_id: prodA.data.id,
      reviewer_name: 'Wanjiku M.',
      rating: 5,
      title: 'Incredible aroma',
      body: 'Delivered same afternoon and tastes super fresh!',
    },
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(rev.status, 201, JSON.stringify(rev.data));

  const mpAfterRev = await api(
    `/api/v1/marketplace/sandbox/products?store=${inSlug}`,
    'GET',
    undefined,
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(mpAfterRev.data.products[0].rating_avg, 5);
  assert.equal(mpAfterRev.data.products[0].review_count, 1);

  const modHide = await api(
    root() + '/commerce/stores/' + storeId + '/reviews/' + rev.data.id + '/status',
    'POST',
    { status: 'hidden' },
  );
  assert.equal(modHide.status, 200);
  const mpAfterHide = await api(
    `/api/v1/marketplace/sandbox/products?store=${inSlug}`,
    'GET',
    undefined,
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(mpAfterHide.data.products[0].review_count, 0);

  // 7. Direct-to-seller cart (2-step POST {} -> PUT items) shows up in merchant's Abandoned Carts report
  const cartCreate = await api(
    `/api/v1/storefronts/sandbox/${inSlug}/cart`,
    'POST',
    {},
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(cartCreate.status, 201, JSON.stringify(cartCreate.data));
  const cartPut = await api(
    `/api/v1/storefronts/sandbox/${inSlug}/cart`,
    'PUT',
    {
      expected_version: cartCreate.data.version,
      cart: {
        items: [{ product_id: prodA.data.id, quantity_milli: 2000 }],
        discount_code: 'ROAST10',
        shipping_option_id: shippingId,
      },
      country: 'KE',
    },
    randomUUID(),
    'sandbox',
    cartCreate.cookie,
  );
  assert.equal(cartPut.status, 200, JSON.stringify(cartPut.data));

  const abandoned = await api(root() + '/commerce/stores/' + storeId + '/abandoned-carts');
  assert.equal(abandoned.status, 200, JSON.stringify(abandoned.data));
  assert.equal(abandoned.data.total, 1);
  assert.equal(abandoned.data.data[0].discount_code, 'ROAST10');
  assert.equal(abandoned.data.data[0].item_count, 1);

  // 8. Unpublishing removes store & products cleanly from Marketplace
  const unpubStore = await api(root() + '/commerce/stores/' + storeId + '/unpublish', 'POST', {
    expected_publication_version: pubIn.data.version,
    acknowledge_unpublish: true,
  });
  assert.equal(unpubStore.status, 200);

  const mpAfterUnpub = await api(
    `/api/v1/marketplace/sandbox/products?store=${inSlug}`,
    'GET',
    undefined,
    randomUUID(),
    'sandbox',
    '',
  );
  assert.equal(mpAfterUnpub.data.total, 0);
});

test('POS returns live available_milli stock on product tiles and wires Floors, Tables, KDS & Loyalty', async () => {
  // Activate inventory + create warehouse + tracked product with stock
  await api(root() + '/services/inventory/activate', 'POST', {});
  const wh = await api(root() + '/inventory/warehouses', 'POST', {
    code: 'POS-MAIN',
    name: 'Counter Warehouse',
    address: 'Nairobi CBD',
    status: 'active',
  });
  assert.equal(wh.status, 201, JSON.stringify(wh.data));

  const prod = await api(root() + '/products', 'POST', {
    sku: 'ESP-DBL',
    name: 'Double Espresso',
    sale_price_minor: 35000,
    purchase_cost_minor: 10000,
    currency: 'KES',
    category: 'Coffee',
    track_inventory: true,
  });
  assert.equal(prod.status, 201, JSON.stringify(prod.data));

  const adj = await api(root() + '/inventory/movements', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    kind: 'receipt',
    quantity_milli: 25000,
    reason: 'Opening counter stock receipt',
  });
  assert.equal(adj.status, 201, JSON.stringify(adj.data));

  const walkIn = await api(root() + '/records/customers', 'POST', {
    name: 'Walk-in Guest',
    status: 'active',
  });
  assert.equal(walkIn.status, 201, JSON.stringify(walkIn.data));

  const reg = await api(root() + '/pos/registers', 'POST', {
    expected_version: 0,
    name: 'Front Counter',
    currency: 'KES',
    tax_bps: 1600,
    timezone: 'Africa/Nairobi',
    warehouse_id: wh.data.id,
    location_id: null,
    default_customer_id: walkIn.data.id,
    cashier_ids: [],
    manager_ids: [],
    cashier_discount_bps: 1000,
    manager_discount_bps: 2000,
    allow_cash: true,
    electronic_method: 'sandbox_simulator',
    allow_pending_orders: true,
    active: true,
    acknowledge_automated_invoicing: true,
    acknowledge_recorded_cash: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));

  const posCatalog = await api(root() + '/pos/registers/' + reg.data.id + '/products?q=Espresso');
  assert.equal(posCatalog.status, 200, JSON.stringify(posCatalog.data));
  const hit = posCatalog.data.data.find((p: any) => p.id === prod.data.id);
  assert.ok(hit, 'Tracked product returned on POS register');
  assert.equal(hit.available_milli, 25000);

  // Hospitality Floors, Tables & KDS ticket lifecycle
  const floor = await api(root() + '/pos/floors', 'POST', {
    name: 'Garden Terrace',
    location: 'Outdoor',
  });
  assert.equal(floor.status, 201, JSON.stringify(floor.data));

  const tbl = await api(root() + '/pos/tables', 'POST', {
    floor_id: floor.data.id,
    table_number: 'G1',
    seats: 4,
  });
  assert.equal(tbl.status, 201, JSON.stringify(tbl.data));

  const kds = await api(root() + '/pos/kds/tickets', 'POST', {
    order_ref: 'POS-TEST1',
    table_number: 'G1',
    station: 'bar',
    items: [{ name: 'Double Espresso', qty: 2 }],
  });
  assert.equal(kds.status, 201, JSON.stringify(kds.data));

  const bumped = await api(root() + '/pos/kds/tickets/' + kds.data.id + '/status', 'POST', {
    status: 'ready',
  });
  assert.equal(bumped.status, 200, JSON.stringify(bumped.data));
  assert.equal(bumped.data.status, 'ready');
});
