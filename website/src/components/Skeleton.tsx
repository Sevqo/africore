import type { CSSProperties } from 'react';

const shimmerStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%)',
  backgroundSize: '400% 100%',
  animation: 'ac-shimmer 1.35s ease-in-out infinite',
  borderRadius: 8,
};

export function ShimmerStyles() {
  return (
    <style>{`
      @keyframes ac-shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .ac-skeleton-wrap {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 4px 0;
      }
      .ac-skeleton-kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
      }
      .ac-skeleton-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ac-skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
      }
    `}</style>
  );
}

export function SkeletonBar({
  width = '100%',
  height = 14,
}: {
  width?: string | number;
  height?: number;
}) {
  return <div aria-hidden="true" style={{ ...shimmerStyle, width, height }} />;
}

export function WorkspaceSkeleton({ label = 'Loading workspace…' }: { label?: string }) {
  return (
    <div className="ac-skeleton-wrap" role="status" aria-live="polite">
      <ShimmerStyles />
      <span style={{ fontSize: 12.5, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <div className="ac-skeleton-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <SkeletonBar width={90} height={28} />
        <SkeletonBar width={80} height={22} />
        <SkeletonBar width={85} height={22} />
        <SkeletonBar width={95} height={22} />
      </div>
      <div className="ac-skeleton-kpis">
        {[1, 2, 3, 4].map((i) => (
          <div className="ac-skeleton-card" key={i}>
            <SkeletonBar width="48%" height={12} />
            <SkeletonBar width="68%" height={24} />
            <SkeletonBar width="40%" height={10} />
          </div>
        ))}
      </div>
      <div className="ac-skeleton-card">
        <SkeletonBar width="30%" height={16} />
        {[1, 2, 3, 4, 5].map((r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'center', padding: '6px 0' }}>
            <SkeletonBar width="85%" height={13} />
            <SkeletonBar width="65%" height={13} />
            <SkeletonBar width="55%" height={13} />
            <SkeletonBar width={64} height={24} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  label = 'Loading catalog…',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="ac-skeleton-wrap" role="status" aria-live="polite">
      <ShimmerStyles />
      <span style={{ fontSize: 12.5, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <div className="ac-skeleton-grid">
        {Array.from({ length: count }, (_, idx) => (
          <div className="ac-skeleton-card" key={idx}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SkeletonBar width={40} height={40} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SkeletonBar width="65%" height={15} />
                <SkeletonBar width="40%" height={11} />
              </div>
            </div>
            <SkeletonBar width="92%" height={12} />
            <SkeletonBar width="74%" height={12} />
            <SkeletonBar width={110} height={28} />
          </div>
        ))}
      </div>
    </div>
  );
}
