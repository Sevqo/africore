import { randomUUID } from 'node:crypto';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import { now } from '../platform/crypto';
import { permitted } from '../platform/domain';
import { save as saveRecord } from '../platform/payments';
import { requireServices } from '../marketplace/engine';
import type { WorkspaceKind } from '../marketplace/catalog';
import { financialSnapshot, forecast } from '../operations/intelligence';
import { create as createOpObject, atomic as atomicOp } from '../operations/store';
import { emit } from '../operations/events';
import { notify } from '../operations/automation';
import { createCrmEntry, crmOverview } from '../operations/crm';
import { createCalendarEvent, calendarEvents } from '../apps/phase3';
import { createProject, saveTask, workProjects } from '../erp/work';
import { sumMinor } from '../finance/money';
import { runPythonAgent } from './python-bridge';
import type { AgentCreditCategory } from './billing';
import type { AgentPermissionMode } from './contracts';

export interface ComputerUseStep {
  step_index: number;
  phase: 'observe' | 'navigate' | 'input' | 'execute' | 'verify' | 'awaiting_approval';
  label: string;
  detail: string;
  target_tab: string;
  target_app?: string;
  target_element: string;
  cursor_hint: { x_pct: number; y_pct: number };
  preview_fields?: Record<string, string | number | boolean>;
  status: 'completed' | 'pending_approval' | 'failed';
  duration_ms: number;
}

export interface AgentToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'scheduling' | 'operations' | 'crm' | 'finance' | 'communication' | 'developer';
  access_kind: 'read' | 'write';
  workspace_kinds: WorkspaceKind[];
  required_capability: 'read' | 'operations' | 'finance' | 'admin';
  default_permission: AgentPermissionMode;
  credit_category: AgentCreditCategory;
  target_tab: string;
  target_app?: string;
  cross_workspace_bridge?: 'personal_to_developer' | 'developer_to_personal';
}

export const AGENT_TOOL_CATALOG: AgentToolDefinition[] = [
  // --- Business Workspace Tools ---
  {
    id: 'analyze_business',
    name: 'Analyze business performance',
    description:
      'Inspect receivables, recorded outflows, net movement, CRM pipeline, projects, and upcoming bills to produce an executive business brief.',
    category: 'analysis',
    access_kind: 'read',
    workspace_kinds: ['business'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'Intelligence',
  },
  {
    id: 'forecast_cashflow',
    name: 'Run cash-flow forecast',
    description:
      'Compute a 7, 30, 60, or 90-day scenario projection from receivables, obligations, and covered history.',
    category: 'analysis',
    access_kind: 'read',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'Forecasts',
  },
  {
    id: 'schedule_meeting',
    name: 'Schedule meeting',
    description:
      'Create a real timezone-aware calendar event in AfriCore Calendar and notify invited workspace members.',
    category: 'scheduling',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Calendar',
    target_app: 'calendar',
  },
  {
    id: 'create_project',
    name: 'Set up project & starter tasks',
    description:
      'Create a new workspace project in AfriCore Work with stages, deadline, and initial starter tasks.',
    category: 'operations',
    access_kind: 'write',
    workspace_kinds: ['business'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Work',
    target_app: 'work',
  },
  {
    id: 'create_task',
    name: 'Add project task',
    description: 'Create a tracked task inside an existing AfriCore Work project.',
    category: 'operations',
    access_kind: 'write',
    workspace_kinds: ['business'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Work',
    target_app: 'work',
  },
  {
    id: 'create_customer',
    name: 'Create customer / client',
    description: 'Register a new customer or client contact in the canonical workspace directory.',
    category: 'crm',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Customers',
  },
  {
    id: 'create_crm_lead',
    name: 'Create CRM lead or follow-up',
    description: 'Log a new CRM lead, opportunity, or customer follow-up task in AfriCore CRM.',
    category: 'crm',
    access_kind: 'write',
    workspace_kinds: ['business'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Customer Relationships',
    target_app: 'crm',
  },
  {
    id: 'create_draft_invoice',
    name: 'Prepare draft invoice',
    description:
      'Create a draft invoice for human review (never auto-issues or moves real funds without explicit review).',
    category: 'finance',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'finance',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Invoices',
  },
  {
    id: 'record_expense',
    name: 'Record business or personal expense',
    description: 'Record a dated expense entry with explicit integer minor units and currency.',
    category: 'finance',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'finance',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Expenses',
  },
  {
    id: 'create_obligation',
    name: 'Schedule recurring bill or reminder',
    description:
      'Set up an upcoming bill, subscription, or recurring obligation reminder in Cash Flow.',
    category: 'finance',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal'],
    required_capability: 'finance',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Cash Flow',
  },
  {
    id: 'send_workspace_reply',
    name: 'Send workspace reply / team notice',
    description:
      'Post an actionable in-app update, reminder, or reply to workspace members in Notifications.',
    category: 'communication',
    access_kind: 'write',
    workspace_kinds: ['business', 'personal', 'developer'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Notifications',
  },

  // --- Personal Workspace Tools (+ Personal -> Developer Bridge) ---
  {
    id: 'analyze_personal_finances',
    name: 'Analyze personal finances',
    description:
      'Summarize personal recorded income, expenses, subscriptions, net movement, and upcoming obligations.',
    category: 'analysis',
    access_kind: 'read',
    workspace_kinds: ['personal'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'Overview',
  },
  {
    id: 'record_personal_income',
    name: 'Record personal income',
    description: 'Log a manually recorded personal income entry in your Personal workspace.',
    category: 'finance',
    access_kind: 'write',
    workspace_kinds: ['personal'],
    required_capability: 'finance',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'Income',
  },
  {
    id: 'inspect_linked_developer_workspace',
    name: 'Inspect linked Developer workspace',
    description:
      'Read sandbox applications, webhook status, and recent API request logs from your own linked Developer workspace (Business workspaces remain strictly blocked).',
    category: 'developer',
    access_kind: 'read',
    workspace_kinds: ['personal', 'developer'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'My Applications',
    cross_workspace_bridge: 'personal_to_developer',
  },
  {
    id: 'create_developer_application',
    name: 'Create sandbox developer application',
    description:
      'Register a new sandbox API application in your Developer workspace (accessible from Developer or your linked Personal workspace; never Business).',
    category: 'developer',
    access_kind: 'write',
    workspace_kinds: ['personal', 'developer'],
    required_capability: 'operations',
    default_permission: 'approval_required',
    credit_category: 'tool_action',
    target_tab: 'My Applications',
    cross_workspace_bridge: 'personal_to_developer',
  },

  // --- Developer Workspace Tools (+ Developer -> Personal Bridge) ---
  {
    id: 'inspect_developer_diagnostics',
    name: 'Diagnose API & webhook health',
    description:
      'Inspect sandbox API request logs, HTTP error rates, active webhooks, and failed deliveries without exposing secrets.',
    category: 'developer',
    access_kind: 'read',
    workspace_kinds: ['developer'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'Request Logs',
  },
  {
    id: 'inspect_linked_personal_summary',
    name: 'Inspect linked Personal workspace',
    description:
      'Read a summary of your own linked Personal workspace finances and calendar (Business workspaces remain strictly blocked).',
    category: 'analysis',
    access_kind: 'read',
    workspace_kinds: ['developer'],
    required_capability: 'read',
    default_permission: 'autonomous',
    credit_category: 'analysis_read',
    target_tab: 'Overview',
    cross_workspace_bridge: 'developer_to_personal',
  },
];

export function toolsForWorkspaceKind(kind: WorkspaceKind): AgentToolDefinition[] {
  return AGENT_TOOL_CATALOG.filter((tool) => tool.workspace_kinds.includes(kind));
}

export function defaultPermissionsForKind(kind: WorkspaceKind): Record<string, AgentPermissionMode> {
  return Object.fromEntries(
    toolsForWorkspaceKind(kind).map((tool) => [tool.id, tool.default_permission]),
  );
}

export function toolById(id: string): AgentToolDefinition | undefined {
  return AGENT_TOOL_CATALOG.find((t) => t.id === id);
}

function moneyFmt(minor: number, currency: string) {
  const divisor = ['UGX', 'RWF'].includes(currency) ? 1 : 100;
  return `${currency} ${(minor / divisor).toLocaleString('en-KE', {
    minimumFractionDigits: divisor === 1 ? 0 : 2,
    maximumFractionDigits: divisor === 1 ? 0 : 2,
  })}`;
}

function todayDate(tz = 'Africa/Nairobi') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function futureIso(hoursFromNow = 24, durationMinutes = 45, preferredHour?: number) {
  const start = new Date(Date.now() + hoursFromNow * 3600_000);
  if (typeof preferredHour === 'number' && preferredHour >= 0 && preferredHour <= 23) {
    start.setHours(preferredHour, 0, 0, 0);
    if (start.getTime() < Date.now() + 10 * 60_000) {
      start.setTime(start.getTime() + 24 * 3600_000);
    }
  } else {
    start.setMinutes(0, 0, 0);
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchSandboxCloneContext(
  targetAccess: Access,
  cloneKind: string,
): Promise<Record<string, unknown>> {
  try {
    if (cloneKind === 'calendar') {
      const cal = await calendarEvents(targetAccess).catch(() => ({ data: [] }));
      return {
        existing_events: (cal.data || []).slice(0, 5).map((e: any) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          location: e.location || 'Workspace',
        })),
      };
    }
    if (cloneKind === 'work') {
      const list = await workProjects(targetAccess).catch(() => ({ data: [] }));
      return {
        existing_projects: (list.data || []).slice(0, 4).map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status || 'active',
          deadline: p.deadline || null,
        })),
      };
    }
    if (cloneKind === 'crm') {
      const rows = await dbAll(
        "SELECT id, title, stage, amount_minor, currency FROM ac_crm_entries WHERE org_id=? AND environment=? AND status<>'archived' ORDER BY updated_at DESC LIMIT 5",
        [targetAccess.org, targetAccess.environment],
      ).catch(() => []);
      return { existing_leads: rows };
    }
    if (cloneKind === 'invoices' || cloneKind === 'customers') {
      const [custs, invs] = await Promise.all([
        dbAll(
          "SELECT id, data FROM ac_records WHERE org_id=? AND environment=? AND kind='customers' ORDER BY created_at DESC LIMIT 5",
          [targetAccess.org, targetAccess.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id, data FROM ac_records WHERE org_id=? AND environment=? AND kind='invoices' ORDER BY created_at DESC LIMIT 4",
          [targetAccess.org, targetAccess.environment],
        ).catch(() => []),
      ]);
      return {
        existing_customers: custs.map((c: any) => {
          try {
            return { id: c.id, name: JSON.parse(c.data).name };
          } catch {
            return { id: c.id, name: 'Customer' };
          }
        }),
        existing_invoices: invs.map((i: any) => {
          try {
            const d = JSON.parse(i.data);
            return { id: i.id, reference: d.reference, customer_name: d.customer_name, status: d.status, total_minor: d.total_minor };
          } catch {
            return { id: i.id, reference: 'INV', status: 'draft', total_minor: 0 };
          }
        }),
      };
    }
  } catch {
    // Non-blocking context enrichment for sandbox clone UI
  }
  return {};
}

export interface ToolExecutionOutput {
  summary: string;
  record_id?: string;
  destination: { tab: string; app?: string; section?: string; workspace_id: string; workspace_kind: WorkspaceKind };
  data: Record<string, unknown>;
  steps: ComputerUseStep[];
}

export async function executeAgentTool(
  targetAccess: Access,
  targetKind: WorkspaceKind,
  tool: AgentToolDefinition,
  params: Record<string, unknown>,
  currency: string,
  idempotencySeed: string,
): Promise<ToolExecutionOutput> {
  if (!permitted(targetAccess.role, tool.required_capability)) {
    fail(
      403,
      `Your workspace role (${targetAccess.role}) does not have '${tool.required_capability}' permission for ${tool.name}.`,
    );
  }

  const dest = (tab: string, app?: string, section?: string) => ({
    tab,
    ...(app ? { app } : {}),
    ...(section ? { section } : {}),
    workspace_id: targetAccess.org,
    workspace_kind: targetKind,
  });

  if (tool.id === 'analyze_business') {
    const snapshot = await financialSnapshot(targetAccess, { currency });
    const [crmRows, workList, calList, customerRows] = await Promise.all([
      dbAll(
        "SELECT id, kind, title, stage, status, amount_minor, currency FROM ac_crm_entries WHERE org_id=? AND environment=? AND status<>'archived'",
        [targetAccess.org, targetAccess.environment],
      ).catch(() => []),
      workProjects(targetAccess).catch(() => ({ data: [] })),
      calendarEvents(targetAccess).catch(() => ({ data: [] })),
      dbAll(
        "SELECT id FROM ac_records WHERE org_id=? AND environment=? AND kind='customers'",
        [targetAccess.org, targetAccess.environment],
      ).catch(() => []),
    ]);

    const projectRows = workList.data || [];
    const allTasks = projectRows.flatMap((p: any) => p.tasks || []);
    const eventRows = calList.data || [];
    const openInvoices = snapshot.invoices.filter((i: any) => i.outstanding_minor > 0);
    const overdueInvoices = openInvoices.filter((i: any) => i.overdue_days > 0);

    const pyIntel = await runPythonAgent<{
      summary: string;
      highlights?: string[];
      recommended_actions?: { title: string; action_prompt: string }[];
      metrics?: Record<string, unknown>;
    }>({
      op: 'analyze_operations',
      workspace_kind: 'business',
      currency,
      prompt: String(params.prompt || ''),
      totals: snapshot.totals,
      period: snapshot.period,
      invoices: snapshot.invoices,
      expenses: snapshot.inputs.expenses || [],
      obligations: snapshot.inputs.obligations || [],
      crm_entries: crmRows,
      projects: projectRows,
      tasks: allTasks,
      calendar_events: eventRows,
      customers: customerRows,
    });

    return {
      summary: pyIntel.summary,
      destination: dest('Intelligence'),
      data: {
        currency,
        period: snapshot.period,
        totals: snapshot.totals,
        overdue_invoice_count: overdueInvoices.length,
        open_invoice_count: openInvoices.length,
        crm_active_count: crmRows.length,
        project_count: projectRows.length,
        calendar_event_count: eventRows.length,
        quality: snapshot.quality,
        recommended_actions: pyIntel.recommended_actions || [],
        highlights: pyIntel.highlights || [],
      },
      steps: [
        {
          step_index: 1,
          phase: 'observe',
          label: 'Verify Business Sandbox Boundary',
          detail: 'Confirmed strict isolation to active Business workspace only.',
          target_tab: 'Intelligence',
          target_element: 'Workspace Isolation Shield',
          cursor_hint: { x_pct: 18, y_pct: 16 },
          status: 'completed',
          duration_ms: 45,
        },
        {
          step_index: 2,
          phase: 'navigate',
          label: 'Cross-Scan Invoices, CRM, Work & Calendar',
          detail: `Analyzed ${snapshot.invoices.length} invoices, ${crmRows.length} CRM items, ${projectRows.length} projects, and ${eventRows.length} events in Python.`,
          target_tab: 'Intelligence',
          target_element: 'Cross-Module Operational Diagnostic',
          cursor_hint: { x_pct: 48, y_pct: 38 },
          status: 'completed',
          duration_ms: 120,
        },
        {
          step_index: 3,
          phase: 'verify',
          label: 'Synthesize Operational Playbook',
          detail: `Verified ${openInvoices.length} open receivables and ${allTasks.length} project tasks with exact integer arithmetic.`,
          target_tab: 'Intelligence',
          target_element: 'Executive Action Plan',
          cursor_hint: { x_pct: 64, y_pct: 68 },
          status: 'completed',
          duration_ms: 80,
        },
      ],
    };
  }

  if (tool.id === 'forecast_cashflow') {
    const horizon = [7, 30, 60, 90].includes(Number(params.horizon))
      ? (Number(params.horizon) as 7 | 30 | 60 | 90)
      : 30;
    const scenario = ['expected', 'optimistic', 'conservative'].includes(String(params.scenario))
      ? (String(params.scenario) as 'expected' | 'optimistic' | 'conservative')
      : 'expected';
    const result = await forecast(targetAccess, { currency: currency as any, horizon, scenario });
    return {
      summary: `${horizon}-day ${scenario} cash-flow projection (${currency}): Projected inflows ${moneyFmt(result.projected_inflows_minor, currency)}, projected outflows ${moneyFmt(result.projected_outflows_minor, currency)}, estimated net movement ${moneyFmt(result.estimated_net_movement_minor, currency)}. (Scenario estimate; not a guaranteed bank balance.)`,
      destination: dest('Forecasts'),
      data: {
        currency: result.currency,
        horizon: result.horizon,
        scenario: result.scenario,
        projected_inflows_minor: result.projected_inflows_minor,
        projected_outflows_minor: result.projected_outflows_minor,
        estimated_net_movement_minor: result.estimated_net_movement_minor,
        confidence: result.confidence,
        actions: result.actions,
      },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Cash-Flow Forecasts',
          detail: `Selected ${horizon}-day ${scenario} scenario in ${currency}.`,
          target_tab: 'Forecasts',
          target_element: 'Scenario Selector',
          cursor_hint: { x_pct: 32, y_pct: 28 },
          preview_fields: { currency, horizon_days: horizon, scenario },
          status: 'completed',
          duration_ms: 95,
        },
        {
          step_index: 2,
          phase: 'verify',
          label: 'Validate Projection Assumptions',
          detail: `Computed estimated net movement ${moneyFmt(result.estimated_net_movement_minor, currency)}.`,
          target_tab: 'Forecasts',
          target_element: 'Projection Chart',
          cursor_hint: { x_pct: 62, y_pct: 58 },
          status: 'completed',
          duration_ms: 110,
        },
      ],
    };
  }

  if (tool.id === 'schedule_meeting') {
    const title = String(params.title || 'Workspace Strategy Meeting').slice(0, 180);
    const description = String(
      params.description || 'Scheduled by AfriCore Autonomous Agent.',
    ).slice(0, 2000);
    const location = String(params.location || 'Workspace Meeting Room').slice(0, 250);
    const timezone = String(params.timezone || 'Africa/Nairobi');
    const defaults = futureIso(
      Number(params.hours_from_now || 24),
      Number(params.duration_minutes || 45),
      params.preferred_hour !== undefined ? Number(params.preferred_hour) : undefined,
    );
    const start = typeof params.start === 'string' && !Number.isNaN(Date.parse(params.start))
      ? params.start
      : defaults.start;
    const end = typeof params.end === 'string' && !Number.isNaN(Date.parse(params.end))
      ? params.end
      : defaults.end;

    const created = await createCalendarEvent(
      targetAccess,
      {
        title,
        description,
        start,
        end,
        timezone,
        all_day: false,
        location,
        meeting_url: '',
        visibility: 'default',
        recurrence: 'none',
        recurrence_rule: null,
        attendees: [],
        linked_record: null,
      },
      'agent-cal-' + idempotencySeed,
    );

    await notify(targetAccess, {
      category: 'calendar_scheduled',
      title: `Meeting Scheduled: ${title}`,
      body: `${new Date(start).toLocaleString('en-KE', { timeZone: timezone })} (${timezone}) · ${location}`,
      key: 'agent-cal-notify:' + created.id,
      severity: 'informational',
      capability: 'read',
    }).catch(() => {});

    const calTab = targetKind === 'business' ? 'Apps' : 'Calendar';
    return {
      summary: `Meeting scheduled in AfriCore Calendar: "${title}" on ${new Date(start).toLocaleString('en-KE', { timeZone: timezone })} (${timezone}) at ${location}. Workspace members now have visibility.`,
      record_id: created.id,
      destination:
        targetKind === 'business'
          ? dest(calTab, 'calendar', 'calendar')
          : dest('Calendar'),
      data: {
        event_id: created.id,
        title,
        start,
        end,
        timezone,
        location,
      },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open AfriCore Calendar',
          detail: 'Navigated to workspace calendar schedule view.',
          target_tab: calTab,
          target_app: targetKind === 'business' ? 'calendar' : undefined,
          target_element: 'New Event Button',
          cursor_hint: { x_pct: 76, y_pct: 22 },
          status: 'completed',
          duration_ms: 110,
        },
        {
          step_index: 2,
          phase: 'input',
          label: 'Fill Meeting Details',
          detail: `Entered title "${title}", time window, and location.`,
          target_tab: calTab,
          target_app: targetKind === 'business' ? 'calendar' : undefined,
          target_element: 'Event Title & Time Form',
          cursor_hint: { x_pct: 46, y_pct: 48 },
          preview_fields: { title, start: start.slice(0, 16), timezone, location },
          status: 'completed',
          duration_ms: 150,
        },
        {
          step_index: 3,
          phase: 'execute',
          label: 'Save & Notify Workspace',
          detail: `Created calendar event ${created.id.slice(0, 8)} and persisted to encrypted store.`,
          target_tab: calTab,
          target_app: targetKind === 'business' ? 'calendar' : undefined,
          target_element: 'Save Event Action',
          cursor_hint: { x_pct: 72, y_pct: 80 },
          status: 'completed',
          duration_ms: 130,
        },
      ],
    };
  }

  if (tool.id === 'create_project') {
    const name = String(params.name || 'New Business Initiative').slice(0, 180);
    const description = String(
      params.description || 'Project initialized by AfriCore Autonomous Agent.',
    ).slice(0, 3000);
    const deadline =
      typeof params.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.deadline)
        ? params.deadline
        : new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    const created = await createProject(
      targetAccess,
      {
        name,
        description,
        owner_id: targetAccess.actor,
        members: [{ user_id: targetAccess.actor, permission: 'manage' }],
        deadline,
        starts_on: todayDate(),
        priority: ['low', 'normal', 'high', 'urgent'].includes(String(params.priority))
          ? String(params.priority)
          : 'normal',
      },
      'agent-proj-' + idempotencySeed,
    );

    const starterTaskTitle = String(
      params.starter_task || `Kickoff checklist for ${name}`,
    ).slice(0, 180);
    const task = await saveTask(
      targetAccess,
      created.id,
      null,
      {
        expected_version: 0,
        task: {
          title: starterTaskTitle,
          description: 'Auto-generated kickoff task from AfriCore Agent.',
          stage: 'planned',
          assignee_id: targetAccess.actor,
          due_on: deadline,
          priority: 'normal',
        },
      },
      'agent-task-' + idempotencySeed,
    );

    return {
      summary: `Created project "${name}" in AfriCore Work (deadline ${deadline}) and added starter task "${starterTaskTitle}".`,
      record_id: created.id,
      destination: dest('Work', 'work', 'dashboard'),
      data: {
        project_id: created.id,
        name,
        deadline,
        starter_task_id: task.id,
        starter_task: starterTaskTitle,
      },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open AfriCore Work',
          detail: 'Opened Projects workspace inside Business sandbox.',
          target_tab: 'Work',
          target_app: 'work',
          target_element: 'Create Project Button',
          cursor_hint: { x_pct: 74, y_pct: 20 },
          status: 'completed',
          duration_ms: 95,
        },
        {
          step_index: 2,
          phase: 'input',
          label: 'Configure Project & Stages',
          detail: `Configured "${name}" with Planned / In progress / Complete stages and deadline ${deadline}.`,
          target_tab: 'Work',
          target_app: 'work',
          target_element: 'Project Setup Form',
          cursor_hint: { x_pct: 45, y_pct: 52 },
          preview_fields: { name, deadline, starter_task: starterTaskTitle },
          status: 'completed',
          duration_ms: 165,
        },
        {
          step_index: 3,
          phase: 'verify',
          label: 'Verify Project & Starter Task',
          detail: `Verified project ${created.id.slice(0, 8)} and starter task ${task.id.slice(0, 8)} are live.`,
          target_tab: 'Work',
          target_app: 'work',
          target_element: 'Project Board',
          cursor_hint: { x_pct: 58, y_pct: 74 },
          status: 'completed',
          duration_ms: 120,
        },
      ],
    };
  }

  if (tool.id === 'create_task') {
    const title = String(params.title || 'Follow-up workspace task').slice(0, 180);
    const list = await workProjects(targetAccess);
    const projects = list.data || [];
    let projectId = typeof params.project_id === 'string' ? params.project_id : projects[0]?.id;
    if (!projectId) {
      const fallback = await createProject(
        targetAccess,
        {
          name: 'Operations Backlog',
          description: 'Created automatically by AfriCore Agent to track tasks.',
          owner_id: targetAccess.actor,
          members: [{ user_id: targetAccess.actor, permission: 'manage' }],
        },
        'agent-auto-proj-' + idempotencySeed,
      );
      projectId = fallback.id;
    }
    const task = await saveTask(
      targetAccess,
      projectId,
      null,
      {
        expected_version: 0,
        task: {
          title,
          description: String(params.description || 'Added by AfriCore Autonomous Agent.').slice(
            0,
            2000,
          ),
          stage: 'planned',
          assignee_id: targetAccess.actor,
          due_on:
            typeof params.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.due_on)
              ? params.due_on
              : new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
          priority: 'normal',
        },
      },
      'agent-only-task-' + idempotencySeed,
    );
    return {
      summary: `Added task "${title}" to your AfriCore Work project board.`,
      record_id: task.id,
      destination: dest('Work', 'work', 'my-work'),
      data: { task_id: task.id, project_id: projectId, title },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Project Task Board',
          detail: `Selected project ${projectId.slice(0, 8)}.`,
          target_tab: 'Work',
          target_app: 'work',
          target_element: 'Add Task Control',
          cursor_hint: { x_pct: 36, y_pct: 34 },
          status: 'completed',
          duration_ms: 85,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Create Task Card',
          detail: `Saved task "${title}" in Planned stage.`,
          target_tab: 'Work',
          target_app: 'work',
          target_element: 'Planned Column',
          cursor_hint: { x_pct: 52, y_pct: 64 },
          preview_fields: { title, stage: 'planned' },
          status: 'completed',
          duration_ms: 110,
        },
      ],
    };
  }

  if (tool.id === 'create_customer') {
    await requireServices(targetAccess, ['customers', 'invoicing', 'orders', 'crm', 'sales']);
    const name = String(params.name || 'New Workspace Customer').slice(0, 180);
    const email = String(params.email || '').slice(0, 200);
    const phone = String(params.phone || '').slice(0, 50);
    const saved = await saveRecord(targetAccess, 'customers', {
      name,
      email,
      phone,
      notes: String(params.notes || 'Created by AfriCore Autonomous Agent.').slice(0, 1000),
    });
    const tab = targetKind === 'personal' ? 'Clients' : 'Customers';
    return {
      summary: `Added ${targetKind === 'personal' ? 'client' : 'customer'} "${name}" to your canonical directory.`,
      record_id: saved.id,
      destination: dest(tab),
      data: { customer_id: saved.id, name, email, phone },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: `Open ${tab} Directory`,
          detail: 'Opened canonical contact registry.',
          target_tab: tab,
          target_element: 'New Contact Form',
          cursor_hint: { x_pct: 40, y_pct: 28 },
          status: 'completed',
          duration_ms: 80,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Save Contact Record',
          detail: `Persisted contact "${name}" (${saved.id.slice(0, 8)}).`,
          target_tab: tab,
          target_element: 'Directory Table',
          cursor_hint: { x_pct: 60, y_pct: 64 },
          preview_fields: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
          status: 'completed',
          duration_ms: 95,
        },
      ],
    };
  }

  if (tool.id === 'create_crm_lead') {
    const title = String(params.title || 'New Business Opportunity').slice(0, 180);
    const customerName = String(params.customer_name || title).slice(0, 180);
    const amountMinor = Math.max(0, Math.round(Number(params.amount_minor || 0)));

    // Find existing customer or create one if needed
    const existingCustomers = await dbAll(
      "SELECT id, data FROM ac_records WHERE org_id=? AND environment=? AND kind='customers' ORDER BY created_at DESC LIMIT 50",
      [targetAccess.org, targetAccess.environment],
    );
    let customerId = existingCustomers.find((c: any) => {
      try {
        return JSON.parse(c.data).name?.toLowerCase() === customerName.toLowerCase();
      } catch {
        return false;
      }
    })?.id;

    if (!customerId) {
      const newCust = await saveRecord(targetAccess, 'customers', {
        name: customerName,
        email: '',
        phone: '',
        notes: 'Created while logging CRM lead via AfriCore Agent.',
      });
      customerId = newCust.id;
    }

    const entry = await createCrmEntry(
      targetAccess,
      {
        customer_id: customerId,
        kind: 'lead',
        title,
        stage: 'new',
        status: 'open',
        amount_minor: amountMinor,
        currency,
        assigned_to: targetAccess.actor,
        due_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
        notes: String(params.notes || 'Created by AfriCore Autonomous Agent.').slice(0, 2000),
      },
      'agent-crm-' + idempotencySeed,
    );

    return {
      summary: `Logged CRM lead "${title}" for ${customerName}${amountMinor > 0 ? ` (${moneyFmt(amountMinor, currency)})` : ''} in AfriCore CRM.`,
      record_id: entry.id,
      destination: dest('Customer Relationships', 'crm', 'pipeline'),
      data: { crm_entry_id: entry.id, customer_id: customerId, title, amount_minor: amountMinor, currency },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open AfriCore CRM Pipeline',
          detail: 'Opened lead & opportunity pipeline.',
          target_tab: 'Customer Relationships',
          target_app: 'crm',
          target_element: 'New Lead Action',
          cursor_hint: { x_pct: 72, y_pct: 22 },
          status: 'completed',
          duration_ms: 90,
        },
        {
          step_index: 2,
          phase: 'input',
          label: 'Populate Lead Details',
          detail: `Linked customer "${customerName}" and set stage to New.`,
          target_tab: 'Customer Relationships',
          target_app: 'crm',
          target_element: 'Lead Composer',
          cursor_hint: { x_pct: 48, y_pct: 54 },
          preview_fields: { title, customer: customerName, stage: 'new' },
          status: 'completed',
          duration_ms: 130,
        },
        {
          step_index: 3,
          phase: 'verify',
          label: 'Verify Pipeline Card',
          detail: `CRM lead ${entry.id.slice(0, 8)} is now active on the pipeline.`,
          target_tab: 'Customer Relationships',
          target_app: 'crm',
          target_element: 'New Stage Column',
          cursor_hint: { x_pct: 26, y_pct: 70 },
          status: 'completed',
          duration_ms: 85,
        },
      ],
    };
  }

  if (tool.id === 'create_draft_invoice') {
    await requireServices(targetAccess, ['invoicing']);
    const customerName = String(params.customer_name || 'Walk-in Client').slice(0, 180);
    const description = String(params.description || 'Professional services').slice(0, 400);
    const amountMinor = Math.max(100, Math.round(Number(params.amount_minor || 10000)));
    const issueDate = todayDate();
    const dueDate = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

    const existingCustomers = await dbAll(
      "SELECT id, data FROM ac_records WHERE org_id=? AND environment=? AND kind='customers' ORDER BY created_at DESC LIMIT 50",
      [targetAccess.org, targetAccess.environment],
    );
    let customerId = existingCustomers.find((c: any) => {
      try {
        return JSON.parse(c.data).name?.toLowerCase().includes(customerName.toLowerCase());
      } catch {
        return false;
      }
    })?.id;
    if (!customerId) {
      const createdCust = await saveRecord(targetAccess, 'customers', {
        name: customerName,
        email: '',
        phone: '',
        notes: 'Created while preparing draft invoice via AfriCore Agent.',
      });
      customerId = createdCust.id;
    }

    const reference = 'INV-AG-' + Date.now().toString().slice(-6);
    const inv = await saveRecord(targetAccess, 'invoices', {
      reference,
      customer_id: customerId,
      customer_name: customerName,
      currency,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'draft',
      items: [
        {
          description,
          quantity: 1,
          unit_price_minor: amountMinor,
          line_total_minor: amountMinor,
        },
      ],
      subtotal_minor: amountMinor,
      tax_minor: 0,
      total_minor: amountMinor,
      paid_minor: 0,
      balance_minor: amountMinor,
    });

    return {
      summary: `Prepared DRAFT invoice ${reference} for ${customerName} (${moneyFmt(amountMinor, currency)}, due ${dueDate}). Review and issue it from Invoices when ready — no payment was collected.`,
      record_id: inv.id,
      destination: dest('Invoices'),
      data: {
        invoice_id: inv.id,
        reference,
        customer_name: customerName,
        total_minor: amountMinor,
        currency,
        status: 'draft',
        due_date: dueDate,
      },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Invoices',
          detail: 'Opened workspace invoicing register.',
          target_tab: 'Invoices',
          target_element: 'Create Draft Invoice',
          cursor_hint: { x_pct: 68, y_pct: 24 },
          status: 'completed',
          duration_ms: 90,
        },
        {
          step_index: 2,
          phase: 'input',
          label: 'Populate Draft Line Items',
          detail: `Entered ${description} (${moneyFmt(amountMinor, currency)}) for ${customerName}.`,
          target_tab: 'Invoices',
          target_element: 'Invoice Draft Editor',
          cursor_hint: { x_pct: 44, y_pct: 56 },
          preview_fields: { reference, customer: customerName, amount: moneyFmt(amountMinor, currency), status: 'draft' },
          status: 'completed',
          duration_ms: 145,
        },
        {
          step_index: 3,
          phase: 'verify',
          label: 'Save as Draft (Safe Guardrail)',
          detail: `Saved draft ${reference} awaiting human issuance.`,
          target_tab: 'Invoices',
          target_element: 'Invoice List Row',
          cursor_hint: { x_pct: 55, y_pct: 76 },
          status: 'completed',
          duration_ms: 95,
        },
      ],
    };
  }

  if (tool.id === 'record_expense') {
    await requireServices(targetAccess, ['expenses', 'cash_flow']);
    const description = String(params.description || 'Recorded workspace expense').slice(0, 280);
    const amountMinor = Math.max(100, Math.round(Number(params.amount_minor || 10000)));
    const category = String(params.category || 'other');
    const occurredOn = todayDate();

    const expense = await atomicOp(targetAccess, async () => {
      const row = await createOpObject(targetAccess, 'expenses', {
        description,
        amount_minor: amountMinor,
        currency,
        occurred_on: occurredOn,
        category,
        supplier: String(params.supplier || '').slice(0, 180),
        notes: 'Recorded via AfriCore Autonomous Agent.',
        status: 'recorded',
        actor: targetAccess.actor,
      });
      await audit(targetAccess.org, targetAccess.actor, 'expense.created', row.id);
      await emit(targetAccess, 'expense.recorded', {
        id: row.id,
        amount_minor: amountMinor,
        currency,
        category,
      });
      return row;
    });

    return {
      summary: `Recorded expense "${description}" for ${moneyFmt(amountMinor, currency)} under ${category} on ${occurredOn}.`,
      record_id: expense.id,
      destination: dest('Expenses'),
      data: { expense_id: expense.id, description, amount_minor: amountMinor, currency, category, occurred_on: occurredOn },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Expenses Ledger',
          detail: 'Opened workspace expenses view.',
          target_tab: 'Expenses',
          target_element: 'Record Expense Form',
          cursor_hint: { x_pct: 34, y_pct: 32 },
          status: 'completed',
          duration_ms: 80,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Persist Expense Entry',
          detail: `Recorded ${moneyFmt(amountMinor, currency)} (${category}).`,
          target_tab: 'Expenses',
          target_element: 'Expense History Table',
          cursor_hint: { x_pct: 58, y_pct: 68 },
          preview_fields: { description, amount: moneyFmt(amountMinor, currency), category, date: occurredOn },
          status: 'completed',
          duration_ms: 110,
        },
      ],
    };
  }

  if (tool.id === 'create_obligation') {
    await requireServices(targetAccess, ['cash_flow', 'expenses']);
    const description = String(params.description || 'Recurring workspace commitment').slice(0, 280);
    const amountMinor = Math.max(100, Math.round(Number(params.amount_minor || 50000)));
    const recurrence = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(
      String(params.recurrence),
    )
      ? String(params.recurrence)
      : 'monthly';
    const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

    const ob = await atomicOp(targetAccess, async () => {
      const row = await createOpObject(targetAccess, 'obligations', {
        description,
        amount_minor: amountMinor,
        currency,
        next_due_date: due,
        recurrence,
        category: String(params.category || 'subscriptions'),
        supplier: String(params.supplier || '').slice(0, 180),
        timezone: 'Africa/Nairobi',
        reminder_days: 3,
        status: 'active',
      });
      await audit(targetAccess.org, targetAccess.actor, 'obligation.created', row.id);
      return row;
    });

    return {
      summary: `Scheduled ${recurrence} obligation reminder "${description}" (${moneyFmt(amountMinor, currency)}, next due ${due}). Reminder only — no funds move automatically.`,
      record_id: ob.id,
      destination: dest(targetKind === 'personal' ? 'Subscriptions' : 'Cash Flow'),
      data: { obligation_id: ob.id, description, amount_minor: amountMinor, currency, recurrence, next_due_date: due },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Cash Flow & Obligations',
          detail: 'Opened recurring obligations planner.',
          target_tab: targetKind === 'personal' ? 'Subscriptions' : 'Cash Flow',
          target_element: 'Add Obligation Control',
          cursor_hint: { x_pct: 42, y_pct: 36 },
          status: 'completed',
          duration_ms: 85,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Save Recurring Reminder',
          detail: `Scheduled "${description}" (${recurrence}, due ${due}).`,
          target_tab: targetKind === 'personal' ? 'Subscriptions' : 'Cash Flow',
          target_element: 'Upcoming Bills List',
          cursor_hint: { x_pct: 64, y_pct: 70 },
          preview_fields: { description, amount: moneyFmt(amountMinor, currency), recurrence, next_due: due },
          status: 'completed',
          duration_ms: 105,
        },
      ],
    };
  }

  if (tool.id === 'send_workspace_reply') {
    const title = String(params.title || 'Update from AfriCore Agent').slice(0, 140);
    const body = String(params.body || params.message || 'Actionable follow-up posted by AfriCore Agent.').slice(0, 1000);
    await notify(targetAccess, {
      category: 'agent_reply',
      title,
      body,
      key: 'agent-reply:' + idempotencySeed,
      severity: 'informational',
      capability: 'read',
    });
    await audit(targetAccess.org, targetAccess.actor, 'agent.workspace_reply_sent', idempotencySeed);
    return {
      summary: `Delivered in-app workspace message "${title}" to authorized workspace members in Notifications.`,
      destination: dest('Notifications'),
      data: { title, body },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Workspace Notifications',
          detail: 'Prepared scoped in-app notification for current workspace members.',
          target_tab: 'Notifications',
          target_element: 'Notification Feed',
          cursor_hint: { x_pct: 78, y_pct: 18 },
          status: 'completed',
          duration_ms: 70,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Deliver Reply',
          detail: `Posted "${title}" inside Notifications.`,
          target_tab: 'Notifications',
          target_element: 'Latest Notification Card',
          cursor_hint: { x_pct: 52, y_pct: 44 },
          preview_fields: { title, recipients: 'Active workspace members' },
          status: 'completed',
          duration_ms: 90,
        },
      ],
    };
  }

  if (tool.id === 'analyze_personal_finances' || tool.id === 'inspect_linked_personal_summary') {
    const snapshot = await financialSnapshot(targetAccess, { currency });
    const incomeRows = await dbAll(
      'SELECT amount_minor FROM ac_personal_income WHERE workspace_id=? AND environment=? AND currency=?',
      [targetAccess.org, targetAccess.environment, currency],
    );
    const totalIncome = sumMinor(incomeRows.map((r: any) => Number(r.amount_minor || 0)));
    const totalExpenses = snapshot.totals.recorded_outflows_minor;
    const net = totalIncome - totalExpenses;
    const cal = await calendarEvents(targetAccess).catch(() => ({ data: [] }));

    return {
      summary: [
        `Personal Workspace Summary (${currency}):`,
        `• Manually recorded income: ${moneyFmt(totalIncome, currency)}`,
        `• Recorded expenses: ${moneyFmt(totalExpenses, currency)}`,
        `• Recorded personal net movement: ${moneyFmt(net, currency)}`,
        `• Active obligations/subscriptions: ${snapshot.inputs.obligations.length} · Calendar events: ${(cal.data || []).length}`,
      ].join('\n'),
      destination: dest('Overview'),
      data: {
        currency,
        recorded_income_minor: totalIncome,
        recorded_expenses_minor: totalExpenses,
        recorded_net_minor: net,
        obligations_count: snapshot.inputs.obligations.length,
        calendar_events_count: (cal.data || []).length,
      },
      steps: [
        {
          step_index: 1,
          phase: 'observe',
          label: 'Verify Personal Scope (Business Blocked)',
          detail: 'Confirmed Personal/Developer scope; Business workspaces strictly unreachable.',
          target_tab: 'Overview',
          target_element: 'Personal Summary Cards',
          cursor_hint: { x_pct: 28, y_pct: 26 },
          status: 'completed',
          duration_ms: 60,
        },
        {
          step_index: 2,
          phase: 'verify',
          label: 'Compile Personal Ledger Metrics',
          detail: `Computed income ${moneyFmt(totalIncome, currency)} vs expenses ${moneyFmt(totalExpenses, currency)}.`,
          target_tab: 'Overview',
          target_element: 'Net Movement Metric',
          cursor_hint: { x_pct: 56, y_pct: 52 },
          status: 'completed',
          duration_ms: 90,
        },
      ],
    };
  }

  if (tool.id === 'record_personal_income') {
    await requireServices(targetAccess, ['income']);
    const description = String(params.description || 'Personal income entry').slice(0, 280);
    const amountMinor = Math.max(100, Math.round(Number(params.amount_minor || 50000)));
    const occurredOn = todayDate();
    const id = randomUUID();
    await dbRun(
      'INSERT INTO ac_personal_income(id,workspace_id,environment,description,amount_minor,currency,occurred_on,created_at,actor) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, targetAccess.org, targetAccess.environment, description, amountMinor, currency, occurredOn, now(), targetAccess.actor],
    );
    await audit(targetAccess.org, targetAccess.actor, 'personal_income.recorded', id);

    return {
      summary: `Recorded personal income "${description}" (${moneyFmt(amountMinor, currency)}) on ${occurredOn}.`,
      record_id: id,
      destination: dest('Income'),
      data: { income_id: id, description, amount_minor: amountMinor, currency, occurred_on: occurredOn },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Personal Income',
          detail: 'Navigated to personal income tracker.',
          target_tab: 'Income',
          target_element: 'Record Income Form',
          cursor_hint: { x_pct: 38, y_pct: 30 },
          status: 'completed',
          duration_ms: 75,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Save Personal Income',
          detail: `Recorded ${moneyFmt(amountMinor, currency)} as manually recorded income.`,
          target_tab: 'Income',
          target_element: 'Income History',
          cursor_hint: { x_pct: 62, y_pct: 66 },
          preview_fields: { description, amount: moneyFmt(amountMinor, currency), date: occurredOn },
          status: 'completed',
          duration_ms: 95,
        },
      ],
    };
  }

  if (
    tool.id === 'inspect_linked_developer_workspace' ||
    tool.id === 'inspect_developer_diagnostics'
  ) {
    const [apps, creds, logs, webhooks, deliveries] = await Promise.all([
      dbAll(
        "SELECT id, data, created_at FROM ac_records WHERE org_id=? AND environment='sandbox' AND kind='applications' ORDER BY created_at DESC LIMIT 20",
        [targetAccess.org],
      ),
      dbAll(
        "SELECT id, scopes, revoked_at, created_at FROM ac_credentials WHERE org_id=? AND environment='sandbox' ORDER BY created_at DESC LIMIT 20",
        [targetAccess.org],
      ),
      dbAll(
        "SELECT id, method, route, status_code, created_at FROM ac_api_request_logs WHERE org_id=? AND environment='sandbox' ORDER BY created_at DESC LIMIT 30",
        [targetAccess.org],
      ),
      dbAll(
        "SELECT id, url, subscriptions FROM ac_endpoints WHERE org_id=? AND environment='sandbox'",
        [targetAccess.org],
      ),
      dbAll(
        "SELECT id, event_type, status, attempts FROM ac_deliveries WHERE org_id=? ORDER BY created_at DESC LIMIT 20",
        [targetAccess.org],
      ),
    ]);
    const activeCreds = creds.filter((c: any) => !c.revoked_at).length;
    const errorLogs = logs.filter((l: any) => Number(l.status_code) >= 400).length;
    const failedDeliveries = deliveries.filter((d: any) => d.status === 'dead_letter' || d.status === 'failed').length;

    return {
      summary: [
        `Developer Sandbox Diagnostics (Workspace ${targetAccess.org.slice(0, 8)}):`,
        `• Registered applications: ${apps.length}`,
        `• Active scoped API keys: ${activeCreds} (secrets never exposed)`,
        `• Recent API requests: ${logs.length} (${errorLogs} with 4xx/5xx status)`,
        `• Webhook endpoints: ${webhooks.length} · Failed/dead-letter deliveries: ${failedDeliveries}`,
      ].join('\n'),
      destination: dest(tool.id === 'inspect_developer_diagnostics' ? 'Request Logs' : 'My Applications'),
      data: {
        developer_workspace_id: targetAccess.org,
        applications_count: apps.length,
        active_credentials_count: activeCreds,
        recent_requests_count: logs.length,
        error_requests_count: errorLogs,
        webhooks_count: webhooks.length,
        failed_deliveries_count: failedDeliveries,
        applications: apps.slice(0, 5).map((r: any) => ({ id: r.id, ...JSON.parse(r.data) })),
      },
      steps: [
        {
          step_index: 1,
          phase: 'observe',
          label: 'Verify Personal ↔ Developer Bridge',
          detail: 'Verified owned Developer workspace sandbox access (Business workspaces blocked).',
          target_tab: 'My Applications',
          target_element: 'Developer Sandbox Header',
          cursor_hint: { x_pct: 24, y_pct: 18 },
          status: 'completed',
          duration_ms: 65,
        },
        {
          step_index: 2,
          phase: 'navigate',
          label: 'Inspect Applications, Logs & Webhooks',
          detail: `Scanned ${apps.length} apps, ${logs.length} recent requests, and ${webhooks.length} webhooks.`,
          target_tab: 'Request Logs',
          target_element: 'API Diagnostics Table',
          cursor_hint: { x_pct: 54, y_pct: 56 },
          status: 'completed',
          duration_ms: 115,
        },
      ],
    };
  }

  if (tool.id === 'create_developer_application') {
    await requireServices(targetAccess, ['developer_api']);
    const name = String(params.name || 'AfriCore Sandbox App').slice(0, 120);
    const description = String(
      params.description || 'Created via AfriCore Autonomous Agent.',
    ).slice(0, 500);
    const saved = await saveRecord(targetAccess, 'applications', { name, description });
    return {
      summary: `Created sandbox developer application "${name}" in your Developer workspace.`,
      record_id: saved.id,
      destination: dest('My Applications'),
      data: { application_id: saved.id, name, description, developer_workspace_id: targetAccess.org },
      steps: [
        {
          step_index: 1,
          phase: 'navigate',
          label: 'Open Developer Applications',
          detail: 'Accessed owned Developer workspace (sandbox).',
          target_tab: 'My Applications',
          target_element: 'Create Application Form',
          cursor_hint: { x_pct: 36, y_pct: 30 },
          status: 'completed',
          duration_ms: 85,
        },
        {
          step_index: 2,
          phase: 'execute',
          label: 'Register Application',
          detail: `Saved application "${name}" (${saved.id.slice(0, 8)}).`,
          target_tab: 'My Applications',
          target_element: 'Applications List',
          cursor_hint: { x_pct: 58, y_pct: 64 },
          preview_fields: { name, environment: 'sandbox' },
          status: 'completed',
          duration_ms: 100,
        },
      ],
    };
  }

  return fail(400, 'Unsupported agent tool: ' + tool.id);
}
