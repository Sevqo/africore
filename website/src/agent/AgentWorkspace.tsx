import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { DataTable } from '../components/DataTable';
import { ComputerUseStage } from './ComputerUseStage';
import { formatAgentMoney, type AgentDestination } from './computer-use';
import type { API } from '../operations/UI';
import './agent.css';

type StudioTab = 'command' | 'routines' | 'permissions' | 'billing' | 'memory';

const QUICK_PROMPTS: Record<'business' | 'personal' | 'developer', string[]> = {
  business: [
    'Analyze my business performance and receivables',
    'Schedule a meeting for Client Quarterly Review tomorrow',
    'Set up a project for Q4 Growth Launch',
    'Create a CRM lead for Savannah Retail KES 45000',
    'Draft an invoice for Nairobi Traders KES 25000',
    'Run a 30-day cash-flow forecast',
  ],
  personal: [
    'Analyze my personal finances and subscriptions',
    'Schedule a meeting for Personal Budget Check-in tomorrow',
    'Record an expense of KES 4500 for groceries',
    'Check my linked Developer workspace API health',
    'Create a sandbox developer app called Personal Finance Bot',
  ],
  developer: [
    'Diagnose my sandbox API logs and webhook health',
    'Create a sandbox developer app called Checkout Sync Service',
    'Inspect my linked Personal workspace summary',
    'Send a developer workspace notice about webhook testing',
  ],
};

const ROUTINE_PRESETS: Record<
  'business' | 'personal' | 'developer',
  { name: string; description: string; schedule_label: string; prompt: string; tool_name: string }[]
> = {
  business: [
    {
      name: 'Morning Business Briefing',
      description: 'Townie-style daily executive brief of inflows, overdue invoices, CRM, and projects.',
      schedule_label: 'Weekdays at 08:00 EAT',
      prompt: 'Analyze my business performance and highlight overdue invoices',
      tool_name: 'analyze_business',
    },
    {
      name: 'Weekly Cash-Flow Watch',
      description: '30-day cash-flow projection comparing receivables against upcoming bills.',
      schedule_label: 'Mondays at 09:00 EAT',
      prompt: 'Run a 30-day cash-flow forecast',
      tool_name: 'forecast_cashflow',
    },
    {
      name: 'Team Standup Reminder',
      description: 'Posts an actionable weekly check-in update to workspace Notifications.',
      schedule_label: 'Fridays at 15:00 EAT',
      prompt: 'Send a team reply summarizing weekly operations follow-ups',
      tool_name: 'send_workspace_reply',
    },
  ],
  personal: [
    {
      name: 'Personal Cash-Flow Check-In',
      description: 'Summarizes personal income, expenses, and recurring obligations.',
      schedule_label: 'Sundays at 18:00 EAT',
      prompt: 'Analyze my personal finances and subscriptions',
      tool_name: 'analyze_personal_finances',
    },
    {
      name: 'Linked Developer Health Watch',
      description: 'Monitors your linked Developer sandbox apps & webhooks from your Personal workspace.',
      schedule_label: 'Daily at 09:00 EAT',
      prompt: 'Check my linked Developer workspace API health',
      tool_name: 'inspect_linked_developer_workspace',
    },
  ],
  developer: [
    {
      name: 'Sandbox API & Webhook Audit',
      description: 'Checks 4xx/5xx API requests and failed webhook deliveries daily.',
      schedule_label: 'Daily at 08:30 EAT',
      prompt: 'Diagnose my sandbox API logs and webhook health',
      tool_name: 'inspect_developer_diagnostics',
    },
  ],
};

export function AgentWorkspace({
  api,
  currency,
  workspaceId,
  workspaceKind = 'business',
  initialTab = 'command',
  onOpenDestination,
}: {
  api: API;
  currency: string;
  workspaceId?: string;
  workspaceKind?: 'business' | 'personal' | 'developer';
  initialTab?: StudioTab;
  onOpenDestination?: (dest: AgentDestination) => void;
}) {
  const [subTab, setSubTab] = useState<StudioTab>(initialTab);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [driveLive, setDriveLive] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Routine creation form state
  const [routineName, setRoutineName] = useState('');
  const [routineSchedule, setRoutineSchedule] = useState('Weekdays at 08:00 EAT');
  const [routinePrompt, setRoutinePrompt] = useState('');
  const [routineTool, setRoutineTool] = useState('');
  const [routineMode, setRoutineMode] = useState<'approval_required' | 'autonomous'>('approval_required');

  // Billing spend cap form state
  const [capInput, setCapInput] = useState('');
  // Memory form state
  const [memoryCategory, setMemoryCategory] = useState<'preference' | 'business_context' | 'workflow_rule' | 'tone'>('business_context');
  const [memoryText, setMemoryText] = useState('');

  const alive = useRef(true);

  async function loadOverview() {
    setError('');
    try {
      const data = await api('/agent/overview');
      if (!alive.current) return;
      setOverview(data);
      if (data.runs?.length && !selectedRunId) {
        setSelectedRunId(data.runs[0].id);
      }
      if (!routineTool && data.tools?.length) {
        setRoutineTool(data.tools[0].id);
      }
      if (data.billing?.monthly_spend_cap_minor !== undefined) {
        setCapInput(
          data.billing.monthly_spend_cap_minor === null
            ? ''
            : String(Math.round(data.billing.monthly_spend_cap_minor / 100)),
        );
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }

  useEffect(() => {
    alive.current = true;
    void loadOverview();
    return () => {
      alive.current = false;
    };
  }, [workspaceId, workspaceKind]);

  async function runInstruction(text?: string, toolHint?: string) {
    const clean = (text ?? prompt).trim();
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const run = await api(
        '/agent/runs',
        'POST',
        {
          prompt: clean,
          currency,
          ...(toolHint ? { tool_hint: toolHint } : {}),
          computer_use: true,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setPrompt('');
      setSelectedRunId(run.id);
      setNotice(
        run.status === 'awaiting_approval'
          ? 'Action planned and paused for your approval.'
          : 'Autonomous run completed.',
      );
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(approvalId: string, decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api(`/agent/approvals/${approvalId}/decide`, 'POST', { decision, note: '' });
      if (res?.run?.id) setSelectedRunId(res.run.id);
      setNotice(
        decision === 'approve'
          ? 'Approved and executed live in your workspace.'
          : 'Action rejected. No workspace record was changed.',
      );
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePermissions(patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/agent/permissions', 'PUT', patch);
      setNotice('Agent permissions saved.');
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRoutine(payload?: {
    name: string;
    description: string;
    schedule_label: string;
    prompt: string;
    tool_name: string;
    execution_mode: 'approval_required' | 'autonomous';
  }) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/agent/routines', 'POST', {
        name: payload?.name || routineName,
        description: payload?.description || 'Scheduled autonomous routine',
        trigger_type: 'schedule',
        schedule_label: payload?.schedule_label || routineSchedule,
        prompt: payload?.prompt || routinePrompt,
        tool_name: payload?.tool_name || routineTool,
        execution_mode: payload?.execution_mode || routineMode,
        enabled: true,
      });
      if (!payload) {
        setRoutineName('');
        setRoutinePrompt('');
      }
      setNotice('Autonomous routine saved.');
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runRoutineNow(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api(
        `/agent/routines/${id}/run`,
        'POST',
        {},
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      if (res?.run?.id) setSelectedRunId(res.run.id);
      setSubTab('command');
      setNotice('Routine triggered live.');
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateBilling(patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/agent/billing', 'PUT', patch);
      setNotice('Separate Agent Billing updated.');
      await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const resolvedKind: 'business' | 'personal' | 'developer' =
    overview?.workspace_kind || workspaceKind;
  const billing = overview?.billing;
  const boundary = overview?.boundary;
  const policy = overview?.policy;
  const runs: any[] = overview?.runs || [];
  const pendingApprovals: any[] = (overview?.approvals || []).filter(
    (item: any) => item.status === 'pending',
  );
  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0] || null;
  const quickPrompts = QUICK_PROMPTS[resolvedKind] || QUICK_PROMPTS.business;
  const routinePresets = ROUTINE_PRESETS[resolvedKind] || ROUTINE_PRESETS.business;

  return (
    <section className="agent-studio" aria-label="AfriCore Autonomous Agent Studio">
      <header className="agent-studio-header">
        <div className="agent-studio-title">
          <span className="eyebrow">PYTHON AUTONOMOUS AGENT · TOWNIE-INSPIRED</span>
          <h2>AfriCore Agent</h2>
          <p>
            Executes real workspace operations—scheduling meetings, setting up projects, managing
            CRM leads, preparing draft invoices, running analyses, and executing recurring routines
            with owner guardrails and live Computer Use visibility.
          </p>
        </div>
        <div className="agent-header-badges">
          <span className={`agent-shield-badge agent-shield-${resolvedKind}`}>
            <Icon name="shield" width={15} height={15} />
            {boundary?.isolation_label ||
              (resolvedKind === 'business'
                ? 'Business Sandboxed'
                : 'Personal + Dev Scope · Business Blocked')}
          </span>
          {billing && (
            <button
              type="button"
              className="agent-credits-pill"
              onClick={() => setSubTab('billing')}
              title="Open separate Agent Billing"
            >
              <Icon name="bolt" width={14} height={14} />
              {billing.credits_remaining} / {billing.total_credits_pool} Agent Credits
            </button>
          )}
        </div>
      </header>

      <nav className="agent-subnav" role="tablist" aria-label="Agent workspace sections">
        {(
          [
            ['command', 'Command & Computer Use', pendingApprovals.length],
            ['routines', 'Routines', overview?.routines?.length || 0],
            ['permissions', 'Permissions & Sandbox', 0],
            ['billing', 'Agent Billing (Separate)', 0],
            ['memory', 'Workspace Memory', overview?.memory?.length || 0],
          ] as [StudioTab, string, number][]
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subTab === id}
            onClick={() => setSubTab(id)}
          >
            {label}
            {count > 0 && <span className="agent-count-pill">{count}</span>}
          </button>
        ))}
      </nav>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert one-time" role="status">
          {notice}
        </div>
      )}

      {!overview && !error && (
        <div className="skeleton" role="status">
          Initializing autonomous agent workspace…
        </div>
      )}

      {overview && subTab === 'command' && (
        <div className="agent-grid-2">
          <div className="agent-card">
            <h3>Instruct AfriCore Agent</h3>
            <p className="agent-card-muted">
              Tell the agent what to execute. Write operations follow your owner permission matrix
              (ask approval vs. autonomous).
            </p>
            <div className="agent-quick-chips">
              {quickPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="agent-quick-chip"
                  disabled={busy}
                  onClick={() => void runInstruction(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <form
              className="agent-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void runInstruction();
              }}
            >
              <label className="field">
                <span>Instruction or business task</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Schedule a sales review meeting tomorrow, create a Q4 Launch project, or analyze my overdue invoices…"
                  disabled={busy}
                  minLength={2}
                  maxLength={2000}
                />
              </label>
              <div className="agent-composer-row">
                <label className="agent-toggle-label">
                  <input
                    type="checkbox"
                    checked={driveLive}
                    onChange={(e) => setDriveLive(e.target.checked)}
                  />
                  Show live Computer Use in workspace
                </label>
                <button className="button" disabled={busy || prompt.trim().length < 2}>
                  {busy ? 'Agent working…' : 'Run autonomously'}
                </button>
              </div>
            </form>

            {pendingApprovals.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                <h3>Pending Approvals ({pendingApprovals.length})</h3>
                {pendingApprovals.map((item: any) => (
                  <article key={item.id} className="agent-approval-card">
                    <div className="agent-run-top">
                      <strong>{item.action_summary}</strong>
                      <span className="agent-status-chip agent-status-pending">
                        Approval required
                      </span>
                    </div>
                    <p className="agent-card-muted">
                      Tool: <code>{item.tool_name}</code> · Target workspace:{' '}
                      <code>{item.target_workspace_id.slice(0, 8)}</code>
                    </p>
                    <div className="agent-approval-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => void decideApproval(item.id, 'approve')}
                      >
                        Approve & Execute Live
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void decideApproval(item.id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              <h3>Recent Autonomous Runs ({runs.length})</h3>
              {!runs.length && (
                <p className="agent-card-muted">
                  No runs yet. Tap a quick action above or type any instruction.
                </p>
              )}
              {runs.slice(0, 10).map((run: any) => (
                <article key={run.id} className="agent-run-card">
                  <div className="agent-run-top">
                    <span>
                      <code>{run.tool_name}</code> · {run.credits_used} cr ·{' '}
                      {new Date(run.created_at).toLocaleTimeString()}
                    </span>
                    <span className={`agent-status-chip agent-status-${run.status}`}>
                      {run.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="agent-run-prompt">{run.prompt}</p>
                  <p className="agent-run-summary">{run.summary}</p>
                  <div className="agent-approval-actions">
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      Watch Computer Use ({run.steps?.length || 0} steps)
                    </button>
                    {run.result?.destination && onOpenDestination && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onOpenDestination(run.result.destination)}
                      >
                        Open {run.result.destination.tab} <Icon name="right" width={14} height={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {selectedRun ? (
              <ComputerUseStage
                workspaceId={workspaceId || overview.boundary?.source_workspace_id || ''}
                steps={selectedRun.steps || []}
                status={selectedRun.status}
                destination={selectedRun.result?.destination}
                driveLive={driveLive}
                onOpenDestination={onOpenDestination}
              />
            ) : (
              <section className="agent-card">
                <h3>Live Computer Use Stage</h3>
                <p className="agent-card-muted">
                  When you run an instruction, you will watch every navigation, form input, and
                  verification step live right here—and optionally watch the agent navigate your
                  workspace in real time.
                </p>
              </section>
            )}

            <section className="agent-card">
              <h3>Workspace Isolation Guarantee</h3>
              <p className="agent-card-muted">{boundary?.sandbox_policy}</p>
              <div className="agent-boundary-box">
                <h4>Authorized Targets</h4>
                <ul>
                  {(boundary?.linked_workspaces || []).map((w: any) => (
                    <li key={w.id}>
                      <strong>{w.name}</strong> ({w.kind}) —{' '}
                      {w.relation === 'current' ? 'Active workspace' : 'Personal ↔ Dev bridge'}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="agent-boundary-box">
                <h4>Hard-Blocked by Server</h4>
                <ul>
                  {(boundary?.blocked_kinds || []).map((blocked: string) => (
                    <li key={blocked}>{blocked.replaceAll('_', ' ')} workspaces (HTTP 403)</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      )}

      {overview && subTab === 'routines' && (
        <div className="agent-grid-2">
          <section className="agent-card">
            <h3>Active Routines ({overview.routines?.length || 0})</h3>
            <p className="agent-card-muted">
              Inspired by Townie routines: repeatable schedules and briefings your agent prepares
              automatically within your workspace boundaries.
            </p>
            {!overview.routines?.length && (
              <p className="agent-card-muted">
                No routines yet. Install a recommended template or create your own.
              </p>
            )}
            {(overview.routines || []).map((r: any) => (
              <article key={r.id} className="agent-run-card">
                <div className="agent-run-top">
                  <strong>{r.name}</strong>
                  <span className="agent-status-chip">
                    {r.enabled ? 'Active' : 'Paused'} · {r.execution_mode.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="agent-card-muted">
                  {r.schedule_label} · Tool: <code>{r.tool_name}</code>
                </p>
                <p className="agent-run-summary">{r.prompt}</p>
                {r.last_run_at && (
                  <p className="agent-card-muted">
                    Last run: {new Date(r.last_run_at).toLocaleString()} ({r.last_status})
                  </p>
                )}
                <div className="agent-approval-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void runRoutineNow(r.id)}
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={async () => {
                      await api(`/agent/routines/${r.id}`, 'PATCH', { enabled: !r.enabled });
                      await loadOverview();
                    }}
                  >
                    {r.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={async () => {
                      await api(`/agent/routines/${r.id}`, 'DELETE', {});
                      await loadOverview();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>

          <div style={{ display: 'grid', gap: 14 }}>
            <section className="agent-card">
              <h3>Recommended Templates</h3>
              {routinePresets.map((preset) => (
                <div key={preset.name} className="agent-run-card">
                  <strong>{preset.name}</strong>
                  <p className="agent-card-muted">{preset.description}</p>
                  <p className="agent-card-muted">{preset.schedule_label}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void saveRoutine({
                        ...preset,
                        execution_mode: 'autonomous',
                      })
                    }
                  >
                    Add routine
                  </button>
                </div>
              ))}
            </section>

            <form
              className="agent-card"
              onSubmit={(e) => {
                e.preventDefault();
                void saveRoutine();
              }}
            >
              <h3>Create Custom Routine</h3>
              <label className="field">
                <span>Routine name</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  placeholder="e.g. Friday Receivables Check"
                />
              </label>
              <label className="field">
                <span>Schedule</span>
                <input
                  required
                  value={routineSchedule}
                  onChange={(e) => setRoutineSchedule(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Capability</span>
                <select value={routineTool} onChange={(e) => setRoutineTool(e.target.value)}>
                  {(overview.tools || []).map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Execution guardrail</span>
                <select
                  value={routineMode}
                  onChange={(e) => setRoutineMode(e.target.value as any)}
                >
                  <option value="approval_required">Ask approval before executing</option>
                  <option value="autonomous">Run autonomously</option>
                </select>
              </label>
              <label className="field">
                <span>Instruction</span>
                <textarea
                  required
                  minLength={3}
                  value={routinePrompt}
                  onChange={(e) => setRoutinePrompt(e.target.value)}
                  placeholder="Describe what the agent should do each run…"
                />
              </label>
              <button className="button" disabled={busy || routineName.trim().length < 2}>
                Save routine
              </button>
            </form>
          </div>
        </div>
      )}

      {overview && subTab === 'permissions' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="agent-card">
            <h3>Workspace Sandboxing & Autonomy Policy</h3>
            <p className="agent-card-muted">{boundary?.sandbox_policy}</p>
            <div className="agent-boundary-grid">
              <div className="agent-boundary-box">
                <h4>Global Autonomy Mode</h4>
                <select
                  disabled={!overview.can_manage_policy || busy}
                  value={policy?.autonomy_mode || 'supervised'}
                  onChange={(e) => void updatePermissions({ autonomy_mode: e.target.value })}
                >
                  <option value="read_only">Read-Only (Analysis only, writes blocked)</option>
                  <option value="supervised">
                    Supervised (Restraint-first — follow per-tool permissions)
                  </option>
                  <option value="autonomous">
                    Full Workspace Autonomy (Execute permitted tools without pausing)
                  </option>
                </select>
              </div>
              <div className="agent-boundary-box">
                <h4>Computer Use & Workspace Bridge</h4>
                <label className="agent-toggle-label">
                  <input
                    type="checkbox"
                    disabled={!overview.can_manage_policy || busy}
                    checked={!!policy?.computer_use_enabled}
                    onChange={(e) =>
                      void updatePermissions({ computer_use_enabled: e.target.checked })
                    }
                  />
                  Enable Live Computer Use visibility
                </label>
                {resolvedKind === 'business' ? (
                  <p className="agent-card-muted" style={{ marginTop: 8 }}>
                    Cross-workspace bridge is <strong>permanently disabled</strong> for Business
                    workspaces.
                  </p>
                ) : (
                  <label className="agent-toggle-label" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      disabled={!overview.can_manage_policy || busy}
                      checked={!!policy?.cross_dev_bridge_enabled}
                      onChange={(e) =>
                        void updatePermissions({ cross_dev_bridge_enabled: e.target.checked })
                      }
                    />
                    Allow Personal ↔ Developer bridge (Business stays blocked)
                  </label>
                )}
              </div>
            </div>
          </section>

          <section className="agent-card">
            <h3>Owner Capability Permission Matrix</h3>
            <p className="agent-card-muted">
              {overview.can_manage_policy
                ? 'Choose which actions this agent can run autonomously, ask approval for, or never touch inside this workspace.'
                : 'Only a workspace owner or administrator can change agent permissions.'}
            </p>
            <div>
              {(overview.tools || []).map((tool: any) => (
                <div key={tool.id} className="agent-permission-row">
                  <div>
                    <strong>{tool.name}</strong>{' '}
                    <span className="agent-status-chip">
                      {tool.access_kind} · {tool.credit_cost} cr
                    </span>
                    <p className="agent-card-muted">{tool.description}</p>
                  </div>
                  <select
                    aria-label={`Permission for ${tool.name}`}
                    disabled={!overview.can_manage_policy || busy}
                    value={tool.permission}
                    onChange={(e) =>
                      void updatePermissions({
                        permissions: { [tool.id]: e.target.value },
                      })
                    }
                  >
                    <option value="disabled">Disabled</option>
                    <option value="approval_required">Ask Approval</option>
                    <option value="autonomous">Autonomous</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {overview && subTab === 'billing' && billing && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="agent-card">
            <div className="agent-run-top">
              <div>
                <span className="eyebrow">SEPARATE BILLING STREAM · EXCLUDED FROM ALL-APPS CAP</span>
                <h3>Agent Credit Wallet ({billing.period})</h3>
              </div>
              <span className="agent-credits-pill">
                Estimated: {formatAgentMoney(billing.total_estimated_minor, billing.currency)} · Due:
                KSh 0.00 (Evaluation)
              </span>
            </div>
            <p className="agent-card-muted">{billing.policy_note}</p>

            <div className="agent-meter-bar" role="progressbar" aria-valuenow={billing.credits_used} aria-valuemax={billing.total_credits_pool}>
              <div
                className="agent-meter-fill"
                style={{
                  width: `${Math.min(100, Math.round((billing.credits_used / Math.max(1, billing.total_credits_pool)) * 100))}%`,
                }}
              />
            </div>
            <div className="agent-run-top">
              <span>
                Used: <strong>{billing.credits_used} credits</strong> · Remaining:{' '}
                <strong>{billing.credits_remaining} credits</strong> (Pool: {billing.included_credits}{' '}
                plan + {billing.bonus_credits} bonus)
              </span>
              <span>
                Overage: {billing.overage_credits} cr @{' '}
                {formatAgentMoney(billing.overage_unit_minor, billing.currency)}/cr
              </span>
            </div>

            <div className="agent-plan-grid">
              {(billing.available_plans || []).map((plan: any) => {
                const active = billing.plan?.id === plan.id;
                return (
                  <article
                    key={plan.id}
                    className={active ? 'agent-plan-card agent-plan-active' : 'agent-plan-card'}
                  >
                    <strong>{plan.name}</strong>
                    <div>
                      <strong>{formatAgentMoney(plan.monthly_minor, plan.currency)}</strong> / month
                    </div>
                    <p className="agent-card-muted">{plan.summary}</p>
                    <button
                      type="button"
                      className={active ? 'secondary-button' : 'button'}
                      disabled={active || !overview.can_manage_policy || busy}
                      onClick={() => void updateBilling({ plan_tier: plan.id })}
                    >
                      {active ? 'Current Agent Plan' : `Switch to ${plan.name}`}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="agent-boundary-grid">
              <form
                className="agent-boundary-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  const minor = capInput.trim() === '' ? null : Math.round(Number(capInput) * 100);
                  void updateBilling({ monthly_spend_cap_minor: minor });
                }}
              >
                <h4>Monthly Agent Spend Cap (KES)</h4>
                <div className="agent-composer-row">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={capInput}
                    disabled={!overview.can_manage_policy || busy}
                    onChange={(e) => setCapInput(e.target.value)}
                    placeholder="No cap"
                  />
                  <button
                    className="secondary-button"
                    disabled={!overview.can_manage_policy || busy}
                  >
                    Save cap
                  </button>
                </div>
                <label className="agent-toggle-label" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!billing.hard_stop}
                    disabled={!overview.can_manage_policy || busy}
                    onChange={(e) => void updateBilling({ hard_stop: e.target.checked })}
                  />
                  Hard-stop agent runs if monthly cap is reached
                </label>
              </form>

              <div className="agent-boundary-box">
                <h4>Credit Cost Schedule</h4>
                <ul>
                  <li>Analysis / Read briefing: 1 credit</li>
                  <li>Scheduled Routine run: 2 credits</li>
                  <li>Autonomous Tool Action: 3 credits</li>
                  <li>Live Computer Use workflow: 5 credits</li>
                </ul>
                {overview.environment === 'sandbox' && overview.can_manage_policy && (
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ marginTop: 8 }}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api('/agent/billing/credits', 'POST', {
                          credits: 100,
                          reason: 'Sandbox evaluation credit top-up',
                        });
                        setNotice('Added +100 sandbox evaluation Agent Credits.');
                        await loadOverview();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    + Add 100 Sandbox Evaluation Credits
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="agent-card">
            <h3>Separate Agent Credit Ledger</h3>
            {billing.ledger?.length ? (
              <DataTable>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Credits</th>
                    <th>Overage Est.</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.ledger.map((row: any) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.entry_type}</td>
                      <td>
                        <code>{row.credits_delta > 0 ? `+${row.credits_delta}` : row.credits_delta}</code>
                      </td>
                      <td>{formatAgentMoney(row.estimated_minor, row.currency)}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <p className="agent-card-muted">No agent credit transactions recorded this period yet.</p>
            )}
          </section>
        </div>
      )}

      {overview && subTab === 'memory' && (
        <div className="agent-grid-2">
          <section className="agent-card">
            <h3>Workspace Memory ({overview.memory?.length || 0})</h3>
            <p className="agent-card-muted">
              Saved context stays strictly inside this workspace boundary. It never leaks across
              Business, Personal, or Developer boundaries.
            </p>
            {!overview.memory?.length && (
              <p className="agent-card-muted">No saved workspace preferences yet.</p>
            )}
            {(overview.memory || []).map((item: any) => (
              <div key={item.id} className="agent-run-card">
                <div className="agent-run-top">
                  <span className="agent-status-chip">{item.category.replaceAll('_', ' ')}</span>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={async () => {
                      await api(`/agent/memory/${item.id}`, 'DELETE', {});
                      await loadOverview();
                    }}
                  >
                    Remove
                  </button>
                </div>
                <p className="agent-run-summary">{item.content}</p>
              </div>
            ))}
          </section>

          <form
            className="agent-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (memoryText.trim().length < 3 || busy) return;
              setBusy(true);
              try {
                await api('/agent/memory', 'POST', {
                  category: memoryCategory,
                  content: memoryText.trim(),
                });
                setMemoryText('');
                setNotice('Workspace memory saved.');
                await loadOverview();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Teach Your Agent</h3>
            <label className="field">
              <span>Category</span>
              <select
                value={memoryCategory}
                onChange={(e) => setMemoryCategory(e.target.value as any)}
              >
                <option value="business_context">Workspace context</option>
                <option value="workflow_rule">Workflow rule</option>
                <option value="preference">Preference</option>
                <option value="tone">Communication tone</option>
              </select>
            </label>
            <label className="field">
              <span>Memory note</span>
              <textarea
                required
                minLength={3}
                maxLength={800}
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                placeholder="e.g. Always schedule client calls in EAT mornings between 9am and 11am."
              />
            </label>
            <button className="button" disabled={busy || memoryText.trim().length < 3}>
              Save memory
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
