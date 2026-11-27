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

const FLOAT_PROMPTS: Record<'business' | 'personal' | 'developer', string[]> = {
  business: [
    'Analyze my business operations & priorities',
    'Schedule a meeting for Client Review tomorrow at 10am',
    'Set up a Q4 Launch project and schedule kickoff meeting',
    'Create a CRM lead for Savannah Retail KES 65000',
  ],
  personal: [
    'Analyze my personal finances & savings rate',
    'Schedule a Personal Budget Review tomorrow at 9am',
    'Check my linked Developer workspace API health',
    'Record an expense of KES 2500 for groceries',
  ],
  developer: [
    'Diagnose my sandbox API logs & error rate',
    'Create a sandbox developer app called Checkout Sync',
    'Inspect my linked Personal workspace summary',
  ],
};

/**
 * Persistent Floating Agent + Resizable Split-Screen Sandbox Clone Orchestrator.
 *
 * Choreography:
 * 1. User types or taps a task in the Floating Agent window.
 * 2. When Computer Use opens a Sandbox Clone (write / compound task):
 *    - Right-side resizable Green Sandbox Clone opens with a live clone of the target page
 *      (Calendar, Work, CRM, Invoices, Expenses, etc.).
 *    - Floating chat window minimizes down out of the way while the agent populates the clone.
 *    - When staging finishes, the bottom Approval Dock rises up with "Approve & Send to Workspace"
 *      and "Discard Sandbox".
 * 3. On Approve: commits to canonical backend, closes the sandbox cleanly, navigates & refreshes
 *    the live workspace so the newly created record renders immediately!
 * 4. Closing or dismissing ALWAYS tears down the sandbox cleanly (zero stuck green screen).
 */
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
  const [approvalDockReady, setApprovalDockReady] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Active Sandbox Clone state (mounted as flex/grid sibling inside workspace shell ONLY while active)
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
  const [sandboxWidth, setSandboxWidth] = useState<number>(500);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const closeAllSandbox = useCallback(() => {
    setSandboxRun(null);
    setMinimizedForSandbox(false);
    setApprovalDockReady(false);
    setEditedParams({});
  }, []);

  // Reset sandbox cleanly when switching workspaces
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

  // Auto-grow textarea fallback for browsers without CSS field-sizing: content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(148, Math.max(52, el.scrollHeight))}px`;
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
        // Choreographed Computer Use takeover:
        // 1. Open resizable right-side Sandbox Clone of target page
        // 2. Dismiss/minimize chat window down while agent populates sandbox
        // 3. Rise up approval dock once playback finishes!
        setEditedParams({});
        setApprovalDockReady(false);
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

  const handlePlaybackDone = useCallback(() => {
    setApprovalDockReady(true);
  }, []);

  const pendingApprovals: any[] = (overview?.approvals || []).filter(
    (item: any) => item.status === 'pending',
  );
  const creditsRemaining = overview?.billing?.credits_remaining;
  const isolationLabel =
    overview?.boundary?.isolation_label ||
    (workspaceKind === 'business'
      ? 'Business Sandboxed'
      : 'Personal + Dev Bridge · Business Blocked');

  return (
    <>
      {sandboxRun && (
        <SandboxCloneStage
          blueprint={sandboxRun.blueprint}
          steps={sandboxRun.steps}
          status={sandboxRun.status}
          editedParams={editedParams}
          onChangeParam={(key, val) =>
            setEditedParams((prev) => ({ ...prev, [key]: val }))
          }
          onPlaybackDone={handlePlaybackDone}
          onDismiss={closeAllSandbox}
          widthPx={sandboxWidth}
          onWidthChange={setSandboxWidth}
        />
      )}

      {/* Choreographed Rising Bottom Approval Dock when Sandbox Clone finishes staging */}
      {sandboxRun && sandboxRun.approvalId && (
        <section
          className={
            approvalDockReady
              ? 'agent-approval-dock is-risen'
              : 'agent-approval-dock is-working'
          }
          role="region"
          aria-label="Sandbox Approval Controls"
        >
          {!approvalDockReady ? (
            <div className="agent-approval-dock-working">
              <span className="agent-sandbox-live-dot" aria-hidden="true" />
              <span>
                Agent is staging <strong>{sandboxRun.blueprint.page_title}</strong> in the isolated
                sandbox…
              </span>
              <button
                type="button"
                className="quiet-button agent-cu-btn"
                onClick={() => setApprovalDockReady(true)}
              >
                Skip animation
              </button>
            </div>
          ) : (
            <div className="agent-approval-dock-ready">
              <div className="agent-approval-dock-copy">
                <span className="agent-dock-kicker">SANDBOX READY · REVIEW &amp; APPROVE</span>
                <strong>
                  Send staged changes to live {sandboxRun.blueprint.page_title}?
                </strong>
                <p>
                  Once approved, this record is saved to your live workspace and visible to
                  authorized members.
                </p>
              </div>
              {error && (
                <div className="alert error" role="alert">
                  {error}
                </div>
              )}
              <div className="agent-approval-dock-buttons">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void decide(sandboxRun.approvalId!, 'approve')}
                >
                  <Icon name="check" width={16} height={16} />
                  {busy ? 'Sending to workspace…' : sandboxRun.blueprint.primary_cta}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void decide(sandboxRun.approvalId!, 'reject')}
                >
                  Discard sandbox
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => {
                    setOpen(true);
                    setMinimizedForSandbox(false);
                  }}
                >
                  Open chat
                </button>
              </div>
            </div>
          )}
        </section>
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
              <strong id="floating-agent-title">AfriCore Autonomous Agent</strong>
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
                <Icon name="external" width={16} height={16} />
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
                <Icon name="close" width={16} height={16} />
              </button>
            </div>
          </header>

          <div className="agent-float-body">
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}

            <div className="agent-quick-chips">
              {(FLOAT_PROMPTS[workspaceKind] || FLOAT_PROMPTS.business).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="agent-quick-chip"
                  disabled={busy}
                  onClick={() => void submitPrompt(chip)}
                >
                  {chip}
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
                        setApprovalDockReady(true);
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
                      Inspect Sandbox Clone
                    </button>
                  )}
                  <button
                    type="button"
                    className="button agent-cu-btn"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'approve')}
                  >
                    Approve &amp; Send
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

            {(overview?.runs || []).slice(0, 4).map((run: any) => (
              <article key={run.id} className="agent-run-card">
                <div className="agent-run-top">
                  <span>
                    <code>{run.tool_name}</code> · {run.credits_used} cr
                  </span>
                  <span className={`agent-status-chip agent-status-${run.status}`}>
                    {String(run.status).replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="agent-run-prompt">{run.prompt}</p>
                <p className="agent-run-summary">{run.summary}</p>
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
                          <Icon name="bolt" width={13} height={13} />
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
                placeholder="Ask your agent to schedule a meeting, set up a project, draft an invoice, or diagnose operations…"
                value={prompt}
                rows={2}
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
                  Enter to run · Opens sandbox clone before changes
                </span>
                <button
                  type="submit"
                  className="button agent-send-btn"
                  disabled={busy || prompt.trim().length < 2}
                >
                  <Icon name="bolt" width={15} height={15} />
                  <span>{busy ? 'Working…' : 'Send'}</span>
                </button>
              </div>
            </form>
          </footer>
        </aside>
      )}

      {!minimizedForSandbox || !sandboxRun ? (
        <button
          type="button"
          className="agent-float-launcher"
          aria-expanded={open}
          aria-label={open ? 'Close AfriCore Autonomous Agent' : 'Open AfriCore Autonomous Agent'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <Icon name="bolt" width={18} height={18} />
          <span>Agent</span>
          {pendingApprovals.length > 0 && (
            <span className="agent-float-badge">{pendingApprovals.length}</span>
          )}
        </button>
      ) : null}
    </>
  );
}
