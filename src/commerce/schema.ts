import { dbGet, dbExec, dbRun, dbTransaction, isPostgres } from '../db/adapter';
import { serviceCatalog } from '../marketplace/catalog';
import { evaluationPrice } from '../marketplace/schema';
export const commerceTables = [
  'ac_publications',
  'ac_publication_versions',
  'ac_commerce_carts',
  'ac_commerce_order_links',
  'ac_marketplace_stores',
  'ac_marketplace_listings',
  'ac_commerce_reviews',
];
const foundationCommerceTables = [
  'ac_publications',
  'ac_publication_versions',
  'ac_commerce_carts',
  'ac_commerce_order_links',
];
const marketplaceCommerceTables = [
  'ac_marketplace_stores',
  'ac_marketplace_listings',
  'ac_commerce_reviews',
];
export async function migrateCommerce(
  database = { dbGet, dbExec, dbRun, dbTransaction, isPostgres },
) {
  await database.dbTransaction(async () => {
    if (
      await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '017-commerce-foundation',
      ])
    )
      return;
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_publications (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES ac_erp_objects(id),source_kind TEXT NOT NULL,slug TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,published_by TEXT NOT NULL,published_at TEXT NOT NULL,UNIQUE(environment,slug),UNIQUE(org_id,environment,source_id))',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_publication_versions (publication_id TEXT NOT NULL REFERENCES ac_publications(id),version INTEGER NOT NULL,snapshot TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(publication_id,version))',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_commerce_carts (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,store_id TEXT NOT NULL REFERENCES ac_erp_objects(id),token_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_commerce_order_links (cart_id TEXT PRIMARY KEY REFERENCES ac_commerce_carts(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,store_id TEXT NOT NULL REFERENCES ac_erp_objects(id),order_id TEXT NOT NULL UNIQUE REFERENCES ac_records(id),invoice_id TEXT NOT NULL UNIQUE REFERENCES ac_records(id),created_at TEXT NOT NULL)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_commerce_cart_scope ON ac_commerce_carts(org_id,environment,store_id,status,expires_at)',
    );
    if (database.isPostgres) {
      for (const table of foundationCommerceTables) {
        await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
      }
      await database.dbExec(
        "CREATE OR REPLACE FUNCTION ac_publication_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published revision history is immutable'; END $$",
      );
      await database.dbExec(
        'CREATE TRIGGER ac_publication_history_immutable BEFORE UPDATE OR DELETE ON ac_publication_versions FOR EACH ROW EXECUTE FUNCTION ac_publication_protect_history()',
      );
    } else
      for (const action of ['UPDATE', 'DELETE'])
        await database.dbExec(
          'CREATE TRIGGER IF NOT EXISTS ac_publication_history_immutable_' +
            action +
            ' BEFORE ' +
            action +
            " ON ac_publication_versions BEGIN SELECT RAISE(ABORT,'Published revision history is immutable'); END",
        );
    const definition = serviceCatalog.find((s) => s.id === 'commerce');
    if (!definition) throw new Error('Commerce metadata required');
    const at = new Date().toISOString();
    await database.dbRun(
      'INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
      ['commerce', definition.version, JSON.stringify(definition), at],
    );
    await database.dbRun(
      'INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',
      [
        'commerce:evaluation-v1',
        'commerce',
        'evaluation-v1',
        JSON.stringify(evaluationPrice('commerce')),
        at,
      ],
    );
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '017-commerce-foundation',
      at,
    ]);
  });
  await database.dbTransaction(async () => {
    if (
      await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '028-commerce-marketplace-and-reviews',
      ])
    )
      return;
    await database.dbExec(
      "CREATE TABLE IF NOT EXISTS ac_marketplace_stores (store_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,slug TEXT NOT NULL,name TEXT NOT NULL,tagline TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'General',location TEXT NOT NULL DEFAULT '',currency TEXT NOT NULL DEFAULT 'KES',brand_color TEXT NOT NULL DEFAULT '#047857',logo_asset_id TEXT,banner_asset_id TEXT,checkout_available INTEGER NOT NULL DEFAULT 0,verified INTEGER NOT NULL DEFAULT 0,product_count INTEGER NOT NULL DEFAULT 0,rating_avg REAL NOT NULL DEFAULT 0,review_count INTEGER NOT NULL DEFAULT 0,published_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(environment,slug))",
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_mp_stores_env_cat ON ac_marketplace_stores(environment,category,product_count DESC)',
    );
    await database.dbExec(
      "CREATE TABLE IF NOT EXISTS ac_marketplace_listings (listing_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),store_id TEXT NOT NULL REFERENCES ac_marketplace_stores(store_id) ON DELETE CASCADE,org_id TEXT NOT NULL,environment TEXT NOT NULL,store_slug TEXT NOT NULL,store_name TEXT NOT NULL,product_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'General',sku TEXT NOT NULL DEFAULT '',variant TEXT NOT NULL DEFAULT '',unit TEXT NOT NULL DEFAULT 'unit',currency TEXT NOT NULL DEFAULT 'KES',unit_price_minor INTEGER NOT NULL,compare_at_minor INTEGER,image_asset_id TEXT,image_alt TEXT NOT NULL DEFAULT '',in_stock INTEGER NOT NULL DEFAULT 1,minimum_quantity_milli INTEGER NOT NULL DEFAULT 1000,rating_avg REAL NOT NULL DEFAULT 0,review_count INTEGER NOT NULL DEFAULT 0,published_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_mp_listings_env_cat ON ac_marketplace_listings(environment,category,unit_price_minor)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_mp_listings_store ON ac_marketplace_listings(environment,store_id)',
    );
    await database.dbExec(
      "CREATE TABLE IF NOT EXISTS ac_commerce_reviews (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,store_id TEXT NOT NULL,listing_id TEXT NOT NULL,product_id TEXT NOT NULL,reviewer_name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),title TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',verified_purchase INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'published',created_at TEXT NOT NULL)",
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_commerce_reviews_scope ON ac_commerce_reviews(environment,store_id,listing_id,status,created_at DESC)',
    );
    if (database.isPostgres) {
      for (const table of marketplaceCommerceTables) {
        await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
      }
    }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '028-commerce-marketplace-and-reviews',
      new Date().toISOString(),
    ]);
  });
}
