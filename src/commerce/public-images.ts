import {z} from 'zod';
import {dbGet} from '../db/adapter';
import {fail} from '../platform/auth';
import {publishedStoreContext} from './publishing';
import {assetBytes, currentAsset} from '../publishing/assets';

export async function publicStoreImage(environment: string, slug: string, id: string) {
  z.string().uuid().parse(id);
  const {a, manifest} = await publishedStoreContext(environment, slug);
  let referenced = manifest.logo_asset?.id === id;
  if (!referenced) {
    for (const listing of manifest.listings.filter((l: any) => l.assets?.some((asset: any) => asset.id === id))) {
      const current = await dbGet("SELECT p.data FROM ac_erp_objects l JOIN ac_products p ON p.id=l.parent_id AND p.org_id=l.org_id AND p.environment=l.environment WHERE l.id=? AND l.org_id=? AND l.environment=? AND l.kind='commerce_listing' AND l.root_id=? AND l.status='active' AND p.status='active'", [listing.id, a.org, a.environment, manifest.store_id]);
      if (current && JSON.parse(current.data).currency === manifest.currency) {referenced = true; break;}
    }
  }
  if (!referenced) fail(404, 'Published image not found');
  const asset = await currentAsset(a, id);
  return {bytes: assetBytes(asset), mime: asset.mime};
}
