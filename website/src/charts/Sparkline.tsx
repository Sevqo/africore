import { useId } from 'react';
import { safeDomId, smoothPath, vizComparisonColor, vizPalette } from './viz';
import './viz.css';

/** Compact trend line used inside metric tiles (Shopify analytics header cards). */
export function Sparkline({
  values,
  comparison,
  color = vizPalette[0],
  height = 36,
  label,
}: {
  values: number[];
  comparison?: number[];
  color?: string;
  height?: number;
  label?: string;
}) {
  const id = safeDomId(useId());
  const all = [...values, ...(comparison || [])].filter(Number.isFinite);
  if (values.length < 2 || !all.length) return <div className="sv-spark sv-spark--empty" style={{ height }} />;
  const min = Math.min(0, ...all),
    max = Math.max(...all, min + 1),
    pad = 3,
    toPoints = (series: number[]) =>
      series.map(
        (value, i) =>
          [
            (i / Math.max(1, values.length - 1)) * 100,
            pad + ((max - value) / (max - min)) * (height - pad * 2),
          ] as [number, number],
      ),
    line = smoothPath(toPoints(values)),
    compare = comparison && comparison.length > 1 ? smoothPath(toPoints(comparison.slice(0, values.length))) : '';
  return (
    <svg
      className="sv-spark"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      height={height}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,${height}L0,${height}Z`} fill={`url(#${id})`} />
      {compare && (
        <path
          d={compare}
          fill="none"
          stroke={vizComparisonColor}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
