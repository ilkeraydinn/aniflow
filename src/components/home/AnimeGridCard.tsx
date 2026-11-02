import React, { useState, useRef } from 'react';
import { NormalizedAnimeItem } from '../../types';
import { Plus, Check, Clock, Loader2, Star } from 'lucide-react';
import { getAnimeAuraColor } from '../../utils/auraColor';
import { formatAiringCountdown } from './AnimeCard';
import { anilistService } from '../../services/anilistClient';

export interface AnimeGridCardProps {
  item: NormalizedAnimeItem;
  onIncrement: (item: NormalizedAnimeItem) => Promise<void>;
  onOpenDetail: (item: NormalizedAnimeItem) => void;
  onOpenScore?: (item: NormalizedAnimeItem) => void;
  isPending?: boolean;
}

const AnimeGridCardComponent: React.FC<AnimeGridCardProps> = ({
  item,
  onIncrement,
  onOpenDetail,
  onOpenScore,
  isPending = false
}) => {
  const [imgError, setImgError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeCurrent = Math.max(0, item.progress || 0);
  const total = typeof item.episodes === 'number' && item.episodes > 0 ? item.episodes : null;
  const isCompleted = total !== null && safeCurrent >= total;
  const hasUserScore = typeof item.userScore === 'number' && item.userScore > 0;
  const percentage = total
    ? Math.min(100, Math.max(0, (safeCurrent / total) * 100))
    : safeCurrent > 0
      ? item.nextAiringEpisode?.episode && item.nextAiringEpisode.episode > 1
        ? Math.min(75, Math.max(25, (safeCurrent / item.nextAiringEpisode.episode) * 72))
        : 50
      : 0;
  const airingText = formatAiringCountdown(item.nextAiringEpisode);

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCompleted && !isPending) {
      onIncrement(item);
    }
  };

  return (
    <article
      className="anime-card-ambient anime-card-grid"
      onClick={() => onOpenDetail(item)}
      onMouseEnter={() => {
        hoverTimerRef.current = setTimeout(() => {
          anilistService.prefetchAnimeDetails(item.mediaId);
        }, 350);
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
      }}
      title={`View details for ${item.title}`}
      style={
        {
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
          cursor: 'pointer',
          boxSizing: 'border-box',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
          '--card-color': getAnimeAuraColor(item.coverColor, item.mediaId)
        } as React.CSSProperties
      }
    >
      {/* Background Poster Image */}
      {!imgError ? (
        <img
          src={item.coverImage}
          alt={item.title}
          onError={() => setImgError(true)}
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.25s ease',
            display: 'block'
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'var(--color-input-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-tertiary)',
            fontSize: '11px'
          }}
        >
          No Image
        </div>
      )}

      {/* Top Floating Badges */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '6px',
          zIndex: 2,
          pointerEvents: 'none'
        }}
      >
        {/* Left Badge: User Score (★ 8.0) if rated, otherwise Community Score (AL 81%) without star */}
        {hasUserScore ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenScore?.(item);
            }}
            title={`Your score: ${item.userScore!.toFixed(1)} (Click to edit)`}
            style={{
              pointerEvents: onOpenScore ? 'auto' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3.5px',
              padding: '2.5px 6.5px',
              borderRadius: '7px',
              backgroundColor: 'rgba(14, 14, 16, 0.88)',
              border: '1px solid rgba(251, 191, 36, 0.38)',
              color: 'var(--color-accent)',
              fontSize: '10.5px',
              fontWeight: 600,
              lineHeight: 1.2,
              cursor: onOpenScore ? 'pointer' : 'default',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            <Star size={10} fill="var(--color-accent)" color="var(--color-accent)" />
            <span>{item.userScore!.toFixed(1)}</span>
          </button>
        ) : typeof item.averageScore === 'number' ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '3px',
              padding: '2.5px 6.5px',
              borderRadius: '7px',
              backgroundColor: 'rgba(14, 14, 16, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              fontSize: '10px',
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.65)', fontWeight: 500 }}>AL</span>
            <span style={{ color: '#ffffff', fontWeight: 600 }}>{item.averageScore}%</span>
          </span>
        ) : (
          <span />
        )}

        {/* Airing Countdown & Unwatched Episode Badge */}
        {airingText ? (() => {
          const airedEpisodes = item.nextAiringEpisode
            ? Math.max(0, item.nextAiringEpisode.episode - 1)
            : 0;
          const unwatchedAiredCount = Math.max(0, airedEpisodes - safeCurrent);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3.5px',
                  padding: '2.5px 6.5px',
                  borderRadius: '7px',
                  backgroundColor: 'rgba(14, 14, 16, 0.88)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  color: '#38bdf8',
                  fontSize: '10px',
                  fontWeight: 500,
                  lineHeight: 1.2,
                  maxWidth: '112px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                <Clock size={9.5} style={{ flexShrink: 0 }} />
                <span>{airingText.replace('Ep ', 'E')}</span>
              </span>
              {unwatchedAiredCount > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2.5px 6.5px',
                    borderRadius: '7px',
                    backgroundColor: 'rgba(12, 37, 56, 0.92)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    color: '#38bdf8',
                    fontSize: '9.5px',
                    fontWeight: 600,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  <span
                    style={{
                      width: '4.5px',
                      height: '4.5px',
                      borderRadius: '50%',
                      backgroundColor: '#38bdf8',
                      boxShadow: '0 0 5px #38bdf8',
                      flexShrink: 0
                    }}
                  />
                  <span>
                    {unwatchedAiredCount === 1
                      ? `Ep ${airedEpisodes} Out`
                      : `${unwatchedAiredCount} New Eps`}
                  </span>
                </span>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {/* Bottom Gradient Overlay & Metadata */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: '34px 10px 10px 10px',
          background:
            'linear-gradient(to top, rgba(8, 8, 10, 0.98) 0%, rgba(8, 8, 10, 0.86) 46%, rgba(8, 8, 10, 0.42) 76%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px'
        }}
      >
        {/* Title Clamped */}
        <h3
          className="line-clamp-2"
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#ffffff',
            margin: 0,
            lineHeight: 1.25,
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)'
          }}
        >
          {item.title}
        </h3>

        {/* Single-Row Footer: Progress Bar + Episode Count + Quick +1 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px'
          }}
        >
          {/* Mini Progress Bar */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: '4px',
              borderRadius: '999px',
              backgroundColor: 'rgba(255, 255, 255, 0.22)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${percentage}%`,
                height: '100%',
                backgroundColor: isCompleted ? '#10b981' : 'var(--card-color, #38bdf8)',
                borderRadius: '999px',
                transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          </div>

          {/* Episode Count (UI Font + tabular-nums) */}
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              color: isCompleted ? '#34d399' : '#ffffff',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.85)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isCompleted ? (
              'Done ✓'
            ) : (
              <>
                {safeCurrent}
                <span style={{ color: 'rgba(255, 255, 255, 0.58)', fontWeight: 400 }}>
                  {' '}/ {total ?? '?'}
                </span>
              </>
            )}
          </span>

          {/* Quick +1 Button */}
          {!isCompleted ? (
            <button
              type="button"
              onClick={handleIncrement}
              disabled={isPending}
              aria-label={`Increment episode for ${item.title}`}
              title={`+1 Episode (${safeCurrent + 1})`}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '7px',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                backgroundColor: 'rgba(24, 24, 28, 0.88)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: isPending ? 'wait' : 'pointer',
                transition:
                  'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#ffffff';
                e.currentTarget.style.color = '#000000';
                e.currentTarget.style.transform = 'scale(1.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(24, 24, 28, 0.88)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.28)';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={13} strokeWidth={2.5} />
              )}
            </button>
          ) : (
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#34d399'
              }}
            >
              <Check size={12} strokeWidth={2.5} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export const AnimeGridCard = React.memo(AnimeGridCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.isPending === nextProps.isPending &&
    prevProps.onIncrement === nextProps.onIncrement &&
    prevProps.onOpenDetail === nextProps.onOpenDetail &&
    prevProps.onOpenScore === nextProps.onOpenScore &&
    prevProps.item.mediaId === nextProps.item.mediaId &&
    prevProps.item.progress === nextProps.item.progress &&
    prevProps.item.userScore === nextProps.item.userScore &&
    prevProps.item.userStatus === nextProps.item.userStatus &&
    prevProps.item.averageScore === nextProps.item.averageScore &&
    prevProps.item.coverImage === nextProps.item.coverImage &&
    prevProps.item.coverColor === nextProps.item.coverColor &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.episodes === nextProps.item.episodes &&
    prevProps.item.nextAiringEpisode?.episode === nextProps.item.nextAiringEpisode?.episode &&
    prevProps.item.nextAiringEpisode?.airingAt === nextProps.item.nextAiringEpisode?.airingAt &&
    prevProps.item.nextAiringEpisode?.timeUntilAiring === nextProps.item.nextAiringEpisode?.timeUntilAiring
  );
});
