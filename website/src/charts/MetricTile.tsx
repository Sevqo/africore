import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';
import { Trend } from './Trend';
import { vizPalette } from './viz';
import './viz.css';

/**
 * Shopify Analytics metric card: dotted-underlined label (definition on hover),
 * large value, change vs comparison period and an optional sparkline.
 */
export function MetricTile({
  label,
  value,
  definition,
  change,
  invertChange = false,
  changeLabel,
  spark,
  sparkComparison,
  color = vizPalette[0],
  caption,
  children,
  onSelect,
  selected = false,
  className = '',
}: {
  label: string;
  value: ReactNode;
  definition?: string;
  change?: number | null;
  invertChange?: boolean;
  changeLabel?: string;
  spark?: number[];
  sparkComparison?: number[];
  color?: string;
  caption?: ReactNode;
  children?: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="sv-metric-label" title={definition}>
        {label}
      </span>
      <span className="sv-metric-value-row">
        <strong className="sv-metric-value">{value}</strong>
        {change !== undefined && <Trend value={change} invert={invertChange} label={changeLabel} />}
      </span>
      {caption && <small className="sv-metric-caption">{caption}</small>}
      {spark && spark.length > 1 && (
        <span className="sv-metric-spark">
          <Sparkline values={spark} comparison={sparkComparison} color={color} />
        </span>
      )}
    </>
  );
  return (
    <div
      className={`sv-root sv-metric ${onSelect ? 'sv-metric--interactive' : ''} ${selected ? 'sv-metric--selected' : ''} ${className}`}
    >
      {onSelect ? (
        <button type="button" className="sv-metric-hit" aria-pressed={selected} onClick={onSelect}>
          {body}
        </button>
      ) : (
        body
      )}
      {children}
    </div>
  );
}

/** Horizontal strip of metric tiles separated by hairlines, as on Shopify's analytics header. */
export function MetricStrip({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section className="sv-root sv-metric-strip" aria-label={label}>
      {children}
    </section>
  );
}
