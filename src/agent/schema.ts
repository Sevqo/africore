import { dbAll, dbExec, dbGet, dbRun, dbTransaction, isPostgres } from '../db/adapter';
import { serviceCatalog } from '../marketplace/catalog';

export const agentTables = [
  'ac_agent_policies',
  'ac_agent_runs',
  'ac_agent_approvals',
  'ac_agent_routines',
  'ac_agent_billing_accounts',
  'ac_agent_credit_ledger',
  'ac_agent_memory',
];

export const agentStatements = [
  `CREATE TABLE IF NOT EXISTS ac_agent_policies (
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    autonomy_mode TEXT NOT NULL DEFAULT 'supervised',
    computer_use_enabled INTEGER NOT NULL DEFAULT 1,
    cross_dev_bridge_enabled INTEGER NOT NULL DEFAULT 1,
    permissions_json TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_runs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    workspace_kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    isolation_boundary TEXT NOT NULL,
    target_workspace_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 0,
    estimated_minor INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'KES',
    routine_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(org_id, environment, actor, idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES ac_agent_runs(id),
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    actor TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    target_workspace_id TEXT NOT NULL,
    action_summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    decision_note TEXT,
    decided_by TEXT,
    decided_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_routines (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    workspace_kind TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    schedule_label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    execution_mode TEXT NOT NULL DEFAULT 'approval_required',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_id TEXT,
    last_run_at TEXT,
    last_status TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_billing_accounts (
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    plan_tier TEXT NOT NULL DEFAULT 'agent_starter',
    monthly_credits_included INTEGER NOT NULL DEFAULT 50,
    bonus_credits INTEGER NOT NULL DEFAULT 0,
    monthly_spend_cap_minor INTEGER,
    hard_stop INTEGER NOT NULL DEFAULT 1,
    overage_unit_minor INTEGER NOT NULL DEFAULT 1000,
    currency TEXT NOT NULL DEFAULT 'KES',
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_credit_ledger (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    actor TEXT NOT NULL,
    run_id TEXT,
    entry_type TEXT NOT NULL,
    credits_delta INTEGER NOT NULL,
    estimated_minor INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'KES',
    reason TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ac_agent_memory (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    workspace_kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS ac_agent_runs_scope ON ac_agent_runs(org_id, environment, created_at)',
  'CREATE INDEX IF NOT EXISTS ac_agent_approvals_scope ON ac_agent_approvals(org_id, environment, status, created_at)',
  'CREATE INDEX IF NOT EXISTS ac_agent_routines_scope ON ac_agent_routines(org_id, environment, enabled, created_at)',
  'CREATE INDEX IF NOT EXISTS ac_agent_ledger_scope ON ac_agent_credit_ledger(org_id, environment, period, created_at)',
  'CREATE INDEX IF NOT EXISTS ac_agent_memory_scope ON ac_agent_memory(org_id, environment, created_at)',
];

export async function migrateAgent(
  database = { dbAll, dbGet, dbExec, dbRun, dbTransaction, isPostgres },
) {
  await database.dbTransaction(async () => {
    if (
      await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '029-autonomous-agent',
      ])
    )
      return;
    for (const statement of agentStatements) await database.dbExec(statement);
    if (database.isPostgres) {
      for (const table of agentTables) {
        await database.dbExec('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
        await database.dbExec('REVOKE ALL ON ' + table + ' FROM PUBLIC');
      }
    }
    const assistantService = serviceCatalog.find((s) => s.id === 'assistant');
    if (assistantService) {
      await database.dbRun(
        'INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,definition=excluded.definition,updated_at=excluded.updated_at',
        [
          assistantService.id,
          assistantService.version,
          JSON.stringify(assistantService),
          new Date().toISOString(),
        ],
      );
    }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '029-autonomous-agent',
      new Date().toISOString(),
    ]);
  });
}
