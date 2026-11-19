import { dbExec, dbGet, dbRun, dbTransaction } from '../db/adapter';

/** Additive index for the encrypted People resource kinds introduced in 2.10B. */
export async function migratePeopleExpansion() {
  await dbTransaction(async () => {
    if (
      await dbGet('SELECT version FROM platform_migrations WHERE version=?', [
        '021-people-expansion',
      ])
    )
      return;
    await dbExec(
      'CREATE INDEX IF NOT EXISTS ac_people_expansion_scope ON ac_erp_objects(org_id,environment,kind,status,parent_id,stage,position,id)',
    );
    await dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', [
      '021-people-expansion',
      new Date().toISOString(),
    ]);
  });
}
