import { dbAll, dbGet, dbExec, dbRun, dbTransaction, isPostgres } from '../db/adapter';
import { randomUUID } from 'node:crypto';
import { serviceCatalog } from '../marketplace/catalog';
import { evaluationPrice } from '../marketplace/schema';

export const erpTables = ['ac_erp_objects', 'ac_erp_grants', 'ac_erp_history', 'ac_erp_operations'];
const workExpansionTables = ['ac_work_timers', 'ac_work_occurrences', 'ac_work_task_events'];
export const erpStatements = [
  "CREATE TABLE IF NOT EXISTS ac_erp_objects (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,kind TEXT NOT NULL,root_id TEXT NOT NULL,parent_id TEXT,owner_id TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,due_on TEXT,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
  'CREATE TABLE IF NOT EXISTS ac_erp_grants (org_id TEXT NOT NULL,environment TEXT NOT NULL,resource_id TEXT NOT NULL REFERENCES ac_erp_objects(id),user_id TEXT NOT NULL,permission TEXT NOT NULL,PRIMARY KEY(org_id,environment,resource_id,user_id))',
  'CREATE TABLE IF NOT EXISTS ac_erp_history (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,resource_id TEXT NOT NULL REFERENCES ac_erp_objects(id),version INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(resource_id,version))',
  'CREATE TABLE IF NOT EXISTS ac_erp_operations (org_id TEXT NOT NULL,environment TEXT NOT NULL,actor TEXT NOT NULL,operation TEXT NOT NULL,idempotency_key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(org_id,environment,actor,operation,idempotency_key))',
  'CREATE INDEX IF NOT EXISTS ac_erp_object_scope ON ac_erp_objects(org_id,environment,kind,root_id,status,position,id)',
  'CREATE INDEX IF NOT EXISTS ac_erp_grant_actor ON ac_erp_grants(org_id,environment,user_id,resource_id)',
];
export async function migrateERP(
  database = { dbAll, dbGet, dbExec, dbRun, dbTransaction, isPostgres },
) {
  await database.dbTransaction(async () => {
    if (
      !(await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '012-erp-foundation',
      ]))
    ) {
      for (const statement of erpStatements) await database.dbExec(statement);
      if (database.isPostgres)
        for (const table of erpTables) {
          await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
          await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
        }
      for (const id of ['work']) {
        const definition = serviceCatalog.find((s) => s.id === id)!;
        await database.dbRun(
          'INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
          [id, definition.version, JSON.stringify(definition), new Date().toISOString()],
        );
        await database.dbRun(
          'INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',
          [
            id + ':evaluation-v1',
            id,
            'evaluation-v1',
            JSON.stringify(evaluationPrice(id)),
            new Date().toISOString(),
          ],
        );
      }
      await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
        '012-erp-foundation',
        new Date().toISOString(),
      ]);
    }
  });
  await database.dbTransaction(async () => {
    if (
      await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '013-work-time-and-history',
      ])
    )
      return;
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_work_timers (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,user_id TEXT NOT NULL,project_id TEXT NOT NULL,task_id TEXT NOT NULL,started_at TEXT NOT NULL,stopped_at TEXT,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
    );
    await database.dbExec(
      "CREATE UNIQUE INDEX IF NOT EXISTS ac_work_one_active_timer ON ac_work_timers(org_id,environment,user_id) WHERE state='running'",
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_work_timer_actor ON ac_work_timers(org_id,environment,user_id,state,started_at)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_work_occurrences (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,rule_id TEXT NOT NULL,source_task_id TEXT NOT NULL,occurrence_on TEXT NOT NULL,task_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(org_id,environment,rule_id,occurrence_on),UNIQUE(task_id))',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_work_occurrence_source ON ac_work_occurrences(org_id,environment,source_task_id,occurrence_on)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_work_task_events (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,project_id TEXT NOT NULL,task_id TEXT NOT NULL,actor TEXT NOT NULL,event_type TEXT NOT NULL,stage TEXT NOT NULL,task_status TEXT NOT NULL,occurred_at TEXT NOT NULL)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_work_task_event_date ON ac_work_task_events(org_id,environment,project_id,occurred_at,task_id)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_work_task_event_task ON ac_work_task_events(org_id,environment,task_id,occurred_at)',
    );
    // Establish honest historical coverage at this migration's cutover. Earlier
    // task states cannot be reconstructed from the current encrypted snapshot.
    const cutover = new Date().toISOString();
    const existingTasks = await database.dbAll(
      "SELECT o.org_id,o.environment,o.root_id,o.id,o.owner_id,o.stage,o.status FROM ac_erp_objects o WHERE o.kind='work_task' AND NOT EXISTS (SELECT 1 FROM ac_work_task_events e WHERE e.org_id=o.org_id AND e.environment=o.environment AND e.task_id=o.id)",
    );
    for (const task of existingTasks)
      await database.dbRun(
        'INSERT INTO ac_work_task_events(id,org_id,environment,project_id,task_id,actor,event_type,stage,task_status,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
          randomUUID(),
          task.org_id,
          task.environment,
          task.root_id,
          task.id,
          task.owner_id,
          'baseline',
          task.stage,
          task.status,
          cutover,
        ],
      );
    if (database.isPostgres)
      for (const table of workExpansionTables) {
        await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
      }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '013-work-time-and-history',
      cutover,
    ]);
  });
}
