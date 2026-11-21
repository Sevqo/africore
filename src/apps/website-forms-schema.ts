import { dbExec, dbGet, dbRun, dbTransaction, isPostgres } from '../db/adapter';

export const websiteFormTables = ['ac_website_form_submissions'];

export async function migrateWebsiteForms(
  database = { dbExec, dbGet, dbRun, dbTransaction, isPostgres },
) {
  await database.dbTransaction(async () => {
    if (
      await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '027-website-forms',
      ])
    )
      return;
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_website_form_submissions (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES ac_organizations(id),environment TEXT NOT NULL,publication_id TEXT NOT NULL,slug TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_website_forms_scope ON ac_website_form_submissions(org_id,environment,created_at,id)',
    );
    if (database.isPostgres) {
      await database.dbExec('ALTER TABLE ac_website_form_submissions ENABLE ROW LEVEL SECURITY');
      await database.dbExec('REVOKE ALL ON ac_website_form_submissions FROM PUBLIC');
    }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '027-website-forms',
      new Date().toISOString(),
    ]);
  });
}
