import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { now, unseal } from '../platform/crypto';
import { decode, read, currentMember } from '../erp/store';
import { publicSlug } from './contracts';
import { checkoutReadiness } from './checkout-policy';
import { store } from './catalog';

export const MARKETPLACE_CATEGORIES = [
  'Electronics',
  'Fashion & Apparel',
  'Home & Living',
  'Food & Beverages',
  'Health & Beauty',
  'Office & Stationery',
  'Hardware & Tools',
  'Agriculture & Fresh',
  'Services & Digital',
  'General',
] as const;

export const MARKETPLACE_NOTICE =
  'AfriCore Marketplace connects buyers directly with independent merchant-owned stores. AfriCore owns zero inventory — every product, price, invoice, and delivery is owned and fulfilled directly by the merchant.';

const environmentSchema = z.enum(['sandbox', 'production']);

const literalLike = (value: string) =>
  '%' + value.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';

export async function removeMarketplaceStore(storeId: string) {
  await dbRun('DELETE FROM ac_marketplace_listings WHERE store_id=?', [storeId]);
  await dbRun('DELETE FROM ac_marketplace_stores WHERE store_id=?', [storeId]);
}

/**
 * Synchronizes a published, explicitly opted-in Commerce store (`marketplace_listed: true`)
 * into the plaintext public Marketplace discovery tables. Stores that are unpublished,
 * opted-out, or inactive are immediately removed so only current opted-in public data is indexed.
 */
export async function syncMarketplaceStore(a: Access, storeId: string) {
  const pub = await dbGet(
    "SELECT p.*, w.kind AS workspace_kind, w.status AS workspace_status FROM ac_publications p JOIN ac_workspaces w ON w.id=p.org_id WHERE p.org_id=? AND p.environment=? AND p.source_id=? AND p.source_kind='commerce' AND p.active=1",
    [a.org, a.environment, storeId],
  );
  if (!pub || pub.workspace_kind !== 'business' || pub.workspace_status !== 'active') {
    await removeMarketplaceStore(storeId);
    return { indexed: false, product_count: 0 };
  }

  let s;
  try {
    s = await read(a, storeId, 'commerce_store');
  } catch {
    await removeMarketplaceStore(storeId);
    return { indexed: false, product_count: 0 };
  }

  const settings = s.data?.settings || {};
  if (!settings.marketplace_listed) {
    await removeMarketplaceStore(storeId);
    return { indexed: false, product_count: 0 };
  }

  const manifestContext = JSON.stringify([
    'commerce-publication',
    a.org,
    a.environment,
    pub.id,
    Number(pub.version),
  ]);
  let manifest: any;
  try {
    manifest = JSON.parse(unseal(pub.snapshot, manifestContext));
  } catch {
    await removeMarketplaceStore(storeId);
    return { indexed: false, product_count: 0 };
  }

  const readiness = await checkoutReadiness(a, s).catch(() => ({ available: false, reason: '' }));
  const listedRows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='commerce_listing' AND status='active'",
    [a.org, a.environment, storeId],
  );
  const activeListings = new Map(listedRows.map((row) => [row.id, decode(a, row)]));

  const productIds = (manifest.listings || []).map((l: any) => l.product_id);
  const productRows = productIds.length
    ? await dbAll(
        'SELECT id,name,status,version,data FROM ac_products WHERE org_id=? AND environment=? AND id IN (' +
          productIds.map(() => '?').join(',') +
          ')',
        [a.org, a.environment, ...productIds],
      )
    : [];
  const productById = new Map(productRows.map((row) => [row.id, row]));

  const reviewRows = await dbAll(
    "SELECT listing_id, AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM ac_commerce_reviews WHERE environment=? AND store_id=? AND status='published' GROUP BY listing_id",
    [a.environment, storeId],
  );
  const ratingByListing = new Map<string, { avg: number; count: number }>();
  let totalRatingWeighted = 0;
  let totalReviews = 0;
  for (const r of reviewRows) {
    const cnt = Number(r.cnt || 0);
    const avg = Number(r.avg_rating || 0);
    ratingByListing.set(r.listing_id, { avg: Math.round(avg * 10) / 10, count: cnt });
    totalRatingWeighted += avg * cnt;
    totalReviews += cnt;
  }
  const storeRatingAvg =
    totalReviews > 0 ? Math.round((totalRatingWeighted / totalReviews) * 10) / 10 : 0;

  const storeCategory = String(settings.marketplace_category || 'General').trim() || 'General';
  const at = now();
  const indexedItems: any[] = [];

  for (const l of manifest.listings || []) {
    const liveListing = activeListings.get(l.id);
    if (!liveListing || liveListing.data.marketplace_visible === false) continue;
    const pRow = productById.get(l.product_id);
    if (!pRow || pRow.status !== 'active') continue;
    const prod = JSON.parse(pRow.data);
    if (prod.currency !== manifest.currency) continue;
    const unitPrice = Number(prod.sale_price_minor);
    const compareAt =
      liveListing.data.compare_at_minor && Number(liveListing.data.compare_at_minor) > unitPrice
        ? Number(liveListing.data.compare_at_minor)
        : null;
    const firstImage = Array.isArray(l.assets) && l.assets.length ? l.assets[0] : null;
    const ratingInfo = ratingByListing.get(l.id) || { avg: 0, count: 0 };
    const listingCategory =
      String(liveListing.data.category || prod.category || storeCategory).trim() || storeCategory;

    indexedItems.push({
      listing_id: l.id,
      store_id: storeId,
      org_id: a.org,
      environment: a.environment,
      store_slug: manifest.slug,
      store_name: manifest.name,
      product_id: pRow.id,
      title: l.title || pRow.name,
      description: l.description || prod.description || '',
      category: listingCategory,
      sku: prod.sku || '',
      variant: prod.variant || '',
      unit: prod.unit || 'unit',
      currency: prod.currency,
      unit_price_minor: unitPrice,
      compare_at_minor: compareAt,
      image_asset_id: firstImage?.id || null,
      image_alt: firstImage?.alt || l.title || pRow.name,
      in_stock: 1,
      minimum_quantity_milli: Number(liveListing.data.minimum_quantity_milli || 1000),
      rating_avg: ratingInfo.avg,
      review_count: ratingInfo.count,
      published_at: pub.published_at,
      updated_at: at,
    });
  }

  await dbRun('DELETE FROM ac_marketplace_listings WHERE store_id=?', [storeId]);
  await dbRun(
    `INSERT INTO ac_marketplace_stores(
      store_id,org_id,environment,slug,name,tagline,description,category,location,currency,
      brand_color,logo_asset_id,banner_asset_id,checkout_available,verified,product_count,
      rating_avg,review_count,published_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(store_id) DO UPDATE SET
      slug=excluded.slug,name=excluded.name,tagline=excluded.tagline,description=excluded.description,
      category=excluded.category,location=excluded.location,currency=excluded.currency,
      brand_color=excluded.brand_color,logo_asset_id=excluded.logo_asset_id,
      banner_asset_id=excluded.banner_asset_id,checkout_available=excluded.checkout_available,
      verified=excluded.verified,product_count=excluded.product_count,
      rating_avg=excluded.rating_avg,review_count=excluded.review_count,
      published_at=excluded.published_at,updated_at=excluded.updated_at`,
    [
      storeId,
      a.org,
      a.environment,
      manifest.slug,
      manifest.name,
      String(settings.marketplace_tagline || ''),
      String(manifest.description || ''),
      storeCategory,
      String(settings.marketplace_location || ''),
      manifest.currency,
      manifest.brand_color || '#047857',
      settings.logo_asset_id || null,
      settings.banner_asset_id || null,
      readiness.available ? 1 : 0,
      1,
      indexedItems.length,
      storeRatingAvg,
      totalReviews,
      pub.published_at,
      at,
    ],
  );

  for (const item of indexedItems) {
    await dbRun(
      `INSERT INTO ac_marketplace_listings(
        listing_id,store_id,org_id,environment,store_slug,store_name,product_id,title,description,
        category,sku,variant,unit,currency,unit_price_minor,compare_at_minor,image_asset_id,
        image_alt,in_stock,minimum_quantity_milli,rating_avg,review_count,published_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        item.listing_id,
        item.store_id,
        item.org_id,
        item.environment,
        item.store_slug,
        item.store_name,
        item.product_id,
        item.title,
        item.description,
        item.category,
        item.sku,
        item.variant,
        item.unit,
        item.currency,
        item.unit_price_minor,
        item.compare_at_minor,
        item.image_asset_id,
        item.image_alt,
        item.in_stock,
        item.minimum_quantity_milli,
        item.rating_avg,
        item.review_count,
        item.published_at,
        item.updated_at,
      ],
    );
  }

  return { indexed: true, product_count: indexedItems.length };
}

export async function marketplaceFeatured(environment: string) {
  const env = environmentSchema.parse(environment);
  const stats = await dbGet(
    'SELECT COUNT(*) AS store_count, COALESCE(SUM(product_count),0) AS product_count FROM ac_marketplace_stores WHERE environment=?',
    [env],
  );
  const categories = await dbAll(
    'SELECT category, COUNT(*) AS count FROM ac_marketplace_listings WHERE environment=? GROUP BY category ORDER BY count DESC, category ASC LIMIT 24',
    [env],
  );
  const stores = await dbAll(
    'SELECT * FROM ac_marketplace_stores WHERE environment=? ORDER BY product_count DESC, rating_avg DESC, updated_at DESC LIMIT 12',
    [env],
  );
  const deals = await dbAll(
    `SELECT l.*, s.brand_color, s.location AS store_location, s.checkout_available, s.verified AS store_verified
     FROM ac_marketplace_listings l
     JOIN ac_marketplace_stores s ON s.store_id=l.store_id
     WHERE l.environment=? AND l.compare_at_minor IS NOT NULL AND l.compare_at_minor > l.unit_price_minor
     ORDER BY (l.compare_at_minor - l.unit_price_minor) DESC, l.updated_at DESC
     LIMIT 12`,
    [env],
  );
  const featured = await dbAll(
    `SELECT l.*, s.brand_color, s.location AS store_location, s.checkout_available, s.verified AS store_verified
     FROM ac_marketplace_listings l
     JOIN ac_marketplace_stores s ON s.store_id=l.store_id
     WHERE l.environment=?
     ORDER BY l.rating_avg DESC, l.review_count DESC, l.updated_at DESC
     LIMIT 24`,
    [env],
  );

  return {
    environment: env,
    notice: MARKETPLACE_NOTICE,
    stats: {
      store_count: Number(stats?.store_count || 0),
      product_count: Number(stats?.product_count || 0),
      category_count: categories.length,
    },
    categories: categories.map((c) => ({ name: c.category, count: Number(c.count) })),
    stores: stores.map(formatMarketplaceStore),
    deals: deals.map(formatMarketplaceProduct),
    featured_products: featured.map(formatMarketplaceProduct),
  };
}

export async function listMarketplaceProducts(environment: string, input: unknown = {}) {
  const env = environmentSchema.parse(environment);
  const q = z
    .object({
      q: z.string().trim().max(120).default(''),
      category: z.string().trim().max(80).default(''),
      store: z.string().trim().max(63).default(''),
      currency: z.string().trim().max(8).default(''),
      min_price: z.coerce.number().int().min(0).optional(),
      max_price: z.coerce.number().int().min(0).optional(),
      deals_only: z.enum(['0', '1', 'true', 'false']).optional(),
      sort: z.enum(['featured', 'price_asc', 'price_desc', 'newest', 'rating']).default('featured'),
      offset: z.coerce.number().int().min(0).max(5000).default(0),
      limit: z.coerce.number().int().min(1).max(48).default(24),
    })
    .strict()
    .parse(input);

  const clauses = ['l.environment=?'];
  const params: any[] = [env];
  if (q.q) {
    clauses.push(
      "(LOWER(l.title) LIKE ? ESCAPE '\\' OR LOWER(l.description) LIKE ? ESCAPE '\\' OR LOWER(l.store_name) LIKE ? ESCAPE '\\' OR LOWER(l.category) LIKE ? ESCAPE '\\' OR LOWER(l.sku) LIKE ? ESCAPE '\\')",
    );
    const pat = literalLike(q.q);
    params.push(pat, pat, pat, pat, pat);
  }
  if (q.category) {
    clauses.push('LOWER(l.category)=?');
    params.push(q.category.toLowerCase());
  }
  if (q.store) {
    clauses.push('l.store_slug=?');
    params.push(q.store.toLowerCase());
  }
  if (q.currency) {
    clauses.push('l.currency=?');
    params.push(q.currency.toUpperCase());
  }
  if (q.min_price !== undefined) {
    clauses.push('l.unit_price_minor >= ?');
    params.push(q.min_price);
  }
  if (q.max_price !== undefined) {
    clauses.push('l.unit_price_minor <= ?');
    params.push(q.max_price);
  }
  if (q.deals_only === '1' || q.deals_only === 'true') {
    clauses.push('l.compare_at_minor IS NOT NULL AND l.compare_at_minor > l.unit_price_minor');
  }

  const orderBy =
    q.sort === 'price_asc'
      ? 'l.unit_price_minor ASC, l.title ASC'
      : q.sort === 'price_desc'
        ? 'l.unit_price_minor DESC, l.title ASC'
        : q.sort === 'newest'
          ? 'l.published_at DESC, l.updated_at DESC'
          : q.sort === 'rating'
            ? 'l.rating_avg DESC, l.review_count DESC, l.updated_at DESC'
            : 'l.rating_avg DESC, CASE WHEN l.compare_at_minor > l.unit_price_minor THEN 1 ELSE 0 END DESC, l.updated_at DESC';

  const whereSql = clauses.join(' AND ');
  const countRow = await dbGet(
    `SELECT COUNT(*) AS total FROM ac_marketplace_listings l WHERE ${whereSql}`,
    params,
  );
  const rows = await dbAll(
    `SELECT l.*, s.brand_color, s.location AS store_location, s.checkout_available, s.verified AS store_verified
     FROM ac_marketplace_listings l
     JOIN ac_marketplace_stores s ON s.store_id=l.store_id
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, q.limit + 1, q.offset],
  );
  const categories = await dbAll(
    'SELECT category, COUNT(*) AS count FROM ac_marketplace_listings WHERE environment=? GROUP BY category ORDER BY count DESC, category ASC LIMIT 30',
    [env],
  );
  const stores = await dbAll(
    'SELECT slug, name, product_count, location, verified FROM ac_marketplace_stores WHERE environment=? ORDER BY product_count DESC, name ASC LIMIT 50',
    [env],
  );

  return {
    environment: env,
    notice: MARKETPLACE_NOTICE,
    total: Number(countRow?.total || 0),
    offset: q.offset,
    limit: q.limit,
    has_more: rows.length > q.limit,
    products: rows.slice(0, q.limit).map(formatMarketplaceProduct),
    facets: {
      categories: categories.map((c) => ({ name: c.category, count: Number(c.count) })),
      stores: stores.map((s) => ({
        slug: s.slug,
        name: s.name,
        product_count: Number(s.product_count),
        location: s.location,
        verified: !!s.verified,
      })),
    },
  };
}

export async function listMarketplaceStores(environment: string, input: unknown = {}) {
  const env = environmentSchema.parse(environment);
  const q = z
    .object({
      q: z.string().trim().max(120).default(''),
      category: z.string().trim().max(80).default(''),
      offset: z.coerce.number().int().min(0).max(2000).default(0),
      limit: z.coerce.number().int().min(1).max(40).default(20),
    })
    .strict()
    .parse(input);

  const clauses = ['environment=?'];
  const params: any[] = [env];
  if (q.q) {
    clauses.push(
      "(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(tagline) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\' OR LOWER(location) LIKE ? ESCAPE '\\')",
    );
    const pat = literalLike(q.q);
    params.push(pat, pat, pat, pat);
  }
  if (q.category) {
    clauses.push('LOWER(category)=?');
    params.push(q.category.toLowerCase());
  }

  const whereSql = clauses.join(' AND ');
  const countRow = await dbGet(
    `SELECT COUNT(*) AS total FROM ac_marketplace_stores WHERE ${whereSql}`,
    params,
  );
  const rows = await dbAll(
    `SELECT * FROM ac_marketplace_stores WHERE ${whereSql} ORDER BY product_count DESC, rating_avg DESC, name ASC LIMIT ? OFFSET ?`,
    [...params, q.limit + 1, q.offset],
  );

  return {
    environment: env,
    notice: MARKETPLACE_NOTICE,
    total: Number(countRow?.total || 0),
    offset: q.offset,
    has_more: rows.length > q.limit,
    stores: rows.slice(0, q.limit).map(formatMarketplaceStore),
  };
}

function formatMarketplaceStore(row: any) {
  return {
    store_id: row.store_id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline || '',
    description: row.description || '',
    category: row.category || 'General',
    location: row.location || '',
    currency: row.currency,
    brand_color: row.brand_color || '#047857',
    logo_url: row.logo_asset_id
      ? `/api/v1/storefronts/${row.environment}/${row.slug}/assets/${row.logo_asset_id}`
      : null,
    banner_url: row.banner_asset_id
      ? `/api/v1/storefronts/${row.environment}/${row.slug}/assets/${row.banner_asset_id}`
      : null,
    store_url: `/s/${row.environment}/${row.slug}`,
    checkout_available: !!row.checkout_available,
    verified: !!row.verified,
    product_count: Number(row.product_count || 0),
    rating_avg: Number(row.rating_avg || 0),
    review_count: Number(row.review_count || 0),
    published_at: row.published_at,
  };
}

function formatMarketplaceProduct(row: any) {
  const unitPrice = Number(row.unit_price_minor);
  const compareAt = row.compare_at_minor ? Number(row.compare_at_minor) : null;
  const discountPct =
    compareAt && compareAt > unitPrice
      ? Math.round(((compareAt - unitPrice) / compareAt) * 100)
      : 0;
  return {
    listing_id: row.listing_id,
    product_id: row.product_id,
    store_id: row.store_id,
    store_slug: row.store_slug,
    store_name: row.store_name,
    store_url: `/s/${row.environment}/${row.store_slug}`,
    product_url: `/s/${row.environment}/${row.store_slug}/p/${row.listing_id}`,
    store_brand_color: row.brand_color || '#047857',
    store_location: row.store_location || '',
    store_verified: !!row.store_verified,
    checkout_available: !!row.checkout_available,
    title: row.title,
    description: row.description || '',
    category: row.category || 'General',
    sku: row.sku || '',
    variant: row.variant || '',
    unit: row.unit || 'unit',
    currency: row.currency,
    unit_price_minor: unitPrice,
    compare_at_minor: compareAt,
    discount_pct: discountPct,
    image_url: row.image_asset_id
      ? `/api/v1/storefronts/${row.environment}/${row.store_slug}/assets/${row.image_asset_id}`
      : null,
    image_alt: row.image_alt || row.title,
    in_stock: !!row.in_stock,
    minimum_quantity_milli: Number(row.minimum_quantity_milli || 1000),
    rating_avg: Number(row.rating_avg || 0),
    review_count: Number(row.review_count || 0),
    published_at: row.published_at,
  };
}

async function resolvePublicStoreMeta(environment: string, slug: string) {
  const env = environmentSchema.parse(environment);
  publicSlug.parse(slug);
  const pub = await dbGet(
    "SELECT p.org_id, p.source_id, p.environment, p.slug FROM ac_publications p JOIN ac_workspaces w ON w.id=p.org_id WHERE p.environment=? AND p.slug=? AND p.active=1 AND p.source_kind='commerce' AND w.kind='business' AND w.status='active'",
    [env, slug],
  );
  if (!pub) fail(404, 'Storefront not found');
  return { org_id: pub.org_id, store_id: pub.source_id, environment: env, slug: pub.slug };
}

async function recomputeReviewAggregates(environment: string, storeId: string, listingId: string) {
  const listingAgg = await dbGet(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM ac_commerce_reviews WHERE environment=? AND store_id=? AND listing_id=? AND status='published'",
    [environment, storeId, listingId],
  );
  const lAvg = listingAgg?.cnt ? Math.round(Number(listingAgg.avg_rating) * 10) / 10 : 0;
  const lCnt = Number(listingAgg?.cnt || 0);
  await dbRun(
    'UPDATE ac_marketplace_listings SET rating_avg=?, review_count=? WHERE listing_id=? AND environment=?',
    [lAvg, lCnt, listingId, environment],
  );

  const storeAgg = await dbGet(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM ac_commerce_reviews WHERE environment=? AND store_id=? AND status='published'",
    [environment, storeId],
  );
  const sAvg = storeAgg?.cnt ? Math.round(Number(storeAgg.avg_rating) * 10) / 10 : 0;
  const sCnt = Number(storeAgg?.cnt || 0);
  await dbRun(
    'UPDATE ac_marketplace_stores SET rating_avg=?, review_count=? WHERE store_id=? AND environment=?',
    [sAvg, sCnt, storeId, environment],
  );
}

export async function listPublicStoreReviews(environment: string, slug: string, input: unknown = {}) {
  const meta = await resolvePublicStoreMeta(environment, slug);
  const q = z
    .object({
      listing_id: z.string().uuid().optional(),
      offset: z.coerce.number().int().min(0).max(500).default(0),
    })
    .strict()
    .parse(input);
  const clauses = ["environment=?", "store_id=?", "status='published'"];
  const params: any[] = [meta.environment, meta.store_id];
  if (q.listing_id) {
    clauses.push('listing_id=?');
    params.push(q.listing_id);
  }
  const rows = await dbAll(
    `SELECT id,listing_id,product_id,reviewer_name,rating,title,body,verified_purchase,created_at
     FROM ac_commerce_reviews WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC LIMIT 51 OFFSET ?`,
    [...params, q.offset],
  );
  const agg = await dbGet(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM ac_commerce_reviews WHERE ${clauses.join(' AND ')}`,
    params,
  );
  return {
    rating_avg: agg?.cnt ? Math.round(Number(agg.avg_rating) * 10) / 10 : 0,
    review_count: Number(agg?.cnt || 0),
    has_more: rows.length > 50,
    data: rows.slice(0, 50).map((r) => ({
      ...r,
      rating: Number(r.rating),
      verified_purchase: !!r.verified_purchase,
    })),
  };
}

export async function submitPublicStoreReview(environment: string, slug: string, input: unknown) {
  const meta = await resolvePublicStoreMeta(environment, slug);
  const d = z
    .object({
      listing_id: z.string().uuid(),
      product_id: z.string().uuid(),
      reviewer_name: z.string().trim().min(2).max(80),
      rating: z.number().int().min(1).max(5),
      title: z.string().trim().max(120).default(''),
      body: z.string().trim().min(5).max(1500),
    })
    .strict()
    .parse(input);
  const listingRow = await dbGet(
    "SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND root_id=? AND kind='commerce_listing' AND status='active'",
    [d.listing_id, meta.org_id, meta.environment, meta.store_id],
  );
  if (!listingRow) fail(404, 'Published product listing not found');
  const id = randomUUID();
  const at = now();
  await dbRun(
    "INSERT INTO ac_commerce_reviews(id,org_id,environment,store_id,listing_id,product_id,reviewer_name,rating,title,body,verified_purchase,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,'published',?)",
    [
      id,
      meta.org_id,
      meta.environment,
      meta.store_id,
      d.listing_id,
      d.product_id,
      d.reviewer_name,
      d.rating,
      d.title,
      d.body,
      at,
    ],
  );
  await recomputeReviewAggregates(meta.environment, meta.store_id, d.listing_id);
  return {
    id,
    listing_id: d.listing_id,
    product_id: d.product_id,
    reviewer_name: d.reviewer_name,
    rating: d.rating,
    title: d.title,
    body: d.body,
    status: 'published',
    created_at: at,
  };
}

export async function merchantStoreReviews(a: Access, storeId: string) {
  await store(a, storeId);
  const rows = await dbAll(
    'SELECT id,listing_id,product_id,reviewer_name,rating,title,body,verified_purchase,status,created_at FROM ac_commerce_reviews WHERE org_id=? AND environment=? AND store_id=? ORDER BY created_at DESC LIMIT 100',
    [a.org, a.environment, storeId],
  );
  return {
    data: rows.map((r) => ({
      ...r,
      rating: Number(r.rating),
      verified_purchase: !!r.verified_purchase,
    })),
  };
}

export async function moderateStoreReview(
  a: Access,
  storeId: string,
  reviewId: string,
  input: unknown,
) {
  await store(a, storeId, true);
  const d = z.object({ status: z.enum(['published', 'hidden']) }).strict().parse(input);
  const row = await dbGet(
    'SELECT id,listing_id FROM ac_commerce_reviews WHERE id=? AND org_id=? AND environment=? AND store_id=?',
    [reviewId, a.org, a.environment, storeId],
  );
  if (!row) fail(404, 'Review not found');
  await dbRun(
    'UPDATE ac_commerce_reviews SET status=? WHERE id=? AND org_id=? AND environment=?',
    [d.status, reviewId, a.org, a.environment],
  );
  await recomputeReviewAggregates(a.environment, storeId, row.listing_id);
  return { id: reviewId, status: d.status };
}

export async function storeAbandonedCarts(a: Access, storeId: string) {
  await store(a, storeId);
  if (!['owner', 'admin'].includes(await currentMember(a)))
    fail(403, 'Current owner or administrator required');
  const rows = await dbAll(
    "SELECT id,status,data,expires_at,created_at,updated_at FROM ac_commerce_carts WHERE org_id=? AND environment=? AND store_id=? AND status='open' ORDER BY updated_at DESC LIMIT 50",
    [a.org, a.environment, storeId],
  );
  const carts = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(
        unseal(row.data, JSON.stringify(['commerce-cart', a.org, a.environment, storeId, row.id])),
      );
      const cartItems = parsed.cart?.items || parsed.items || [];
      carts.push({
        id: row.id,
        item_count: Array.isArray(cartItems) ? cartItems.length : 0,
        currency: parsed.quote?.currency || '',
        total_minor: Number(parsed.quote?.total_minor || 0),
        discount_code: parsed.cart?.discount_code || parsed.discount_code || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at,
      });
    } catch {
      carts.push({
        id: row.id,
        item_count: 0,
        currency: '',
        total_minor: 0,
        discount_code: '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at,
      });
    }
  }
  return {
    total: carts.length,
    data: carts,
    coverage: 'Open carts that have not yet converted into confirmed orders (up to 50 most recent).',
  };
}
