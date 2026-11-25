import { useEffect, useState } from 'react';

/**
 * Shared visual language for every AfriCore chart, modelled on Shopify Analytics
 * (Polaris Viz): calm gridlines, smooth monotone lines, dashed comparison periods,
 * rounded bars and compact axis labels.
 */
export const vizPalette = [
  '#3c8ceb', // blue (primary)
  '#7f56d9', // purple
  '#2bb5a6', // teal
  '#f08c3a', // orange
  '#e0559d', // magenta
  '#e4b83a', // yellow
  '#5b6b7f', // slate
  '#4cc3e6', // cyan
];
export const vizComparisonColor = '#a9c9f5';
export const vizPositive = '#29845a';
export const vizNegative = '#d72c0d';
export function vizColor(index: number) {
  const n = vizPalette.length;
  return vizPalette[((index % n) + n) % n];
}

const zeroDecimal = ['UGX', 'RWF'];
/** AfriCore amounts are stored in minor units except for zero-decimal currencies. */
export function toMajor(value: number, currency?: string) {
  return currency ? value / (zeroDecimal.includes(currency) ? 1 : 100) : value;
}
export function formatValue(value: number, currency?: string) {
  if (!Number.isFinite(value)) return '—';
  return currency
    ? new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(toMajor(value, currency))
    : new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(value);
}
export function formatAxis(value: number, currency?: string) {
  const major = toMajor(value, currency);
  try {
    return new Intl.NumberFormat('en-KE', {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(currency ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } : {}),
    }).format(major);
  } catch {
    return new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(
      major,
    );
  }
}
export function formatCount(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('en-KE') : '—';
}

/** Percentage change, or null when the previous value cannot support a ratio. */
export function percentChange(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
/** Rounded axis domain that always includes zero, like Polaris Viz y-axes. */
export function niceScale(values: number[], count = 4, integer = false) {
  const finite = values.filter(Number.isFinite);
  let low = Math.min(0, ...finite),
    high = Math.max(0, ...finite);
  if (low === high) high = integer ? Math.max(1, count) : 1;
  let step = niceStep(high - low, count);
  if (integer) step = Math.max(1, Math.ceil(step));
  const min = Math.floor(low / step) * step,
    max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return { min, max: max === min ? min + step : max, ticks };
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth without overshooting data. */
export function smoothPath(points: [number, number][]) {
  const n = points.length;
  if (!n) return '';
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;
  if (n === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;
  const dx: number[] = [],
    slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    slope[i] = dx[i] ? (points[i + 1][1] - points[i][1]) / dx[i] : 0;
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) tangent[i] = 0;
    else
      tangent[i] =
        (3 * (dx[i - 1] + dx[i])) /
        ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i],
      [x1, y1] = points[i + 1],
      third = dx[i] / 3;
    d += `C${x0 + third},${y0 + tangent[i] * third} ${x1 - third},${y1 - tangent[i + 1] * third} ${x1},${y1}`;
  }
  return d;
}

/** Rounded-top bar path (rounded bottom for negative values). */
export function barPath(x: number, y: number, width: number, height: number, negative = false) {
  const r = Math.max(0, Math.min(4, width / 2, height));
  if (height <= 0) return '';
  if (!negative)
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return `M${x},${y}V${y + height - r}Q${x},${y + height} ${x + r},${y + height}H${x + width - r}Q${x + width},${y + height} ${x + width},${y + height - r}V${y}Z`;
}

const DAY = 86400000;
export function dateGranularity(dates: string[]): 'day' | 'month' {
  if (dates.length < 2 || !dates.every((d) => /^\d{4}-\d{2}-01$/.test(d))) return 'day';
  for (let i = 1; i < dates.length; i++)
    if (Date.parse(dates[i]) - Date.parse(dates[i - 1]) < 27 * DAY) return 'day';
  return 'month';
}
export function formatDateLabel(date: string, granularity: 'day' | 'month' = 'day', withYear = false) {
  const value = new Date(date.length === 7 ? date + '-01T00:00:00Z' : date + 'T00:00:00Z');
  if (!Number.isFinite(value.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    ...(granularity === 'month' ? { year: 'numeric' } : { day: 'numeric' }),
    ...(withYear && granularity === 'day' ? { year: 'numeric' } : {}),
  }).format(value);
}
export function formatDateRange(from?: string, to?: string, granularity: 'day' | 'month' = 'day') {
  if (!from) return '';
  if (!to || from === to) return formatDateLabel(from, granularity, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatDateLabel(from, granularity, !sameYear)} – ${formatDateLabel(to, granularity, true)}`;
}
export function shiftIsoDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
}
/** Evenly spaced indices for axis labels. */
export function evenIndices(length: number, max: number) {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const result = new Set<number>();
  for (let j = 0; j < max; j++) result.add(Math.round((j * (length - 1)) / Math.max(1, max - 1)));
  return [...result];
}
export function safeDomId(id: string) {
  return 'sv' + id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Measures an element so charts can render in real pixels (crisp text, no distortion). */
export function useElementWidth<T extends Element>(fallback = 640) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!node) return;
    const update = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}
