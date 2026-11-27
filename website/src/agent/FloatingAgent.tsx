import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SandboxCloneStage } from './SandboxCloneStage';
import {
  dispatchAgentWorkspaceCommitted,
  type AgentDestination,
  type ComputerUseStep,
  type SandboxCloneBlueprint,
} from './computer-use';
import type { API } from '../operations/UI';
import './agent.css';

const FLOAT_PROMPTS: Record<'business' | 'personal' | 'developer', { label: string; prompt: string }[]> = {
  business: [
    {
      label: 'Growth & sales diagnosis',
      prompt: 'How is our business faring and how can we improve sales and win more customers?',
    },
    { label: 'Schedule meeting', prompt: 'Schedule a meeting tomorrow' },
    {
      label: 'Q4 Launch project',
      prompt: 'Set up a Q4 Launch project and schedule kickoff meeting',
    },
    { label: 'Log CRM lead', prompt: 'Create a CRM lead for Savannah Retail KES 65000' },
  ],
  personal: [
    { label: 'Savings & budget check', prompt: 'Analyze my personal finances & savings rate' },
    { label: 'Schedule check-in', prompt: 'Schedule a Personal Budget Review tomorrow at 9am' },
    { label: 'Dev API health', prompt: 'Check my linked Developer workspace API health' },
    { label: 'Log expense', prompt: 'Record an expense of KES 2500 for groceries' },
  ],
  developer: [
    { label: 'API & webhook audit', prompt: 'Diagnose my sandbox API logs & error rate' },
    { label: 'New sandbox app', prompt: 'Create a sandbox developer app called Checkout Sync' },
    { label: 'Personal summary', prompt: 'Inspect my linked Personal workspace summary' },
  ],
};

function renderCompactAgentMarkdown(text: string) {
  return text.split('\n').map((line, idx) => {
    if (!line.trim()) return <div key={idx} style={{ height: 4 }} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={idx}>
        {parts.map((p, pIdx) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={pIdx}>{p.slice(2, -2)}</strong>
          ) : (
            <span key={pIdx}>{p}</span>
          ),
        )}
      </div>
    );
  });
}

export function FloatingAgent({
  api,
  workspaceId,
  workspaceKind,
  currency = 'KES',
  onOpenFullStudio,
  onNavigateDestination,
}: {
  api: API;
  workspaceId: string;
  workspaceKind: 'business' | 'personal' | 'developer';
  currency?: string;
  onOpenFullStudio: () => void;
  onNavigateDestination: (dest: AgentDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const [minimizedForSandbox, setMinimizedForSandbox] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [sandboxRun, setSandboxRun] = useState<{
    runId: string;
    approvalId: string | null;
    actionSummary: string;
    status: string;
    blueprint: SandboxCloneBlueprint;
    steps: ComputerUseStep[];
    destination?: AgentDestination;
  } | null>(null);
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [sandboxWidth, setSandboxWidth] = useState<number>(480);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const closeAllSandbox = useCallback(() => {
    setSandboxRun(null);
    setMinimizedForSandbox(false);
    setEditedParams({});
  }, []);

  useEffect(() => {
    closeAllSandbox();
  }, [workspaceId, workspaceKind, closeAllSandbox]);

  async function refresh() {
    if (!workspaceId) return;
    try {
      const data = await api('/agent/overview');
      setOverview(data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open, workspaceId, workspaceKind]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(116, Math.max(38, el.scrollHeight))}px`;
  }, [prompt, open]);

  async function submitPrompt(text?: string) {
    const clean = (text ?? prompt).trim();
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      const run = await api(
        '/agent/runs',
        'POST',
        {
          prompt: clean,
          currency,
          computer_use: true,
          stage_in_sandbox: true,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setPrompt('');
      await refresh();

      const clone: SandboxCloneBlueprint | undefined = run?.result?.sandbox_clone;
      if (clone && run.status === 'awaiting_approval') {
        setEditedParams({});
        setOpen(false);
        setMinimizedForSandbox(true);
        setSandboxRun({
          runId: run.id,
          approvalId: run.result?.approval_id || null,
          actionSummary: run.summary || clean,
          status: run.status,
          blueprint: clone,
          steps: run.steps || [],
          destination: run.result?.destination,
        });
      } else {
        setOpen(true);
        if (run?.status === 'needs_input') {
          window.setTimeout(() => textareaRef.current?.focus(), 40);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const hasEdits = Object.keys(editedParams).length > 0;
      const res = await api(`/agent/approvals/${approvalId}/decide`, 'POST', {
        decision,
        note: '',
        ...(decision === 'approve' && hasEdits ? { edited_params: editedParams } : {}),
      });
      await refresh();

      if (decision === 'approve') {
        const dest: AgentDestination | undefined =
          res?.run?.result?.destination || sandboxRun?.destination;
        closeAllSandbox();
        if (dest) {
          onNavigateDestination(dest);
        }
        dispatchAgentWorkspaceCommitted({
          workspaceId,
          destination: dest,
          recordId: res?.run?.result?.record_id || null,
        });
      } else {
        closeAllSandbox();
      }
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  const noopDone = useCallback(() => {}, []);

  const pendingApprovals: any[] = (overview?.approvals || []).filter(
    (item: any) => item.status === 'pending',
  );
  const runs: any[] = overview?.runs || [];
  const activeClarificationRun = runs.find((r) => r.status === 'needs_input');
  const creditsRemaining = overview?.billing?.credits_remaining;
  const agentHandle = overview?.policy?.agent_handle;
  const isolationLabel =
    overview?.boundary?.isolation_label ||
    (workspaceKind === 'business'
      ? 'Business Sandboxed'
      : 'Personal + Dev · Business Blocked');

  return (
    <>
      {sandboxRun && (
        <SandboxCloneStage
          blueprint={sandboxRun.blueprint}
          steps={sandboxRun.steps}
          status={sandboxRun.status}
          editedParams={editedParams}
          onChangeParam={(key, val) => setEditedParams((prev) => ({ ...prev, [key]: val }))}
          onPlaybackDone={noopDone}
          onDismiss={closeAllSandbox}
          widthPx={sandboxWidth}
          onWidthChange={setSandboxWidth}
          approvalId={sandboxRun.approvalId}
          busy={busy}
          error={error}
          onApprove={
            sandboxRun.approvalId ? () => void decide(sandboxRun.approvalId!, 'approve') : undefined
          }
          onReject={
            sandboxRun.approvalId ? () => void decide(sandboxRun.approvalId!, 'reject') : undefined
          }
          onOpenChat={() => {
            setOpen(true);
            setMinimizedForSandbox(false);
          }}
        />
      )}

      {open && (
        <aside
          className="agent-float-window"
          role="dialog"
          aria-modal="false"
          aria-labelledby="floating-agent-title"
        >
          <header className="agent-float-header">
            <div className="agent-float-header-title">
              <div className="agent-float-title-row">
                <span className="agent-float-pulse" aria-hidden="true" />
                <strong id="floating-agent-title">
                  {overview?.policy?.agent_display_name || 'AfriCore Agent'}
                </strong>
                {agentHandle && <code className="agent-float-handle">@{agentHandle}</code>}
              </div>
              <span>
                {isolationLabel}
                {typeof creditsRemaining === 'number' ? ` · ${creditsRemaining} cr` : ''}
              </span>
            </div>
            <div className="agent-float-header-actions">
              <button
                type="button"
                className="agent-float-icon-btn"
                title="Open Full Agent Studio"
                aria-label="Open Full Agent Studio"
                onClick={() => {
                  setOpen(false);
                  closeAllSandbox();
                  onOpenFullStudio();
                }}
              >
                <Icon name="external" width={14} height={14} />
              </button>
              <button
                type="button"
                className="agent-float-icon-btn"
                title="Close Agent Window"
                aria-label="Close Agent Window"
                onClick={() => {
                  setOpen(false);
                  if (!sandboxRun?.approvalId) {
                    closeAllSandbox();
                  }
                }}
              >
                <Icon name="close" width={14} height={14} />
              </button>
            </div>
          </header>

          <div className="agent-float-body">
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}

            <div className="agent-quick-chips" aria-label="Quick agent actions">
              {(FLOAT_PROMPTS[workspaceKind] || FLOAT_PROMPTS.business).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="agent-quick-chip"
                  disabled={busy}
                  onClick={() => void submitPrompt(item.prompt)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {pendingApprovals.map((item: any) => (
              <article key={item.id} className="agent-approval-card">
                <div className="agent-run-top">
                  <strong>{item.action_summary}</strong>
                  <span className="agent-status-chip agent-status-pending">Staged</span>
                </div>
                <div className="agent-approval-actions">
                  {item.payload?.sandbox_clone && !sandboxRun && (
                    <button
                      type="button"
                      className="secondary-button agent-cu-btn"
                      disabled={busy}
                      onClick={() => {
                        setOpen(false);
                        setMinimizedForSandbox(true);
                        setSandboxRun({
                          runId: item.run_id,
                          approvalId: item.id,
                          actionSummary: item.action_summary,
                          status: 'awaiting_approval',
                          blueprint: item.payload.sandbox_clone,
                          steps: [],
                        });
                      }}
                    >
                      Open Sandbox
                    </button>
                  )}
                  <button
                    type="button"
                    className="button agent-cu-btn"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="secondary-button agent-cu-btn"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'reject')}
                  >
                    Discard
                  </button>
                </div>
              </article>
            ))}

            {runs.slice(0, 5).map((run: any) => (
              <article
                key={run.id}
                className={
                  run.status === 'needs_input'
                    ? 'agent-run-card agent-run-clarify'
                    : 'agent-run-card'
                }
              >
                <div className="agent-run-top">
                  <span>
                    <code>{run.tool_name}</code>
                    {run.credits_used > 0 ? ` · ${run.credits_used} cr` : ' · Clarifying'}
                  </span>
                  <span className={`agent-status-chip agent-status-${run.status}`}>
                    {run.status === 'needs_input'
                      ? 'Needs details'
                      : String(run.status).replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="agent-run-prompt">{run.prompt}</p>
                <div className="agent-run-summary">{renderCompactAgentMarkdown(run.summary || '')}</div>
                {Array.isArray(run.result?.data?.recommended_actions) &&
                  run.result.data.recommended_actions.length > 0 && (
                    <div className="agent-followup-chips">
                      {run.result.data.recommended_actions.map((act: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          className="agent-followup-btn"
                          disabled={busy}
                          onClick={() => void submitPrompt(act.action_prompt)}
                        >
                          <Icon name="bolt" width={12} height={12} />
                          <span>{act.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </article>
            ))}
          </div>

          <footer className="agent-float-footer">
            <form
              className="agent-composer-shell"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPrompt();
              }}
            >
              <textarea
                ref={textareaRef}
                className="agent-chat-textarea"
                aria-label="Tell AfriCore Agent what to do"
                placeholder={
                  activeClarificationRun
                    ? 'Reply with the topic, title, or preferred time…'
                    : 'Ask a strategic question or tell your agent what to execute…'
                }
                value={prompt}
                rows={1}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitPrompt();
                  }
                }}
                disabled={busy}
              />
              <div className="agent-composer-bar">
                <span className="agent-composer-hint">
                  {activeClarificationRun
                    ? 'Replying to agent question · Auto-crafts title & agenda'
                    : 'Enter to send · Stages writes in Sandbox Clone'}
                </span>
                <button
                  type="submit"
                  className="button agent-send-btn"
                  disabled={busy || prompt.trim().length < 2}
                >
                  <Icon name="bolt" width={13} height={13} />
                  <span>{busy ? '…' : 'Send'}</span>
                </button>
              </div>
            </form>
          </footer>
        </aside>
      )}

      {!minimizedForSandbox || !sandboxRun ? (
        <button
          type="button"
          className={open ? 'agent-float-launcher is-open' : 'agent-float-launcher'}
          aria-expanded={open}
          aria-label={open ? 'Close AfriCore Autonomous Agent' : 'Open AfriCore Autonomous Agent'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="agent-launcher-orb" aria-hidden="true">
            <Icon name="bolt" width={14} height={14} />
          </span>
          <span className="agent-launcher-label">Agent</span>
          {pendingApprovals.length > 0 && (
            <span className="agent-float-badge">{pendingApprovals.length}</span>
          )}
        </button>
      ) : null}
    </>
  );
}
