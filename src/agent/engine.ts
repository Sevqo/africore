import { randomUUID } from 'node:crypto';
import { dbGet, dbRun } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import { hash, now, seal, unseal } from '../platform/crypto';
import { canonical } from '../finance/service';
import { all, change, create, get } from '../operations/store';
import { consumeAgentCredits, getAgentBillingSummary, type AgentCreditCategory } from './billing';
import {
  agentApprovalDecisionInput,
  agentMemoryInput,
  agentMemoryPatchInput,
  agentPermissionsUpdateInput,
  agentRoutineCreateInput,
  agentRoutinePatchInput,
  agentRunInput,
  type AgentPermissionMode,
} from './contracts';
import {
  DEFAULT_FLOATING_AGENT_ROLES,
  getMemberAccessOverride,
  getWorkspaceMemberOverrides,
  memberCanUseFloatingAgent,
  normalizeAgentHandle,
  resolveWorkspaceUsernames,
  validateAgentHandleOrThrow,
} from '../platform/member-access';
import { getUserAvatarProfiles } from '../platform/profile-avatar';
import { dbAll } from '../db/adapter';
import {
  assertAgentTargetAllowed,
  buildBoundaryInput,
  resolveAgentBoundary,
  workspaceKindFor,
} from './isolation';
import { runPythonAgent } from './python-bridge';
import {
  executeAgentTool,
  fetchSandboxCloneContext,
  toolById,
  type ComputerUseStep,
} from './tools';

export interface AgentPolicyRecord {
  org_id: string;
  environment: string;
  autonomy_mode: 'read_only' | 'supervised' | 'autonomous';
  computer_use_enabled: boolean;
  cross_dev_bridge_enabled: boolean;
  agent_handle: string;
  agent_display_name: string;
  floating_agent_roles: string[];
  permissions: Record<string, AgentPermissionMode>;
  updated_by: string;
  updated_at: string;
}

function defaultAgentIdentity(workspaceName: string | null | undefined, kind: string) {
  const cleanName = String(workspaceName || kind || 'workspace').trim();
  const handle = normalizeAgentHandle('', cleanName);
  const displayName = `${cleanName} Agent`.slice(0, 60);
  return { handle, displayName };
}

const sealCtx = (a: Access, kind: string, id: string) =>
  JSON.stringify(['agent-object', kind, a.org, a.environment, id]);

function decodePrompt(a: Access, row: any): string {
  if (row.prompt_sealed) {
    try {
      return unseal(row.prompt_sealed, sealCtx(a, 'run', row.id));
    } catch {
      return row.prompt || '';
    }
  }
  return row.prompt || '';
}

function decodeMemory(a: Access, row: any): string {
  if (row.content_sealed) {
    try {
      return unseal(row.content_sealed, sealCtx(a, 'memory', row.id));
    } catch {
      return row.content || '';
    }
  }
  return row.content || '';
}

export async function getAgentPolicy(a: Access): Promise<AgentPolicyRecord> {
  const [kind, orgRow] = await Promise.all([
    workspaceKindFor(a.org),
    dbGet('SELECT name FROM ac_organizations WHERE id=?', [a.org]).catch(() => null),
  ]);
  const pyTools = await runPythonAgent<{ tools: any[]; defaults: Record<string, AgentPermissionMode> }>({
    op: 'list_tools',
    workspace_kind: kind,
  });
  const defaultsId = defaultAgentIdentity(orgRow?.name, kind);
  const stored = (await all(a, 'agent_policy'))[0];
  if (!stored) {
    return {
      org_id: a.org,
      environment: a.environment,
      autonomy_mode: 'supervised',
      computer_use_enabled: true,
      cross_dev_bridge_enabled: kind !== 'business',
      agent_handle: defaultsId.handle,
      agent_display_name: defaultsId.displayName,
      floating_agent_roles: [...DEFAULT_FLOATING_AGENT_ROLES],
      permissions: pyTools.defaults,
      updated_by: 'system_default',
      updated_at: now(),
    };
  }
  return {
    org_id: a.org,
    environment: a.environment,
    autonomy_mode: stored.autonomy_mode || 'supervised',
    computer_use_enabled: stored.computer_use_enabled !== false,
    cross_dev_bridge_enabled: kind === 'business' ? false : stored.cross_dev_bridge_enabled !== false,
    agent_handle: normalizeAgentHandle(stored.agent_handle || defaultsId.handle, orgRow?.name || kind),
    agent_display_name: stored.agent_display_name || defaultsId.displayName,
    floating_agent_roles: Array.isArray(stored.floating_agent_roles) && stored.floating_agent_roles.length
      ? stored.floating_agent_roles
      : [...DEFAULT_FLOATING_AGENT_ROLES],
    permissions: { ...pyTools.defaults, ...(stored.permissions || {}) },
    updated_by: stored.updated_by || 'owner',
    updated_at: stored.updated_at,
  };
}

export async function updateAgentPolicy(a: Access, input: unknown): Promise<AgentPolicyRecord> {
  if (a.api || !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Workspace owner or admin is required to configure Agent permissions');
  }
  const patch = agentPermissionsUpdateInput.parse(input);
  if (patch.agent_handle !== undefined) {
    const validHandle = validateAgentHandleOrThrow(patch.agent_handle);
    const [memberRows, overrides] = await Promise.all([
      dbAll(
        'SELECT u.id, u.email, p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?',
        [a.org],
      ).catch(() => []),
      getWorkspaceMemberOverrides(a.org),
    ]);
    const avatarMap = await getUserAvatarProfiles(memberRows.map((r: any) => String(r.id)));
    const taken = resolveWorkspaceUsernames(
      memberRows.map((r: any) => ({
        id: String(r.id),
        email: String(r.email || ''),
        display_name: String(r.display_name || ''),
      })),
      overrides,
      avatarMap,
    );
    for (const username of taken.values()) {
      if (username === validHandle) {
        fail(409, `Handle "@${validHandle}" conflicts with a member username in this workspace`);
      }
    }
    patch.agent_handle = validHandle;
  }
  const kind = await workspaceKindFor(a.org);
  const current = await getAgentPolicy(a);

  // Delegate policy validation & Business sandbox lock enforcement to Python engine
  const evaluated = await runPythonAgent<any>({
    op: 'evaluate_permissions',
    workspace_kind: kind,
    current_policy: current,
    patch,
  });
  if (!evaluated.ok) {
    fail(evaluated.status || 400, evaluated.reason);
  }

  const existing = (await all(a, 'agent_policy'))[0];
  const nextData = {
    ...evaluated.policy,
    updated_by: a.actor,
  };
  if (existing) {
    await change(a, existing, nextData);
  } else {
    await create(a, 'agent_policy', nextData);
  }
  await audit(a.org, a.actor, 'agent.permissions_updated', nextData.autonomy_mode);
  return getAgentPolicy(a);
}

async function consolidateMemoryAfterTurn(
  a: Access,
  opts: {
    prompt: string;
    summary: string;
    toolId: string;
    workspaceKind: string;
    params?: Record<string, unknown>;
  },
): Promise<{ learned_count: number }> {
  try {
    const existing = await listAgentMemory(a);
    const plan = await runPythonAgent<{
      actions?: Array<{
        action: 'create' | 'update' | 'reinforce';
        id?: string;
        category?: string;
        scope?: 'workspace_memory' | 'user_profile';
        content?: string;
        topic_key?: string;
        confidence?: number;
        source?: string;
        hit_count?: number;
      }>;
      prune_ids?: string[];
      learned_count?: number;
    }>({
      op: 'consolidate_memory',
      prompt: opts.prompt,
      summary: opts.summary,
      tool_id: opts.toolId,
      workspace_kind: opts.workspaceKind,
      existing_memories: existing,
      params: opts.params || {},
    });

    const rows = await all(a, 'agent_memory');
    const rowById = new Map(rows.map((r: any) => [String(r.id), r]));

    for (const act of plan.actions || []) {
      if (act.action === 'create' && act.content) {
        const id = randomUUID();
        await create(
          a,
          'agent_memory',
          {
            workspace_kind: opts.workspaceKind,
            actor: a.actor,
            category: act.category || 'learned_fact',
            scope: act.scope || 'workspace_memory',
            topic_key: act.topic_key || '',
            source: 'auto_learned',
            confidence: act.confidence ?? 0.85,
            hit_count: 1,
            last_used_at: now(),
            content_sealed: seal(act.content, sealCtx(a, 'memory', id)),
          },
          id,
        );
      } else if (act.action === 'update' && act.id && act.content) {
        const row = rowById.get(act.id);
        if (row) {
          await change(a, row, {
            category: act.category || row.category,
            scope: act.scope || row.scope || 'workspace_memory',
            topic_key: act.topic_key || row.topic_key || '',
            source: act.source || row.source || 'auto_learned',
            confidence: act.confidence ?? row.confidence ?? 0.85,
            hit_count: Number(row.hit_count || 1) + 1,
            last_used_at: now(),
            content_sealed: seal(act.content, sealCtx(a, 'memory', act.id)),
          });
        }
      } else if (act.action === 'reinforce' && act.id) {
        const row = rowById.get(act.id);
        if (row) {
          await change(a, row, {
            hit_count: act.hit_count ?? Number(row.hit_count || 1) + 1,
            last_used_at: now(),
          });
        }
      }
    }

    for (const victimId of plan.prune_ids || []) {
      await dbRun(
        "DELETE FROM ac2_objects WHERE id=? AND org_id=? AND environment=? AND kind='agent_memory'",
        [victimId, a.org, a.environment],
      ).catch(() => {});
    }

    return { learned_count: Number(plan.learned_count || 0) };
  } catch {
    return { learned_count: 0 };
  }
}

export async function runAgent(
  a: Access,
  input: unknown,
  idempotencyKey: string,
  opts: {
    routineId?: string;
    overrideMode?: AgentPermissionMode;
    source?: 'floating' | 'studio' | 'work_discussion' | 'routine';
  } = {},
) {
  if (a.api) fail(403, 'Autonomous Agent requires a verified human session');
  const d = agentRunInput.parse(input);

  const [policy, memory, memberOverride] = await Promise.all([
    getAgentPolicy(a),
    listAgentMemory(a),
    getMemberAccessOverride(a.org, a.actor),
  ]);

  // Enforce Floating Agent permission EXCEPT inside Work Discussions (open to all members!)
  if (opts.source !== 'work_discussion' && !opts.routineId) {
    const allowedFloating = memberCanUseFloatingAgent(
      a.role,
      memberOverride,
      policy.floating_agent_roles,
    );
    if (!allowedFloating) {
      fail(
        403,
        `Floating Agent access is limited to workspace admins and approved members. You can still mention @${policy.agent_handle} inside Work Discussions, or ask an administrator to grant Floating Agent access in Team settings.`,
      );
    }
  }

  // Privacy & prompt-injection guardrail check before any tool planning
  const guard = await runPythonAgent<{ safe: boolean; reason?: string }>({
    op: 'check_guardrails',
    text: d.prompt,
  });
  if (guard && guard.safe === false) {
    await audit(a.org, a.actor, 'agent.guardrail_blocked', 'prompt_injection');
    fail(400, guard.reason || 'Blocked by AfriCore Privacy Guardrail');
  }

  const fingerprint = hash(
    canonical({
      ...d,
      attachments: (d.attachments || []).map((att) => ({
        filename: att.filename,
        mime_type: att.mime_type,
        hash: hash(att.data_url),
      })),
      routineId: opts.routineId || null,
    }),
  );

  const existingRuns = await all(a, 'agent_run');
  const existing = existingRuns.find(
    (r) => r.actor === a.actor && r.idempotency_key === idempotencyKey,
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      fail(409, 'Idempotency key conflicts with a previous agent instruction');
    }
    return formatRun(a, existing);
  }

  const boundaryInput = await buildBoundaryInput(a, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });

  // Check if this actor has a recent unresolved `needs_input` slot-filling prompt (<30 min old)
  const sortedActorRuns = existingRuns
    .filter((r) => r.actor === a.actor)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  const latestActorRun = sortedActorRuns[0];
  let activePendingIntent: any = null;
  if (
    !opts.routineId &&
    latestActorRun &&
    latestActorRun.status === 'needs_input' &&
    latestActorRun.result?.pending_intent &&
    Date.now() - Date.parse(String(latestActorRun.created_at || '')) < 30 * 60_000
  ) {
    activePendingIntent = latestActorRun.result.pending_intent;
  }

  // Delegate planning, intent extraction, slot-filling, isolation check, permissions & credit estimation to Python!
  const plan = await runPythonAgent<any>({
    op: 'plan_run',
    boundary_input: boundaryInput,
    prompt: d.prompt,
    currency: d.currency,
    tool_hint: d.tool_hint || null,
    target_workspace_id: d.target_workspace_id || null,
    params: d.params || {},
    policy,
    memory,
    pending_intent: activePendingIntent,
    computer_use: d.computer_use,
    stage_in_sandbox: d.stage_in_sandbox,
    routine_id: opts.routineId || null,
    override_mode: opts.overrideMode || null,
  });

  if (!plan.ok) {
    if (plan.audit_violation) {
      await audit(
        a.org,
        a.actor,
        'agent.boundary_violation_blocked',
        plan.violation_target || d.target_workspace_id || a.org,
      );
    }
    fail(plan.status || 403, plan.reason);
  }

  // Re-verify live DB workspace membership & isolation before any data access or write
  const target = await assertAgentTargetAllowed(a, plan.target_workspace_id, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });

  const runId = randomUUID();
  const promptSealed = seal(d.prompt, sealCtx(a, 'run', runId));

  // Mark prior `needs_input` run as resolved once the user replies!
  if (activePendingIntent && latestActorRun) {
    await change(a, latestActorRun, { status: 'answered' }).catch(() => {});
  }

  if (plan.execution_mode === 'needs_input') {
    const clarification = plan.clarification || {};
    const savedClarification = await create(
      a,
      'agent_run',
      {
        engine: plan.engine || 'python_autonomous_agent_v2',
        workspace_kind: plan.boundary.source_kind,
        actor: a.actor,
        idempotency_key: idempotencyKey,
        fingerprint,
        prompt_sealed: promptSealed,
        status: 'needs_input',
        isolation_boundary: plan.boundary,
        target_workspace_id: target.access.org,
        tool_name: plan.tool.id,
        summary: String(
          clarification.question ||
            'Could you share a title or short description so I can stage this cleanly?',
        ),
        steps: [],
        result: {
          clarification_needed: true,
          missing_fields: clarification.missing_fields || [],
          suggestions: clarification.suggestions || [],
          pending_intent: clarification.pending_intent || null,
          data: {
            recommended_actions: (clarification.suggestions || []).map((s: string) => ({
              title: s,
              action_prompt: s,
            })),
          },
        },
        credits_used: 0,
        estimated_minor: 0,
        currency: 'KES',
        routine_id: null,
      },
      runId,
    );
    return formatRun(a, savedClarification);
  }

  if (plan.execution_mode === 'approval_required') {
    const billing = await consumeAgentCredits(a, {
      credits: 1,
      runId,
      entryType: 'analysis_read',
      reason: `Python planner staged in sandbox: ${plan.tool.name}`,
    });
    const approvalId = randomUUID();
    const cloneContext = plan.sandbox_clone?.clone_kind
      ? await fetchSandboxCloneContext(target.access, String(plan.sandbox_clone.clone_kind))
      : {};
    const enrichedClone = plan.sandbox_clone
      ? { ...plan.sandbox_clone, live_context: cloneContext }
      : null;

    const summary = `Staged "${plan.action_summary}" inside the isolated ${plan.sandbox_clone?.page_title || plan.tool.target_tab} sandbox clone. Review the preview and click Approve to commit it to your live workspace.`;

    const savedRun = await create(
      a,
      'agent_run',
      {
        engine: plan.engine || 'python_autonomous_agent_v2',
        workspace_kind: plan.boundary.source_kind,
        actor: a.actor,
        idempotency_key: idempotencyKey,
        fingerprint,
        prompt_sealed: promptSealed,
        status: 'awaiting_approval',
        isolation_boundary: plan.boundary,
        target_workspace_id: target.access.org,
        tool_name: plan.tool.id,
        summary,
        steps: plan.preview_steps || [],
        result: {
          approval_id: approvalId,
          planned_params: plan.params,
          chained_actions: plan.chained_actions || [],
          sandbox_clone: enrichedClone,
          matched_skill: plan.matched_skill || null,
          memory_applied: plan.memory_applied || [],
          destination: {
            tab: plan.tool.target_tab === 'Calendar' && target.targetKind === 'business' ? 'Apps' : plan.tool.target_tab,
            app: plan.tool.target_app,
            section: plan.tool.target_app === 'calendar' ? 'calendar' : undefined,
            workspace_id: target.access.org,
            workspace_kind: target.targetKind,
          },
          remaining_credits: billing.remaining_after,
        },
        credits_used: billing.credits_used,
        estimated_minor: billing.estimated_minor,
        currency: 'KES',
        routine_id: opts.routineId || null,
      },
      runId,
    );

    await create(
      a,
      'agent_approval',
      {
        run_id: runId,
        actor: a.actor,
        tool_name: plan.tool.id,
        target_workspace_id: target.access.org,
        action_summary: plan.action_summary,
        payload: {
          params: plan.params,
          chained_actions: plan.chained_actions || [],
          sandbox_clone: enrichedClone,
          currency: d.currency,
          computer_use: plan.computer_use,
          consent_to_provider: d.consent_to_provider,
        },
        status: 'pending',
        decision_note: null,
        decided_by: null,
        decided_at: null,
      },
      approvalId,
    );

    await audit(a.org, a.actor, 'agent.run_awaiting_approval', runId);
    return formatRun(a, savedRun);
  }

  // Execute tool (+ any chained compound steps) against canonical AfriCore services
  const toolDef = toolById(plan.tool.id);
  if (!toolDef) return fail(400, 'Tool unavailable: ' + plan.tool.id);

  const execution = await executeAgentTool(
    target.access,
    target.targetKind,
    toolDef,
    { ...plan.params, prompt: d.prompt },
    d.currency,
    runId,
  );
  const chainedOutputs: string[] = [];
  for (let i = 0; i < (plan.chained_actions || []).length; i++) {
    const ch = plan.chained_actions[i];
    const chDef = toolById(ch.tool?.id || ch.tool_id);
    if (!chDef) continue;
    const chOut = await executeAgentTool(
      target.access,
      target.targetKind,
      chDef,
      ch.params || {},
      d.currency,
      `${runId}-chain-${i}`,
    );
    chainedOutputs.push(chOut.summary);
  }
  // Process validated image attachments locally & encrypt metadata at rest
  let attachmentAnalysis: any = null;
  let attachmentsSealed: string | null = null;
  if (d.attachments && d.attachments.length > 0) {
    attachmentAnalysis = await runPythonAgent<any>({
      op: 'analyze_attachments',
      attachments: d.attachments,
      prompt: d.prompt,
      workspace_kind: plan.boundary.source_kind,
      currency: d.currency,
    });
    attachmentsSealed = seal(
      JSON.stringify(
        d.attachments.map((att) => ({
          filename: att.filename,
          mime_type: att.mime_type,
          size_bytes: att.data_url.length,
        })),
      ),
      sealCtx(a, 'attachments', runId),
    );
  }

  const combinedSummaryBase = chainedOutputs.length
    ? [execution.summary, ...chainedOutputs.map((s) => `• Chained: ${s}`)].join('\n')
    : execution.summary;
  const combinedSummary = attachmentAnalysis?.summary
    ? `${attachmentAnalysis.summary}\n\n${combinedSummaryBase}`
    : combinedSummaryBase;

  const trace = await runPythonAgent<{ steps: ComputerUseStep[]; llm_narrative: string | null }>({
    op: 'synthesize_trace',
    tool_id: toolDef.id,
    target_tab: execution.destination.tab,
    target_app: execution.destination.app || null,
    isolation_label: plan.boundary.isolation_label,
    preview_fields: plan.params,
    verify_detail: execution.summary.split('\n')[0] || 'Verified canonical record.',
    prompt: d.prompt,
    summary: combinedSummary,
    evidence: execution.data,
    consent_to_provider: d.consent_to_provider,
  });

  const billing = await consumeAgentCredits(a, {
    credits: plan.credits_cost,
    runId,
    entryType: plan.credit_category as AgentCreditCategory,
    reason: `Python Agent executed ${plan.tool.name}${plan.computer_use ? ' (Computer Use)' : ''}`,
  });

  const learning = await consolidateMemoryAfterTurn(a, {
    prompt: d.prompt,
    summary: trace.llm_narrative || combinedSummary,
    toolId: plan.tool.id,
    workspaceKind: plan.boundary.source_kind,
    params: plan.params,
  });

  const savedRun = await create(
    a,
    'agent_run',
    {
      engine: plan.engine || 'python_autonomous_agent_v2',
      workspace_kind: plan.boundary.source_kind,
      actor: a.actor,
      idempotency_key: idempotencyKey,
      fingerprint,
      prompt_sealed: promptSealed,
      attachments_sealed: attachmentsSealed,
      input_modality: d.input_modality,
      status: 'completed',
      isolation_boundary: plan.boundary,
      target_workspace_id: target.access.org,
      tool_name: plan.tool.id,
      summary: trace.llm_narrative || combinedSummary,
      steps: trace.steps?.length ? trace.steps : execution.steps,
      result: {
        record_id: execution.record_id || null,
        destination: execution.destination,
        data: execution.data,
        attachment_analysis: attachmentAnalysis,
        memory_learned_count: learning.learned_count,
        privacy_shield: { active: true, raw_pii_egress: false },
        sandbox_clone: plan.sandbox_clone || null,
        matched_skill: plan.matched_skill || null,
        computer_use: plan.computer_use,
        remaining_credits: billing.remaining_after,
      },
      credits_used: billing.credits_used,
      estimated_minor: billing.estimated_minor,
      currency: 'KES',
      routine_id: opts.routineId || null,
    },
    runId,
  );

  await audit(a.org, a.actor, 'agent.run_completed', runId);
  return formatRun(a, savedRun);
}

export async function decideAgentApproval(a: Access, approvalId: string, input: unknown) {
  if (a.api) fail(403, 'Human session required to decide agent approvals');
  const d = agentApprovalDecisionInput.parse(input);
  const approval = await get(a, approvalId, 'agent_approval');
  if (approval.status !== 'pending') fail(409, 'Agent approval is already decided');
  if (a.actor !== approval.actor && !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Requester or workspace owner/admin required to decide this approval');
  }

  const runRow = await get(a, approval.run_id, 'agent_run');
  const at = now();

  if (d.decision === 'reject') {
    await change(a, approval, {
      status: 'rejected',
      decision_note: d.note || 'Rejected by user',
      decided_by: a.actor,
      decided_at: at,
    });
    const updatedRun = await change(a, runRow, {
      status: 'rejected',
      summary: `Action rejected before execution: ${approval.action_summary}${d.note ? ` (${d.note})` : ''}.`,
    });
    await audit(a.org, a.actor, 'agent.approval_rejected', approvalId);
    return { approval_id: approvalId, status: 'rejected', run: formatRun(a, updatedRun) };
  }

  // Re-verify boundary in Python + DB at execution time
  const policy = await getAgentPolicy(a);
  const target = await assertAgentTargetAllowed(a, approval.target_workspace_id, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });
  const tool = toolById(approval.tool_name);
  if (!tool) return fail(400, 'Tool no longer available');

  const payload = approval.payload || {};
  const mergedParams = {
    ...(payload.params || {}),
    ...(d.edited_params || {}),
  };
  const execution = await executeAgentTool(
    target.access,
    target.targetKind,
    tool,
    mergedParams,
    payload.currency || 'KES',
    approval.run_id,
  );

  const chainedOutputs: string[] = [];
  for (let i = 0; i < (payload.chained_actions || []).length; i++) {
    const ch = payload.chained_actions[i];
    const chDef = toolById(ch.tool?.id || ch.tool_id);
    if (!chDef) continue;
    const chOut = await executeAgentTool(
      target.access,
      target.targetKind,
      chDef,
      ch.params || {},
      payload.currency || 'KES',
      `${approval.run_id}-approved-chain-${i}`,
    );
    chainedOutputs.push(chOut.summary);
  }
  const combinedSummary = chainedOutputs.length
    ? [execution.summary, ...chainedOutputs.map((s) => `• Chained: ${s}`)].join('\n')
    : execution.summary;

  const trace = await runPythonAgent<{ steps: ComputerUseStep[]; llm_narrative: string | null }>({
    op: 'synthesize_trace',
    tool_id: tool.id,
    target_tab: execution.destination.tab,
    target_app: execution.destination.app || null,
    isolation_label: target.boundary.isolation_label,
    preview_fields: mergedParams,
    verify_detail: execution.summary.split('\n')[0] || 'Approved execution verified.',
    prompt: decodePrompt(a, runRow),
    summary: combinedSummary,
    evidence: execution.data,
    consent_to_provider: !!payload.consent_to_provider,
  });

  const creditCategory: AgentCreditCategory = payload.computer_use
    ? 'computer_use_session'
    : tool.credit_category;
  const creditsCost = creditCategory === 'computer_use_session' ? 5 : 3;
  const billing = await consumeAgentCredits(a, {
    credits: creditsCost,
    runId: approval.run_id,
    entryType: creditCategory,
    reason: `Approved Python Agent execution: ${tool.name}`,
  });

  await change(a, approval, {
    status: 'approved',
    decision_note: d.note || 'Approved by user',
    decided_by: a.actor,
    decided_at: at,
  });

  const updatedRun = await change(a, runRow, {
    status: 'completed',
    summary: trace.llm_narrative || combinedSummary,
    steps: trace.steps?.length ? trace.steps : execution.steps,
    result: {
      approval_id: approvalId,
      record_id: execution.record_id || null,
      destination: execution.destination,
      data: execution.data,
      sandbox_clone: payload.sandbox_clone || null,
      computer_use: !!payload.computer_use,
      remaining_credits: billing.remaining_after,
    },
    credits_used: Number(runRow.credits_used || 0) + billing.credits_used,
    estimated_minor: Number(runRow.estimated_minor || 0) + billing.estimated_minor,
  });

  await audit(a.org, a.actor, 'agent.approval_approved_and_executed', approvalId);
  await consolidateMemoryAfterTurn(a, {
    prompt: decodePrompt(a, runRow),
    summary: trace.llm_narrative || combinedSummary,
    toolId: tool.id,
    workspaceKind: target.targetKind,
    params: mergedParams,
  });
  return { approval_id: approvalId, status: 'approved', run: formatRun(a, updatedRun) };
}

export async function listAgentRuns(a: Access, limit = 30) {
  const rows = await all(a, 'agent_run');
  return rows
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
    .slice(0, Math.min(100, Math.max(1, limit)))
    .map((r) => formatRun(a, r));
}

export async function listAgentApprovals(a: Access) {
  const rows = await all(a, 'agent_approval');
  return rows
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
    .slice(0, 50);
}

export async function listAgentRoutines(a: Access) {
  const rows = await all(a, 'agent_routine');
  return rows
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
    .slice(0, 50)
    .map((r) => ({ ...r, enabled: !!r.enabled }));
}

export async function createAgentRoutine(a: Access, input: unknown) {
  if (a.api || !['owner', 'admin', 'finance', 'operations'].includes(a.role)) {
    fail(403, 'Workspace member write permission required to create routines');
  }
  const d = agentRoutineCreateInput.parse(input);
  const kind = await workspaceKindFor(a.org);
  const pyTools = await runPythonAgent<{ tools: any[] }>({
    op: 'list_tools',
    workspace_kind: kind,
  });
  if (!pyTools.tools.some((t) => t.id === d.tool_name)) {
    fail(400, `Tool '${d.tool_name}' is not available in ${kind} workspaces`);
  }
  const row = await create(a, 'agent_routine', {
    workspace_kind: kind,
    name: d.name,
    description: d.description,
    trigger_type: d.trigger_type,
    schedule_label: d.schedule_label,
    prompt: d.prompt,
    tool_name: d.tool_name,
    execution_mode: d.execution_mode,
    enabled: d.enabled,
    last_run_id: null,
    last_run_at: null,
    last_status: null,
    created_by: a.actor,
  });
  await audit(a.org, a.actor, 'agent.routine_created', row.id);
  return { ...row, enabled: !!row.enabled };
}

export async function updateAgentRoutine(a: Access, routineId: string, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = agentRoutinePatchInput.parse(input);
  const row = await get(a, routineId, 'agent_routine');
  const updated = await change(a, row, {
    enabled: d.enabled === undefined ? !!row.enabled : d.enabled,
    execution_mode: d.execution_mode || row.execution_mode,
    schedule_label: d.schedule_label || row.schedule_label,
    prompt: d.prompt || row.prompt,
  });
  return { ...updated, enabled: !!updated.enabled };
}

export async function deleteAgentRoutine(a: Access, routineId: string) {
  if (a.api) fail(403, 'Human session required');
  await get(a, routineId, 'agent_routine');
  await dbRun(
    "DELETE FROM ac2_objects WHERE id=? AND org_id=? AND environment=? AND kind='agent_routine'",
    [routineId, a.org, a.environment],
  );
  await audit(a.org, a.actor, 'agent.routine_deleted', routineId);
  return { deleted: true, id: routineId };
}

export async function triggerAgentRoutineNow(a: Access, routineId: string, idempotencyKey: string) {
  const row = await get(a, routineId, 'agent_routine');
  const run = await runAgent(
    a,
    {
      prompt: row.prompt,
      tool_hint: row.tool_name,
      currency: 'KES',
      computer_use: true,
    },
    idempotencyKey,
    {
      routineId: row.id,
      overrideMode: row.execution_mode === 'autonomous' ? 'autonomous' : 'approval_required',
    },
  );
  await change(a, row, {
    last_run_id: run.id,
    last_run_at: now(),
    last_status: run.status,
  });
  return { routine_id: routineId, run };
}

export async function listAgentMemory(a: Access) {
  const rows = await all(a, 'agent_memory');
  return rows
    .sort((x, y) => String(y.updated_at || y.created_at).localeCompare(String(x.updated_at || x.created_at)))
    .slice(0, 60)
    .map((r) => ({
      id: r.id,
      category: r.category,
      scope: r.scope || (r.category === 'tone' || r.category === 'user_profile' ? 'user_profile' : 'workspace_memory'),
      source: r.source || 'manual',
      topic_key: r.topic_key || '',
      confidence: Number(r.confidence ?? 1),
      hit_count: Number(r.hit_count ?? 1),
      last_used_at: r.last_used_at || r.updated_at || r.created_at,
      content: decodeMemory(a, r),
      actor: r.actor,
      created_at: r.created_at,
    }));
}

export async function addAgentMemory(a: Access, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = agentMemoryInput.parse(input);
  const kind = await workspaceKindFor(a.org);
  const id = randomUUID();
  const scope = d.scope || (d.category === 'tone' || d.category === 'user_profile' ? 'user_profile' : 'workspace_memory');
  const row = await create(
    a,
    'agent_memory',
    {
      workspace_kind: kind,
      actor: a.actor,
      category: d.category,
      scope,
      source: 'manual',
      confidence: 1,
      hit_count: 1,
      last_used_at: now(),
      content_sealed: seal(d.content, sealCtx(a, 'memory', id)),
    },
    id,
  );
  return {
    id: row.id,
    category: d.category,
    scope,
    source: 'manual',
    confidence: 1,
    hit_count: 1,
    content: d.content,
    actor: a.actor,
    created_at: row.created_at,
  };
}

export async function updateAgentMemory(a: Access, memoryId: string, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = agentMemoryPatchInput.parse(input);
  const row = await get(a, memoryId, 'agent_memory');
  const nextScope = d.scope || row.scope || 'workspace_memory';
  const nextCategory = d.category || row.category || 'preference';
  const updated = await change(a, row, {
    category: nextCategory,
    scope: nextScope,
    source: 'manual',
    confidence: 1,
    last_used_at: now(),
    content_sealed: seal(d.content, sealCtx(a, 'memory', memoryId)),
  });
  return {
    id: updated.id,
    category: nextCategory,
    scope: nextScope,
    source: 'manual',
    content: d.content,
    actor: updated.actor,
    created_at: updated.created_at,
  };
}

export async function searchAgentSessions(a: Access, query: string) {
  if (a.api) fail(403, 'Human session required');
  const runs = await listAgentRuns(a, 50);
  return runPythonAgent<{ hits: any[] }>({
    op: 'search_sessions',
    query,
    past_runs: runs,
    limit: 6,
  });
}

export async function deleteAgentMemory(a: Access, memoryId: string) {
  if (a.api) fail(403, 'Human session required');
  await get(a, memoryId, 'agent_memory');
  await dbRun(
    "DELETE FROM ac2_objects WHERE id=? AND org_id=? AND environment=? AND kind='agent_memory'",
    [memoryId, a.org, a.environment],
  );
  return { deleted: true, id: memoryId };
}

export async function getAgentOverview(a: Access) {
  const [policy, billing, runs, approvals, routines, memory, memberOverride] = await Promise.all([
    getAgentPolicy(a),
    getAgentBillingSummary(a),
    listAgentRuns(a, 20),
    listAgentApprovals(a),
    listAgentRoutines(a),
    listAgentMemory(a),
    getMemberAccessOverride(a.org, a.actor),
  ]);
  const boundary = await resolveAgentBoundary(a, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });
  const [pyTools, memoryBlocks] = await Promise.all([
    runPythonAgent<{ tools: any[] }>({
      op: 'list_tools',
      workspace_kind: boundary.source_kind,
    }),
    runPythonAgent<any>({
      op: 'summarize_memory',
      memories: memory,
    }),
  ]);
  const tools = pyTools.tools.map((t) => ({
    ...t,
    permission: policy.permissions[t.id] || t.default_permission,
  }));
  const canUseFloating = memberCanUseFloatingAgent(
    a.role,
    memberOverride,
    policy.floating_agent_roles,
  );

  return {
    agent_name: 'AfriCore Python Autonomous Agent',
    runtime: 'python3',
    workspace_kind: boundary.source_kind,
    environment: a.environment,
    role: a.role,
    can_manage_policy: !a.api && ['owner', 'admin'].includes(a.role),
    can_use_floating_agent: canUseFloating,
    work_discussions_agent_open: true,
    privacy_shield_active: true,
    local_whisper_ready: Boolean(
      (process.env.AFRICORE_WHISPER_URL || '').trim() ||
        (process.env.AFRICORE_WHISPER_BIN || '').trim(),
    ),
    boundary,
    policy,
    billing,
    tools,
    runs,
    approvals,
    pending_approvals_count: approvals.filter((item: any) => item.status === 'pending').length,
    routines,
    memory,
    memory_blocks: memoryBlocks,
  };
}

function formatRun(a: Access, row: any) {
  return {
    id: row.id,
    org_id: row.org_id,
    environment: row.environment,
    engine: row.engine || 'python_autonomous_agent_v1',
    workspace_kind: row.workspace_kind,
    actor: row.actor,
    prompt: decodePrompt(a, row),
    status: row.status,
    isolation_boundary: row.isolation_boundary || {},
    target_workspace_id: row.target_workspace_id,
    tool_name: row.tool_name,
    summary: row.summary,
    steps: (row.steps || []) as ComputerUseStep[],
    result: row.result || {},
    credits_used: Number(row.credits_used || 0),
    estimated_minor: Number(row.estimated_minor || 0),
    currency: row.currency || 'KES',
    routine_id: row.routine_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
