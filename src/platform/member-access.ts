import { dbAll, dbGet, dbRun } from '../db/adapter';
import { appCatalog } from '../apps/catalog';
import { roleAppAccess, roleAllowsApp } from './roles';
import { deriveUsername, type UserAvatarProfile } from './profile-avatar';
import { fail, type Access } from './auth';
import { now } from './crypto';

export type FloatingAgentAccessMode = 'default' | 'allow' | 'deny';

export interface MemberAccessOverride {
  user_id: string;
  username: string;
  extra_apps: string[];
  revoked_apps: string[];
  floating_agent_access: FloatingAgentAccessMode;
}

export const DEFAULT_FLOATING_AGENT_ROLES = ['owner', 'admin'] as const;

const STANDARD_USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;
const RESERVED_USERNAMES = new Set([
  'all',
  'everyone',
  'here',
  'channel',
  'system',
  'bot',
  'admin',
  'owner',
  'agent',
  'support',
  'help',
  'root',
  'moderator',
]);

export function normalizeWorkspaceUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function normalizeAgentHandle(raw: string, fallbackName = 'workspace'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  let base = cleaned;
  if (!base) {
    base = String(fallbackName || 'workspace')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 22);
    if (!base) base = 'workspace';
  }
  if (!/(?:^|[-_])agent$/.test(base) && !base.endsWith('agent')) {
    base = `${base.slice(0, 24)}-agent`;
  } else if (base === 'agent') {
    base = 'workspace-agent';
  }
  return base.slice(0, 31).replace(/^[-_]+|[-_]+$/g, '') || 'workspace-agent';
}

export function validateAgentHandleOrThrow(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,30}$/.test(cleaned)) {
    fail(400, 'Agent handle must be 2–31 lowercase letters, numbers, hyphens, or underscores');
  }
  if (!cleaned.endsWith('agent')) {
    fail(
      400,
      "Workspace agent handle must end with 'agent' (for example, 'continua-agent')",
    );
  }
  if (cleaned === 'agent') {
    fail(400, "Include a workspace prefix before 'agent' (for example, 'continua-agent')");
  }
  return cleaned;
}

export function validateWorkspaceUsername(
  raw: string,
  agentHandle?: string,
): { ok: true; username: string } | { ok: false; message: string } {
  const username = normalizeWorkspaceUsername(raw);
  if (username.length < 2 || username.length > 32) {
    return { ok: false, message: 'Username must be between 2 and 32 characters.' };
  }
  if (!STANDARD_USERNAME_RE.test(username)) {
    return {
      ok: false,
      message:
        'Username must start and end with a letter or number and contain only lowercase letters, numbers, dots, hyphens, or underscores.',
    };
  }
  if (/[._-]{2}/.test(username)) {
    return { ok: false, message: 'Username cannot contain consecutive dots, hyphens, or underscores.' };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, message: `"@${username}" is reserved and cannot be used as a username.` };
  }
  if (/(?:^|[-_.])agent$/.test(username) || username.endsWith('agent')) {
    return {
      ok: false,
      message: 'Usernames ending in "agent" are reserved for workspace AI agents.',
    };
  }
  if (agentHandle && username === normalizeWorkspaceUsername(agentHandle)) {
    return {
      ok: false,
      message: `"@${username}" is already assigned to this workspace's AI agent.`,
    };
  }
  return { ok: true, username };
}

function sanitizeDerivedMemberUsername(displayName?: string | null, email?: string | null): string {
  let base = deriveUsername(displayName, email)
    .toLowerCase()
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (base.length < 2) base = 'member';
  if (RESERVED_USERNAMES.has(base) || base.endsWith('agent')) {
    base = `${base.slice(0, 20)}.user`;
  }
  return base.slice(0, 28);
}

const objectId = (orgId: string, userId: string) => `member_access:${orgId}:${userId}`;

function parseOverrideRow(userId: string, rawData: unknown): MemberAccessOverride {
  try {
    const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData || {};
    return {
      user_id: userId,
      username: typeof parsed.username === 'string' ? normalizeWorkspaceUsername(parsed.username) : '',
      extra_apps: Array.isArray(parsed.extra_apps)
        ? [...new Set<string>(parsed.extra_apps.map((x: unknown) => String(x)).filter(Boolean))]
        : [],
      revoked_apps: Array.isArray(parsed.revoked_apps)
        ? [...new Set<string>(parsed.revoked_apps.map((x: unknown) => String(x)).filter(Boolean))]
        : [],
      floating_agent_access:
        parsed.floating_agent_access === 'allow' || parsed.floating_agent_access === 'deny'
          ? parsed.floating_agent_access
          : 'default',
    };
  } catch {
    return {
      user_id: userId,
      username: '',
      extra_apps: [],
      revoked_apps: [],
      floating_agent_access: 'default',
    };
  }
}

export async function getMemberAccessOverride(
  orgId: string,
  userId: string,
): Promise<MemberAccessOverride> {
  const row = await dbGet(
    "SELECT data FROM ac2_objects WHERE id=? AND org_id=? AND environment='workspace' AND kind='member_access_profile'",
    [objectId(orgId, userId), orgId],
  ).catch(() => null);
  return parseOverrideRow(userId, row?.data);
}

export async function getWorkspaceMemberOverrides(
  orgId: string,
): Promise<Map<string, MemberAccessOverride>> {
  const rows = await dbAll(
    "SELECT id, data FROM ac2_objects WHERE org_id=? AND environment='workspace' AND kind='member_access_profile'",
    [orgId],
  ).catch(() => []);
  const map = new Map<string, MemberAccessOverride>();
  const prefix = `member_access:${orgId}:`;
  for (const row of rows) {
    const id = String(row.id || '');
    const userId = id.startsWith(prefix) ? id.slice(prefix.length) : '';
    if (!userId) continue;
    map.set(userId, parseOverrideRow(userId, row.data));
  }
  return map;
}

export async function saveMemberAccessOverride(
  orgId: string,
  userId: string,
  patch: Partial<Omit<MemberAccessOverride, 'user_id'>>,
): Promise<MemberAccessOverride> {
  const current = await getMemberAccessOverride(orgId, userId);
  const validAppIds = new Set(appCatalog.map((a) => a.id));
  const extra_apps =
    patch.extra_apps !== undefined
      ? [...new Set(patch.extra_apps.filter((id) => validAppIds.has(id)))]
      : current.extra_apps;
  const revoked_apps =
    patch.revoked_apps !== undefined
      ? [...new Set(patch.revoked_apps.filter((id) => validAppIds.has(id) && !extra_apps.includes(id)))]
      : current.revoked_apps.filter((id) => !extra_apps.includes(id));

  const next: MemberAccessOverride = {
    user_id: userId,
    username: patch.username !== undefined ? normalizeWorkspaceUsername(patch.username) : current.username,
    extra_apps,
    revoked_apps,
    floating_agent_access: patch.floating_agent_access ?? current.floating_agent_access,
  };

  const id = objectId(orgId, userId);
  const stamp = now();
  const existing = await dbGet('SELECT version FROM ac2_objects WHERE id=?', [id]).catch(() => null);
  if (existing) {
    await dbRun('UPDATE ac2_objects SET data=?, version=version+1, updated_at=? WHERE id=?', [
      JSON.stringify(next),
      stamp,
      id,
    ]);
  } else {
    await dbRun(
      "INSERT INTO ac2_objects(id, org_id, environment, kind, data, version, created_at, updated_at) VALUES (?,?,'workspace','member_access_profile',?,1,?,?)",
      [id, orgId, JSON.stringify(next), stamp, stamp],
    );
  }
  return next;
}

export function resolveWorkspaceUsernames(
  members: Array<{ id: string; email?: string; display_name?: string }>,
  overrides: Map<string, MemberAccessOverride>,
  avatarMap: Map<string, UserAvatarProfile>,
  agentHandle?: string,
): Map<string, string> {
  const used = new Set<string>();
  if (agentHandle) used.add(normalizeWorkspaceUsername(agentHandle));
  const resolved = new Map<string, string>();

  // First pass: claim explicit valid workspace-scoped usernames
  for (const member of members) {
    const ov = overrides.get(member.id);
    if (ov?.username) {
      const check = validateWorkspaceUsername(ov.username, agentHandle);
      if (check.ok && !used.has(check.username)) {
        used.add(check.username);
        resolved.set(member.id, check.username);
      }
    }
  }

  // Second pass: claim account-level or derived usernames, disambiguating within this workspace
  for (const member of members) {
    if (resolved.has(member.id)) continue;
    const avatarUsername = avatarMap.get(member.id)?.username || '';
    const avatarCheck = avatarUsername
      ? validateWorkspaceUsername(avatarUsername, agentHandle)
      : { ok: false as const, message: '' };
    const base = avatarCheck.ok
      ? avatarCheck.username
      : sanitizeDerivedMemberUsername(member.display_name, member.email);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      const tail = String(suffix++);
      candidate = `${base.slice(0, Math.max(2, 32 - tail.length))}${tail}`;
    }
    used.add(candidate);
    resolved.set(member.id, candidate);
  }

  return resolved;
}

export async function assertWorkspaceUsernameAvailable(
  orgId: string,
  targetUserId: string,
  rawUsername: string,
  agentHandle?: string,
): Promise<string> {
  const check = validateWorkspaceUsername(rawUsername, agentHandle);
  if (!check.ok) return fail(400, check.message);
  const candidate = check.username;

  const [rows, overrides] = await Promise.all([
    dbAll(
      'SELECT u.id, u.email, p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?',
      [orgId],
    ),
    getWorkspaceMemberOverrides(orgId),
  ]);
  const { getUserAvatarProfiles } = await import('./profile-avatar');
  const avatarMap = await getUserAvatarProfiles(rows.map((r: any) => String(r.id)));
  const resolved = resolveWorkspaceUsernames(
    rows.map((r: any) => ({
      id: String(r.id),
      email: String(r.email || ''),
      display_name: String(r.display_name || ''),
    })),
    overrides,
    avatarMap,
    agentHandle,
  );

  for (const [uid, existingUsername] of resolved.entries()) {
    if (uid !== targetUserId && existingUsername === candidate) {
      fail(
        409,
        `Username "@${candidate}" is already taken in this workspace. Choose another username.`,
      );
    }
  }
  return candidate;
}

export function memberAllowedAppIds(
  role: string,
  workspaceKind: 'business' | 'personal' | 'developer',
  override?: MemberAccessOverride | null,
): string[] {
  const eligible = appCatalog.filter((app) => app.kinds.includes(workspaceKind)).map((a) => a.id);
  const allowed = new Set<string>();
  for (const id of eligible) {
    if (roleAllowsApp(role, id, workspaceKind)) allowed.add(id);
  }
  if (override) {
    for (const id of override.extra_apps || []) {
      if (eligible.includes(id)) allowed.add(id);
    }
    if (role !== 'owner') {
      for (const id of override.revoked_apps || []) {
        allowed.delete(id);
      }
    }
  }
  return [...allowed];
}

export function memberCanUseApp(
  role: string,
  appId: string,
  workspaceKind: 'business' | 'personal' | 'developer',
  override?: MemberAccessOverride | null,
): boolean {
  if (role === 'owner') return true;
  if (override?.extra_apps?.includes(appId)) return true;
  if (override?.revoked_apps?.includes(appId)) return false;
  return roleAllowsApp(role, appId, workspaceKind);
}

export function memberCanUseFloatingAgent(
  role: string,
  override?: MemberAccessOverride | null,
  policyDefaultRoles?: readonly string[] | null,
): boolean {
  if (role === 'owner') return true;
  if (override?.floating_agent_access === 'allow') return true;
  if (override?.floating_agent_access === 'deny') return false;
  const defaults =
    policyDefaultRoles && policyDefaultRoles.length > 0
      ? policyDefaultRoles
      : DEFAULT_FLOATING_AGENT_ROLES;
  return defaults.includes(role);
}

export function roleDefaultApps(
  role: string,
  workspaceKind: 'business' | 'personal' | 'developer' = 'business',
): string[] {
  const access = roleAppAccess[role];
  const eligible = appCatalog.filter((app) => app.kinds.includes(workspaceKind)).map((a) => a.id);
  if (access === '*') return eligible;
  if (!access) return [];
  return access.filter((id) => eligible.includes(id));
}

export async function getMemberEffectiveAccess(
  a: Access,
  workspaceKind: 'business' | 'personal' | 'developer',
  policyDefaultRoles?: readonly string[] | null,
) {
  const override = await getMemberAccessOverride(a.org, a.actor);
  return {
    override,
    allowed_apps: memberAllowedAppIds(a.role, workspaceKind, override),
    can_use_floating_agent: memberCanUseFloatingAgent(a.role, override, policyDefaultRoles),
  };
}
