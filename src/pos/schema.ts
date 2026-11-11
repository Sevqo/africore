import {dbGet,dbExec,dbRun,dbTransaction,isPostgres} from '../db/adapter';
import {cashMovementStatement,cashMovementTable,effectiveAllocationsWithCash} from '../finance/cash-schema';
import {serviceCatalog} from '../marketplace/catalog';
import {evaluationPrice} from '../marketplace/schema';

export const posTables = ['ac_pos_sessions','ac_pos_sale_links','ac_pos_drawer_adjustments','ac_pos_session_closures',cashMovementTable];
export async function migratePOS(database={dbGet,dbExec,dbRun,dbTransaction,isPostgres}) {
  await database.dbTransaction(async()=>{
    if(await database.dbGet('SELECT version FROM platform_migrations WHERE version=?',['019-point-of-sale']))return;
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_pos_sessions (session_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,register_id TEXT NOT NULL REFERENCES ac_erp_objects(id),cashier_id TEXT NOT NULL REFERENCES ac_users(id),status TEXT NOT NULL,opened_at TEXT NOT NULL,closed_at TEXT)');
    await database.dbExec("CREATE UNIQUE INDEX IF NOT EXISTS ac_pos_one_open_session ON ac_pos_sessions(org_id,environment,register_id) WHERE status='open'");
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_pos_cashier_sessions ON ac_pos_sessions(org_id,environment,cashier_id,opened_at,session_id)');
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_pos_sale_links (sale_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,register_id TEXT NOT NULL REFERENCES ac_erp_objects(id),session_id TEXT NOT NULL REFERENCES ac_pos_sessions(session_id),order_id TEXT NOT NULL UNIQUE REFERENCES ac_records(id),invoice_id TEXT NOT NULL UNIQUE REFERENCES ac_records(id),created_at TEXT NOT NULL)');
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_pos_sale_scope ON ac_pos_sale_links(org_id,environment,register_id,created_at,sale_id)');
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_pos_drawer_adjustments (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES ac_pos_sessions(session_id),amount_minor BIGINT NOT NULL,actor TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,CHECK(amount_minor<>0))');
    await database.dbExec('CREATE TABLE IF NOT EXISTS ac_pos_session_closures (session_id TEXT PRIMARY KEY REFERENCES ac_pos_sessions(session_id),org_id TEXT NOT NULL,environment TEXT NOT NULL,session_version INTEGER NOT NULL,expected_minor BIGINT NOT NULL,counted_minor BIGINT NOT NULL,variance_minor BIGINT NOT NULL,actor TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,CHECK(counted_minor>=0))');
    await database.dbExec(cashMovementStatement);
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_cash_document_scope ON ac_cash_movements(org_id,environment,document_id,occurred_at,id)');
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_cash_session_scope ON ac_cash_movements(org_id,environment,session_id,occurred_at,id)');
    await database.dbExec('CREATE INDEX IF NOT EXISTS ac_cash_original_returns ON ac_cash_movements(org_id,environment,related_receipt_id)');
    if(database.isPostgres) {
      await database.dbExec(effectiveAllocationsWithCash.replace('CREATE VIEW','CREATE OR REPLACE VIEW'));
      for(const table of posTables) {
        await database.dbExec('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON '+table+' FROM PUBLIC');
      }
      await database.dbExec('REVOKE ALL ON ac_effective_allocations FROM PUBLIC');
      await database.dbExec("CREATE OR REPLACE FUNCTION ac_pos_protect_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Recorded cash and shift closing facts are immutable'; END $$");
      for(const table of [cashMovementTable,'ac_pos_drawer_adjustments','ac_pos_session_closures'])await database.dbExec('CREATE TRIGGER '+table+'_immutable BEFORE UPDATE OR DELETE ON '+table+' FOR EACH ROW EXECUTE FUNCTION ac_pos_protect_fact()');
      await database.dbExec("CREATE OR REPLACE FUNCTION ac_pos_protect_closed_shift() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='closed' THEN RAISE EXCEPTION 'Closed register sessions are immutable'; END IF; RETURN NEW; END $$");
      await database.dbExec('CREATE TRIGGER ac_pos_closed_shift_immutable BEFORE UPDATE ON ac_pos_sessions FOR EACH ROW EXECUTE FUNCTION ac_pos_protect_closed_shift()');
    } else {
      await database.dbExec('DROP VIEW ac_effective_allocations');
      await database.dbExec(effectiveAllocationsWithCash);
      for(const table of [cashMovementTable,'ac_pos_drawer_adjustments','ac_pos_session_closures'])for(const action of ['UPDATE','DELETE'])await database.dbExec("CREATE TRIGGER "+table+'_immutable_'+action+' BEFORE '+action+' ON '+table+" BEGIN SELECT RAISE(ABORT,'Recorded cash and shift closing facts are immutable'); END");
      await database.dbExec("CREATE TRIGGER ac_pos_closed_shift_immutable BEFORE UPDATE ON ac_pos_sessions WHEN OLD.status='closed' BEGIN SELECT RAISE(ABORT,'Closed register sessions are immutable'); END");
    }
    const definition=serviceCatalog.find(s=>s.id==='pos');if(!definition)throw new Error('POS service metadata required');const at=new Date().toISOString();
    await database.dbRun('INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',['pos',definition.version,JSON.stringify(definition),at]);
    await database.dbRun('INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',['pos:evaluation-v1','pos','evaluation-v1',JSON.stringify(evaluationPrice('pos')),at]);
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)',['019-point-of-sale',at]);
  });
}
