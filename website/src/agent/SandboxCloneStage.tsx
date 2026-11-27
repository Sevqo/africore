import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  formatAgentMoney,
  type ComputerUseStep,
  type SandboxCloneBlueprint,
} from './computer-use';

export function SandboxCloneStage({
  blueprint,
  steps,
  status,
  editedParams,
  onChangeParam,
  onPlaybackDone,
  onDismiss,
  widthPx,
  onWidthChange,
}: {
  blueprint: SandboxCloneBlueprint;
  steps: ComputerUseStep[];
  status: string;
  editedParams: Record<string, any>;
  onChangeParam: (key: string, value: string | number) => void;
  onPlaybackDone: () => void;
  onDismiss: () => void;
  widthPx: number;
  onWidthChange: (nextPx: number) => void;
}) {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const doneNotified = useRef(false);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setActiveStepIdx(0);
    setPlaying(true);
    doneNotified.current = false;
  }, [blueprint.tool_id, steps]);

  useEffect(() => {
    if (!playing || !steps.length) {
      if (!doneNotified.current) {
        doneNotified.current = true;
        onPlaybackDone();
      }
      return;
    }
    if (activeStepIdx >= steps.length - 1) {
      setPlaying(false);
      if (!doneNotified.current) {
        doneNotified.current = true;
        onPlaybackDone();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveStepIdx((prev) => Math.min(steps.length - 1, prev + 1));
    }, 680);
    return () => window.clearTimeout(timer);
  }, [activeStepIdx, playing, steps, onPlaybackDone]);

  const activeStep = steps[Math.min(activeStepIdx, Math.max(0, steps.length - 1))];
  const merged = { ...(blueprint.staged_params || {}), ...editedParams };
  const currency = blueprint.currency || 'KES';

  function clampWidth(raw: number) {
    const maxAllowed = typeof window !== 'undefined' ? Math.max(420, Math.round(window.innerWidth * 0.66)) : 820;
    return Math.max(340, Math.min(maxAllowed, Math.round(raw)));
  }

  return (
    <aside
      className="agent-sandbox-pane"
      style={{ '--agent-sandbox-width': `${widthPx}px` } as React.CSSProperties}
      aria-label={`Isolated Sandbox Clone: ${blueprint.page_title}`}
    >
      <div
        className="agent-sandbox-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Computer Use sandbox pane"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onWidthChange(clampWidth(widthPx + 36));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            onWidthChange(clampWidth(widthPx - 36));
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragState.current = { startX: e.clientX, startW: widthPx };
        }}
        onPointerMove={(e) => {
          if (!dragState.current) return;
          const delta = dragState.current.startX - e.clientX;
          onWidthChange(clampWidth(dragState.current.startW + delta));
        }}
        onPointerUp={(e) => {
          if (dragState.current) {
            dragState.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      >
        <span className="agent-sandbox-grip" aria-hidden="true" />
      </div>

      <div className="agent-sandbox-inner">
        <header className="agent-sandbox-topbar">
          <div className="agent-sandbox-topbar-left">
            <span className="agent-sandbox-pill">
              <span className="agent-sandbox-live-dot" aria-hidden="true" />
              ISOLATED SANDBOX CLONE
            </span>
            <strong>{blueprint.page_title}</strong>
          </div>
          <div className="agent-sandbox-topbar-actions">
            <div className="agent-sandbox-presets" role="group" aria-label="Sandbox width presets">
              {(
                [
                  ['Compact', 400],
                  ['Balanced', 520],
                  ['Wide', 680],
                ] as [string, number][]
              ).map(([label, px]) => (
                <button
                  key={label}
                  type="button"
                  className={
                    Math.abs(widthPx - px) < 40
                      ? 'agent-sandbox-preset is-active'
                      : 'agent-sandbox-preset'
                  }
                  onClick={() => onWidthChange(clampWidth(px))}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="agent-sandbox-dismiss-btn"
              onClick={onDismiss}
              aria-label="Close Sandbox"
              title="Close Sandbox and return workspace to full width"
            >
              <Icon name="close" width={15} height={15} />
              <span>Dismiss</span>
            </button>
          </div>
        </header>

        <div className="agent-sandbox-step-strip" role="status" aria-live="polite">
          <div>
            <span className="agent-sandbox-step-count">
              {playing ? 'AGENT OPERATING IN CLONE' : status === 'completed' ? 'COMMITTED TO WORKSPACE' : 'READY FOR YOUR APPROVAL'}
              {steps.length ? ` · Step ${Math.min(activeStepIdx + 1, steps.length)}/${steps.length}` : ''}
            </span>
            <p className="agent-sandbox-step-text">
              {activeStep ? `${activeStep.label} — ${activeStep.detail}` : blueprint.section_label}
            </p>
          </div>
          {!playing && steps.length > 1 && (
            <button
              type="button"
              className="agent-sandbox-replay-btn"
              onClick={() => {
                setActiveStepIdx(0);
                setPlaying(true);
              }}
            >
              Replay
            </button>
          )}
        </div>

        <div className="agent-sandbox-body">
          <div className="agent-clone-window">
            <div className="agent-clone-browser-bar">
              <span className="agent-clone-route-badge">
                clone://{blueprint.clone_kind}/{blueprint.target_tab.toLowerCase().replace(/\s+/g, '-')}
              </span>
              <span className="agent-clone-safe-note">No live data altered until approved</span>
            </div>

            <div className="agent-clone-canvas">
              {blueprint.clone_kind === 'calendar' && (
                <CalendarPageClone merged={merged} context={blueprint.live_context} />
              )}
              {blueprint.clone_kind === 'work' && (
                <WorkPageClone merged={merged} context={blueprint.live_context} />
              )}
              {blueprint.clone_kind === 'crm' && (
                <CrmPageClone merged={merged} currency={currency} context={blueprint.live_context} />
              )}
              {blueprint.clone_kind === 'invoices' && (
                <InvoicePageClone merged={merged} currency={currency} context={blueprint.live_context} />
              )}
              {(blueprint.clone_kind === 'expenses' ||
                blueprint.clone_kind === 'customers' ||
                blueprint.clone_kind === 'notifications' ||
                blueprint.clone_kind === 'developer' ||
                blueprint.clone_kind === 'intelligence') && (
                <LedgerOrFormPageClone
                  cloneKind={blueprint.clone_kind}
                  pageTitle={blueprint.page_title}
                  merged={merged}
                  currency={currency}
                />
              )}

              {activeStep && (
                <div
                  className="agent-cu-cursor"
                  style={{
                    left: `${Math.max(10, Math.min(84, activeStep.cursor_hint.x_pct))}%`,
                    top: `${Math.max(14, Math.min(82, activeStep.cursor_hint.y_pct))}%`,
                  }}
                  aria-hidden="true"
                >
                  <span className="agent-cu-cursor-tip" />
                  <span className="agent-cu-cursor-tag">
                    {playing ? 'Agent typing…' : 'Staged'}
                  </span>
                </div>
              )}
            </div>

            {blueprint.editable_fields?.length > 0 && status === 'awaiting_approval' && (
              <div className="agent-clone-editor">
                <div className="agent-clone-editor-head">
                  <strong>Fine-tune staged fields before sending to workspace</strong>
                  <span>Editable in sandbox</span>
                </div>
                <div className="agent-clone-editor-grid">
                  {blueprint.editable_fields.map((field) => (
                    <label key={field.key} className="agent-clone-field">
                      <span>{field.label}</span>
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={
                          editedParams[field.key] !== undefined
                            ? editedParams[field.key]
                            : field.value
                        }
                        onChange={(e) =>
                          onChangeParam(
                            field.key,
                            field.type === 'number' ? Number(e.target.value) : e.target.value,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {blueprint.chained_actions && blueprint.chained_actions.length > 0 && (
              <div className="agent-clone-chained">
                <strong>Chained Multi-Step Actions Included:</strong>
                <ul>
                  {blueprint.chained_actions.map((ch, idx) => (
                    <li key={`${ch.tool_id}-${idx}`}>
                      <code>{ch.target_tab}</code> — {ch.tool_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function CalendarPageClone({
  merged,
  context,
}: {
  merged: Record<string, any>;
  context?: Record<string, any>;
}) {
  const existing = (context?.existing_events || []) as any[];
  const duration = Number(merged.duration_minutes || 45);
  const hour = merged.preferred_hour !== undefined ? Number(merged.preferred_hour) : 10;
  const hourLabel = `${String(hour).padStart(2, '0')}:00`;
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE CALENDAR · CLONE</span>
          <h4>Schedule &amp; Availability</h4>
        </div>
        <span className="agent-clone-tag">{merged.timezone || 'Africa/Nairobi'}</span>
      </div>
      <div className="agent-clone-calendar-grid">
        <div className="agent-clone-time-slots">
          <div className="agent-clone-slot-muted">09:00 · Morning focus block</div>
          {existing.slice(0, 2).map((ev) => (
            <div key={ev.id} className="agent-clone-slot-existing">
              <strong>{ev.title}</strong>
              <small>Existing workspace event · {ev.location}</small>
            </div>
          ))}
          <div className="agent-clone-slot-staged">
            <div className="agent-clone-slot-badge">NEW STAGED EVENT</div>
            <strong>{merged.title || 'Team Strategy Sync'}</strong>
            <span>
              Tomorrow at {hourLabel} ({duration} min) · {merged.location || 'Workspace Meeting Room'}
            </span>
            <small>On approval: Saves to Calendar &amp; notifies workspace members</small>
          </div>
          <div className="agent-clone-slot-muted">15:00 · Open availability</div>
        </div>
      </div>
    </div>
  );
}

function WorkPageClone({
  merged,
  context,
}: {
  merged: Record<string, any>;
  context?: Record<string, any>;
}) {
  const existing = (context?.existing_projects || []) as any[];
  const projName = merged.name || merged.title || 'Q4 Growth Project';
  const starterTask = merged.starter_task || merged.title || `Kickoff checklist for ${projName}`;
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE WORK · KANBAN CLONE</span>
          <h4>{projName}</h4>
        </div>
        <span className="agent-clone-tag">Priority: {merged.priority || 'normal'}</span>
      </div>
      <div className="agent-clone-kanban">
        <div className="agent-clone-col">
          <h5>Planned</h5>
          <div className="agent-clone-card-staged">
            <span className="agent-clone-slot-badge">STAGED TASK</span>
            <strong>{starterTask}</strong>
            <small>Assigned to workspace owner</small>
          </div>
        </div>
        <div className="agent-clone-col">
          <h5>In progress</h5>
          {existing[0] ? (
            <div className="agent-clone-card-muted">
              <strong>{existing[0].name}</strong>
              <small>Active workspace project</small>
            </div>
          ) : (
            <div className="agent-clone-card-muted">Ready for active sprint items</div>
          )}
        </div>
        <div className="agent-clone-col">
          <h5>Complete</h5>
          <div className="agent-clone-card-muted">Workspace milestones</div>
        </div>
      </div>
    </div>
  );
}

function CrmPageClone({
  merged,
  currency,
  context,
}: {
  merged: Record<string, any>;
  currency: string;
  context?: Record<string, any>;
}) {
  const existing = (context?.existing_leads || []) as any[];
  const amountMinor = Number(merged.amount_minor || 0);
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE CRM · PIPELINE CLONE</span>
          <h4>Opportunities &amp; Leads</h4>
        </div>
        <span className="agent-clone-tag">Stage: New</span>
      </div>
      <div className="agent-clone-kanban">
        <div className="agent-clone-col">
          <h5>New Leads</h5>
          <div className="agent-clone-card-staged">
            <span className="agent-clone-slot-badge">STAGED LEAD</span>
            <strong>{merged.title || 'Inbound Opportunity'}</strong>
            <span>Account: {merged.customer_name || merged.title || 'Client'}</span>
            {amountMinor > 0 && <strong>{formatAgentMoney(amountMinor, currency)}</strong>}
          </div>
          {existing.slice(0, 1).map((item) => (
            <div key={item.id} className="agent-clone-card-muted">
              <strong>{item.title}</strong>
              <small>Existing {item.stage} lead</small>
            </div>
          ))}
        </div>
        <div className="agent-clone-col">
          <h5>Qualified</h5>
          <div className="agent-clone-card-muted">Follow-up scheduled</div>
        </div>
        <div className="agent-clone-col">
          <h5>Proposal</h5>
          <div className="agent-clone-card-muted">Quote review</div>
        </div>
      </div>
    </div>
  );
}

function InvoicePageClone({
  merged,
  currency,
}: {
  merged: Record<string, any>;
  currency: string;
  context?: Record<string, any>;
}) {
  const amountMinor = Number(merged.amount_minor || 15000);
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE INVOICES · DRAFT CLONE</span>
          <h4>Draft Invoice Sheet</h4>
        </div>
        <span className="agent-clone-tag">DRAFT ONLY · NO FUNDS MOVED</span>
      </div>
      <div className="agent-clone-invoice-box">
        <div className="agent-clone-invoice-row">
          <span>Bill to</span>
          <strong>{merged.customer_name || 'Workspace Client'}</strong>
        </div>
        <div className="agent-clone-invoice-row">
          <span>Line item</span>
          <span>{merged.description || 'Professional services'}</span>
        </div>
        <div className="agent-clone-invoice-row agent-clone-invoice-total">
          <span>Staged Draft Total</span>
          <strong>{formatAgentMoney(amountMinor, currency)}</strong>
        </div>
      </div>
    </div>
  );
}

function LedgerOrFormPageClone({
  cloneKind,
  pageTitle,
  merged,
  currency,
}: {
  cloneKind: string;
  pageTitle: string;
  merged: Record<string, any>;
  currency: string;
}) {
  const amountMinor = merged.amount_minor !== undefined ? Number(merged.amount_minor) : null;
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE {cloneKind.toUpperCase()} · CLONE</span>
          <h4>{pageTitle}</h4>
        </div>
        <span className="agent-clone-tag">Staged Record</span>
      </div>
      <div className="agent-clone-invoice-box">
        {Object.entries(merged)
          .filter(([k]) => !['prompt'].includes(k))
          .slice(0, 5)
          .map(([k, v]) => (
            <div key={k} className="agent-clone-invoice-row">
              <span>{k.replace(/_/g, ' ')}</span>
              <strong>
                {k === 'amount_minor' && amountMinor !== null
                  ? formatAgentMoney(amountMinor, currency)
                  : String(v)}
              </strong>
            </div>
          ))}
      </div>
    </div>
  );
}
