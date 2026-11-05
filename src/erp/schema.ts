import {dbAll,dbGet,dbExec,dbRun,dbTransaction,isPostgres} from '../db/adapter';
import {serviceCatalog} from '../marketplace/catalog';
import {evaluationPrice} from '../marketplace/schema';

export const erpTables=['ac_erp_objects','ac_erp_grants','ac_erp_history','ac_erp_operations'];
export const erpStatements=[
 'CREATE TABLE IF NOT EXISTS ac_erp_objects (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,kind TEXT NOT NULL,root_id TEXT NOT NULL,parent_id TEXT,owner_id TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL DEFAULT \'\',position INTEGER NOT NULL DEFAULT 0,due_on TEXT,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS ac_erp_grants (org_id TEXT NOT NULL,environment TEXT NOT NULL,resource_id TEXT NOT NULL REFERENCES ac_erp_objects(id),user_id TEXT NOT NULL,permission TEXT NOT NULL,PRIMARY KEY(org_id,environment,resource_id,user_id))',
 'CREATE TABLE IF NOT EXISTS ac_erp_history (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,resource_id TEXT NOT NULL REFERENCES ac_erp_objects(id),version INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(resource_id,version))',
 'CREATE TABLE IF NOT EXISTS ac_erp_operations (org_id TEXT NOT NULL,environment TEXT NOT NULL,actor TEXT NOT NULL,operation TEXT NOT NULL,idempotency_key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(org_id,environment,actor,operation,idempotency_key))',
 'CREATE INDEX IF NOT EXISTS ac_erp_object_scope ON ac_erp_objects(org_id,environment,kind,root_id,status,position,id)',
 'CREATE INDEX IF NOT EXISTS ac_erp_grant_actor ON ac_erp_grants(org_id,environment,user_id,resource_id)',
];
export async function migrateERP(database={dbAll,dbGet,dbExec,dbRun,dbTransaction,isPostgres}){
 await database.dbTransaction(async()=>{
  if(await database.dbGet('SELECT version FROM platform_migrations WHERE version=?',['012-erp-foundation']))return;
  for(const statement of erpStatements)await database.dbExec(statement);
  if(database.isPostgres)for(const table of erpTables){await database.dbExec('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');await database.dbExec('REVOKE ALL ON '+table+' FROM PUBLIC');}
  for(const id of ['work']){const definition=serviceCatalog.find(s=>s.id===id)!;await database.dbRun('INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',[id,definition.version,JSON.stringify(definition),new Date().toISOString()]);await database.dbRun('INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',[id+':evaluation-v1',id,'evaluation-v1',JSON.stringify(evaluationPrice(id)),new Date().toISOString()]);}
  await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)',['012-erp-foundation',new Date().toISOString()]);
 });
}
