import React from 'react';
import { MediaListStatus } from '../../types';
import { RollingNumber } from '../common/RollingNumber';

interface ProgressBarProps {
  current: number;
  total: number | null | undefined;
  status?: MediaListStatus | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, status }) => {
  const safeCurrent = Math.max(0, current || 0);
  const hasValidTotal = typeof total === 'number' && total > 0;

  // Defensive calculation against division by zero, NaN, Infinity
  let percentage = 0;
  if (hasValidTotal) {
    const raw = (safeCurrent / total) * 100;
    percentage = isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  }

  const isDropped = status === 'DROPPED';
  const isPaused = status === 'PAUSED';
  const isCompleted = !isDropped && !isPaused && hasValidTotal && safeCurrent >= total;
  const isNearCompletion = !isDropped && !isPaused && hasValidTotal && !isCompleted && total - safeCurrent <= 2;

  let barClass = '';
  if (isCompleted) {
    barClass = 'progress-bar-completed';
  } else if (isNearCompletion) {
    barClass = 'progress-bar-near-completion';
  }

  const fillColor = isDropped
    ? 'var(--color-error)'
    : isPaused
    ? 'var(--color-paused)'
    : isCompleted
    ? 'var(--color-success)'
    : isNearCompletion
    ? 'var(--color-accent)'
    : 'var(--color-progress-fill)';

  const textColor = isDropped
    ? 'var(--color-error)'
    : isPaused
    ? 'var(--color-paused)'
    : isCompleted
    ? 'var(--color-success)'
    : isNearCompletion
    ? 'var(--color-accent)'
    : 'var(--color-primary)';

  const tooltipText = isDropped
    ? `Dropped at episode ${safeCurrent}${hasValidTotal ? ` of ${total}` : ''}`
    : isPaused
    ? `Paused at episode ${safeCurrent}${hasValidTotal ? ` of ${total}` : ''}`
    : isCompleted
    ? 'Completed'
    : isNearCompletion && hasValidTotal
    ? `${total - safeCurrent} episode${total - safeCurrent === 1 ? '' : 's'} left`
    : 'Watched / Total episodes';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flex: 1,
        minWidth: 0
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '5.5px',
          backgroundColor: 'var(--color-progress-bg)',
          borderRadius: '999px',
          overflow: 'hidden'
        }}
      >
        <div
          className={barClass}
          style={{
            height: '100%',
            width: hasValidTotal ? `${percentage}%` : safeCurrent > 0 ? '45%' : '0%',
            backgroundColor: fillColor,
            borderRadius: '999px',
            transition: 'width 0.25s ease-out, background-color 0.2s ease',
            opacity: hasValidTotal || safeCurrent > 0 ? (isDropped || isPaused ? 0.85 : 1) : 0.4
          }}
        />
      </div>

      <span
        title={tooltipText}
        style={{
          fontSize: '11.5px',
          lineHeight: 1,
          color: textColor,
          fontWeight: isCompleted || isNearCompletion || isDropped || isPaused ? 600 : 500,
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: '2.5px',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {(isDropped || isPaused) ? (
          <span style={{ color: 'var(--color-secondary)', fontWeight: 500, marginRight: '1px' }}>
            Ep
          </span>
        ) : null}
        <RollingNumber value={safeCurrent} />
        <span style={{ color: 'var(--color-tertiary)', fontWeight: 400 }}>/</span>
        <span style={{ color: 'var(--color-secondary)', fontWeight: 500 }}>{hasValidTotal ? total : '?'}</span>
      </span>
    </div>
  );
};
