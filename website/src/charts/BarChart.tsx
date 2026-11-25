import { useId, useState, type PointerEvent } from 'react';
import { Trend } from './Trend';
import {
  barPath,
  evenIndices,
  formatAxis,
  formatDateLabel,
  formatValue,
  niceScale,
  percentChange,
  safeDomId,
  useElementWidth,
  vizColor,
  vizPalette,
} from './viz';
import './viz.css';

export type BarRow = {
  key: string;
  label: string;
  value: number;
  secondary?: string;
  color?: string;
};

function looksTemporal(rows: BarRow[]) {
  return (
    rows.length >= 2 &&
    rows.every(
      (r) => /^\d{4}-\d{2}(-\d{2})?$/.test(r.key) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(r.label),
    )
  );
}

/**
 * Shopify Analytics / Polaris Viz bar chart supporting both crisp vertical column charts
 * (rounded 4px top corners, faint gridlines, hover tooltip, optional dashed comparison bars)
 * and Shopify horizontal breakdown bars (share %, subtle quarter-gridlines, hover dim).
 */
export function BarChart({
  title,
  rows,
  comparisonRows,
  onInspect,
  color = vizPalette[0],
  currency,
  valueFormatter,
  orientation = 'auto',
  allowOrientationSwitch = true,
  subtitle,
  height = 228,
  showTotal = true,
  multiColor = false,
}: {
  title: string;
  rows: BarRow[];
  comparisonRows?: { key: string; value: number }[];
  onInspect?: (key: string) => void;
  color?: string;
  currency?: string;
  valueFormatter?: (value: number) => string;
  orientation?: 'auto' | 'horizontal' | 'vertical';
  allowOrientationSwitch?: boolean;
  subtitle?: string;
  height?: number;
  showTotal?: boolean;
  multiColor?: boolean;
}) {
  const id = safeDomId(useId());
  const defaultMode: 'horizontal' | 'vertical' =
    orientation === 'auto' ? (looksTemporal(rows) ? 'vertical' : 'horizontal') : orientation;
  const [modeOverride, setModeOverride] = useState<'horizontal' | 'vertical' | null>(null);
  const mode = modeOverride ?? defaultMode;
  const [hovered, setHovered] = useState<number | null>(null);
  const [plotRef, width] = useElementWidth<HTMLDivElement>(580);

  const valid = rows.filter((row) => Number.isFinite(row.value));
  const nonNegative = valid.filter((row) => row.value >= 0);
  const total = nonNegative.reduce((sum, r) => sum + r.value, 0);
  const compareMap = new Map((comparisonRows || []).map((r) => [r.key, r.value]));
  const priorTotal =
    comparisonRows && comparisonRows.length
      ? valid.reduce((sum, r) => sum + Math.max(0, Number(compareMap.get(r.key) || 0)), 0)
      : null;
  const delta = priorTotal !== null ? percentChange(total, priorTotal) : undefined;
  const fmt = (v: number) => (valueFormatter ? valueFormatter(v) : formatValue(v, currency));
  const fmtAxis = (v: number) => (valueFormatter ? formatAxis(v) : formatAxis(v, currency));

  // Vertical SVG column layout
  const values = [
    ...valid.map((r) => r.value),
    ...(comparisonRows ? valid.map((r) => Number(compareMap.get(r.key) ?? 0)) : []),
  ];
  const integer = !currency && !valueFormatter && values.every((v) => Number.isInteger(v));
  const scale = niceScale(values.length ? values : [0, 1], 4, integer);
  const tickLabels = scale.ticks.map(fmtAxis);
  const left = Math.max(30, Math.max(...tickLabels.map((l) => l.length)) * 6.4 + 12),
    right = 12,
    top = 12,
    bottom = 30;
  const plotW = Math.max(60, width - left - right),
    plotH = Math.max(60, height - top - bottom);
  const y = (n: number) => top + ((scale.max - n) / (scale.max - scale.min || 1)) * plotH;
  const zeroY = y(0);
  const slotW = plotW / Math.max(1, valid.length);
  const hasCompare = !!comparisonRows?.length;
  const barW = Math.max(4, Math.min(hasCompare ? 22 : 38, slotW * (hasCompare ? 0.34 : 0.62)));
  const xTicks = evenIndices(valid.length, Math.max(2, Math.floor(plotW / 76)));

  function pickBar(event: PointerEvent<SVGSVGElement>) {
    if (!valid.length) return null;
    const rect = event.currentTarget.getBoundingClientRect(),
      px = event.clientX - rect.left - left;
    const idx = Math.floor((px / plotW) * valid.length);
    return Math.max(0, Math.min(valid.length - 1, idx));
  }

  const activeRow = hovered !== null ? valid[hovered] : null;
  const activeX = hovered !== null ? left + (hovered + 0.5) * slotW : 0;
  const tipFlip = hovered !== null && activeX > width * 0.58;
  const maxHoriz = Math.max(
    1,
    ...nonNegative.map((row) => Math.max(row.value, Number(compareMap.get(row.key) || 0))),
  );

  return (
    <figure className="sv-root sv-bar workspace-bar-chart shopify-bar-chart" aria-labelledby={id}>
      <div className="sv-bar-head shopify-bar-head">
        <div>
          <figcaption id={id}>{title}</figcaption>
          {subtitle && <div className="sv-chart-sub">{subtitle}</div>}
        </div>
        <div className="sv-bar-meta">
          {showTotal && valid.length > 0 && (
            <span className="sv-bar-total shopify-bar-total">
              {fmt(total)} total
            </span>
          )}
          {delta !== undefined && valid.length > 0 && <Trend value={delta} />}
          {allowOrientationSwitch && valid.length > 1 && (
            <div className="sv-segmented" role="group" aria-label="Bar orientation">
              <button
                type="button"
                className="sv-btn sv-segment"
                aria-pressed={mode === 'vertical'}
                title="Column chart"
                onClick={() => setModeOverride('vertical')}
              >
                ▮▮
              </button>
              <button
                type="button"
                className="sv-btn sv-segment"
                aria-pressed={mode === 'horizontal'}
                title="Horizontal breakdown"
                onClick={() => setModeOverride('horizontal')}
              >
                ☰
              </button>
            </div>
          )}
        </div>
      </div>

      {!valid.length ? (
        <div className="sv-empty" style={{ minHeight: 112 }}>
          <p className="shopify-bar-empty">No covered records for this period.</p>
        </div>
      ) : mode === 'vertical' ? (
        <div className="sv-plot" ref={plotRef} style={{ height }}>
          {activeRow && hovered !== null && (
            <div
              className={`sv-tooltip ${tipFlip ? 'sv-tooltip--flip' : ''}`}
              role="tooltip"
              aria-hidden="true"
              style={{ left: activeX }}
            >
              <strong className="sv-tooltip-title">
                {/^\d{4}-\d{2}(-\d{2})?$/.test(activeRow.key)
                  ? formatDateLabel(
                      activeRow.key,
                      activeRow.key.length === 7 ? 'month' : 'day',
                      true,
                    )
                  : activeRow.label}
              </strong>
              <span className="sv-tooltip-row">
                <span>
                  <i
                    className="sv-dot"
                    style={{ background: activeRow.color || (multiColor ? vizColor(hovered) : color) }}
                  />
                  Current
                </span>
                <b>{fmt(activeRow.value)}</b>
              </span>
              {activeRow.secondary && (
                <span className="sv-tooltip-row">
                  <span>Detail</span>
                  <b>{activeRow.secondary}</b>
                </span>
              )}
              {total > 0 && activeRow.value >= 0 && (
                <span className="sv-tooltip-row">
                  <span>Share of total</span>
                  <b>{Math.round((activeRow.value / total) * 100)}%</b>
                </span>
              )}
              {hasCompare && compareMap.has(activeRow.key) && (
                <>
                  <hr />
                  <span className="sv-tooltip-row">
                    <span>Previous period</span>
                    <b>{fmt(Number(compareMap.get(activeRow.key) || 0))}</b>
                  </span>
                </>
              )}
            </div>
          )}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title}. ${valid.length} bars.`}
            onPointerMove={(e) => setHovered(pickBar(e))}
            onPointerLeave={() => setHovered(null)}
            onClick={(e) => {
              if (!onInspect) return;
              const idx = pickBar(e as unknown as PointerEvent<SVGSVGElement>);
              if (idx !== null && valid[idx]) onInspect(valid[idx].key);
            }}
            style={onInspect ? { cursor: 'pointer' } : undefined}
          >
            {scale.ticks.map((tick, i) => (
              <g key={tick}>
                <line
                  className={tick === 0 ? 'sv-grid sv-grid--zero' : 'sv-grid'}
                  x1={left}
                  x2={left + plotW}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text className="sv-axis" x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                  {tickLabels[i]}
                </text>
              </g>
            ))}
            {valid.map((row, i) => {
              const cx = left + (i + 0.5) * slotW,
                fill = row.color || (multiColor ? vizColor(i) : color),
                neg = row.value < 0,
                barTop = neg ? zeroY : y(row.value),
                barH = Math.abs(y(row.value) - zeroY),
                dim = hovered !== null && hovered !== i,
                priorVal = hasCompare ? Number(compareMap.get(row.key) ?? 0) : null,
                priorH = priorVal !== null ? Math.abs(y(priorVal) - zeroY) : 0,
                priorTop = priorVal !== null && priorVal < 0 ? zeroY : priorVal !== null ? y(priorVal) : zeroY;
              return (
                <g key={row.key} className="sv-bar-col" opacity={dim ? 0.45 : 1}>
                  {priorVal !== null && priorH > 0 && (
                    <path
                      d={barPath(cx - barW - 1.5, priorTop, barW, priorH, priorVal < 0)}
                      fill={fill}
                      opacity={0.28}
                    />
                  )}
                  <path
                    d={barPath(hasCompare ? cx + 1.5 : cx - barW / 2, barTop, barW, barH, neg)}
                    fill={fill}
                  >
                    <title>{`${row.label}: ${fmt(row.value)}`}</title>
                  </path>
                </g>
              );
            })}
            {xTicks.map((i) => {
              const row = valid[i],
                cx = left + (i + 0.5) * slotW,
                rawLabel = /^\d{4}-\d{2}(-\d{2})?$/.test(row.key)
                  ? formatDateLabel(row.key, row.key.length === 7 ? 'month' : 'day')
                  : row.label,
                short = rawLabel.length > 13 ? rawLabel.slice(0, 12) + '…' : rawLabel;
              return (
                <text key={row.key} className="sv-axis" x={cx} y={height - 8} textAnchor="middle">
                  {short}
                </text>
              );
            })}
          </svg>
        </div>
      ) : (
        <ul className="sv-bar-list">
          {nonNegative.map((row, i) => {
            const pct = Math.max(row.value > 0 ? 2 : 0, (row.value / maxHoriz) * 100);
            const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
            const isHovered = hovered === i;
            const fill = row.color || (multiColor ? vizColor(i) : color);
            const priorVal = compareMap.get(row.key);
            const priorPct =
              priorVal !== undefined && priorVal > 0 ? Math.min(100, (priorVal / maxHoriz) * 100) : null;
            const inner = (
              <>
                <span className="sv-bar-row-top">
                  <span className="sv-bar-label shopify-bar-label">
                    {row.label}
                    {row.secondary ? ` · ${row.secondary}` : ''}
                  </span>
                  <span className="sv-bar-stats">
                    <strong className="sv-bar-value shopify-bar-value">{fmt(row.value)}</strong>
                    {nonNegative.length > 1 && <span className="sv-bar-share">{share}%</span>}
                  </span>
                </span>
                <span className="sv-bar-track workspace-bar-track shopify-bar-track" aria-hidden="true">
                  <span
                    className="sv-bar-fill shopify-bar-fill"
                    style={{
                      width: pct + '%',
                      backgroundColor: fill,
                      opacity: hovered !== null && !isHovered ? 0.45 : 1,
                    }}
                  />
                  {priorPct !== null && (
                    <span
                      className="sv-bar-compare-mark"
                      style={{ left: priorPct + '%' }}
                      title={`Previous period: ${fmt(priorVal!)}`}
                    />
                  )}
                </span>
              </>
            );
            return (
              <li
                key={row.key}
                className="sv-bar-row"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {onInspect ? (
                  <button
                    type="button"
                    className="sv-btn sv-bar-row-btn"
                    aria-label={`${row.label}: ${fmt(row.value)}. Inspect matching records.`}
                    onClick={() => onInspect(row.key)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="sv-bar-row-inner">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
