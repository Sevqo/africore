import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ComputerUseStage } from './ComputerUseStage';
import {
  dispatchAgentComputerUse,
  subscribeAgentComputerUse,
  type AgentComputerUseEventDetail,
  type AgentDestination,
} from './computer-use';
import type { API } from '../operations/UI';
import './agent.css';

const FLOAT_PROMPTS: Record<'business' | 'personal' | 'developer', string[]> = {
  business: [
    'Analyze my business performance',
    'Schedule a meeting tomorrow',
    'Set up a Q4 Launch project',
    'Create a CRM lead',
  ],
  personal: [
    'Analyze my personal finances',
    'Schedule a meeting tomorrow',
    'Check my linked Developer workspace',
    'Record an expense KES 2000',
  ],
  developer: [
    'Diagnose my sandbox API logs',
    'Create a sandbox developer app',
    'Inspect my linked Personal workspace',
  ],
};

/**
 * Persistent Floating Agent Launcher + Non-Modal Floating Window.
 * Mounted on every page of Business, Personal, and Developer workspaces.
 * Keeps the underlying workspace interactive so the user can watch live Computer Use actions.
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
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [driveLive, setDriveLive] = useState(true);
  const [showStage, setShowStage] = useState(true);
  const [activeBanner, setActiveBanner] = useState<AgentComputerUseEventDetail | null>(null);

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
    return subscribeAgentComputerUse((detail) => {
      if (detail.workspaceId && detail.workspaceId !== workspaceId) return;
      if (detail.action === 'clear') {
        setActiveBanner(null);
        return;
      }
      setActiveBanner(detail);
      if (detail.action === 'navigate' && detail.tab) {
        onNavigateDestination({
          tab: detail.tab,
          app: detail.app,
          section: detail.section,
          workspace_id: detail.workspaceId,
          workspace_kind: workspaceKind,
        });
      }
    });
  }, [workspaceId, workspaceKind, onNavigateDestination]);

  async function submitPrompt(text?: string) {
    const clean = (text ?? prompt).trim();
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(
        '/agent/runs',
        'POST',
        {
          prompt: clean,
          currency,
          computer_use: true,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setPrompt('');
      setShowStage(true);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/agent/approvals/${approvalId}/decide`, 'POST', { decision, note: '' });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const latestRun = overview?.runs?.[0] || null;
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
      {activeBanner && (
        <div className="agent-live-banner" role="status" aria-live="polite">
          <span>
            <strong>AfriCore Agent (Computer Use):</strong> {activeBanner.label}
            {activeBanner.detail ? ` — ${activeBanner.detail}` : ''}
          </span>
          <button
            type="button"
            onClick={() =>
              dispatchAgentComputerUse({ action: 'clear', workspaceId })
            }
          >
            Dismiss
          </button>
        </div>
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
                {typeof creditsRemaining === 'number' ? ` · ${creditsRemaining} cr left` : ''}
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
                onClick={() => setOpen(false)}
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
                  <span className="agent-status-chip agent-status-pending">Approval</span>
                </div>
                <div className="agent-approval-actions">
                  <button
                    type="button"
                    className="button agent-cu-btn"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'approve')}
                  >
                    Approve & Run
                  </button>
                  <button
                    type="button"
                    className="secondary-button agent-cu-btn"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}

            {latestRun && showStage && (
              <ComputerUseStage
                workspaceId={workspaceId}
                steps={latestRun.steps || []}
                status={latestRun.status}
                destination={latestRun.result?.destination}
                driveLive={driveLive}
                compact
                onOpenDestination={(dest) => onNavigateDestination(dest)}
              />
            )}

            {(overview?.runs || []).slice(0, 3).map((run: any) => (
              <article key={run.id} className="agent-run-card">
                <div className="agent-run-top">
                  <span>
                    <code>{run.tool_name}</code> · {run.credits_used} cr
                  </span>
                  <span className={`agent-status-chip agent-status-${run.status}`}>
                    {run.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="agent-run-prompt">{run.prompt}</p>
                <p className="agent-run-summary">{run.summary}</p>
              </article>
            ))}
          </div>

          <footer className="agent-float-footer">
            <div className="agent-composer-row">
              <label className="agent-toggle-label">
                <input
                  type="checkbox"
                  checked={driveLive}
                  onChange={(e) => setDriveLive(e.target.checked)}
                />
                Drive workspace live
              </label>
              <button
                type="button"
                className="quiet-button agent-cu-btn"
                onClick={() => setShowStage((v) => !v)}
              >
                {showStage ? 'Hide stage' : 'Show stage'}
              </button>
            </div>
            <form
              className="agent-float-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPrompt();
              }}
            >
              <textarea
                aria-label="Tell AfriCore Agent what to do"
                placeholder="Tell your agent what to do…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitPrompt();
                  }
                }}
                disabled={busy}
              />
              <button className="button" disabled={busy || prompt.trim().length < 2}>
                {busy ? '…' : 'Run'}
              </button>
            </form>
          </footer>
        </aside>
      )}

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
    </>
  );
}
