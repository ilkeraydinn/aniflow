import React, { useState, useRef } from 'react';
import { NormalizedAnimeItem } from '../../types';
import { ProgressBar } from './ProgressBar';
import { Plus, Check, ExternalLink, Edit2, Clock, Star } from 'lucide-react';
import { Button } from '../common/Button';
import { getAnimeAuraColor } from '../../utils/auraColor';
import { anilistService } from '../../services/anilistClient';

export function formatAiringCountdown(airing?: { episode: number; timeUntilAiring: number; airingAt?: number } | null): string {
  if (!airing) return '';

  const secondsLeft = airing.airingAt
    ? Math.max(0, airing.airingAt - Math.floor(Date.now() / 1000))
    : (airing.timeUntilAiring ?? 0);

  if (secondsLeft <= 0) {
    return `Ep ${airing.episode}: Airing now`;
  }
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);

  if (days > 0) {
    return `Ep ${airing.episode}: in ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `Ep ${airing.episode}: in ${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `Ep ${airing.episode}: in ${minutes}m`;
  }
  return `Ep ${airing.episode}: in < 1m`;
}

export interface AnimeCardProps {
  item: NormalizedAnimeItem;
  onIncrement: (item: NormalizedAnimeItem) => Promise<void>;
  onOpenDetail: (item: NormalizedAnimeItem) => void;
  onOpenScore?: (item: NormalizedAnimeItem) => void;
  isPending?: boolean;
}

const AnimeCardComponent: React.FC<AnimeCardProps> = ({
  item,
  onIncrement,
  onOpenDetail,
  onOpenScore,
  isPending = false
}) => {
  const [imgError, setImgError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCompleted =
    typeof item.episodes === 'number' && item.episodes > 0 && item.progress >= item.episodes;
  const hasUserScore = typeof item.userScore === 'number' && item.userScore > 0;

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCompleted && !isPending) {
      onIncrement(item);
    }
  };

  return (
    <article
      className="anime-card-ambient anime-card-list"
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
      style={
        {
          display: 'flex',
          gap: '12px',
          padding: '12px',
          borderRadius: '14px',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxSizing: 'border-box',
          position: 'relative',
          '--card-color': getAnimeAuraColor(item.coverColor, item.mediaId)
        } as React.CSSProperties
      }
    >
      {/* Pinned Subtle External Link Icon (Frameless, zero box clutter) */}
      {item.siteUrl ? (
        <a
          href={item.siteUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${item.title} on AniList`}
          title={`Open ${item.title} on AniList`}
          className="card-ext-link-plain"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-tertiary)',
            backgroundColor: 'transparent',
            border: 'none',
            opacity: 0.75,
            zIndex: 2
          }}
        >
          <ExternalLink size={12.5} />
        </a>
      ) : null}

      {/* Anime Cover */}
      <div
        className="card-cover-thumb card-thumb-interactive"
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetail(item);
          }
        }}
        title={`View details for ${item.title}`}
        style={{
          width: '64px',
          minWidth: '64px',
          minHeight: '92px',
          alignSelf: 'stretch',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--color-input-bg)',
          border: '1px solid var(--color-border)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
      >
        {!imgError ? (
          <img
            src={item.coverImageMedium || item.coverImage}
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
              display: 'block'
            }}
          />
        ) : (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--color-tertiary)',
              textAlign: 'center',
              padding: '4px'
            }}
          >
            No image
          </span>
        )}
      </div>

      {/* Right Content: Metadata & Single-Row Bottom Progress Bar */}
      <div
        style={{
          flex: 1,
          minWidth: 0, // Critical to avoid horizontal overflow with ellipsis
          minHeight: '92px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px'
        }}
      >
        {/* Top Metadata Group: Title, Scores, Airing Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ paddingRight: '22px' }}>
            <h2
              className="line-clamp-2 card-title-interactive"
              title={`View details for ${item.title}`}
              onClick={() => onOpenDetail(item)}
              style={{
                fontSize: '13.5px',
                fontWeight: 600,
                lineHeight: 1.25,
                color: 'var(--color-primary)',
                margin: 0,
                cursor: 'pointer'
              }}
            >
              {item.title}
            </h2>
          </div>

          {/* Scores hierarchy: Interactive user score badge vs frameless AniList average */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              lineHeight: 1,
              flexWrap: 'wrap'
            }}
          >
            {/* Interactive User Score Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenScore?.(item);
              }}
              title={hasUserScore ? `Your score: ${item.userScore!.toFixed(1)} / 10 (Click to edit)` : 'Rate this anime'}
              className={hasUserScore ? 'user-score-badge-btn' : 'card-icon-btn-subtle'}
              style={{
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4.5px',
                background: hasUserScore ? 'var(--color-score-bg)' : 'var(--color-input-bg)',
                border: hasUserScore ? '1px solid var(--color-score-border)' : '1px solid var(--color-border)',
                borderRadius: '7px',
                padding: '0 7.5px',
                cursor: 'pointer',
                fontSize: '11.5px',
                lineHeight: 1,
                color: hasUserScore ? 'var(--color-score)' : 'var(--color-secondary)',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {hasUserScore ? (
                <>
                  <Star
                    size={11}
                    fill="var(--color-score-star)"
                    color="var(--color-score-star)"
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontWeight: 700,
                      color: 'var(--color-score)',
                      letterSpacing: '0.01em'
                    }}
                  >
                    {item.userScore!.toFixed(1)}
                  </span>
                  <Edit2 size={9.5} style={{ opacity: 0.75, flexShrink: 0 }} />
                </>
              ) : (
                <>
                  <Star size={10.5} style={{ opacity: 0.65, flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, fontSize: '11px' }}>+ Rate</span>
                </>
              )}
            </button>

            <span style={{ color: 'var(--color-tertiary)', fontSize: '10px', userSelect: 'none' }}>•</span>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'var(--color-secondary)' }}>AniList</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                {item.averageScore !== null ? `${item.averageScore}%` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Next Episode Airing Countdown (Frameless Info) & Unwatched Aired Episode Badge (Highlighted Pill) */}
          {item.nextAiringEpisode ? (() => {
            const airedEpisodes = Math.max(0, item.nextAiringEpisode.episode - 1);
            const unwatchedAiredCount = Math.max(0, airedEpisodes - (item.progress || 0));

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginTop: '1px'
                }}
              >
                {/* Frameless Informational Countdown */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4.5px',
                    fontSize: '11px',
                    lineHeight: 1.2,
                    color: 'var(--color-secondary)',
                    maxWidth: '100%'
                  }}
                  title={`Next episode: Ep ${item.nextAiringEpisode.episode}`}
                >
                  <Clock size={11} style={{ color: 'var(--color-tertiary)', flexShrink: 0 }} />
                  <span
                    style={{
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {formatAiringCountdown(item.nextAiringEpisode)}
                  </span>
                </div>

                {/* Highlighted Action Badge only when an episode is already out */}
                {unwatchedAiredCount > 0 ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10.5px',
                      lineHeight: 1,
                      color: 'var(--color-watching)',
                      backgroundColor: 'var(--color-watching-bg)',
                      border: '1px solid color-mix(in srgb, var(--color-watching) 45%, transparent)',
                      borderRadius: '6px',
                      padding: '2.5px 7px',
                      width: 'fit-content',
                      boxSizing: 'border-box'
                    }}
                    title={
                      unwatchedAiredCount === 1
                        ? `Episode ${airedEpisodes} has already aired!`
                        : `${unwatchedAiredCount} aired episodes are ready to watch!`
                    }
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-watching)',
                        boxShadow: '0 0 6px var(--color-watching)',
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {unwatchedAiredCount === 1
                        ? `Ep ${airedEpisodes} Out`
                        : `${unwatchedAiredCount} New Eps`}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })() : null}
        </div>

        {/* Single-Row Bottom Bar: Progress Bar + Episode Counter + Compact '+' Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            marginTop: 'auto'
          }}
        >
          <ProgressBar current={item.progress} total={item.episodes} />

          {isCompleted ? (
            <div
              title="Anime completed"
              aria-label={`${item.title} is completed`}
              style={{
                width: '28px',
                height: '28px',
                minWidth: '28px',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-badge-bg)',
                color: 'var(--color-success)',
                border: '1px solid var(--color-border)',
                flexShrink: 0
              }}
            >
              <Check size={15} strokeWidth={2.4} />
            </div>
          ) : (
            <Button
              variant="icon"
              onClick={handleIncrement}
              disabled={isPending}
              isLoading={isPending}
              aria-label={`Increment episode progress for ${item.title} from ${item.progress} to ${item.progress + 1}`}
              title={`+1 Episode (${item.progress} -> ${item.progress + 1})`}
              style={{
                width: '28px',
                height: '28px',
                minWidth: '28px',
                minHeight: '28px',
                borderRadius: '7px',
                flexShrink: 0
              }}
            >
              <Plus size={15} strokeWidth={2.2} />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
};

export const AnimeCard = React.memo(AnimeCardComponent, (prevProps, nextProps) => {
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
    prevProps.item.coverImageMedium === nextProps.item.coverImageMedium &&
    prevProps.item.coverColor === nextProps.item.coverColor &&
    prevProps.item.siteUrl === nextProps.item.siteUrl &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.episodes === nextProps.item.episodes &&
    prevProps.item.nextAiringEpisode?.episode === nextProps.item.nextAiringEpisode?.episode &&
    prevProps.item.nextAiringEpisode?.airingAt === nextProps.item.nextAiringEpisode?.airingAt &&
    prevProps.item.nextAiringEpisode?.timeUntilAiring === nextProps.item.nextAiringEpisode?.timeUntilAiring
  );
});
