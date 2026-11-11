import {dbGet, dbExec, dbRun, dbTransaction, isPostgres} from '../db/adapter';

export const publicMediaTables = ['ac_public_media', 'ac_public_media_events'];
export async function migratePublicMedia(database = {dbGet, dbExec, dbRun, dbTransaction, isPostgres}) {
  await database.dbTransaction(async () => {
    if (await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', ['018-public-media'])) return;
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_public_media (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES ac_organizations(id),environment TEXT NOT NULL,sha256 TEXT NOT NULL,identity_hash TEXT NOT NULL,byte_size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,mime TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL,image TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,environment,identity_hash))');
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_public_media_events (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,asset_id TEXT NOT NULL REFERENCES ac_public_media(id),version INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(asset_id,version))');
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_public_media_scope ON ac_public_media(org_id,environment,status,created_at,id)');
    if (database.isPostgres) {
      for (const table of publicMediaTables) {
        await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
      }
      await database.dbExec("CREATE OR REPLACE FUNCTION ac_media_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Public media history is immutable'; END $$");
      await database.dbExec('CREATE TRIGGER ac_public_media_history_immutable BEFORE UPDATE OR DELETE ON ac_public_media_events FOR EACH ROW EXECUTE FUNCTION ac_media_protect_history()');
      await database.dbExec("CREATE OR REPLACE FUNCTION ac_media_protect_payload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.identity_hash IS DISTINCT FROM NEW.identity_hash OR OLD.image IS DISTINCT FROM NEW.image OR OLD.data IS DISTINCT FROM NEW.data OR OLD.sha256 IS DISTINCT FROM NEW.sha256 OR OLD.org_id IS DISTINCT FROM NEW.org_id OR OLD.environment IS DISTINCT FROM NEW.environment OR OLD.mime IS DISTINCT FROM NEW.mime OR OLD.width IS DISTINCT FROM NEW.width OR OLD.height IS DISTINCT FROM NEW.height OR OLD.byte_size IS DISTINCT FROM NEW.byte_size THEN RAISE EXCEPTION 'Public media payload is immutable'; END IF; RETURN NEW; END $$");
      await database.dbExec('CREATE TRIGGER ac_public_media_payload_immutable BEFORE UPDATE ON ac_public_media FOR EACH ROW EXECUTE FUNCTION ac_media_protect_payload()');
    } else {
      for (const action of ['UPDATE', 'DELETE']) await database.dbExec("CREATE TRIGGER ac_public_media_history_immutable_" + action + " BEFORE " + action + " ON ac_public_media_events BEGIN SELECT RAISE(ABORT,'Public media history is immutable'); END");
      await database.dbExec("CREATE TRIGGER ac_public_media_payload_immutable BEFORE UPDATE ON ac_public_media WHEN OLD.identity_hash IS NOT NEW.identity_hash OR OLD.image IS NOT NEW.image OR OLD.data IS NOT NEW.data OR OLD.sha256 IS NOT NEW.sha256 OR OLD.org_id IS NOT NEW.org_id OR OLD.environment IS NOT NEW.environment OR OLD.mime IS NOT NEW.mime OR OLD.width IS NOT NEW.width OR OLD.height IS NOT NEW.height OR OLD.byte_size IS NOT NEW.byte_size BEGIN SELECT RAISE(ABORT,'Public media payload is immutable'); END");
    }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', ['018-public-media', new Date().toISOString()]);
  });
}
