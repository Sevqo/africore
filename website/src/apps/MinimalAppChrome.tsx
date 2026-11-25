import './minimal-workspace-shell.css';

export type KpiItem = {
  label: string;
  value: string | number;
  delta?: string;
  tone?: 'up' | 'warn' | 'down';
};

export function AppControlPanel({
  parent,
  title,
  facet,
  search,
  onSearch,
  primaryLabel,
  onPrimary,
  views,
  activeView,
  onViewChange,
  pipeline,
}: {
  parent: string;
  title: string;
  facet?: string;
  search?: string;
  onSearch?: (value: string) => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  views?: { id: string; label: string }[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  pipeline?: { label: string; state?: 'done' | 'active' | 'pending' }[];
}) {
  return (
    <div className="ac-control-panel">
      <div className="ac-control-left">
        {primaryLabel && onPrimary && (
          <button type="button" className="button" onClick={onPrimary}>
            {primaryLabel}
          </button>
        )}
        <div className="ac-breadcrumb">
          <span className="ac-breadcrumb-parent">{parent}</span>
          <h2 className="ac-breadcrumb-title">{title}</h2>
        </div>
      </div>

      {onSearch && (
        <label className="ac-faceted-search" aria-label={`Search ${title}`}>
          {facet && <span className="ac-facet-chip">{facet}</span>}
          <input
            type="search"
            value={search || ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
          />
          <span className="ac-kbd-hint">⌘K</span>
        </label>
      )}

      {views && views.length > 0 && onViewChange && (
        <div className="ac-view-switcher" role="group" aria-label="View switcher">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={activeView === v.id}
              onClick={() => onViewChange(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {pipeline && pipeline.length > 0 && (
        <div className="ac-pipeline" aria-label="Workflow stages">
          {pipeline.map((step) => (
            <span
              key={step.label}
              className={`ac-pipeline-step${step.state ? ' ' + step.state : ''}`}
            >
              {step.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="ac-kpi-strip" role="region" aria-label="Key metrics">
      {items.map((item) => (
        <div className="ac-kpi-item" key={item.label}>
          <span className="ac-kpi-label">{item.label}</span>
          <div className="ac-kpi-value-row">
            <span className="ac-kpi-value">{item.value}</span>
            {item.delta && (
              <span className={`ac-kpi-delta${item.tone && item.tone !== 'up' ? ' ' + item.tone : ''}`}>
                {item.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
