import {dbAll,dbGet,dbExec,dbRun,dbTransaction,isPostgres} from '../db/adapter';
import {serviceCatalog} from '../marketplace/catalog';
import {evaluationPrice} from '../marketplace/schema';
export const peopleTables=['ac_people_employees','ac_people_leave_requests','ac_people_leave_ledger','ac_people_attendance'];
export const peopleStatements=[
 'CREATE TABLE IF NOT EXISTS ac_people_employees (employee_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,linked_user_id TEXT,employee_ref_hash TEXT NOT NULL,manager_id TEXT REFERENCES ac_people_employees(employee_id),department_id TEXT REFERENCES ac_erp_objects(id),status TEXT NOT NULL,start_on TEXT NOT NULL)',
 'CREATE UNIQUE INDEX IF NOT EXISTS ac_people_employee_reference ON ac_people_employees(org_id,environment,employee_ref_hash)',
 'CREATE UNIQUE INDEX IF NOT EXISTS ac_people_linked_identity ON ac_people_employees(org_id,environment,linked_user_id) WHERE linked_user_id IS NOT NULL',
 'CREATE INDEX IF NOT EXISTS ac_people_manager_scope ON ac_people_employees(org_id,environment,manager_id,status)',
 'CREATE INDEX IF NOT EXISTS ac_people_department_scope ON ac_people_employees(org_id,environment,department_id,status)',
 'CREATE TABLE IF NOT EXISTS ac_people_leave_requests (request_id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES ac_people_employees(employee_id),leave_type_id TEXT NOT NULL REFERENCES ac_erp_objects(id),from_on TEXT NOT NULL,to_on TEXT NOT NULL,units_milli INTEGER NOT NULL,year INTEGER NOT NULL,status TEXT NOT NULL,approval_id TEXT UNIQUE REFERENCES ac2_approvals(id))',
 'CREATE INDEX IF NOT EXISTS ac_people_leave_request_scope ON ac_people_leave_requests(org_id,environment,employee_id,status,from_on,to_on)',
 'CREATE TABLE IF NOT EXISTS ac_people_leave_ledger (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES ac_people_employees(employee_id),leave_type_id TEXT NOT NULL REFERENCES ac_erp_objects(id),year INTEGER NOT NULL,units_milli INTEGER NOT NULL,event_type TEXT NOT NULL,source_key TEXT NOT NULL,request_id TEXT REFERENCES ac_erp_objects(id),data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(org_id,environment,employee_id,leave_type_id,year,event_type,source_key),UNIQUE(org_id,environment,request_id,event_type))',
 'CREATE INDEX IF NOT EXISTS ac_people_leave_balance ON ac_people_leave_ledger(org_id,environment,employee_id,leave_type_id,year)',
 'CREATE TABLE IF NOT EXISTS ac_people_attendance (id TEXT PRIMARY KEY REFERENCES ac_erp_objects(id),org_id TEXT NOT NULL,environment TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES ac_people_employees(employee_id),check_in TEXT NOT NULL,check_out TEXT,status TEXT NOT NULL,source TEXT NOT NULL,correction_of TEXT REFERENCES ac_people_attendance(id),superseded_by TEXT REFERENCES ac_people_attendance(id))',
 "CREATE UNIQUE INDEX IF NOT EXISTS ac_people_open_attendance ON ac_people_attendance(org_id,environment,employee_id) WHERE status='open' AND superseded_by IS NULL",
 'CREATE INDEX IF NOT EXISTS ac_people_attendance_scope ON ac_people_attendance(org_id,environment,employee_id,check_in)',
 "CREATE UNIQUE INDEX IF NOT EXISTS ac_people_single_configuration ON ac_erp_objects(org_id,environment,kind) WHERE kind='people_settings'",
 "CREATE UNIQUE INDEX IF NOT EXISTS ac_people_compensation_successor ON ac_erp_objects(parent_id) WHERE kind='employee_compensation' AND parent_id IS NOT NULL",
];
export async function migratePeople(database={dbAll,dbGet,dbExec,dbRun,dbTransaction,isPostgres}){await database.dbTransaction(async()=>{
 if(await database.dbGet('SELECT version FROM platform_migrations WHERE version=?',['014-people-operations']))return;
 for(const sql of peopleStatements)await database.dbExec(sql);
 if(database.isPostgres){for(const table of peopleTables){await database.dbExec('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');await database.dbExec('REVOKE ALL ON '+table+' FROM PUBLIC');}await database.dbExec("CREATE OR REPLACE FUNCTION ac_people_protect_leave_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Leave ledger history is append-only'; END $$");await database.dbExec('CREATE TRIGGER ac_people_leave_ledger_immutable BEFORE UPDATE OR DELETE ON ac_people_leave_ledger FOR EACH ROW EXECUTE FUNCTION ac_people_protect_leave_ledger()');}
 else for(const action of ['UPDATE','DELETE'])await database.dbExec("CREATE TRIGGER IF NOT EXISTS ac_people_leave_ledger_immutable_"+action+" BEFORE "+action+" ON ac_people_leave_ledger BEGIN SELECT RAISE(ABORT,'Leave ledger history is append-only'); END");
 const at=new Date().toISOString(),definition=serviceCatalog.find(s=>s.id==='people')!;await database.dbRun('INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',['people',definition.version,JSON.stringify(definition),at]);await database.dbRun('INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',['people:evaluation-v1','people','evaluation-v1',JSON.stringify(evaluationPrice('people')),at]);await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)',['014-people-operations',at]);
});}
