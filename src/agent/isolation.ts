import { dbAll, dbGet } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import type { WorkspaceKind } from '../marketplace/catalog';
import { runPythonAgent } from './python-bridge';

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

export async function buildBoundaryInput(
  a: Access,
  options: { crossDevBridgeEnabled?: boolean } = {},
) {
  const current = await dbGet(
    `SELECT w.id, w.kind, w.status, o.name
     FROM ac_workspaces w
     JOIN ac_organizations o ON o.id = w.id
     WHERE w.id = ?`,
    [a.org],
  );
  const sourceKind: WorkspaceKind =
    current?.kind === 'personal' || current?.kind === 'developer' ? current.kind : 'business';
  const companionKind: WorkspaceKind = sourceKind === 'personal' ? 'developer' : 'personal';

  const ownedCompanions =
    sourceKind === 'business' || a.api
      ? []
      : await dbAll(
          `SELECT ow.workspace_id AS id, w.kind, o.name, w.status, m.role
           FROM ac_owned_workspaces ow
           JOIN ac_workspaces w ON w.id = ow.workspace_id
           JOIN ac_organizations o ON o.id = ow.workspace_id
           JOIN ac_memberships m ON m.org_id = ow.workspace_id AND m.user_id = ow.user_id
           WHERE ow.user_id = ? AND ow.kind = ? AND w.kind = ?`,
          [a.actor, companionKind, companionKind],
        );

  return {
    source_workspace_id: a.org,
    source_kind: sourceKind,
    source_name: current?.name || 'Workspace',
    cross_dev_bridge_enabled: options.crossDevBridgeEnabled !== false,
    is_api: a.api,
    owned_companions: ownedCompanions,
  };
}

/** Evaluates strict workspace sandboxing through the Python Agent Isolation engine. */
export async function resolveAgentBoundary(
  a: Access,
  options: { crossDevBridgeEnabled?: boolean } = {},
): Promise<AgentIsolationBoundary> {
  const input = await buildBoundaryInput(a, options);
  return runPythonAgent<AgentIsolationBoundary>({
    op: 'evaluate_boundary',
    ...input,
  });
}

/** Fail-closed target verification powered by Python isolation engine + live DB membership check. */
export async function assertAgentTargetAllowed(
  a: Access,
  targetWorkspaceId: string,
  options: { crossDevBridgeEnabled?: boolean } = {},
): Promise<{ access: Access; boundary: AgentIsolationBoundary; targetKind: WorkspaceKind }> {
  const boundaryInput = await buildBoundaryInput(a, options);
  const targetId = targetWorkspaceId || a.org;

  const targetRow = await dbGet(
    `SELECT w.id, w.kind, w.status, m.role
     FROM ac_workspaces w
     JOIN ac_memberships m ON m.org_id = w.id AND m.user_id = ?
     WHERE w.id = ?`,
    [a.actor, targetId],
  );
  const targetKind: WorkspaceKind | undefined =
    targetRow?.kind === 'personal' || targetRow?.kind === 'developer'
      ? targetRow.kind
      : targetRow?.kind === 'business'
        ? 'business'
        : undefined;

  const verdict = await runPythonAgent<{
    boundary: AgentIsolationBoundary;
    allowed: boolean;
    status: number;
    reason: string;
    audit_violation: boolean;
  }>({
    op: 'check_target_access',
    boundary_input: boundaryInput,
    target_workspace_id: targetId,
    target_kind: targetKind ?? null,
  });

  if (!verdict.allowed) {
    if (verdict.audit_violation) {
      await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    }
    fail(verdict.status || 403, verdict.reason);
  }

  if (!targetRow || targetRow.status !== 'active' || !targetKind) {
    await audit(a.org, a.actor, 'agent.boundary_violation_blocked', targetId);
    return fail(403, 'Target workspace is inactive or membership was revoked.');
  }

  const targetEnvironment = targetKind === 'developer' ? 'sandbox' : a.environment;
  return {
    access: {
      actor: a.actor,
      org: targetId,
      environment: targetEnvironment,
      role: targetRow.role,
      api: a.api,
    },
    boundary: verdict.boundary,
    targetKind,
  };
}
