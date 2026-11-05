import {dbGet,dbExec,dbRun,dbTransaction,isPostgres} from '../db/adapter';
import {serviceCatalog} from '../marketplace/catalog';
import {evaluationPrice} from '../marketplace/schema';
export const documentTables=['ac_documents','ac_document_grants','ac_document_blobs','ac_document_stars','ac_document_links'];
export const documentStatements=[
 'CREATE TABLE IF NOT EXISTS ac_documents (id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,doc_kind TEXT NOT NULL,owner_id TEXT NOT NULL,status TEXT NOT NULL,visibility TEXT NOT NULL,employee_id TEXT REFERENCES ac_people_employees(employee_id),folder_id TEXT REFERENCES ac_documents(id),inherit_folder INTEGER NOT NULL DEFAULT 0,current_blob_id TEXT)',
 'CREATE INDEX IF NOT EXISTS ac_document_scope ON ac_documents(org_id,environment,owner_id,status,folder_id)',
 'CREATE TABLE IF NOT EXISTS ac_document_grants (document_id TEXT NOT NULL REFERENCES ac_documents(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,user_id TEXT NOT NULL,permission TEXT NOT NULL,download INTEGER NOT NULL,expires_at TEXT,PRIMARY KEY(document_id,user_id))',
 'CREATE INDEX IF NOT EXISTS ac_document_grant_actor ON ac_document_grants(org_id,environment,user_id,expires_at)',
 'CREATE TABLE IF NOT EXISTS ac_document_blobs (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,origin_document_id TEXT NOT NULL REFERENCES ac_documents(id),version_id TEXT NOT NULL REFERENCES ac_erp_objects(id),size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS ac_document_blob_scope ON ac_document_blobs(org_id,environment,origin_document_id)',
 'CREATE TABLE IF NOT EXISTS ac_document_stars (document_id TEXT NOT NULL REFERENCES ac_documents(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(document_id,user_id))',
 'CREATE TABLE IF NOT EXISTS ac_document_links (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,document_id TEXT NOT NULL REFERENCES ac_documents(id),source_kind TEXT NOT NULL,source_id TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(org_id,environment,document_id,source_kind,source_id))',
];
export async function migrateDocuments(database={dbGet,dbExec,dbRun,dbTransaction,isPostgres}){await database.dbTransaction(async()=>{
 if(await database.dbGet('SELECT version FROM platform_migrations WHERE version=?',['015-private-documents']))return;
 for(const sql of documentStatements)await database.dbExec(sql);
 if(database.isPostgres){for(const table of documentTables){await database.dbExec('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');await database.dbExec('REVOKE ALL ON '+table+' FROM PUBLIC');}await database.dbExec("CREATE OR REPLACE FUNCTION ac_document_protect_blob() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Retained document content is immutable'; END $$");await database.dbExec('CREATE TRIGGER ac_document_blob_immutable BEFORE UPDATE OR DELETE ON ac_document_blobs FOR EACH ROW EXECUTE FUNCTION ac_document_protect_blob()');}
 else for(const action of ['UPDATE','DELETE'])await database.dbExec("CREATE TRIGGER IF NOT EXISTS ac_document_blob_immutable_"+action+" BEFORE "+action+" ON ac_document_blobs BEGIN SELECT RAISE(ABORT,'Retained document content is immutable'); END");
 const definition=serviceCatalog.find(s=>s.id==='documents');if(!definition)throw new Error('Documents service metadata is required before migration');const at=new Date().toISOString();await database.dbRun('INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',['documents',definition.version,JSON.stringify(definition),at]);await database.dbRun('INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',['documents:evaluation-v1','documents','evaluation-v1',JSON.stringify(evaluationPrice('documents')),at]);await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)',['015-private-documents',at]);
});}
