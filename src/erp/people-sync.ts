import { createHmac } from 'node:crypto';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { defaultPeoplePolicy, peopleContext, requireHR } from './people-access';
import { insert, read, update } from './store';

export const ROLE_JOB_TITLES: Record<string, string> = {
  owner: 'Workspace Owner',
  admin: 'Administrator',
  hr: 'HR & People Manager',
  finance: 'Finance Manager',
  accountant: 'Accountant',
  sales: 'Sales Representative',
  operations: 'Operations Lead',
  inventory_manager: 'Inventory & Warehouse Manager',
  support_agent: 'Customer Support Agent',
  marketing_manager: 'Marketing Manager',
  viewer: 'Team Member',
};

function staffReferenceHash(org: string, environment: string, value: string) {
  const key = process.env.ID_HASH_SALT;
  if (!key && process.env.NODE_ENV === 'production')
    fail(503, 'Private employee reference key is unavailable');
  return (
    'hmac-people-v1:' +
    createHmac('sha256', key || 'local-only-people-reference-key')
      .update(
        JSON.stringify([
          'people-employee-reference-v1',
          org,
          environment,
          value.normalize('NFKC').trim().toUpperCase(),
        ]),
      )
      .digest('hex')
  );
}

export async function ensurePeopleSettings(a: Access) {
  const existing = await dbGet(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_settings'",
    [a.org, a.environment],
  );
  if (existing) return read(a, existing.id, 'people_settings');
  return insert(a, 'people_settings', { ...defaultPeoplePolicy });
}

async function nextEmployeeNumber(a: Access): Promise<{ number: string; hash: string }> {
  const countRow = await dbGet(
    'SELECT COUNT(*) AS n FROM ac_people_employees WHERE org_id=? AND environment=?',
    [a.org, a.environment],
  );
  let seq = Number(countRow?.n || 0) + 1;
  for (let attempt = 0; attempt < 200; attempt++) {
    const number = 'EMP-' + String(seq).padStart(4, '0');
    const refHash = staffReferenceHash(a.org, a.environment, number);
    const exists = await dbGet(
      'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND employee_ref_hash=?',
      [a.org, a.environment, refHash],
    );
    if (!exists) return { number, hash: refHash };
    seq++;
  }
  const fallback = 'EMP-' + Date.now().toString(36).toUpperCase();
  return { number: fallback, hash: staffReferenceHash(a.org, a.environment, fallback) };
}

function displayNameFor(member: { display_name?: string | null; email?: string | null }) {
  const explicit = String(member.display_name || '').trim();
  if (explicit) return explicit.slice(0, 160);
  const local = String(member.email || 'Team Member')
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim();
  const formatted = local.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return (formatted || 'Team Member').slice(0, 160);
}

export async function syncMemberToEmployeeRecord(
  a: Access,
  settingsId: string,
  member: { user_id: string; email: string; display_name?: string | null; role: string },
) {
  const existing = await dbGet(
    'SELECT employee_id,status FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
    [a.org, a.environment, member.user_id],
  );
  if (existing) {
    return { created: false, employee_id: existing.employee_id as string };
  }
  const { number, hash: refHash } = await nextEmployeeNumber(a);
  const startOn = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const employeeData = {
    expected_version: 0,
    employee_number: number,
    name: displayNameFor(member),
    job_title: ROLE_JOB_TITLES[member.role] || 'Team Member',
    position_id: null,
    department_id: null,
    manager_id: null,
    linked_user_id: member.user_id,
    self_service: true,
    work_email: member.email || '',
    work_phone: '',
    start_on: startOn,
    status: 'active',
    hr_notes: '',
  };
  const created = await insert(a, 'employee', employeeData, {
    root: settingsId,
    owner: member.user_id,
    status: 'active',
  });
  await dbRun(
    'INSERT INTO ac_people_employees(employee_id,org_id,environment,linked_user_id,employee_ref_hash,manager_id,department_id,status,start_on) VALUES (?,?,?,?,?,?,?,?,?)',
    [created.id, a.org, a.environment, member.user_id, refHash, null, null, 'active', startOn],
  );
  return { created: true, employee_id: created.id };
}

export async function syncWorkspaceMembersToEmployees(a: Access) {
  await requireHR(a, true);
  const settings = await ensurePeopleSettings(a);
  const members = (await dbAll(
    'SELECT m.user_id,m.role,u.email,p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=? ORDER BY u.email',
    [a.org],
  )) as { user_id: string; role: string; email: string; display_name?: string | null }[];
  let createdCount = 0;
  for (const member of members) {
    const res = await syncMemberToEmployeeRecord(a, settings.id, member);
    if (res.created) createdCount++;
  }
  return {
    synced: createdCount,
    total_members: members.length,
    settings_initialized: true,
  };
}

/**
 * Automatically syncs workspace members into People when an invitation is accepted
 * (or when People is active in the workspace) so invited HR/team members immediately appear.
 */
export async function autoSyncMembersOnInvitationAccept(orgId: string, actorId: string) {
  const workspace = await dbGet('SELECT kind,status FROM ac_workspaces WHERE id=?', [orgId]);
  if (!workspace || workspace.kind !== 'business' || workspace.status !== 'active') return;
  const envs = (await dbAll(
    "SELECT DISTINCT environment FROM ac_service_entitlements WHERE org_id=? AND service_id='people' AND status='active'",
    [orgId],
  )) as { environment: string }[];
  if (!envs.length) return;
  const members = (await dbAll(
    'SELECT m.user_id,m.role,u.email,p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=? ORDER BY u.email',
    [orgId],
  )) as { user_id: string; role: string; email: string; display_name?: string | null }[];
  for (const { environment } of envs) {
    const a: Access = { org: orgId, actor: actorId, environment, role: 'owner', api: false };
    const settings = await ensurePeopleSettings(a);
    for (const member of members) {
      await syncMemberToEmployeeRecord(a, settings.id, member);
    }
  }
}

/**
 * Keeps People in sync when a member is removed from Team (Odoo Employee-User Archive Sync).
 */
export async function archiveEmployeeForRemovedMember(
  orgId: string,
  userId: string,
  actorId: string,
  actorRole: string,
) {
  const linkedRows = (await dbAll(
    "SELECT employee_id,environment FROM ac_people_employees WHERE org_id=? AND linked_user_id=? AND status<>'inactive'",
    [orgId, userId],
  )) as { employee_id: string; environment: string }[];
  for (const row of linkedRows) {
    const a: Access = {
      org: orgId,
      actor: actorId,
      environment: row.environment,
      role: actorRole,
      api: false,
    };
    try {
      const existing = await read(a, row.employee_id, 'employee');
      await update(
        a,
        existing,
        { ...existing.data, status: 'inactive' },
        { status: 'inactive' },
        'archived_on_member_removal',
      );
      await dbRun(
        "UPDATE ac_people_employees SET status='inactive' WHERE employee_id=? AND org_id=? AND environment=?",
        [row.employee_id, orgId, row.environment],
      );
    } catch {
      /* ignore if record missing */
    }
  }
}

export async function ensurePeopleInitializedForAdminOrHR(a: Access) {
  const c = await peopleContext(a, true);
  if (c.settings) return c.settings;
  return ensurePeopleSettings(a);
}
