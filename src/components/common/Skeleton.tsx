import React from 'react';

export const Skeleton: React.FC<{
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = '16px', borderRadius = '6px', className = '', style }) => {
  return (
    <div
      className={`skeleton-shimmer ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
        ...style
      }}
    />
  );
};

export const AnimeCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px',
        borderRadius: '14px',
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)'
      }}
    >
      <Skeleton width="64px" height="92px" borderRadius="8px" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton width="75%" height="16px" />
        <Skeleton width="45%" height="12px" />
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Skeleton width="35%" height="11px" />
          <Skeleton width="100%" height="6px" borderRadius="3px" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <Skeleton width="40px" height="40px" borderRadius="8px" />
      </div>
    </div>
  );
};

export const AnimeGridCardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '260px',
        borderRadius: '14px',
        overflow: 'hidden',
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '12px',
        boxSizing: 'border-box'
      }}
    >
      <div className="skeleton-shimmer" style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton width="85%" height="13px" borderRadius="4px" />
        <Skeleton width="55%" height="10px" borderRadius="3px" />
        <Skeleton width="100%" height="4px" borderRadius="2px" />
      </div>
    </div>
  );
};
