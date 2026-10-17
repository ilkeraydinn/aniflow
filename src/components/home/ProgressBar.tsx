import React from 'react';
import { RollingNumber } from '../common/RollingNumber';

interface ProgressBarProps {
  current: number;
  total: number | null | undefined;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const safeCurrent = Math.max(0, current || 0);
  const hasValidTotal = typeof total === 'number' && total > 0;

  // Defensive calculation against division by zero, NaN, Infinity
  let percentage = 0;
  if (hasValidTotal) {
    const raw = (safeCurrent / total) * 100;
    percentage = isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  }

  const isCompleted = hasValidTotal && safeCurrent >= total;
  const isNearCompletion = hasValidTotal && !isCompleted && total - safeCurrent <= 2;

  let barClass = '';
  if (isCompleted) {
    barClass = 'progress-bar-completed';
  } else if (isNearCompletion) {
    barClass = 'progress-bar-near-completion';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: '11px',
          lineHeight: 1
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: 'var(--color-secondary)' }}>Progress</span>
          {isCompleted ? (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-success)',
                letterSpacing: '0.02em'
              }}
            >
              Completed ✓
            </span>
          ) : isNearCompletion ? (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-accent)',
                letterSpacing: '0.02em'
              }}
            >
              {total - safeCurrent} left
            </span>
          ) : null}
        </div>

        <span
          className="font-mono"
          style={{
            color: isCompleted
              ? 'var(--color-success)'
              : isNearCompletion
              ? 'var(--color-accent)'
              : 'var(--color-primary)',
            fontWeight: isCompleted || isNearCompletion ? 600 : 500,
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: '3px'
          }}
        >
          <RollingNumber value={safeCurrent} />
          <span>/</span>
          <span>{hasValidTotal ? total : '?'}</span>
        </span>
      </div>

      <div
        style={{
          width: '100%',
          height: '5px',
          backgroundColor: 'var(--color-progress-bg)',
          borderRadius: '3px',
          overflow: 'hidden'
        }}
      >
        <div
          className={barClass}
          style={{
            height: '100%',
            width: hasValidTotal ? `${percentage}%` : '20%',
            backgroundColor: isCompleted
              ? 'var(--color-success)'
              : isNearCompletion
              ? 'var(--color-accent)'
              : 'var(--color-progress-fill)',
            borderRadius: '3px',
            transition: 'width 0.25s ease-out, background-color 0.2s ease',
            opacity: hasValidTotal ? 1 : 0.4
          }}
        />
      </div>
    </div>
  );
};
