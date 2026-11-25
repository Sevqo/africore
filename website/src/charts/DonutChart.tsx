import { useState } from 'react';
import { formatAxis, formatValue, vizColor } from './viz';
import './viz.css';

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color?: string;
};

/**
 * Shopify Polaris Viz Donut chart with interactive hover callout in the ring center,
 * crisp slice separators, share-of-total percentages and optional record drilldown.
 */
export function DonutChart({
  title,
  rows,
  currency,
  valueFormatter,
  onInspect,
  emptyText = 'No covered records in this period.',
}: {
  title: string;
  rows: DonutSlice[];
  currency?: string;
  valueFormatter?: (value: number) => string;
  onInspect?: (key: string) => void;
  emptyText?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const positive = rows.filter((row) => Number.isFinite(row.value) && row.value > 0);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const fmt = (v: number) => (valueFormatter ? valueFormatter(v) : formatValue(v, currency));
  const compact = (v: number) => (valueFormatter ? valueFormatter(v) : formatAxis(v, currency));

  if (!total) {
    return (
      <div className="sv-root sv-empty" style={{ minHeight: 140 }}>
        <p>{emptyText}</p>
      </div>
    );
  }

  let cursor = 0;
  const gap = positive.length > 1 ? 0.8 : 0;
  const focused = active !== null ? positive[active] : null;

  return (
    <div className="sv-root sv-donut" aria-label={`${title} breakdown`}>
      <div className="sv-donut-ring">
        <svg viewBox="0 0 180 180" role="img" aria-label={`${title}: ${fmt(total)}`}>
          <circle cx="90" cy="90" r="66" fill="none" stroke="#f1f2f4" strokeWidth="24" />
          {positive.map((slice, index) => {
            const pct = (slice.value / total) * 100,
              draw = Math.max(0.4, pct - gap),
              start = cursor,
              isHovered = active === index;
            cursor += pct;
            return (
              <circle
                key={slice.key}
                cx="90"
                cy="90"
                r="66"
                fill="none"
                stroke={slice.color || vizColor(index)}
                strokeWidth={isHovered ? 27 : 24}
                pathLength="100"
                strokeDasharray={`${draw} ${100 - draw}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
                opacity={active !== null && !isHovered ? 0.42 : 1}
                style={{ transition: 'opacity 140ms ease, stroke-width 140ms ease', cursor: onInspect ? 'pointer' : 'default' }}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onInspect?.(slice.key)}
              >
                <title>{`${slice.label}: ${fmt(slice.value)} (${Math.round(pct)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="sv-donut-center">
          <small>{focused ? focused.label : currency || 'Total'}</small>
          <strong>{compact(focused ? focused.value : total)}</strong>
        </div>
      </div>

      <ul className="sv-donut-legend">
        {positive.map((slice, index) => {
          const share = Math.round((slice.value / total) * 100);
          return (
            <li
              key={slice.key}
              className={`sv-donut-item ${active === index ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              <i className="sv-dot" style={{ background: slice.color || vizColor(index) }} />
              {onInspect ? (
                <button
                  type="button"
                  className="sv-btn sv-donut-drill"
                  onClick={() => onInspect(slice.key)}
                >
                  {slice.label}
                </button>
              ) : (
                <span className="sv-donut-name">{slice.label}</span>
              )}
              <strong className="sv-donut-val">{fmt(slice.value)}</strong>
              <span className="sv-donut-pct">{share}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
