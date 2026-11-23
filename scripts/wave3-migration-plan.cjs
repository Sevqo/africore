/* Capture only the reviewed additive migrations; executing a plan is the
 * guarded maintenance runner's responsibility, never ordinary startup. */
exports.wave3MigrationPlan = async function (versions) {
  const known = new Set(versions),
    commands = [];
  if (!known.has('016-procurement')) throw Error('Wave 2 foundation required');
  const database = {
    isPostgres: true,
    dbTransaction: (fn) => fn(),
    dbGet: async (_sql, params) => (known.has(params[0]) ? { version: params[0] } : undefined),
    dbExec: async (sql) => {
      commands.push({ sql, params: [] });
    },
    dbRun: async (sql, params = []) => {
      commands.push({ sql, params });
      return { changes: 1 };
    },
  };
  await require('../dist/commerce/schema').migrateCommerce(database);
  await require('../dist/publishing/schema').migratePublicMedia(database);
  await require('../dist/pos/schema').migratePOS(database);
  if (known.has('026-app15-16'))
    await require('../dist/apps/website-forms-schema').migrateWebsiteForms(database);
  if (known.has('027-website-forms'))
    await require('../dist/apps/calendar-appointments-schema').migrateCalendarAppointments(database);
  return commands;
};
