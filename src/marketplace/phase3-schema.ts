import { dbGet, dbRun, dbTransaction } from '../db/adapter';
import { serviceCatalog } from './catalog';
import { evaluationPrice } from './schema';

/** Add app capabilities without backfilling entitlements for existing workspaces. */
export async function migratePhase3Catalog() {
  await dbTransaction(async () => {
    if (await dbGet('SELECT version FROM platform_migrations WHERE version=?', ['026-app15-16']))
      return;
    const at = new Date().toISOString();
    for (const id of ['calendar', 'website']) {
      const service = serviceCatalog.find((entry) => entry.id === id);
      if (!service) throw new Error('Phase 3 service definition missing: ' + id);
      await dbRun(
        'INSERT INTO ac_services(id,version,definition,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
        [service.id, service.version, JSON.stringify(service), at],
      );
      await dbRun(
        'INSERT INTO ac_service_prices(id,service_id,version,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(service_id,version) DO NOTHING',
        [service.id + ':evaluation-v1', service.id, 'evaluation-v1', JSON.stringify(evaluationPrice(id)), at],
      );
    }
    await dbRun('INSERT INTO platform_migrations(version,applied_at) VALUES (?,?)', ['026-app15-16', at]);
  });
}
