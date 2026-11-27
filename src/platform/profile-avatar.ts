import { dbAll, dbGet, dbRun } from '../db/adapter';
import { now } from './crypto';

export interface UserAvatarProfile {
  avatar_url: string;
  username: string;
}

const AVATAR_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{16,220000}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

export function isValidAvatarDataUrl(value: string): boolean {
  return value === '' || AVATAR_DATA_URL_RE.test(value);
}

export function isValidUsername(value: string): boolean {
  return value === '' || USERNAME_RE.test(value);
}

export function deriveUsername(displayName?: string | null, email?: string | null): string {
  const base = (displayName || email?.split('@')[0] || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
  return base.length >= 2 ? base : 'member';
}

export async function getUserAvatarProfile(userId: string): Promise<UserAvatarProfile> {
  const row = await dbGet(
    "SELECT data FROM ac2_objects WHERE id=? AND org_id=? AND environment='account' AND kind='user_avatar'",
    ['user_avatar:' + userId, userId],
  ).catch(() => null);
  if (!row?.data) return { avatar_url: '', username: '' };
  try {
    const parsed = JSON.parse(row.data);
    return {
      avatar_url: typeof parsed.avatar_url === 'string' ? parsed.avatar_url : '',
      username: typeof parsed.username === 'string' ? parsed.username : '',
    };
  } catch {
    return { avatar_url: '', username: '' };
  }
}

export async function getUserAvatarProfiles(
  userIds: string[],
): Promise<Map<string, UserAvatarProfile>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, UserAvatarProfile>();
  if (!unique.length) return map;
  const placeholders = unique.map(() => '?').join(',');
  const ids = unique.map((u) => 'user_avatar:' + u);
  const rows = await dbAll(
    `SELECT org_id, data FROM ac2_objects WHERE id IN (${placeholders}) AND environment='account' AND kind='user_avatar'`,
    ids,
  ).catch(() => []);
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data);
      map.set(String(row.org_id), {
        avatar_url: typeof parsed.avatar_url === 'string' ? parsed.avatar_url : '',
        username: typeof parsed.username === 'string' ? parsed.username : '',
      });
    } catch {
      /* ignore malformed */
    }
  }
  return map;
}

export async function saveUserAvatarProfile(
  userId: string,
  patch: { avatar_url?: string; username?: string },
): Promise<UserAvatarProfile> {
  const current = await getUserAvatarProfile(userId);
  const next: UserAvatarProfile = {
    avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : current.avatar_url,
    username: patch.username !== undefined ? patch.username : current.username,
  };
  const stamp = now();
  const id = 'user_avatar:' + userId;
  const existing = await dbGet('SELECT version FROM ac2_objects WHERE id=?', [id]).catch(
    () => null,
  );
  if (existing) {
    await dbRun(
      'UPDATE ac2_objects SET data=?, version=version+1, updated_at=? WHERE id=?',
      [JSON.stringify(next), stamp, id],
    );
  } else {
    await dbRun(
      "INSERT INTO ac2_objects(id, org_id, environment, kind, data, version, created_at, updated_at) VALUES (?,?,'account','user_avatar',?,1,?,?)",
      [id, userId, JSON.stringify(next), stamp, stamp],
    );
  }
  return next;
}
