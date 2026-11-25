import { useEffect, useRef, useState, type ReactNode } from 'react';
import './minimal-workspace-shell.css';

export type AppMenuEntry = {
  id: string;
  label: string;
  active?: boolean;
  onSelect?: () => void;
  children?: { id: string; label: string; active?: boolean; onSelect: () => void }[];
};

export function AppModuleMenuBar({
  ariaLabel,
  brandLabel,
  brandActive,
  onBrandClick,
  menus,
  rightContent,
  primaryAction,
  className = '',
}: {
  ariaLabel: string;
  brandLabel?: ReactNode;
  brandActive?: boolean;
  onBrandClick?: () => void;
  menus: AppMenuEntry[];
  rightContent?: ReactNode;
  primaryAction?: { label: string; onClick: () => void; items?: { label: string; onClick: () => void }[] };
  className?: string;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <nav
      ref={rootRef}
      className={`ac-app-menubar sales-module-nav ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {brandLabel && (
        <button
          type="button"
          className={`ac-menubar-pill${brandActive ? ' active' : ''}`}
          aria-current={brandActive ? 'page' : undefined}
          onClick={() => {
            setOpenMenu(null);
            onBrandClick?.();
          }}
        >
          {brandLabel}
        </button>
      )}
      {menus.map((entry) => {
        const hasChildren = !!entry.children && entry.children.length > 0;
        const isOpen = openMenu === entry.id;
        if (!hasChildren) {
          return (
            <button
              type="button"
              key={entry.id}
              className={`ac-menubar-pill${entry.active ? ' active' : ''}`}
              aria-current={entry.active ? 'page' : undefined}
              onClick={() => {
                setOpenMenu(null);
                entry.onSelect?.();
              }}
            >
              {entry.label}
            </button>
          );
        }
        return (
          <div className={`ac-menubar-dropdown${isOpen ? ' is-open' : ''}`} key={entry.id}>
            <button
              type="button"
              className={`ac-menubar-trigger${entry.active || isOpen ? ' active' : ''}`}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              onClick={() => setOpenMenu((current) => (current === entry.id ? null : entry.id))}
            >
              <span>{entry.label}</span>
              <span className="ac-menubar-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {isOpen && (
              <div className="ac-menubar-popover" role="menu">
                {entry.children!.map((child) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={child.id}
                    className={child.active ? 'active' : ''}
                    onClick={() => {
                      setOpenMenu(null);
                      child.onSelect();
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <span className="sales-nav-spacer" style={{ flex: '1 1 auto' }} />
      {rightContent}
      {primaryAction &&
        (primaryAction.items && primaryAction.items.length > 0 ? (
          <div className={`ac-menubar-dropdown${openMenu === '__primary_new' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="sales-new"
              aria-expanded={openMenu === '__primary_new'}
              aria-haspopup="menu"
              onClick={() =>
                setOpenMenu((current) => (current === '__primary_new' ? null : '__primary_new'))
              }
            >
              {primaryAction.label} ▾
            </button>
            {openMenu === '__primary_new' && (
              <div className="ac-menubar-popover align-right" role="menu">
                {primaryAction.items.map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.label}
                    onClick={() => {
                      setOpenMenu(null);
                      item.onClick();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="sales-new"
            onClick={() => {
              setOpenMenu(null);
              primaryAction.onClick();
            }}
          >
            {primaryAction.label}
          </button>
        ))}
    </nav>
  );
}

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
