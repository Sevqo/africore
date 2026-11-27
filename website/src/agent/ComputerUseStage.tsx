import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  type AgentDestination,
  type ComputerUseStep,
} from './computer-use';

export function ComputerUseStage({
  steps,
  status,
  destination,
  compact = false,
  onOpenDestination,
}: {
  workspaceId?: string;
  steps: ComputerUseStep[];
  status: string;
  destination?: AgentDestination;
  driveLive?: boolean;
  compact?: boolean;
  onOpenDestination?: (dest: AgentDestination) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(true);
  }, [steps]);

  useEffect(() => {
    if (!playing || !steps.length) return;
    if (activeIndex >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveIndex((idx) => Math.min(steps.length - 1, idx + 1));
    }, compact ? 650 : 800);
    return () => window.clearTimeout(timer);
  }, [activeIndex, playing, steps, compact]);

  if (!steps.length) return null;
  const active = steps[Math.min(activeIndex, steps.length - 1)];

  return (
    <section
      className={compact ? 'agent-cu-stage agent-cu-compact' : 'agent-cu-stage'}
      aria-label="Live Computer Use Stage"
    >
      <div className="agent-cu-chrome">
        <div className="agent-cu-chrome-left">
          <span className="agent-cu-dot" aria-hidden="true" />
          <strong>Execution Trace</strong>
          <span className="agent-cu-route">
            {active.target_tab}
            {active.target_app ? ` · ${active.target_app}` : ''}
          </span>
        </div>
        <div className="agent-cu-chrome-actions">
          <button
            type="button"
            className="quiet-button agent-cu-btn"
            onClick={() => {
              setActiveIndex(0);
              setPlaying(true);
            }}
          >
            Replay
          </button>
          {destination && onOpenDestination && status === 'completed' && (
            <button
              type="button"
              className="secondary-button agent-cu-btn"
              onClick={() => onOpenDestination(destination)}
            >
              Open in workspace <Icon name="right" width={14} height={14} />
            </button>
          )}
        </div>
      </div>

      <div className="agent-cu-viewport">
        <div className="agent-cu-mock-bar">
          <span>{active.target_element}</span>
          <span className={`agent-status-chip agent-status-${active.status}`}>
            {active.phase.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="agent-cu-canvas">
          <div className="agent-cu-surface-card">
            <div className="agent-cu-step-heading">
              <span>
                Step {active.step_index} of {steps.length}
              </span>
              <h4>{active.label}</h4>
              <p>{active.detail}</p>
            </div>
            {active.preview_fields && Object.keys(active.preview_fields).length > 0 && (
              <dl className="agent-cu-fields">
                {Object.entries(active.preview_fields).map(([key, value]) => (
                  <div key={key} className="agent-cu-field-row">
                    <dt>{key.replace(/_/g, ' ')}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div
            className="agent-cu-cursor"
            style={{
              left: `${Math.max(8, Math.min(88, active.cursor_hint.x_pct))}%`,
              top: `${Math.max(12, Math.min(84, active.cursor_hint.y_pct))}%`,
            }}
            aria-hidden="true"
          >
            <span className="agent-cu-cursor-tip" />
            <span className="agent-cu-cursor-tag">Agent</span>
          </div>
        </div>
      </div>

      <ol className="agent-cu-steps">
        {steps.map((step, index) => (
          <li key={step.step_index}>
            <button
              type="button"
              className={
                index === activeIndex
                  ? 'agent-cu-step-item agent-cu-step-active'
                  : 'agent-cu-step-item'
              }
              onClick={() => {
                setPlaying(false);
                setActiveIndex(index);
              }}
            >
              <span className="agent-cu-step-num">{step.step_index}</span>
              <span className="agent-cu-step-label">{step.label}</span>
              <span className="agent-cu-step-phase">
                {step.status === 'pending_approval' ? 'Staged' : `${step.duration_ms}ms`}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {status === 'awaiting_approval' && (
        <p className="agent-cu-note">
          Staged in isolated sandbox — review and approve to commit to your live workspace.
        </p>
      )}
    </section>
  );
}
