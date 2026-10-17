import React, { useState, useRef } from 'react';
import { NormalizedAnimeItem, MediaListStatus } from '../../types';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Plus, Check, ExternalLink, Edit2, Clock, PauseCircle } from 'lucide-react';
import { getAnimeAuraColor } from '../../utils/auraColor';
import { anilistService } from '../../services/anilistClient';

export interface SearchResultCardProps {
  anime: NormalizedAnimeItem;
  isAlreadyAdded: boolean;
  userStatus?: MediaListStatus | null;
  userScore?: number | null;
  onOpenScoreModal: (anime: NormalizedAnimeItem) => void;
  onOpenStatusModal: (anime: NormalizedAnimeItem, initialStatus?: MediaListStatus | null) => void;
  onOpenDetailModal: (anime: NormalizedAnimeItem) => void;
  onAdd?: (anime: NormalizedAnimeItem) => Promise<boolean>;
}

const SearchResultCardComponent: React.FC<SearchResultCardProps> = ({
  anime,
  isAlreadyAdded,
  userStatus,
  userScore,
  onOpenScoreModal,
  onOpenStatusModal,
  onOpenDetailModal
}) => {
  const [imgError, setImgError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User list status: either passed from SearchView, overrides, or AniList mediaListEntry
  const effectiveStatus =
    userStatus !== undefined
      ? userStatus
      : isAlreadyAdded
      ? 'CURRENT'
      : anime.userStatus ?? null;

  const rawScore =
    anime.userScore !== undefined && anime.userScore !== null && anime.userScore > 0
      ? anime.userScore
      : null;
  const effectiveUserScore = userScore !== undefined ? userScore : rawScore;

  const handleOpenStatusModal = () => {
    onOpenStatusModal(
      {
        ...anime,
        userStatus: effectiveStatus,
        userScore: effectiveUserScore
      },
      effectiveStatus
    );
  };

  const handleAdd = () => {
    handleOpenStatusModal();
  };

  const handleOpenDetailModal = () => {
    onOpenDetailModal({
      ...anime,
      userStatus: effectiveStatus,
      userScore: effectiveUserScore
    });
  };

  return (
    <article
      className="anime-card-ambient"
      onMouseEnter={() => {
        hoverTimerRef.current = setTimeout(() => {
          anilistService.prefetchAnimeDetails(anime.mediaId);
        }, 180);
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
          padding: '10px 12px',
          borderRadius: '14px',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxSizing: 'border-box',
          '--card-color': getAnimeAuraColor(anime.coverColor, anime.mediaId)
        } as React.CSSProperties
      }
    >
      {/* Cover Image */}
      <div
        className="card-cover-thumb card-thumb-interactive"
        role="button"
        tabIndex={0}
        onClick={handleOpenDetailModal}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenDetailModal();
          }
        }}
        title={`View details for ${anime.title}`}
        style={{
          width: '52px',
          height: '74px',
          minWidth: '52px',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--color-input-bg)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
      >
        {!imgError ? (
          <img
            src={anime.coverImageMedium || anime.coverImage}
            alt={anime.title}
            onError={() => setImgError(true)}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '9px', color: 'var(--color-tertiary)' }}>No img</span>
        )}
      </div>

      {/* Middle info */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        <div>
          <h3
            className="line-clamp-2 card-title-interactive"
            title={`View details for ${anime.title}`}
            onClick={handleOpenDetailModal}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: 1.25,
              color: 'var(--color-primary)',
              margin: 0,
              cursor: 'pointer'
            }}
          >
            {anime.title}
          </h3>
        </div>

        {/* Editorial Dot-Separated Specs: Format & Episodes */}
        {(anime.format || anime.episodes) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              color: 'var(--color-secondary)',
              lineHeight: 1
            }}
          >
            {anime.format ? (
              <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>{anime.format}</span>
            ) : null}
            {anime.format && anime.episodes ? (
              <span style={{ color: 'var(--color-tertiary)', fontSize: '9px' }}>•</span>
            ) : null}
            {anime.episodes ? (
              <span className="font-mono">{anime.episodes} eps</span>
            ) : null}
          </div>
        ) : null}

        {/* Dedicated Ratings Row: AniList Community Score & Your Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {anime.averageScore ? (
            <Badge variant="neutral">
              <span className="font-mono">{anime.averageScore}%</span>
            </Badge>
          ) : null}
          {effectiveUserScore !== null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenScoreModal(anime);
              }}
              title="Click to edit your score"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer'
              }}
            >
              <Badge variant="accent">
                <span className="font-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  ★ {effectiveUserScore.toFixed(1)}
                  <Edit2 size={9} style={{ opacity: 0.7 }} />
                </span>
              </Badge>
            </button>
          ) : effectiveStatus ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenScoreModal(anime);
              }}
              title="Rate this anime"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer'
              }}
            >
              <Badge variant="outline">
                <span className="font-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  + Rate
                </span>
              </Badge>
            </button>
          ) : null}
        </div>
      </div>

      {/* Action / Status Section & External Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {effectiveStatus === 'COMPLETED' ? (
          <button
            type="button"
            onClick={handleOpenStatusModal}
            title={`Completed${effectiveUserScore ? ` • Your score: ${effectiveUserScore.toFixed(1)}` : ''} (Click to change status)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid var(--color-success)',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
            className="card-status-badge-btn"
          >
            <Check size={13} strokeWidth={2.5} />
            <span>Completed</span>
          </button>
        ) : effectiveStatus === 'CURRENT' ? (
          <button
            type="button"
            onClick={handleOpenStatusModal}
            title="Currently Watching (Click to change status)"
            className="card-status-badge-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-watching-bg)',
              color: 'var(--color-watching)',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid var(--color-watching)',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Check size={12} strokeWidth={2.5} />
            <span>Watching</span>
          </button>
        ) : effectiveStatus === 'PLANNING' ? (
          <button
            type="button"
            onClick={handleOpenStatusModal}
            title="In Planning List (Click to change status)"
            className="card-status-badge-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-planning-bg)',
              color: 'var(--color-planning)',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid var(--color-planning)',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Clock size={12} strokeWidth={2.5} />
            <span>Planning</span>
          </button>
        ) : effectiveStatus === 'PAUSED' || effectiveStatus === 'DROPPED' ? (
          <button
            type="button"
            onClick={handleOpenStatusModal}
            title={`${effectiveStatus === 'PAUSED' ? 'Paused' : 'Dropped'} (Click to change status)`}
            className="card-status-badge-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-paused-bg)',
              color: 'var(--color-paused)',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid var(--color-paused)',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <PauseCircle size={12} strokeWidth={2.5} />
            <span>{effectiveStatus === 'PAUSED' ? 'Paused' : 'Dropped'}</span>
          </button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            aria-label={`Add ${anime.title} to AniList`}
            style={{ padding: '6px 12px' }}
          >
            <Plus size={14} strokeWidth={2} />
            <span>Add</span>
          </Button>
        )}

        {/* External Link Button */}
        {anime.siteUrl ? (
          <a
            href={anime.siteUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${anime.title} on AniList`}
            title={`Open ${anime.title} on AniList`}
            className="card-icon-btn-subtle"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-tertiary)',
              backgroundColor: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              flexShrink: 0
            }}
          >
            <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </article>
  );
};

export const SearchResultCard = React.memo(SearchResultCardComponent);
