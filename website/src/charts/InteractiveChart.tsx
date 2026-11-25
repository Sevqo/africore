import { useEffect, useId, useMemo, useState, type PointerEvent } from 'react';
import { DataTable } from '../components/DataTable';
import { Trend } from './Trend';
import {
  dateGranularity,
  daysBetween,
  evenIndices,
  formatAxis,
  formatDateLabel,
  formatDateRange,
  formatValue,
  niceScale,
  percentChange,
  safeDomId,
  shiftIsoDate,
  smoothPath,
  useElementWidth,
  vizPalette,
} from './viz';
import {
  isIsoDate,
  selectRange,
  rangeAvailable,
  previousPeriod,
  type ChartPoint,
  type ChartRange,
  type ChartSeries,
} from './model';
import './viz.css';

export const financialSeries: ChartSeries[] = [
  { key: 'inflows', label: 'Confirmed inflows', color: vizPalette[0] },
  { key: 'outflows', label: 'Recorded outflows', color: vizPalette[3] },
  { key: 'net', label: 'Net movement', color: vizPalette[2], dashed: true },
];

/**
 * Shopify Analytics-style time-series chart (Polaris Viz look): headline totals with
 * period-over-period change, smooth lines, soft gradient area, faint gridlines,
 * crosshair tooltip and a dashed previous-period comparison.
 */
export function InteractiveChart({
  title,
  points,
  comparisonPoints,
  comparisonPeriod,
  defaultCompare,
  series,
  currency,
  forecast = false,
  description,
  loading = false,
  headingLevel = 2,
  asOfDate,
  compact = false,
  variant = 'line',
  onPointSelect,
  height,
  showRanges = true,
  invertChange = false,
}: {
  title: string;
  points: ChartPoint[];
  /** Optional pre-fetched adjacent prior-period points (used when server filters [from, to]). */
  comparisonPoints?: ChartPoint[] | null;
  comparisonPeriod?: { from: string; to: string } | null;
  defaultCompare?: boolean;
  series: ChartSeries[];
  currency?: string;
  forecast?: boolean;
  description: string;
  loading?: boolean;
  headingLevel?: 2 | 3;
  asOfDate?: string;
  compact?: boolean;
  variant?: 'line' | 'area';
  onPointSelect?: (point: ChartPoint) => void;
  height?: number;
  showRanges?: boolean;
  /** Treat decreases as favourable in the change indicator (e.g. costs). */
  invertChange?: boolean;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const rawId = useId(),
    id = safeDomId(rawId),
    [range, setRange] = useState<ChartRange>('ALL'),
    [active, setActive] = useState<number | null>(null),
    [pinned, setPinned] = useState<number | null>(null),
    [hidden, setHidden] = useState<string[]>([]),
    [compare, setCompare] = useState(!!defaultCompare),
    [plotRef, width] = useElementWidth<HTMLDivElement>(640);

  useEffect(() => {
    if (defaultCompare !== undefined) setCompare(defaultCompare);
  }, [defaultCompare]);

  const valid = useMemo(
    () => points.filter((p) => series.every((s) => Number.isFinite(Number(p[s.key])))),
    [points, series],
  );
  const shown = useMemo(
    () => selectRange(valid, range, forecast, asOfDate),
    [valid, range, forecast, asOfDate],
  );
  const externalPrior = useMemo(() => {
    if (forecast || range !== 'ALL' || !comparisonPoints?.length || !shown.length) return null;
    const clean = comparisonPoints
      .filter((p) => isIsoDate(p.date) && series.every((s) => Number.isFinite(Number(p[s.key]))))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!clean.length) return null;
    const from = comparisonPeriod?.from || clean[0].date,
      to = comparisonPeriod?.to || clean.at(-1)!.date,
      offsetDays = daysBetween(from, shown[0].date);
    const byAlignedDate = new Map<string, ChartPoint>();
    if (offsetDays > 0 && shown.every((p) => !/^\d{4}-\d{2}-01$/.test(p.date))) {
      clean.forEach((p) => byAlignedDate.set(shiftIsoDate(p.date, offsetDays), p));
    } else {
      clean.forEach((p, idx) => {
        if (shown[idx]) byAlignedDate.set(shown[idx].date, p);
      });
    }
    return { from, to, records: clean, byAlignedDate };
  }, [comparisonPoints, comparisonPeriod, forecast, range, series, shown]);

  const prior = useMemo(
    () => (forecast ? null : externalPrior || previousPeriod(valid, range, asOfDate)),
    [valid, forecast, range, asOfDate, externalPrior],
  );
  const visible = series.filter((s) => !hidden.includes(s.key));
  const comparison = compare ? prior : null;
  const granularity = dateGranularity(shown.map((p) => p.date));
  const chartHeight = height ?? (compact ? 215 : 264);

  // Scales in real pixels so labels stay crisp at any width.
  const values = [...shown, ...(comparison?.records || [])].flatMap((p) =>
    visible.map((s) => Number(p[s.key])),
  );
  const integer = !currency && values.every((v) => Number.isInteger(v));
  const scale = niceScale(values.length ? values : [0, 1], compact ? 3 : 4, integer);
  const tickLabels = scale.ticks.map((t) => formatAxis(t, currency));
  const left = Math.max(30, Math.max(...tickLabels.map((l) => l.length)) * 6.4 + 12),
    right = 12,
    top = 10,
    bottom = 28;
  const plotW = Math.max(40, width - left - right),
    plotH = Math.max(40, chartHeight - top - bottom);
  const t0 = shown.length ? Date.parse(shown[0].date) : 0,
    t1 = shown.length ? Date.parse(shown.at(-1)!.date) : 0;
  const x = (i: number) =>
    shown.length < 2 || t1 === t0
      ? left + plotW / 2
      : left + ((Date.parse(shown[i].date) - t0) / (t1 - t0)) * plotW;
  const y = (n: number) => top + ((scale.max - n) / (scale.max - scale.min || 1)) * plotH;
  const baseline = y(Math.min(Math.max(0, scale.min), scale.max));

  const sum = (rows: ChartPoint[], key: string) =>
    rows.reduce((total, p) => total + Number(p[key] || 0), 0);
  const focusIndex = active ?? pinned;
  const focused =
    focusIndex !== null && shown.length ? shown[Math.min(focusIndex, shown.length - 1)] : null;
  const drillPoint = shown.length
    ? shown[Math.min(pinned ?? active ?? shown.length - 1, shown.length - 1)]
    : null;
  const headline = (key: string) =>
    forecast ? Number((focused ?? shown.at(-1))?.[key] ?? 0) : sum(shown, key);
  const ranges: ChartRange[] = forecast
    ? ['7D', '30D', '90D', 'ALL']
    : ['7D', '30D', '90D', 'YTD', '1Y', 'ALL'];
  const single = shown.length === 1;
  const showMarkers = shown.length <= 7;

  function nearest(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect(),
      px = event.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < shown.length; i++)
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  }
  const linePoints = (key: string) =>
    shown.map((p, i) => [x(i), y(Number(p[key]))] as [number, number]);
  const comparisonSegments = (key: string) => {
    if (!comparison) return [] as [number, number][][];
    const segments: [number, number][][] = [];
    let current: [number, number][] = [];
    shown.forEach((point, i) => {
      const previous = comparison.byAlignedDate.get(point.date);
      if (!previous) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push([x(i), y(Number(previous[key]))]);
    });
    if (current.length) segments.push(current);
    return segments;
  };
  const xTicks = evenIndices(shown.length, Math.max(2, Math.floor(plotW / 92)));
  const tipFlip =
    focusIndex !== null &&
    shown.length > 0 &&
    x(Math.min(focusIndex, shown.length - 1)) > width * 0.58;

  return (
    <figure className="sv-root sv-chart interactive-chart" aria-labelledby={id + '-title'}>
      <div className="sv-chart-head">
        <div className="sv-chart-titles">
          <Heading id={id + '-title'} className="sv-chart-title" title={description}>
            {title}
          </Heading>
          <span className="sv-chart-sub">
            {forecast
              ? 'Scenario projection'
              : shown.length
                ? formatDateRange(shown[0].date, shown.at(-1)!.date, granularity)
                : 'No recorded dates'}
            {currency ? ' · ' + currency : ''}
          </span>
        </div>
        {showRanges && (
          <div
            className="sv-segmented chart-ranges"
            role="group"
            aria-label={forecast ? 'Projection window' : 'Chart time range'}
          >
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                className="sv-btn sv-segment"
                aria-pressed={range === r}
                disabled={!rangeAvailable(points, r, forecast)}
                title={
                  rangeAvailable(points, r, forecast)
                    ? 'Filter loaded records'
                    : 'This complete time range is not loaded'
                }
                onClick={() => {
                  setRange(r);
                  setActive(null);
                  setPinned(null);
                }}
              >
                {r === 'ALL' ? 'All' : r}
              </button>
            ))}
          </div>
        )}
      </div>
      {(!compact || shown.length > 0) && (
        <div
          className={`sv-readout chart-readout ${visible.length === 1 ? 'sv-readout--single' : ''}`}
          aria-live="off"
        >
          {visible.map((s) => {
            const value = headline(s.key),
              change =
                prior && !forecast ? percentChange(value, sum(prior.records, s.key)) : undefined;
            return (
              <div key={s.key} className="sv-readout-item">
                <span className="sv-readout-label">
                  <i className="sv-dot" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="sv-readout-value-row">
                  <strong className="sv-readout-value">
                    {shown.length ? formatValue(value, currency) : '—'}
                  </strong>
                  {change !== undefined && shown.length > 0 && (
                    <Trend value={change} invert={invertChange} label="from previous period" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {loading ? (
        <div className="sv-skeleton chart-loading" role="status" style={{ height: chartHeight }}>
          <span className="sv-sr-only">Loading recorded activity…</span>
        </div>
      ) : !shown.length ? (
        <div className="sv-empty chart-empty" style={{ minHeight: compact ? 120 : 160 }}>
          <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">
            <path
              d="M2 28 C12 26 14 12 24 16 S38 6 46 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="3 4"
            />
          </svg>
          <h4>No activity for this period</h4>
          <p>Choose another period or add a relevant record to this workspace.</p>
        </div>
      ) : (
        <>
          <div className="sv-plot chart-plot" ref={plotRef} style={{ height: chartHeight }}>
            {focused && focusIndex !== null && (
              <div
                className={`sv-tooltip chart-tooltip ${tipFlip ? 'sv-tooltip--flip' : ''}`}
                role="tooltip"
                aria-hidden="true"
                style={{ left: x(Math.min(focusIndex, shown.length - 1)) }}
              >
                <strong className="sv-tooltip-title">
                  {formatDateLabel(focused.date, granularity, true)}
                </strong>
                {visible.map((s) => (
                  <span className="sv-tooltip-row" key={s.key}>
                    <span>
                      <i className="sv-line-swatch" style={{ borderColor: s.color }} />
                      {s.label}
                    </span>
                    <b>{formatValue(Number(focused[s.key]), currency)}</b>
                  </span>
                ))}
                {comparison && (
                  <>
                    <hr />
                    <strong className="sv-tooltip-title">
                      {comparison.byAlignedDate.get(focused.date)
                        ? formatDateLabel(
                            comparison.byAlignedDate.get(focused.date)!.date,
                            granularity,
                            true,
                          )
                        : 'No matching recorded date'}
                    </strong>
                    {visible.map((s) => (
                      <span className="sv-tooltip-row" key={'prior-' + s.key}>
                        <span>
                          <i
                            className="sv-line-swatch sv-line-swatch--dashed"
                            style={{ borderColor: s.color }}
                          />
                          {s.label}
                        </span>
                        <b>
                          {comparison.byAlignedDate.has(focused.date)
                            ? formatValue(
                                Number(comparison.byAlignedDate.get(focused.date)![s.key]),
                                currency,
                              )
                            : '—'}
                        </b>
                      </span>
                    ))}
                  </>
                )}
              </div>
            )}
            <svg
              width={width}
              height={chartHeight}
              viewBox={`0 0 ${width} ${chartHeight}`}
              role="img"
              aria-label={`${title}. ${shown.length} dates. Use the date explorer or the data table for exact values.`}
              onPointerMove={(e) => setActive(nearest(e))}
              onPointerDown={(e) => {
                const index = nearest(e);
                setActive(index);
                setPinned(index);
              }}
              onPointerLeave={() => setActive(null)}
              onPointerCancel={() => setActive(null)}
            >
              <defs>
                {visible.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`${id}-${s.key}-fill`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={s.color}
                      stopOpacity={variant === 'area' ? 0.22 : 0.14}
                    />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                  </linearGradient>
                ))}
              </defs>
              {scale.ticks.map((tick, i) => (
                <g key={tick}>
                  <line
                    className={tick === 0 && scale.min < 0 ? 'sv-grid sv-grid--zero' : 'sv-grid'}
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
              {xTicks.map((i) => {
                const px = x(i),
                  anchor =
                    shown.length < 2
                      ? 'middle'
                      : px < left + 28
                        ? 'start'
                        : px > left + plotW - 28
                          ? 'end'
                          : 'middle';
                return (
                  <text
                    key={shown[i].date}
                    className="sv-axis"
                    x={px}
                    y={chartHeight - 8}
                    textAnchor={anchor}
                  >
                    {formatDateLabel(shown[i].date, granularity)}
                  </text>
                );
              })}
              {!single &&
                visible.slice(0, variant === 'area' ? visible.length : 1).map((s) => {
                  const pts = linePoints(s.key);
                  return (
                    <path
                      key={'area-' + s.key}
                      d={`${smoothPath(pts)}L${pts.at(-1)![0]},${baseline}L${pts[0][0]},${baseline}Z`}
                      fill={`url(#${id}-${s.key}-fill)`}
                      aria-hidden="true"
                    />
                  );
                })}
              {comparison &&
                visible.map((s) =>
                  comparisonSegments(s.key).map((segment, index) => (
                    <g key={`prior-${s.key}-${index}`} aria-hidden="true">
                      {segment.length > 1 && (
                        <path
                          className="sv-line sv-line--comparison"
                          d={smoothPath(segment)}
                          stroke={s.color}
                        />
                      )}
                      {segment.length === 1 && (
                        <circle
                          cx={segment[0][0]}
                          cy={segment[0][1]}
                          r="3"
                          fill="#fff"
                          stroke={s.color}
                          strokeOpacity=".55"
                          strokeWidth="1.5"
                        />
                      )}
                    </g>
                  )),
                )}
              {visible.map((s) => (
                <g key={s.key}>
                  {!single && (
                    <path
                      className="sv-line"
                      d={smoothPath(linePoints(s.key))}
                      stroke={s.color}
                      strokeDasharray={s.dashed ? '6 4' : undefined}
                    />
                  )}
                  {(showMarkers || single) &&
                    shown.map((point, i) => (
                      <circle
                        key={point.date}
                        cx={x(i)}
                        cy={y(Number(point[s.key]))}
                        r={single ? 4.5 : 3}
                        fill="#fff"
                        stroke={s.color}
                        strokeWidth="2"
                      />
                    ))}
                </g>
              ))}
              {focusIndex !== null && shown[Math.min(focusIndex, shown.length - 1)] && (
                <g aria-hidden="true">
                  <line
                    className="sv-crosshair"
                    x1={x(Math.min(focusIndex, shown.length - 1))}
                    x2={x(Math.min(focusIndex, shown.length - 1))}
                    y1={top}
                    y2={top + plotH}
                  />
                  {comparison &&
                    visible.map((s) => {
                      const previous = comparison.byAlignedDate.get(focused!.date);
                      return previous ? (
                        <circle
                          key={'prior-dot-' + s.key}
                          cx={x(Math.min(focusIndex, shown.length - 1))}
                          cy={y(Number(previous[s.key]))}
                          r="4"
                          fill="#fff"
                          stroke={s.color}
                          strokeOpacity=".6"
                          strokeWidth="2"
                        />
                      ) : null;
                    })}
                  {visible.map((s) => (
                    <circle
                      key={'dot-' + s.key}
                      cx={x(Math.min(focusIndex, shown.length - 1))}
                      cy={y(Number(focused![s.key]))}
                      r="5"
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>
          <label className="sv-explorer chart-explorer">
            <span>Explore a date</span>
            <input
              aria-label={'Explore ' + title + ' by date'}
              type="range"
              min="0"
              max={Math.max(0, shown.length - 1)}
              value={Math.min(focusIndex ?? shown.length - 1, shown.length - 1)}
              aria-valuetext={
                focused
                  ? focused.date +
                    ': ' +
                    visible
                      .map((s) => s.label + ' ' + formatValue(Number(focused[s.key]), currency))
                      .join(', ')
                  : ''
              }
              onChange={(e) => {
                setActive(Number(e.target.value));
                setPinned(Number(e.target.value));
              }}
              onBlur={() => setActive(null)}
            />
          </label>
        </>
      )}
      {(!compact || shown.length > 0) && (
        <div className="sv-chart-foot">
          <div className="sv-legend chart-legend" role="group" aria-label="Visible chart series">
            {series.map((s) => (
              <button
                key={s.key}
                type="button"
                className="sv-btn sv-legend-item"
                aria-pressed={!hidden.includes(s.key)}
                disabled={!hidden.includes(s.key) && visible.length === 1}
                onClick={() =>
                  setHidden(
                    hidden.includes(s.key)
                      ? hidden.filter((k) => k !== s.key)
                      : [...hidden, s.key],
                  )
                }
              >
                <i
                  className={`sv-line-swatch ${s.dashed ? 'sv-line-swatch--dashed' : ''}`}
                  style={{ borderColor: s.color }}
                />
                {s.label}
              </button>
            ))}
            {comparison && (
              <span className="sv-legend-item sv-legend-item--static">
                <i
                  className="sv-line-swatch sv-line-swatch--dashed"
                  style={{ borderColor: '#8a8a8a' }}
                />
                {formatDateRange(comparison.from, comparison.to, granularity)}
              </span>
            )}
          </div>
          <div className="sv-chart-actions chart-comparison">
            {!forecast && (
              <button
                className="sv-btn sv-chip"
                type="button"
                aria-pressed={!!comparison}
                disabled={!prior}
                title={
                  prior
                    ? 'Compare recorded values in the preceding equal-length period'
                    : 'Choose a shorter range with earlier loaded history to compare periods'
                }
                onClick={() => setCompare((value) => !value)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M2 11 C5 9 6 5 9 6 S12 4 14 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M2 14 C5 12 6 9 9 10 S12 8 14 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeDasharray="2 2"
                  />
                </svg>
                Compare previous period
              </button>
            )}
            {onPointSelect && drillPoint && shown.length > 0 && (
              <button
                type="button"
                className="sv-btn sv-link chart-drill"
                onClick={() => onPointSelect(drillPoint)}
              >
                View records for {formatDateLabel(drillPoint.date, granularity, true)}
              </button>
            )}
          </div>
        </div>
      )}
      <p className="sv-chart-desc chart-description">
        {single ? 'Single recorded date shown as a point. ' : ''}
        {description}{' '}
        {forecast
          ? 'Ranges show the first projected days.'
          : 'Ranges filter the loaded records and end on their latest date.'}
      </p>
      <details className="sv-data chart-data">
        <summary>View exact data</summary>
        <div className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>Date</th>
                {series.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
                {comparison && (
                  <>
                    <th>Previous date</th>
                    {series.map((s) => (
                      <th key={'prior-' + s.key}>Previous {s.label.toLowerCase()}</th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  {series.map((s) => (
                    <td key={s.key}>{formatValue(Number(p[s.key]), currency)}</td>
                  ))}
                  {comparison && (
                    <>
                      <td>
                        {comparison.byAlignedDate.get(p.date)?.date || 'No matching recorded date'}
                      </td>
                      {series.map((s) => (
                        <td key={'prior-' + s.key}>
                          {comparison.byAlignedDate.has(p.date)
                            ? formatValue(
                                Number(comparison.byAlignedDate.get(p.date)![s.key]),
                                currency,
                              )
                            : '—'}
                        </td>
                      ))}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </details>
    </figure>
  );
}
