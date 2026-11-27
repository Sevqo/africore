import { dbAll, dbGet } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import type { WorkspaceKind } from '../marketplace/catalog';

export interface LinkedWorkspaceTarget {
  id: string;
  kind: WorkspaceKind;
  name: string;
  relation: 'current' | 'personal_developer_bridge';
}

export interface AgentIsolationBoundary {
  source_workspace_id: string;
  source_kind: WorkspaceKind;
  allowed_workspace_ids: string[];
  linked_workspaces: LinkedWorkspaceTarget[];
  blocked_kinds: string[];
  cross_workspace_bridge: boolean;
  sandbox_policy: string;
  isolation_label: string;
}

export async function workspaceKindFor(orgId: string): Promise<WorkspaceKind> {
  const row = await dbGet('SELECT kind FROM ac_workspaces WHERE id=?', [orgId]);
  const kind = row?.kind || 'business';
  if (kind === 'personal' || kind === 'developer' || kind === 'business') return kind;
  return 'business';
}

/**
 * Enforces AfriCore's strict workspace sandboxing boundary:
 * - Business workspace agent: STRICTLY sandboxed to the active Business workspace only.
 *   Never accesses Personal, Developer, or any other Business workspace.
 * - Personal workspace agent: Accesses the user's Personal workspace and (when owned by the
 *   same verified account & active) their Developer workspace. NEVER accesses any Business workspace.
 * - Developer workspace agent: Accesses the user's Developer workspace and (when owned by the
 *   same verified account & active) their Personal workspace. NEVER accesses any Business workspace.
 */
export async function resolveAgentBoundary(
  a: Access,
  options: { crossDevBridgeEnabled?: boolean } = {},
): Promise<AgentIsolationBoundary> {
  const current = await dbGet(
    `SELECT w.id, w.kind, w.status, o.name
     FROM ac_workspaces w
     JOIN ac_organizations o ON o.id = w.id
     WHERE w.id = ?`,
    [a.org],
  );
  const sourceKind: WorkspaceKind =
    current?.kind === 'personal' || current?.kind === 'developer' ? current.kind : 'business';
  const currentName = current?.name || 'Workspace';

  if (sourceKind === 'business') {
    return {
      source_workspace_id: a.org,
      source_kind: 'business',
      allowed_workspace_ids: [a.org],
      linked_workspaces: [
        { id: a.org, kind: 'business', name: currentName, relation: 'current' },
      ],
      blocked_kinds: ['personal', 'developer', 'other_business'],
      cross_workspace_bridge: false,
      sandbox_policy:
        'Business Sandbox Lock: This agent is strictly isolated inside this business workspace. It has zero read or write access to Personal, Developer, or other Business workspaces.',
      isolation_label: 'Business Sandboxed',
    };
  }

  const linked: LinkedWorkspaceTarget[] = [
    { id: a.org, kind: sourceKind, name: currentName, relation: 'current' },
  ];
  const allowedIds = [a.org];
  const bridgeEnabled = options.crossDevBridgeEnabled !== false;

  if (bridgeEnabled && !a.api) {
    const companionKind: WorkspaceKind = sourceKind === 'personal' ? 'developer' : 'personal';
    const owned = await dbAll(
      `SELECT ow.workspace_id AS id, w.kind, o.name
       FROM ac_owned_workspaces ow
       JOIN ac_workspaces w ON w.id = ow.workspace_id
       JOIN ac_organizations o ON o.id = ow.workspace_id
       JOIN ac_memberships m ON m.org_id = ow.workspace_id AND m.user_id = ow.user_id
       WHERE ow.user_id = ?
         AND ow.kind = ?
         AND w.kind = ?
         AND w.status = 'active'
         AND m.role = 'owner'`,
      [a.actor, companionKind, companionKind],
    );
    for (const row of owned) {
      if (row.id && row.id !== a.org && !allowedIds.includes(row.id)) {
        allowedIds.push(row.id);
        linked.push({
          id: row.id,
          kind: companionKind,
          name: row.name || companionKind,
          relation: 'personal_developer_bridge',
        });
      }
    }
  }

  return {
    source_workspace_id: a.org,
    source_kind: sourceKind,
    allowed_workspace_ids: allowedIds,
    linked_workspaces: linked,
    blocked_kinds: ['business'],
    cross_workspace_bridge: linked.length > 1,
    sandbox_policy:
      sourceKind === 'personal'
        ? 'Personal + Developer Scope: This agent can manage your Personal workspace and linked Developer workspace. Business workspaces are permanently blocked.'
        : 'Developer + Personal Scope: This agent can manage your Developer workspace and linked Personal workspace. Business workspaces are permanently blocked.',
    isolation_label:
      linked.length > 1
        ? sourceKind === 'personal'
          ? 'Personal + Dev Bridge · Business Blocked'
          : 'Developer + Personal Bridge · Business Blocked'
        : sourceKind === 'personal'
          ? 'Personal Isolated · Business Blocked'
          : 'Developer Isolated · Business Blocked',
  };
}

/**
 * Hard fail-closed enforcement called before ANY agent tool executes or reads data.
 * Re-verifies live DB workspace kind & membership and logs boundary violations to ac_audit.
 */
export async function assertAgentTargetAllowed(
  a: Access,
  targetWorkspaceId: string,
  options: { crossDevBridgeEnabled?: boolean } = {},
): Promise<{ access: Access; boundary: AgentIsolationBoundary; targetKind: WorkspaceKind }> {
  const boundary = await resolveAgentBoundary(a, options);
  const targetId = targetWorkspaceId || a.org;

  if (!boundary.allowed_workspace_ids.includes(targetId)) {
    await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    const reason =
      boundary.source_kind === 'business'
        ? 'Business workspace isolation violation: a Business agent can never access Personal, Developer, or other Business workspaces.'
        : 'Workspace isolation violation: Personal and Developer agents can never access Business workspaces or unowned workspaces.';
    fail(403, reason);
  }

  const targetRow = await dbGet(
    `SELECT w.id, w.kind, w.status, m.role
     FROM ac_workspaces w
     JOIN ac_memberships m ON m.org_id = w.id AND m.user_id = ?
     WHERE w.id = ?`,
    [a.actor, targetId],
  );
  if (!targetRow || targetRow.status !== 'active') {
    await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    fail(403, 'Target workspace is inactive or membership was revoked.');
  }
  const targetKind: WorkspaceKind =
    targetRow.kind === 'personal' || targetRow.kind === 'developer' ? targetRow.kind : 'business';

  if (boundary.source_kind === 'business' && targetId !== a.org) {
    await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    fail(403, 'Business agent cannot escape its sandboxed workspace.');
  }
  if (boundary.source_kind !== 'business' && targetKind === 'business') {
    await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    fail(403, 'Personal and Developer agents are strictly blocked from Business workspaces.');
  }

  // Developer workspaces only run in sandbox environment.
  const targetEnvironment = targetKind === 'developer' ? 'sandbox' : a.environment;
  return {
    access: {
      actor: a.actor,
      org: targetId,
      environment: targetEnvironment,
      role: targetRow.role,
      api: a.api,
    },
    boundary,
    targetKind,
  };
}
