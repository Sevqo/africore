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
  approvalId,
  busy = false,
  error = '',
  onApprove,
  onReject,
  onOpenChat,
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
  approvalId?: string | null;
  busy?: boolean;
  error?: string;
  onApprove?: () => void;
  onReject?: () => void;
  onOpenChat?: () => void;
}) {
  const [activeStepIdx, setActiveStepIdx] = useState(Math.max(0, steps.length - 1));
  const [showLiveDiff, setShowLiveDiff] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ ok: boolean; checks: string[] } | null>(null);
  const doneNotified = useRef(false);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setActiveStepIdx(Math.max(0, steps.length - 1));
    setDryRunResult(null);
    if (!doneNotified.current) {
      doneNotified.current = true;
      onPlaybackDone();
    }
  }, [blueprint.tool_id, steps, onPlaybackDone]);

  const activeStep = steps[Math.min(activeStepIdx, Math.max(0, steps.length - 1))];
  const merged = { ...(blueprint.staged_params || {}), ...editedParams };
  const currency = blueprint.currency || 'KES';

  function runInteractiveDryCheck() {
    const checks: string[] = [];
    let ok = true;
    for (const field of blueprint.editable_fields || []) {
      const val = editedParams[field.key] !== undefined ? editedParams[field.key] : field.value;
      const str = String(val ?? '').trim();
      if (!str && !field.label.toLowerCase().includes('optional')) {
        ok = false;
        checks.push(`Missing required field: ${field.label}`);
      } else {
        checks.push(`✓ ${field.label}: ${str.slice(0, 60)}`);
      }
    }
    checks.push(`✓ Privacy Shield: encrypted workspace execution (${blueprint.tool_id})`);
    checks.push(`✓ Target surface: ${blueprint.page_title} (+1 staged write, live workspace untouched until Approve)`);
    setDryRunResult({ ok, checks });
  }

  function clampWidth(raw: number) {
    const maxAllowed =
      typeof window !== 'undefined' ? Math.max(420, Math.round(window.innerWidth * 0.66)) : 820;
    return Math.max(360, Math.min(maxAllowed, Math.round(raw)));
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
              INTERACTIVE SANDBOX CLONE
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
              <Icon name="close" width={14} height={14} />
              <span>Dismiss</span>
            </button>
          </div>
        </header>

        <div className="agent-sandbox-step-strip" role="status" aria-live="polite">
          <div className="agent-sandbox-step-meta">
            <span className="agent-sandbox-step-count">
              {status === 'completed'
                ? 'LIVE EXECUTION COMMITTED'
                : 'LIVE INTERACTIVE SANDBOX · INSPECT, VALIDATE & EDIT DIRECTLY'}
            </span>
            <p className="agent-sandbox-step-text">
              {activeStep ? `${activeStep.label} — ${activeStep.detail}` : blueprint.section_label}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="quiet-button"
              style={{ padding: '3px 8px', minHeight: 24, fontSize: 11 }}
              onClick={runInteractiveDryCheck}
            >
              Validate
            </button>
            <button
              type="button"
              className="quiet-button"
              style={{ padding: '3px 8px', minHeight: 24, fontSize: 11 }}
              onClick={() => setShowLiveDiff((v) => !v)}
            >
              {showLiveDiff ? 'Hide diff' : 'Live diff'}
            </button>
            {steps.length > 0 && (
              <div className="agent-sandbox-step-dots" aria-label="Live execution steps">
                {steps.map((st, idx) => (
                  <button
                    key={st.step_index}
                    type="button"
                    className={
                      idx === activeStepIdx
                        ? 'agent-step-pill is-current'
                        : idx < activeStepIdx
                          ? 'agent-step-pill is-done'
                          : 'agent-step-pill'
                    }
                    title={`${st.label}: ${st.detail}`}
                    onClick={() => setActiveStepIdx(idx)}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="agent-sandbox-body">
          <div className="agent-clone-window">
            <div className="agent-clone-browser-bar">
              <span className="agent-clone-route-badge">
                sandbox://{blueprint.clone_kind}/
                {blueprint.target_tab.toLowerCase().replace(/\s+/g, '-')}
              </span>
              <span className="agent-clone-safe-note">Isolated preview · Live workspace untouched</span>
            </div>

            <div className="agent-clone-canvas">
              {blueprint.clone_kind === 'calendar' && (
                <CalendarPageClone
                  merged={merged}
                  context={blueprint.live_context}
                  onChangeParam={onChangeParam}
                />
              )}
              {blueprint.clone_kind === 'work' && (
                <WorkPageClone
                  merged={merged}
                  context={blueprint.live_context}
                  onChangeParam={onChangeParam}
                />
              )}
              {blueprint.clone_kind === 'crm' && (
                <CrmPageClone
                  merged={merged}
                  currency={currency}
                  context={blueprint.live_context}
                  onChangeParam={onChangeParam}
                />
              )}
              {blueprint.clone_kind === 'invoices' && (
                <InvoicePageClone
                  merged={merged}
                  currency={currency}
                  context={blueprint.live_context}
                />
              )}
              {![ 'calendar', 'work', 'crm', 'invoices' ].includes(blueprint.clone_kind) && (
                <LedgerOrFormPageClone
                  cloneKind={blueprint.clone_kind}
                  pageTitle={blueprint.page_title}
                  merged={merged}
                  currency={currency}
                />
              )}

              {dryRunResult && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${dryRunResult.ok ? '#86efac' : '#fca5a5'}`,
                    background: dryRunResult.ok ? '#f0fdf4' : '#fef2f2',
                    fontSize: 12,
                  }}
                >
                  <strong>
                    {dryRunResult.ok ? 'Dry-Run Validation Passed' : 'Review Required Before Commit'}
                  </strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                    {dryRunResult.checks.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showLiveDiff && (
                <pre
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: '#0f172a',
                    color: '#e2e8f0',
                    fontSize: 11.5,
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(
                    {
                      tool: blueprint.tool_id,
                      target: blueprint.page_title,
                      live_write_delta: '+1 record (staged)',
                      payload: merged,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>

            {blueprint.editable_fields?.length > 0 && status === 'awaiting_approval' && (
              <div className="agent-clone-editor">
                <div className="agent-clone-editor-head">
                  <strong>Edit staged fields directly</strong>
                  <span>Syncs live with preview above</span>
                </div>
                <div className="agent-clone-editor-grid">
                  {blueprint.editable_fields.map((field) => {
                    const val =
                      editedParams[field.key] !== undefined ? editedParams[field.key] : field.value;
                    return (
                      <label
                        key={field.key}
                        className={
                          field.type === 'textarea'
                            ? 'agent-clone-field agent-clone-field-wide'
                            : 'agent-clone-field'
                        }
                      >
                        <span>{field.label}</span>
                        {field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            value={String(val ?? '')}
                            onChange={(e) => onChangeParam(field.key, e.target.value)}
                          />
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={val}
                            onChange={(e) =>
                              onChangeParam(
                                field.key,
                                field.type === 'number' ? Number(e.target.value) : e.target.value,
                              )
                            }
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {blueprint.chained_actions && blueprint.chained_actions.length > 0 && (
              <div className="agent-clone-chained">
                <strong>Chained Multi-Step Actions Queued:</strong>
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

        {/* Sticky Non-Overlapping Footer Action Bar inside Sandbox Pane */}
        {approvalId && status === 'awaiting_approval' && (
          <footer className="agent-sandbox-footer" role="region" aria-label="Sandbox Approval Controls">
            {error && (
              <div className="alert error" role="alert" style={{ marginBottom: 6 }}>
                {error}
              </div>
            )}
            <div className="agent-sandbox-footer-copy">
              <span className="agent-dock-kicker">SANDBOX READY · REVIEW &amp; APPROVE</span>
              <p>
                Commits to live <strong>{blueprint.page_title}</strong> and grants authorized member
                visibility.
              </p>
            </div>
            <div className="agent-sandbox-footer-btns">
              <button
                type="button"
                className="button agent-sandbox-approve-btn"
                disabled={busy}
                onClick={onApprove}
              >
                <Icon name="check" width={15} height={15} />
                <span>{busy ? 'Committing…' : blueprint.primary_cta}</span>
              </button>
              <button
                type="button"
                className="secondary-button agent-sandbox-discard-btn"
                disabled={busy}
                onClick={onReject}
              >
                Discard
              </button>
              {onOpenChat && (
                <button
                  type="button"
                  className="quiet-button agent-sandbox-chat-btn"
                  disabled={busy}
                  onClick={onOpenChat}
                >
                  Chat
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </aside>
  );
}

function CalendarPageClone({
  merged,
  context,
  onChangeParam,
}: {
  merged: Record<string, any>;
  context?: Record<string, any>;
  onChangeParam: (key: string, value: string | number) => void;
}) {
  const existing = (context?.existing_events || []) as any[];
  const duration = Number(merged.duration_minutes || 45);
  const hour = merged.preferred_hour !== undefined ? Number(merged.preferred_hour) : 10;
  const dayOffset = Number(merged.hours_from_now || 24);
  const endMinutesTotal = hour * 60 + duration;
  const endHour = Math.floor(endMinutesTotal / 60) % 24;
  const endMin = endMinutesTotal % 60;
  const startLabel = `${String(hour).padStart(2, '0')}:00`;
  const endLabel = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">ODOO-STYLE CALENDAR · INTERACTIVE STAGE</span>
          <h4>{merged.title || 'Team Strategy Sync'}</h4>
        </div>
        <span className="agent-clone-tag">{merged.timezone || 'Africa/Nairobi'}</span>
      </div>

      {/* Interactive Day, Time Slot, Duration & Room Quick Pickers */}
      <div className="agent-clone-quick-controls">
        <div className="agent-clone-control-group">
          <span>Day</span>
          <div className="agent-clone-pill-row">
            {(
              [
                ['Today', 2],
                ['Tomorrow', 24],
                ['+2 Days', 48],
                ['Next Week', 168],
              ] as [string, number][]
            ).map(([lbl, hrs]) => (
              <button
                key={lbl}
                type="button"
                className={dayOffset === hrs ? 'agent-slot-chip is-selected' : 'agent-slot-chip'}
                onClick={() => onChangeParam('hours_from_now', hrs)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="agent-clone-control-group">
          <span>Click start time</span>
          <div className="agent-clone-pill-row">
            {[9, 10, 11, 14, 15, 16].map((h) => (
              <button
                key={h}
                type="button"
                className={hour === h ? 'agent-slot-chip is-selected' : 'agent-slot-chip'}
                onClick={() => onChangeParam('preferred_hour', h)}
              >
                {String(h).padStart(2, '0')}:00
              </button>
            ))}
          </div>
        </div>

        <div className="agent-clone-control-group">
          <span>Duration &amp; Room</span>
          <div className="agent-clone-pill-row">
            {[30, 45, 60].map((d) => (
              <button
                key={d}
                type="button"
                className={duration === d ? 'agent-slot-chip is-selected' : 'agent-slot-chip'}
                onClick={() => onChangeParam('duration_minutes', d)}
              >
                {d}m
              </button>
            ))}
            {['Workspace Meeting Room', 'Google Meet', 'Boardroom'].map((loc) => (
              <button
                key={loc}
                type="button"
                className={
                  (merged.location || 'Workspace Meeting Room') === loc
                    ? 'agent-slot-chip is-selected'
                    : 'agent-slot-chip'
                }
                onClick={() => onChangeParam('location', loc)}
              >
                {loc === 'Workspace Meeting Room' ? 'Meeting Room' : loc}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Visual Hairline Schedule Preview */}
      <div className="agent-clone-timeline">
        {existing.slice(0, 2).map((ev) => (
          <div key={ev.id} className="agent-clone-timeline-row is-existing">
            <span className="agent-clone-timeline-time">
              {ev.start ? String(ev.start).slice(11, 16) : 'Booked'}
            </span>
            <div className="agent-clone-timeline-card">
              <strong>{ev.title}</strong>
              <small>Existing workspace event · {ev.location}</small>
            </div>
          </div>
        ))}
        <div className="agent-clone-timeline-row is-staged">
          <span className="agent-clone-timeline-time">{startLabel}</span>
          <div className="agent-clone-slot-staged">
            <div className="agent-clone-staged-top">
              <span className="agent-clone-slot-badge">STAGED INVITE</span>
              <span>
                {startLabel}–{endLabel} ({duration}m)
              </span>
            </div>
            <strong>{merged.title || 'Team Strategy Sync'}</strong>
            <span>{merged.location || 'Workspace Meeting Room'}</span>
            {merged.description && (
              <p className="agent-clone-agenda-preview">{String(merged.description)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkPageClone({
  merged,
  context,
  onChangeParam,
}: {
  merged: Record<string, any>;
  context?: Record<string, any>;
  onChangeParam: (key: string, value: string | number) => void;
}) {
  const existing = (context?.existing_projects || []) as any[];
  const projName = merged.name || merged.title || 'Q4 Growth Project';
  const starterTask = merged.starter_task || merged.title || `Kickoff checklist for ${projName}`;
  const priority = String(merged.priority || 'normal');
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE WORK · INTERACTIVE KANBAN</span>
          <h4>{projName}</h4>
        </div>
        <div className="agent-clone-pill-row">
          {(['normal', 'high', 'urgent'] as const).map((prio) => (
            <button
              key={prio}
              type="button"
              className={priority === prio ? 'agent-slot-chip is-selected' : 'agent-slot-chip'}
              onClick={() => onChangeParam('priority', prio)}
            >
              {prio}
            </button>
          ))}
        </div>
      </div>
      <div className="agent-clone-kanban">
        <div className="agent-clone-col">
          <h5>Planned</h5>
          <div className="agent-clone-card-staged">
            <span className="agent-clone-slot-badge">STAGED</span>
            <strong>{starterTask}</strong>
            <small>Auto-creates #{projName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 22)} channel</small>
          </div>
        </div>
        <div className="agent-clone-col">
          <h5>In progress</h5>
          {existing[0] ? (
            <div className="agent-clone-card-muted">
              <strong>{existing[0].name}</strong>
              <small>Active project</small>
            </div>
          ) : (
            <div className="agent-clone-card-muted">Sprint queue</div>
          )}
        </div>
        <div className="agent-clone-col">
          <h5>Complete</h5>
          <div className="agent-clone-card-muted">Milestones</div>
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
  onChangeParam: (key: string, value: string | number) => void;
}) {
  const existing = (context?.existing_leads || []) as any[];
  const amountMinor = Number(merged.amount_minor || 0);
  return (
    <div className="agent-clone-surface">
      <div className="agent-clone-surface-head">
        <div>
          <span className="agent-clone-kicker">AFRICORE CRM · PIPELINE STAGE</span>
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
          <div className="agent-clone-card-muted">Discovery &amp; demo</div>
        </div>
        <div className="agent-clone-col">
          <h5>Proposal</h5>
          <div className="agent-clone-card-muted">Sales quote</div>
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
          <span className="agent-clone-kicker">AFRICORE INVOICES · DRAFT STAGE</span>
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
          <span className="agent-clone-kicker">AFRICORE {cloneKind.toUpperCase()} · STAGE</span>
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
