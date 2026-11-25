import { useId, useState } from 'react';

/** Shopify-style horizontal/vertical bar chart with crisp gridlines and hover callouts. */
export function BarChart({
  title,
  rows,
  onInspect,
  color = '#166534',
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
  onInspect?: (key: string) => void;
  color?: string;
}) {
  const id = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const valid = rows.filter((row) => Number.isFinite(row.value) && row.value >= 0);
  const max = Math.max(1, ...valid.map((row) => row.value));

  return (
    <figure className="workspace-bar-chart shopify-bar-chart" aria-labelledby={id}>
      <div className="shopify-bar-head">
        <figcaption id={id}>{title}</figcaption>
        {valid.length > 0 && (
          <span className="shopify-bar-total">
            {valid.reduce((sum, r) => sum + r.value, 0).toLocaleString('en-KE')} total
          </span>
        )}
      </div>
      {!valid.length ? (
        <p className="shopify-bar-empty">No covered records for this period.</p>
      ) : (
        <ul>
          {valid.map((row) => {
            const pct = Math.max(row.value > 0 ? 3 : 0, (row.value / max) * 100);
            const isHovered = hovered === row.key;
            const inner = (
              <>
                <span className="shopify-bar-label">{row.label}</span>
                <span className="workspace-bar-track shopify-bar-track" aria-hidden="true">
                  <span
                    className="shopify-bar-fill"
                    style={{
                      width: pct + '%',
                      backgroundColor: color,
                      opacity: hovered && !isHovered ? 0.55 : 1,
                    }}
                  />
                </span>
                <strong className="shopify-bar-value">{row.value.toLocaleString('en-KE')}</strong>
              </>
            );
            return (
              <li
                key={row.key}
                onMouseEnter={() => setHovered(row.key)}
                onMouseLeave={() => setHovered(null)}
              >
                {onInspect ? (
                  <button
                    type="button"
                    aria-label={`${row.label}: ${row.value.toLocaleString('en-KE')} records. Inspect matching records.`}
                    onClick={() => onInspect(row.key)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
