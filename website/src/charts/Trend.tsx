import './viz.css';

/** Shopify-style change indicator: arrow + percentage, green when the change is good. */
export function Trend({
  value,
  invert = false,
  label = 'from previous period',
}: {
  value: number | null | undefined;
  /** Set when a decrease is the desirable direction (e.g. expenses, overdue amounts). */
  invert?: boolean;
  label?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return (
      <span className="sv-trend sv-trend--flat" title={`No comparable value ${label}`}>
        —
      </span>
    );
  const flat = Math.abs(value) < 0.05,
    up = value > 0,
    good = invert ? !up : up,
    magnitude = Math.abs(value),
    text = `${magnitude >= 10 ? Math.round(magnitude) : magnitude.toFixed(1)}%`;
  return (
    <span
      className={`sv-trend ${flat ? 'sv-trend--flat' : good ? 'sv-trend--positive' : 'sv-trend--negative'}`}
      aria-label={`${flat ? 'No change' : up ? 'Up ' + text : 'Down ' + text} ${label}`}
      title={`${flat ? 'No change' : (up ? '+' : '−') + text} ${label}`}
    >
      {!flat && (
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d={up ? 'M3 8.5 L8.5 3 M4.5 3 H8.5 V7' : 'M3 3.5 L8.5 9 M8.5 5 V9 H4.5'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {flat ? '0%' : text}
    </span>
  );
}
