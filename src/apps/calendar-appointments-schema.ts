import { dbExec, dbGet, dbRun, dbTransaction, isPostgres } from '../db/adapter';

export const calendarAppointmentTables = [
  'ac_calendar_appointment_links',
  'ac_calendar_booking_requests',
  'ac_calendar_booking_history',
  'ac_calendar_booking_slots',
];

export async function migrateCalendarAppointments(
  database = { dbExec, dbGet, dbRun, dbTransaction, isPostgres },
) {
  await database.dbTransaction(async () => {
    if (await database.dbGet('SELECT version FROM platform_migrations WHERE version=?', ['028-calendar-appointments'])) return;
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_calendar_appointment_links (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES ac_organizations(id),environment TEXT NOT NULL,type_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,capacity INTEGER NOT NULL,work_days TEXT NOT NULL,active INTEGER NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_calendar_appointment_links_scope ON ac_calendar_appointment_links(org_id,environment,type_id,active)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_calendar_booking_requests (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES ac_organizations(id),environment TEXT NOT NULL,type_id TEXT NOT NULL,link_id TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,proposed_start TEXT,proposed_end TEXT,status TEXT NOT NULL,payload TEXT NOT NULL,manage_hash TEXT NOT NULL UNIQUE,event_id TEXT,assigned_staff TEXT,request_key TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,environment,type_id,request_key))',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_calendar_booking_requests_scope ON ac_calendar_booking_requests(org_id,environment,type_id,status,start_at)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_calendar_booking_history (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,booking_id TEXT NOT NULL,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)',
    );
    await database.dbExec(
      'CREATE INDEX IF NOT EXISTS ac_calendar_booking_history_scope ON ac_calendar_booking_history(org_id,environment,booking_id,created_at,id)',
    );
    await database.dbExec(
      'CREATE TABLE IF NOT EXISTS ac_calendar_booking_slots (id TEXT PRIMARY KEY,org_id TEXT NOT NULL,environment TEXT NOT NULL,type_id TEXT NOT NULL,start_at TEXT NOT NULL,occupied INTEGER NOT NULL,UNIQUE(org_id,environment,type_id,start_at))',
    );
    if (database.isPostgres) {
      for (const table of calendarAppointmentTables) {
        await database.dbExec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await database.dbExec(`REVOKE ALL ON ${table} FROM PUBLIC`);
      }
    }
    await database.dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '028-calendar-appointments',
      new Date().toISOString(),
    ]);
  });
}
