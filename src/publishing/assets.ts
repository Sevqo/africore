import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, audit, fail } from '../platform/auth';
import { now, seal, unseal } from '../platform/crypto';
import { operation, currentMember } from '../erp/store';
import { requireServices } from '../marketplace/engine';
import { canonicalPublicImage, MAX_IMAGE_BYTES } from './image-validation';

export const publicAssetInput = z
  .object({
    label: z.string().trim().min(1).max(160),
    alt: z.string().trim().min(1).max(300),
    image_base64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
    acknowledge_public_use: z.literal(true),
    acknowledge_rights: z.literal(true),
  })
  .strict();
export const withdrawAssetInput = z
  .object({
    expected_version: z.number().int().positive(),
    acknowledge_withdrawal: z.literal(true),
  })
  .strict();
const context = (a: Pick<Access, 'org' | 'environment'>, id: string) =>
  JSON.stringify(['public-media', a.org, a.environment, id]);
export async function publicMediaAccess(
  a: Access,
  write = true,
  services: string[] = ['commerce'],
) {
  const role = await currentMember(a);
  await requireServices(a, services, !write);
  if (!['owner', 'admin'].includes(role))
    fail(403, 'Current owner or administrator required for public media');
}
const imageContext = (a: Pick<Access, 'org' | 'environment'>, id: string) =>
  JSON.stringify(['public-media-image', a.org, a.environment, id]);
const metadataColumns =
  'id,org_id,environment,sha256,byte_size,width,height,mime,status,version,data,created_by,created_at,updated_at';
function decode(a: Access, row: any) {
  return {
    ...row,
    version: Number(row.version),
    content: JSON.parse(unseal(row.data, context(a, row.id))),
  };
}
function presentation(row: any) {
  return {
    id: row.id,
    version: row.version,
    label: row.content.label,
    alt: row.content.alt,
    width: Number(row.width),
    height: Number(row.height),
    byte_size: Number(row.byte_size),
    mime: row.mime,
    status: row.status,
    created_at: row.created_at,
  };
}

export async function currentAsset(a: Access, id: string, active = true) {
  const row = await dbGet(
    'SELECT * FROM ac_public_media WHERE id=? AND org_id=? AND environment=?',
    [id, a.org, a.environment],
  );
  if (!row || (active && row.status !== 'active')) fail(404, 'Public image not found');
  return decode(a, row);
}
export async function assetReferences(a: Access, ids: string[]) {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  if (unique.length > 500) fail(413, 'Too many public image references');
  const rows = await dbAll(
    'SELECT ' +
      metadataColumns +
      ' FROM ac_public_media WHERE org_id=? AND environment=? AND status=? AND id IN (' +
      unique.map(() => '?').join(',') +
      ')',
    [a.org, a.environment, 'active', ...unique],
  );
  const values = new Map<string, { id: string; alt: string; width: number; height: number }>();
  for (const row of rows) {
    const item = decode(a, row);
    values.set(item.id, {
      id: item.id,
      alt: item.content.alt,
      width: Number(item.width),
      height: Number(item.height),
    });
  }
  return ids.map((id) => values.get(id) || fail(404, 'Public image not found'));
}
export async function listAssets(a: Access, input: unknown, services: string[] = ['commerce']) {
  await publicMediaAccess(a, false, services);
  const q = z
    .object({ offset: z.coerce.number().int().min(0).max(500).default(0) })
    .strict()
    .parse(input);
  const rows = await dbAll(
    'SELECT ' +
      metadataColumns +
      ' FROM ac_public_media WHERE org_id=? AND environment=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?',
    [a.org, a.environment, q.offset],
  );
  return {
    data: rows.slice(0, 50).map((row) => presentation(decode(a, row))),
    has_more: rows.length > 50,
    offset: q.offset,
    notice:
      'Only separately uploaded public-use images. Private Documents cannot be selected. Images are re-encoded; this is not a malware-scanning or physical-erasure service.',
  };
}
export async function uploadAsset(
  a: Access,
  input: unknown,
  key: string,
  services: string[] = ['commerce'],
) {
  const d = publicAssetInput.parse(input);
  await publicMediaAccess(a, true, services);
  const activeService = await dbGet(
    'SELECT e.service_id FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.status=\'active\' AND s.enabled=1 AND e.service_id IN (' +
      services.map(() => '?').join(',') +
      ') ORDER BY CASE e.service_id WHEN \'commerce\' THEN 0 ELSE 1 END LIMIT 1',
    [a.org, a.environment, ...services],
  );
  if (!activeService) fail(402, 'Activate the Website or Commerce service before uploading media');
  // Decode outside the database transaction, with bounded process-wide work.
  // Current authority is checked again under the workspace lock below.
  const image = await canonicalPublicImage(d.image_base64),
    digest = createHash('sha256').update(image.bytes).digest('hex');
  const identity = createHash('sha256')
    .update(JSON.stringify([digest, d.label, d.alt]))
    .digest('hex');
  return operation(
    a,
    activeService.service_id + '.asset.upload',
    key,
    d,
    () => publicMediaAccess(a, true, services),
    async () => {
      const old = await dbGet(
        'SELECT * FROM ac_public_media WHERE org_id=? AND environment=? AND identity_hash=?',
        [a.org, a.environment, identity],
      );
      if (old) {
        if (old.status !== 'active')
          fail(
            409,
            'This named image revision was withdrawn. Upload a new named revision instead.',
          );
        const existing = decode(a, old);
        if (existing.content.alt !== d.alt || existing.content.label !== d.label)
          fail(
            409,
            'This image already exists with different descriptive text. Reuse that image or upload a revised version.',
          );
        return presentation(existing);
      }
      const usage = await dbGet(
        'SELECT COUNT(*) AS n,COALESCE(SUM(byte_size),0) AS bytes FROM ac_public_media WHERE org_id=? AND environment=?',
        [a.org, a.environment],
      );
      if (Number(usage.n) >= 500 || Number(usage.bytes) + image.bytes.length > 50 * 1024 * 1024)
        fail(409, 'Retained public media evaluation limit reached: 500 images or 50 MiB.');
      const id = randomUUID(),
        at = now();
      const imageData = seal(image.bytes.toString('base64'), imageContext(a, id), '2');
      const data = seal(
        JSON.stringify({
          label: d.label,
          alt: d.alt,
          acknowledged_public_use: true,
          acknowledged_rights: true,
        }),
        context(a, id),
        '2',
      );
      await dbRun(
        "INSERT INTO ac_public_media(id,org_id,environment,sha256,identity_hash,byte_size,width,height,mime,status,version,data,image,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'active',1,?,?,?,?,?)",
        [
          id,
          a.org,
          a.environment,
          digest,
          identity,
          image.bytes.length,
          image.width,
          image.height,
          image.mime,
          data,
          imageData,
          a.actor,
          at,
          at,
        ],
      );
      await dbRun(
        'INSERT INTO ac_public_media_events(id,org_id,environment,asset_id,version,action,actor,created_at) VALUES (?,?,?,?,1,?,?,?)',
        [randomUUID(), a.org, a.environment, id, 'uploaded_for_public_use', a.actor, at],
      );
      await audit(a.org, a.actor, 'public_media.uploaded', id);
      return presentation(await currentAsset(a, id));
    },
  );
}

/** Authenticated, short-lived editor preview. Public delivery uses publication references. */
export async function previewAsset(a: Access, id: string) {
  await publicMediaAccess(a, false, ['commerce', 'website']);
  const asset = await currentAsset(a, id);
  return {
    id: asset.id,
    data_url: `data:${asset.mime};base64,${assetBytes(asset).toString('base64')}`,
  };
}
export async function withdrawAsset(
  a: Access,
  id: string,
  input: unknown,
  key: string,
  services: string[] = ['commerce'],
) {
  const d = withdrawAssetInput.parse(input);
  const activeService = await dbGet(
    'SELECT e.service_id FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.status=\'active\' AND s.enabled=1 AND e.service_id IN (' +
      services.map(() => '?').join(',') +
      ") ORDER BY CASE e.service_id WHEN 'commerce' THEN 0 ELSE 1 END LIMIT 1",
    [a.org, a.environment, ...services],
  );
  if (!activeService) fail(402, 'Activate the Website or Commerce service before withdrawing media');
  return operation(
    a,
    activeService.service_id + '.asset.withdraw:' + id,
    key,
    d,
    () => publicMediaAccess(a, true, services),
    async () => {
      const row = await currentAsset(a, id);
      if (row.version !== d.expected_version)
        fail(409, 'Image state changed; reload before withdrawing');
      const publications = await dbAll(
        "SELECT id,version,snapshot FROM ac_publications WHERE org_id=? AND environment=? AND active=1 AND source_kind='website'",
        [a.org, a.environment],
      );
      for (const publication of publications) {
        try {
          const context = JSON.stringify([
            'website-publication',
            a.org,
            a.environment,
            publication.id,
            Number(publication.version),
          ]);
          const snapshot = JSON.parse(unseal(publication.snapshot, context));
          const references =
            snapshot.site?.logo_media_id === id ||
            snapshot.sections?.some((section: any) => section.image_id === id || section.image_ids?.includes(id));
          if (references)
            fail(409, 'Remove this image from active publications before withdrawing it');
        } catch (error) {
          if (error instanceof Error && 'status' in error) throw error;
          fail(503, 'A publication snapshot could not be checked; image withdrawal is blocked');
        }
      }
      await dbRun(
        "UPDATE ac_public_media SET status='withdrawn',version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?",
        [now(), id, a.org, a.environment, row.version],
      );
      await dbRun(
        'INSERT INTO ac_public_media_events(id,org_id,environment,asset_id,version,action,actor,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [randomUUID(), a.org, a.environment, id, row.version + 1, 'withdrawn', a.actor, now()],
      );
      await audit(a.org, a.actor, 'public_media.withdrawn', id);
      return { id, version: row.version + 1, status: 'withdrawn', retained: true };
    },
  );
}

/** Internal reader: callers must establish current merchant authority or a
 * current public snapshot reference before accessing the canonical bytes. */
export function assetBytes(row: any) {
  const bytes = Buffer.from(
    unseal(row.image, imageContext({ org: row.org_id, environment: row.environment }, row.id)),
    'base64',
  );
  if (
    bytes.length !== Number(row.byte_size) ||
    createHash('sha256').update(bytes).digest('hex') !== row.sha256
  )
    fail(503, 'Image integrity requires review');
  return bytes;
}
