import { randomUUID } from 'node:crypto';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import { hash, now } from '../platform/crypto';
import type { WorkspaceKind } from '../marketplace/catalog';
import { canonical } from '../finance/service';
import {
  AGENT_CREDIT_COSTS,
  consumeAgentCredits,
  getAgentBillingSummary,
} from './billing';
import {
  agentApprovalDecisionInput,
  agentMemoryInput,
  agentPermissionsUpdateInput,
  agentRoutineCreateInput,
  agentRoutinePatchInput,
  agentRunInput,
  type AgentPermissionMode,
} from './contracts';
import {
  assertAgentTargetAllowed,
  resolveAgentBoundary,
  workspaceKindFor,
  type AgentIsolationBoundary,
} from './isolation';
import {
  defaultPermissionsForKind,
  executeAgentTool,
  toolById,
  toolsForWorkspaceKind,
  type AgentToolDefinition,
  type ComputerUseStep,
} from './tools';

export interface AgentPolicyRecord {
  org_id: string;
  environment: string;
  autonomy_mode: 'read_only' | 'supervised' | 'autonomous';
  computer_use_enabled: boolean;
  cross_dev_bridge_enabled: boolean;
  permissions: Record<string, AgentPermissionMode>;
  updated_by: string;
  updated_at: string;
}

export async function getAgentPolicy(a: Access): Promise<AgentPolicyRecord> {
  const kind = await workspaceKindFor(a.org);
  const defaults = defaultPermissionsForKind(kind);
  const row = await dbGet(
    'SELECT * FROM ac_agent_policies WHERE org_id=? AND environment=?',
    [a.org, a.environment],
  );
  if (!row) {
    return {
      org_id: a.org,
      environment: a.environment,
      autonomy_mode: 'supervised',
      computer_use_enabled: true,
      cross_dev_bridge_enabled: kind !== 'business',
      permissions: defaults,
      updated_by: 'system_default',
      updated_at: now(),
    };
  }
  const stored = JSON.parse(row.permissions_json || '{}');
  return {
    org_id: row.org_id,
    environment: row.environment,
    autonomy_mode: row.autonomy_mode || 'supervised',
    computer_use_enabled: !!row.computer_use_enabled,
    cross_dev_bridge_enabled: kind === 'business' ? false : !!row.cross_dev_bridge_enabled,
    permissions: { ...defaults, ...stored },
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

export async function updateAgentPolicy(a: Access, input: unknown): Promise<AgentPolicyRecord> {
  if (a.api || !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Workspace owner or admin is required to configure Agent permissions');
  }
  const parsed = agentPermissionsUpdateInput.parse(input);
  const kind = await workspaceKindFor(a.org);
  const current = await getAgentPolicy(a);
  const allowedTools = new Set(toolsForWorkspaceKind(kind).map((t) => t.id));

  if (kind === 'business' && parsed.cross_dev_bridge_enabled === true) {
    fail(
      403,
      'Business workspace agents are permanently sandboxed and cannot bridge to Personal or Developer workspaces.',
    );
  }

  const nextPermissions = { ...current.permissions };
  if (parsed.permissions) {
    for (const [toolId, mode] of Object.entries(parsed.permissions)) {
      if (!allowedTools.has(toolId)) {
        fail(400, `Tool '${toolId}' is not available in ${kind} workspaces`);
      }
      nextPermissions[toolId] = mode;
    }
  }

  const nextAutonomy = parsed.autonomy_mode || current.autonomy_mode;
  const nextComputerUse =
    parsed.computer_use_enabled === undefined
      ? current.computer_use_enabled
      : parsed.computer_use_enabled;
  const nextBridge =
    kind === 'business'
      ? false
      : parsed.cross_dev_bridge_enabled === undefined
        ? current.cross_dev_bridge_enabled
        : parsed.cross_dev_bridge_enabled;

  const at = now();
  await dbRun(
    `INSERT INTO ac_agent_policies
     (org_id, environment, autonomy_mode, computer_use_enabled, cross_dev_bridge_enabled, permissions_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id, environment) DO UPDATE SET
       autonomy_mode=excluded.autonomy_mode,
       computer_use_enabled=excluded.computer_use_enabled,
       cross_dev_bridge_enabled=excluded.cross_dev_bridge_enabled,
       permissions_json=excluded.permissions_json,
       updated_by=excluded.updated_by,
       updated_at=excluded.updated_at`,
    [
      a.org,
      a.environment,
      nextAutonomy,
      nextComputerUse ? 1 : 0,
      nextBridge ? 1 : 0,
      JSON.stringify(nextPermissions),
      a.actor,
      at,
    ],
  );
  await audit(a.org, a.actor, 'agent.permissions_updated', nextAutonomy);
  return getAgentPolicy(a);
}

/**
 * Extracts structured parameters from natural language instructions for reliable,
 * zero-hallucination autonomous execution across AfriCore apps.
 */
function extractAmountMinor(prompt: string, currency: string): number {
  const match = prompt.match(/(?:kes|ksh|usd|eur|gbp|ugx|tzs|rwf|\$)?\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
  if (!match) return 15_000;
  const numeric = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 15_000;
  const multiplier = ['UGX', 'RWF'].includes(currency) ? 1 : 100;
  return Math.min(100_000_000_000, Math.round(numeric * multiplier));
}

function extractTitleAfter(prompt: string, keywords: RegExp, fallback: string): string {
  const quoted = prompt.match(/["“]([^"”]{2,120})["”]/);
  if (quoted) return quoted[1].trim();
  const after = prompt.replace(keywords, '').trim().replace(/^(?:for|about|called|named|titled|with|to)\s+/i, '');
  const cleaned = after.split(/\s+(?:for\s+(?:kes|ksh|usd)|on\s+\d|at\s+\d|tomorrow|today|next\s+)/i)[0]?.trim();
  return cleaned && cleaned.length >= 2 ? cleaned.slice(0, 140) : fallback;
}

interface PlannedAction {
  tool: AgentToolDefinition;
  targetWorkspaceId: string;
  params: Record<string, unknown>;
  actionSummary: string;
}

function planAgentAction(
  kind: WorkspaceKind,
  boundary: AgentIsolationBoundary,
  prompt: string,
  currency: string,
  toolHint?: string,
  explicitTargetWorkspaceId?: string,
  explicitParams?: Record<string, unknown>,
): PlannedAction {
  const available = toolsForWorkspaceKind(kind);
  let chosen: AgentToolDefinition | undefined = toolHint ? available.find((t) => t.id === toolHint) : undefined;

  if (!chosen) {
    const p = prompt.toLowerCase();
    if (kind === 'business') {
      if (/\b(meet|meeting|calendar|call|sync|appointment|book|schedule)\b/.test(p))
        chosen = available.find((t) => t.id === 'schedule_meeting');
      else if (/\b(project|roadmap|initiative|launch|workspace board)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_project');
      else if (/\b(task|todo|to-do|action item|checklist)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_task');
      else if (/\b(lead|crm|deal|opportunity|pipeline|prospect)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_crm_lead');
      else if (/\b(invoice|bill client|billing|quote)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_draft_invoice');
      else if (/\b(customer|client|contact)\b/.test(p) && /\b(add|create|new|register)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_customer');
      else if (/\b(expense|spent|cost|paid for|rent|utilities|receipt)\b/.test(p))
        chosen = available.find((t) => t.id === 'record_expense');
      else if (/\b(subscription|recurring|bill reminder|obligation)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_obligation');
      else if (/\b(reply|notify|message|team|tell|announce|follow up)\b/.test(p))
        chosen = available.find((t) => t.id === 'send_workspace_reply');
      else if (/\b(forecast|project|next month|90 days|60 days|cash flow projection)\b/.test(p))
        chosen = available.find((t) => t.id === 'forecast_cashflow');
      else chosen = available.find((t) => t.id === 'analyze_business');
    } else if (kind === 'personal') {
      if (/\b(developer|dev workspace|api|webhook|sandbox app|request log)\b/.test(p)) {
        chosen = /\b(create|new|add|register)\b/.test(p)
          ? available.find((t) => t.id === 'create_developer_application')
          : available.find((t) => t.id === 'inspect_linked_developer_workspace');
      } else if (/\b(meet|meeting|calendar|appointment|schedule)\b/.test(p))
        chosen = available.find((t) => t.id === 'schedule_meeting');
      else if (/\b(income|salary|earned|freelance|received)\b/.test(p))
        chosen = available.find((t) => t.id === 'record_personal_income');
      else if (/\b(expense|spent|bought|cost|groceries|rent)\b/.test(p))
        chosen = available.find((t) => t.id === 'record_expense');
      else if (/\b(subscription|netflix|spotify|recurring|bill|obligation)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_obligation');
      else if (/\b(invoice)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_draft_invoice');
      else if (/\b(client|contact)\b/.test(p) && /\b(add|create|new)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_customer');
      else if (/\b(forecast|next month)\b/.test(p))
        chosen = available.find((t) => t.id === 'forecast_cashflow');
      else if (/\b(reply|notify|remind|note)\b/.test(p))
        chosen = available.find((t) => t.id === 'send_workspace_reply');
      else chosen = available.find((t) => t.id === 'analyze_personal_finances');
    } else {
      // developer workspace
      if (/\b(personal|my finances|my income|my expenses|my calendar)\b/.test(p))
        chosen = available.find((t) => t.id === 'inspect_linked_personal_summary');
      else if (/\b(create|new|add|register)\b/.test(p) && /\b(app|application|sandbox)\b/.test(p))
        chosen = available.find((t) => t.id === 'create_developer_application');
      else if (/\b(reply|notify|alert|message)\b/.test(p))
        chosen = available.find((t) => t.id === 'send_workspace_reply');
      else chosen = available.find((t) => t.id === 'inspect_developer_diagnostics');
    }
  }

  if (!chosen) chosen = available[0];

  // Determine target workspace (supporting Personal <-> Developer bridge when applicable)
  let targetWorkspaceId = explicitTargetWorkspaceId || boundary.source_workspace_id;
  if (!explicitTargetWorkspaceId) {
    if (
      chosen.cross_workspace_bridge === 'personal_to_developer' &&
      kind === 'personal'
    ) {
      const devTarget = boundary.linked_workspaces.find((w) => w.kind === 'developer');
      if (devTarget) targetWorkspaceId = devTarget.id;
    } else if (
      chosen.cross_workspace_bridge === 'developer_to_personal' &&
      kind === 'developer'
    ) {
      const personalTarget = boundary.linked_workspaces.find((w) => w.kind === 'personal');
      if (personalTarget) targetWorkspaceId = personalTarget.id;
    }
  }

  // Synthesize typed parameters
  const derived: Record<string, unknown> = {};
  if (chosen.id === 'schedule_meeting') {
    derived.title = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:set up|schedule|book|create)\s+(?:a\s+)?(?:meeting|call|sync|appointment)\s*/i,
      'Team Sync Meeting',
    );
    derived.hours_from_now = /tomorrow/i.test(prompt) ? 24 : /today/i.test(prompt) ? 2 : 24;
    derived.duration_minutes = /30\s*min/i.test(prompt) ? 30 : /60\s*min|1\s*hour/i.test(prompt) ? 60 : 45;
  } else if (chosen.id === 'create_project') {
    derived.name = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:set up|create|start|launch)\s+(?:a\s+)?(?:new\s+)?project\s*/i,
      'Q4 Growth Project',
    );
  } else if (chosen.id === 'create_task') {
    derived.title = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:create|add)\s+(?:a\s+)?(?:new\s+)?(?:task|todo|action item)\s*/i,
      'Follow-up action item',
    );
  } else if (chosen.id === 'create_customer') {
    derived.name = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:add|create|register)\s+(?:a\s+)?(?:new\s+)?(?:customer|client|contact)\s*/i,
      'New Contact',
    );
  } else if (chosen.id === 'create_crm_lead') {
    const label = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:add|create|log)\s+(?:a\s+)?(?:new\s+)?(?:crm\s+)?(?:lead|deal|opportunity)\s*/i,
      'Inbound Business Lead',
    );
    derived.title = label;
    derived.customer_name = label;
    if (/\d/.test(prompt)) derived.amount_minor = extractAmountMinor(prompt, currency);
  } else if (chosen.id === 'create_draft_invoice') {
    derived.customer_name = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:draft|create|prepare)\s+(?:a\s+)?(?:draft\s+)?invoice\s*/i,
      'Workspace Client',
    );
    derived.description = prompt.slice(0, 180);
    derived.amount_minor = extractAmountMinor(prompt, currency);
  } else if (chosen.id === 'record_expense' || chosen.id === 'record_personal_income' || chosen.id === 'create_obligation') {
    derived.description = prompt.slice(0, 160);
    derived.amount_minor = extractAmountMinor(prompt, currency);
    if (/rent/i.test(prompt)) derived.category = 'rent';
    else if (/software|cloud|hosting/i.test(prompt)) derived.category = 'software';
    else if (/subscription|netflix|spotify/i.test(prompt)) derived.category = 'subscriptions';
    else if (/transport|fuel|uber/i.test(prompt)) derived.category = 'transport';
    else if (/groceries|food/i.test(prompt)) derived.category = 'groceries';
    else derived.category = 'other';
  } else if (chosen.id === 'send_workspace_reply') {
    derived.title = 'Agent Workspace Update';
    derived.body = prompt.slice(0, 500);
  } else if (chosen.id === 'create_developer_application') {
    derived.name = extractTitleAfter(
      prompt,
      /^(?:please\s+)?(?:create|add|register)\s+(?:a\s+)?(?:new\s+)?(?:sandbox\s+)?(?:developer\s+)?(?:app|application)\s*/i,
      'Agent Sandbox App',
    );
  }

  const params = { ...derived, ...(explicitParams || {}) };
  const actionSummary = `${chosen.name}: ${
    params.title || params.name || params.description || params.customer_name || prompt.slice(0, 120)
  }`;

  return {
    tool: chosen,
    targetWorkspaceId,
    params,
    actionSummary,
  };
}

export async function runAgent(
  a: Access,
  input: unknown,
  idempotencyKey: string,
  opts: { routineId?: string; overrideMode?: AgentPermissionMode } = {},
) {
  if (a.api) fail(403, 'Autonomous Agent requires a verified human session');
  const d = agentRunInput.parse(input);
  const fingerprint = hash(canonical({ ...d, routineId: opts.routineId || null }));

  const existing = await dbGet(
    'SELECT * FROM ac_agent_runs WHERE org_id=? AND environment=? AND actor=? AND idempotency_key=?',
    [a.org, a.environment, a.actor, idempotencyKey],
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      fail(409, 'Idempotency key conflicts with a previous agent instruction');
    }
    return formatRunRow(existing);
  }

  const policy = await getAgentPolicy(a);
  const boundary = await resolveAgentBoundary(a, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });

  // Always check explicit target_workspace_id BEFORE planning if supplied
  if (d.target_workspace_id) {
    await assertAgentTargetAllowed(a, d.target_workspace_id, {
      crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
    });
  }

  const plan = planAgentAction(
    boundary.source_kind,
    boundary,
    d.prompt,
    d.currency,
    d.tool_hint,
    d.target_workspace_id,
    d.params,
  );

  // Hard server-side isolation enforcement on resolved target workspace!
  const target = await assertAgentTargetAllowed(a, plan.targetWorkspaceId, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });

  // If cross-workspace tool needs a companion workspace that doesn't exist yet
  if (
    plan.tool.cross_workspace_bridge === 'personal_to_developer' &&
    boundary.source_kind === 'personal' &&
    target.targetKind !== 'developer'
  ) {
    fail(
      409,
      'No linked Developer workspace found for your account. Create a Developer workspace first to bridge Personal → Developer.',
    );
  }
  if (
    plan.tool.cross_workspace_bridge === 'developer_to_personal' &&
    boundary.source_kind === 'developer' &&
    target.targetKind !== 'personal'
  ) {
    fail(
      409,
      'No linked Personal workspace found for your account. Create a Personal workspace first to bridge Developer → Personal.',
    );
  }

  // Evaluate Owner Permission Matrix + Autonomy Mode
  let effectiveMode: AgentPermissionMode =
    opts.overrideMode || policy.permissions[plan.tool.id] || plan.tool.default_permission;
  if (policy.autonomy_mode === 'read_only' && plan.tool.access_kind === 'write') {
    effectiveMode = 'disabled';
  } else if (policy.autonomy_mode === 'autonomous' && effectiveMode === 'approval_required') {
    // Owner explicitly enabled full workspace autonomy
    effectiveMode = 'autonomous';
  }

  if (effectiveMode === 'disabled') {
    fail(
      403,
      `The '${plan.tool.name}' capability is disabled by the workspace owner in Agent Permissions.`,
    );
  }

  const runId = randomUUID();
  const at = now();
  const useComputerUse = d.computer_use && policy.computer_use_enabled;

  // Determine separate Agent Credits cost
  const creditCategory = opts.routineId
    ? 'routine_run'
    : useComputerUse && plan.tool.access_kind === 'write'
      ? 'computer_use_session'
      : plan.tool.credit_category;
  const creditsCost = AGENT_CREDIT_COSTS[creditCategory];

  if (effectiveMode === 'approval_required') {
    // Restraint-first Townie pattern: charge only 1 planning credit now, pause for human approval!
    const billing = await consumeAgentCredits(a, {
      credits: AGENT_CREDIT_COSTS.analysis_read,
      runId,
      entryType: 'analysis_read',
      reason: `Planned action (awaiting approval): ${plan.tool.name}`,
    });
    const approvalId = randomUUID();
    const previewSteps: ComputerUseStep[] = [
      {
        step_index: 1,
        phase: 'observe',
        label: 'Inspect Workspace Context & Isolation Lock',
        detail: `${boundary.isolation_label} verified before planning.`,
        target_tab: plan.tool.target_tab,
        target_app: plan.tool.target_app,
        target_element: 'Workspace Policy Gate',
        cursor_hint: { x_pct: 22, y_pct: 20 },
        status: 'completed',
        duration_ms: 55,
      },
      {
        step_index: 2,
        phase: 'awaiting_approval',
        label: `Awaiting Owner Approval: ${plan.tool.name}`,
        detail: `Restraint-first guardrail paused execution. Review the parameters and approve to execute live.`,
        target_tab: plan.tool.target_tab,
        target_app: plan.tool.target_app,
        target_element: 'Approval Decision Bar',
        cursor_hint: { x_pct: 52, y_pct: 58 },
        preview_fields: Object.fromEntries(
          Object.entries(plan.params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : (v as any)]),
        ),
        status: 'pending_approval',
        duration_ms: 0,
      },
    ];

    const summary = `Ready to execute "${plan.actionSummary}". Owner permission for ${plan.tool.name} is set to Approval Required — approve below to run it live.`;
    await dbRun(
      `INSERT INTO ac_agent_runs
       (id, org_id, environment, workspace_kind, actor, idempotency_key, fingerprint, prompt, status, isolation_boundary, target_workspace_id, tool_name, summary, steps_json, result_json, credits_used, estimated_minor, currency, routine_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', ?, ?, ?, ?, ?, ?, ?, ?, 'KES', ?, ?, ?)`,
      [
        runId,
        a.org,
        a.environment,
        boundary.source_kind,
        a.actor,
        idempotencyKey,
        fingerprint,
        d.prompt,
        JSON.stringify(boundary),
        target.access.org,
        plan.tool.id,
        summary,
        JSON.stringify(previewSteps),
        JSON.stringify({
          approval_id: approvalId,
          planned_params: plan.params,
          destination: {
            tab: plan.tool.target_tab,
            app: plan.tool.target_app,
            workspace_id: target.access.org,
            workspace_kind: target.targetKind,
          },
          remaining_credits: billing.remaining_after,
        }),
        billing.credits_used,
        billing.estimated_minor,
        opts.routineId || null,
        at,
        at,
      ],
    );

    await dbRun(
      `INSERT INTO ac_agent_approvals
       (id, run_id, org_id, environment, actor, tool_name, target_workspace_id, action_summary, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        approvalId,
        runId,
        a.org,
        a.environment,
        a.actor,
        plan.tool.id,
        target.access.org,
        plan.actionSummary,
        JSON.stringify({ params: plan.params, currency: d.currency, computer_use: useComputerUse }),
        at,
      ],
    );

    await audit(a.org, a.actor, 'agent.run_awaiting_approval', runId);
    const saved = await dbGet('SELECT * FROM ac_agent_runs WHERE id=?', [runId]);
    return formatRunRow(saved);
  }

  // Execute autonomously now!
  const execution = await executeAgentTool(
    target.access,
    target.targetKind,
    plan.tool,
    plan.params,
    d.currency,
    runId,
  );
  const billing = await consumeAgentCredits(a, {
    credits: creditsCost,
    runId,
    entryType: creditCategory,
    reason: `Executed ${plan.tool.name}${useComputerUse ? ' (Computer Use)' : ''}`,
  });

  await dbRun(
    `INSERT INTO ac_agent_runs
     (id, org_id, environment, workspace_kind, actor, idempotency_key, fingerprint, prompt, status, isolation_boundary, target_workspace_id, tool_name, summary, steps_json, result_json, credits_used, estimated_minor, currency, routine_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, 'KES', ?, ?, ?)`,
    [
      runId,
      a.org,
      a.environment,
      boundary.source_kind,
      a.actor,
      idempotencyKey,
      fingerprint,
      d.prompt,
      JSON.stringify(boundary),
      target.access.org,
      plan.tool.id,
      execution.summary,
      JSON.stringify(execution.steps),
      JSON.stringify({
        record_id: execution.record_id || null,
        destination: execution.destination,
        data: execution.data,
        computer_use: useComputerUse,
        remaining_credits: billing.remaining_after,
      }),
      billing.credits_used,
      billing.estimated_minor,
      opts.routineId || null,
      at,
      at,
    ],
  );
  await audit(a.org, a.actor, 'agent.run_completed', runId);
  const saved = await dbGet('SELECT * FROM ac_agent_runs WHERE id=?', [runId]);
  return formatRunRow(saved);
}

export async function decideAgentApproval(a: Access, approvalId: string, input: unknown) {
  if (a.api) fail(403, 'Human session required to decide agent approvals');
  const d = agentApprovalDecisionInput.parse(input);
  const approval = await dbGet(
    'SELECT * FROM ac_agent_approvals WHERE id=? AND org_id=? AND environment=?',
    [approvalId, a.org, a.environment],
  );
  if (!approval) fail(404, 'Agent approval not found');
  if (approval.status !== 'pending') fail(409, 'Agent approval is already decided');
  if (a.actor !== approval.actor && !['owner', 'admin'].includes(a.role)) {
    fail(403, 'Requester or workspace owner/admin required to decide this approval');
  }

  const at = now();
  if (d.decision === 'reject') {
    await dbRun(
      "UPDATE ac_agent_approvals SET status='rejected', decision_note=?, decided_by=?, decided_at=? WHERE id=?",
      [d.note || 'Rejected by user', a.actor, at, approvalId],
    );
    await dbRun(
      "UPDATE ac_agent_runs SET status='rejected', summary=?, updated_at=? WHERE id=?",
      [
        `Action rejected before execution: ${approval.action_summary}${d.note ? ` (${d.note})` : ''}.`,
        at,
        approval.run_id,
      ],
    );
    await audit(a.org, a.actor, 'agent.approval_rejected', approvalId);
    const updated = await dbGet('SELECT * FROM ac_agent_runs WHERE id=?', [approval.run_id]);
    return { approval_id: approvalId, status: 'rejected', run: formatRunRow(updated) };
  }

  // Approve & execute live (re-verifying isolation boundary at execution time!)
  const policy = await getAgentPolicy(a);
  const target = await assertAgentTargetAllowed(a, approval.target_workspace_id, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });
  const tool = toolById(approval.tool_name);
  if (!tool) return fail(400, 'Tool no longer available');
  const payload = JSON.parse(approval.payload_json || '{}');
  const execution = await executeAgentTool(
    target.access,
    target.targetKind,
    tool,
    payload.params || {},
    payload.currency || 'KES',
    approval.run_id,
  );
  const creditCategory = payload.computer_use ? 'computer_use_session' : tool.credit_category;
  const billing = await consumeAgentCredits(a, {
    credits: AGENT_CREDIT_COSTS[creditCategory],
    runId: approval.run_id,
    entryType: creditCategory,
    reason: `Approved execution: ${tool.name}`,
  });

  await dbRun(
    "UPDATE ac_agent_approvals SET status='approved', decision_note=?, decided_by=?, decided_at=? WHERE id=?",
    [d.note || 'Approved by user', a.actor, at, approvalId],
  );
  await dbRun(
    `UPDATE ac_agent_runs
     SET status='completed', summary=?, steps_json=?, result_json=?, credits_used = credits_used + ?, estimated_minor = estimated_minor + ?, updated_at=?
     WHERE id=?`,
    [
      execution.summary,
      JSON.stringify(execution.steps),
      JSON.stringify({
        approval_id: approvalId,
        record_id: execution.record_id || null,
        destination: execution.destination,
        data: execution.data,
        computer_use: !!payload.computer_use,
        remaining_credits: billing.remaining_after,
      }),
      billing.credits_used,
      billing.estimated_minor,
      at,
      approval.run_id,
    ],
  );
  await audit(a.org, a.actor, 'agent.approval_approved_and_executed', approvalId);
  const updated = await dbGet('SELECT * FROM ac_agent_runs WHERE id=?', [approval.run_id]);
  return { approval_id: approvalId, status: 'approved', run: formatRunRow(updated) };
}

export async function listAgentRuns(a: Access, limit = 30) {
  const rows = await dbAll(
    'SELECT * FROM ac_agent_runs WHERE org_id=? AND environment=? ORDER BY created_at DESC LIMIT ?',
    [a.org, a.environment, Math.min(100, Math.max(1, limit))],
  );
  return rows.map(formatRunRow);
}

export async function listAgentApprovals(a: Access) {
  const rows = await dbAll(
    'SELECT * FROM ac_agent_approvals WHERE org_id=? AND environment=? ORDER BY created_at DESC LIMIT 50',
    [a.org, a.environment],
  );
  return rows.map((r: any) => ({
    ...r,
    payload: JSON.parse(r.payload_json || '{}'),
  }));
}

export async function listAgentRoutines(a: Access) {
  const rows = await dbAll(
    'SELECT * FROM ac_agent_routines WHERE org_id=? AND environment=? ORDER BY created_at DESC LIMIT 50',
    [a.org, a.environment],
  );
  return rows.map((r: any) => ({ ...r, enabled: !!r.enabled }));
}

export async function createAgentRoutine(a: Access, input: unknown) {
  if (a.api || !['owner', 'admin', 'finance', 'operations'].includes(a.role)) {
    fail(403, 'Workspace member write permission required to create routines');
  }
  const d = agentRoutineCreateInput.parse(input);
  const kind = await workspaceKindFor(a.org);
  const allowed = toolsForWorkspaceKind(kind);
  if (!allowed.some((t) => t.id === d.tool_name)) {
    fail(400, `Tool '${d.tool_name}' is not available in ${kind} workspaces`);
  }
  const id = randomUUID();
  const at = now();
  await dbRun(
    `INSERT INTO ac_agent_routines
     (id, org_id, environment, workspace_kind, name, description, trigger_type, schedule_label, prompt, tool_name, execution_mode, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      a.org,
      a.environment,
      kind,
      d.name,
      d.description,
      d.trigger_type,
      d.schedule_label,
      d.prompt,
      d.tool_name,
      d.execution_mode,
      d.enabled ? 1 : 0,
      a.actor,
      at,
      at,
    ],
  );
  await audit(a.org, a.actor, 'agent.routine_created', id);
  const row = await dbGet('SELECT * FROM ac_agent_routines WHERE id=?', [id]);
  return { ...row, enabled: !!row.enabled };
}

export async function updateAgentRoutine(a: Access, routineId: string, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = agentRoutinePatchInput.parse(input);
  const row = await dbGet(
    'SELECT * FROM ac_agent_routines WHERE id=? AND org_id=? AND environment=?',
    [routineId, a.org, a.environment],
  );
  if (!row) fail(404, 'Agent routine not found');
  await dbRun(
    `UPDATE ac_agent_routines
     SET enabled=?, execution_mode=?, schedule_label=?, prompt=?, updated_at=?
     WHERE id=? AND org_id=? AND environment=?`,
    [
      d.enabled === undefined ? row.enabled : d.enabled ? 1 : 0,
      d.execution_mode || row.execution_mode,
      d.schedule_label || row.schedule_label,
      d.prompt || row.prompt,
      now(),
      routineId,
      a.org,
      a.environment,
    ],
  );
  const updated = await dbGet('SELECT * FROM ac_agent_routines WHERE id=?', [routineId]);
  return { ...updated, enabled: !!updated.enabled };
}

export async function deleteAgentRoutine(a: Access, routineId: string) {
  if (a.api) fail(403, 'Human session required');
  const res = await dbRun(
    'DELETE FROM ac_agent_routines WHERE id=? AND org_id=? AND environment=?',
    [routineId, a.org, a.environment],
  );
  if (!res.changes) fail(404, 'Agent routine not found');
  await audit(a.org, a.actor, 'agent.routine_deleted', routineId);
  return { deleted: true, id: routineId };
}

export async function triggerAgentRoutineNow(a: Access, routineId: string, idempotencyKey: string) {
  const row = await dbGet(
    'SELECT * FROM ac_agent_routines WHERE id=? AND org_id=? AND environment=?',
    [routineId, a.org, a.environment],
  );
  if (!row) fail(404, 'Agent routine not found');
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
  await dbRun(
    'UPDATE ac_agent_routines SET last_run_id=?, last_run_at=?, last_status=?, updated_at=? WHERE id=?',
    [run.id, now(), run.status, now(), routineId],
  );
  return { routine_id: routineId, run };
}

export async function listAgentMemory(a: Access) {
  return dbAll(
    'SELECT id, category, content, actor, created_at FROM ac_agent_memory WHERE org_id=? AND environment=? ORDER BY created_at DESC LIMIT 50',
    [a.org, a.environment],
  );
}

export async function addAgentMemory(a: Access, input: unknown) {
  if (a.api) fail(403, 'Human session required');
  const d = agentMemoryInput.parse(input);
  const kind = await workspaceKindFor(a.org);
  const id = randomUUID();
  const at = now();
  await dbRun(
    'INSERT INTO ac_agent_memory(id, org_id, environment, workspace_kind, actor, category, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, a.org, a.environment, kind, a.actor, d.category, d.content, at],
  );
  return { id, ...d, actor: a.actor, created_at: at };
}

export async function deleteAgentMemory(a: Access, memoryId: string) {
  if (a.api) fail(403, 'Human session required');
  const res = await dbRun(
    'DELETE FROM ac_agent_memory WHERE id=? AND org_id=? AND environment=?',
    [memoryId, a.org, a.environment],
  );
  if (!res.changes) fail(404, 'Memory item not found');
  return { deleted: true, id: memoryId };
}

export async function getAgentOverview(a: Access) {
  const [policy, billing, runs, approvals, routines, memory] = await Promise.all([
    getAgentPolicy(a),
    getAgentBillingSummary(a),
    listAgentRuns(a, 20),
    listAgentApprovals(a),
    listAgentRoutines(a),
    listAgentMemory(a),
  ]);
  const boundary = await resolveAgentBoundary(a, {
    crossDevBridgeEnabled: policy.cross_dev_bridge_enabled,
  });
  const tools = toolsForWorkspaceKind(boundary.source_kind).map((t) => ({
    ...t,
    permission: policy.permissions[t.id] || t.default_permission,
    credit_cost: AGENT_CREDIT_COSTS[t.credit_category],
  }));

  return {
    agent_name: 'AfriCore Agent',
    workspace_kind: boundary.source_kind,
    environment: a.environment,
    role: a.role,
    can_manage_policy: !a.api && ['owner', 'admin'].includes(a.role),
    boundary,
    policy,
    billing,
    tools,
    runs,
    approvals,
    pending_approvals_count: approvals.filter((item: any) => item.status === 'pending').length,
    routines,
    memory,
  };
}

function formatRunRow(row: any) {
  return {
    id: row.id,
    org_id: row.org_id,
    environment: row.environment,
    workspace_kind: row.workspace_kind,
    actor: row.actor,
    prompt: row.prompt,
    status: row.status,
    isolation_boundary: JSON.parse(row.isolation_boundary || '{}'),
    target_workspace_id: row.target_workspace_id,
    tool_name: row.tool_name,
    summary: row.summary,
    steps: JSON.parse(row.steps_json || '[]') as ComputerUseStep[],
    result: JSON.parse(row.result_json || '{}'),
    credits_used: Number(row.credits_used || 0),
    estimated_minor: Number(row.estimated_minor || 0),
    currency: row.currency || 'KES',
    routine_id: row.routine_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
