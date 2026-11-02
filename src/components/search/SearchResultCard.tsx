import React, { useState, useRef } from 'react';
import { NormalizedAnimeItem, MediaListStatus } from '../../types';
import { Button } from '../common/Button';
import { Plus, Check, Eye, ExternalLink, Edit2, Clock, PauseCircle, XCircle, Star } from 'lucide-react';
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
  const effectiveUserScore =
    userScore !== undefined
      ? userScore !== null && userScore > 0
        ? userScore
        : null
      : rawScore;

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
          padding: '10px 12px',
          borderRadius: '14px',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxSizing: 'border-box',
          position: 'relative',
          '--card-color': getAnimeAuraColor(anime.coverColor, anime.mediaId)
        } as React.CSSProperties
      }
    >
      {/* Pinned Subtle External Link Icon (Frameless, matches Home & Profile views) */}
      {anime.siteUrl ? (
        <a
          href={anime.siteUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${anime.title} on AniList`}
          title={`Open ${anime.title} on AniList`}
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
          width: '58px',
          minWidth: '58px',
          minHeight: '80px',
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
            src={anime.coverImageMedium || anime.coverImage}
            alt={anime.title}
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
          <span style={{ fontSize: '9px', color: 'var(--color-tertiary)' }}>No img</span>
        )}
      </div>

      {/* Middle & Bottom Content */}
      {(() => {
        const showUserScoreBtn =
          effectiveUserScore !== null ||
          Boolean(effectiveStatus && effectiveStatus !== 'PLANNING');

        const formatLabel = anime.format ? anime.format.replace(/_/g, ' ') : null;
        const showEpisodeProgress =
          effectiveStatus === 'CURRENT' ||
          ((effectiveStatus === 'DROPPED' || effectiveStatus === 'PAUSED') && anime.progress > 0);

        const renderSpecsInline = () => (
          <>
            {formatLabel ? (
              <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>{formatLabel}</span>
            ) : null}
            {formatLabel && (anime.episodes || showEpisodeProgress) ? (
              <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>•</span>
            ) : null}
            {showEpisodeProgress ? (
              <span
                style={{
                  color:
                    effectiveStatus === 'DROPPED'
                      ? 'var(--color-error)'
                      : effectiveStatus === 'PAUSED'
                      ? 'var(--color-paused)'
                      : 'var(--color-watching)',
                  fontWeight: 600,
                  fontSize: '11px'
                }}
              >
                Ep {anime.progress}/{anime.episodes || anime.chapters || '?'}
              </span>
            ) : anime.episodes ? (
              <span style={{ fontWeight: 500 }}>{anime.episodes} eps</span>
            ) : null}
            {(formatLabel || anime.episodes || showEpisodeProgress) && anime.seasonYear ? (
              <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>•</span>
            ) : null}
            {anime.seasonYear ? (
              <span style={{ fontWeight: 500 }}>{anime.seasonYear}</span>
            ) : null}
          </>
        );

        const hasSpecs = Boolean(formatLabel || anime.episodes || showEpisodeProgress || anime.seasonYear);

        return (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: '80px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '6px'
            }}
          >
            {/* Top Group: Title, Genres & (when score badge is shown) Specs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5px' }}>
              <div style={{ paddingRight: '22px' }}>
                <h3
                  className="line-clamp-2 card-title-interactive"
                  title={`View details for ${anime.title}`}
                  onClick={handleOpenDetailModal}
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: 'var(--color-primary)',
                    margin: 0,
                    cursor: 'pointer'
                  }}
                >
                  {anime.title}
                </h3>
              </div>

              {/* Genres Row (Matches ProfileView style) */}
              {anime.genres && anime.genres.length > 0 ? (
                <div
                  className="truncate"
                  title={anime.genres.join(' • ')}
                  style={{
                    fontSize: '11px',
                    fontWeight: 400,
                    color: 'var(--color-secondary)',
                    opacity: 0.85,
                    lineHeight: 1.2
                  }}
                >
                  {anime.genres.slice(0, 3).join(' • ')}
                </div>
              ) : null}

              {/* If bottom row has a User Score / + Rate button, render Format • Eps • Year here so bottom row stays uncluttered */}
              {showUserScoreBtn && hasSpecs ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    color: 'var(--color-secondary)',
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {renderSpecsInline()}
                </div>
              ) : null}
            </div>

            {/* Bottom Row: Specs/Ratings on Left, Action/Status Button on Right */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: 'auto'
              }}
            >
              {/* Left: Either [★ Score] • AniList % OR Format • Eps • Year • AniList % */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5.5px',
                  fontSize: '11.5px',
                  color: 'var(--color-secondary)',
                  lineHeight: 1,
                  flexWrap: 'wrap',
                  minWidth: 0,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {!showUserScoreBtn && hasSpecs ? (
                  <>
                    {renderSpecsInline()}
                    {anime.averageScore ? (
                      <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>•</span>
                    ) : null}
                  </>
                ) : null}

                {effectiveUserScore !== null ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenScoreModal(anime);
                    }}
                    title={`Your score: ${effectiveUserScore.toFixed(1)} / 10 (Click to edit)`}
                    className="user-score-badge-btn"
                    style={{
                      height: '24px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4.5px',
                      background: 'var(--color-score-bg)',
                      border: '1px solid var(--color-score-border)',
                      borderRadius: '7px',
                      padding: '0 7.5px',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      lineHeight: 1,
                      color: 'var(--color-score)',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
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
                      {effectiveUserScore.toFixed(1)}
                    </span>
                    <Edit2 size={9.5} style={{ opacity: 0.75, flexShrink: 0 }} />
                  </button>
                ) : showUserScoreBtn ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenScoreModal(anime);
                    }}
                    title="Rate this anime"
                    className="card-icon-btn-subtle"
                    style={{
                      height: '24px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4.5px',
                      background: 'var(--color-input-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '7px',
                      padding: '0 7.5px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      lineHeight: 1,
                      color: 'var(--color-secondary)',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    <Star size={10.5} style={{ opacity: 0.65, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>+ Rate</span>
                  </button>
                ) : null}

                {showUserScoreBtn && anime.averageScore ? (
                  <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>•</span>
                ) : null}

                {anime.averageScore ? (
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3.5px', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: 'var(--color-secondary)' }}>AniList</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {anime.averageScore}%
                    </span>
                  </div>
                ) : null}
              </div>

          {/* Right: Action / Status Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: 'auto' }}>
            {effectiveStatus === 'COMPLETED' ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                title={`Completed${effectiveUserScore ? ` • Your score: ${effectiveUserScore.toFixed(1)}` : ''} (Click to change status)`}
                style={{
                  height: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  backgroundColor: 'var(--color-success-bg)',
                  color: 'var(--color-success)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-success) 55%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
                className="card-status-badge-btn"
              >
                <Check size={12.5} strokeWidth={2.5} />
                <span>Completed</span>
              </button>
            ) : effectiveStatus === 'CURRENT' ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                title="Currently Watching (Click to change status)"
                className="card-status-badge-btn"
                style={{
                  height: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  backgroundColor: 'var(--color-watching-bg)',
                  color: 'var(--color-watching)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-watching) 55%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <Eye size={12.5} strokeWidth={2.3} />
                <span>Watching</span>
              </button>
            ) : effectiveStatus === 'PLANNING' ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                title="In Planning List (Click to change status)"
                className="card-status-badge-btn"
                style={{
                  height: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  backgroundColor: 'var(--color-planning-bg)',
                  color: 'var(--color-planning)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-planning) 55%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <Clock size={12} strokeWidth={2.5} />
                <span>Planning</span>
              </button>
            ) : effectiveStatus === 'PAUSED' ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                title="Paused (Click to change status)"
                className="card-status-badge-btn"
                style={{
                  height: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  backgroundColor: 'var(--color-paused-bg)',
                  color: 'var(--color-paused)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-paused) 55%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <PauseCircle size={12} strokeWidth={2.5} />
                <span>Paused</span>
              </button>
            ) : effectiveStatus === 'DROPPED' ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                title="Dropped (Click to change status)"
                className="card-status-badge-btn"
                style={{
                  height: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  backgroundColor: 'var(--color-error-bg)',
                  color: 'var(--color-error)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-error) 55%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                <XCircle size={12} strokeWidth={2.5} />
                <span>Dropped</span>
              </button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAdd}
                aria-label={`Add ${anime.title} to AniList`}
                style={{ height: '24px', padding: '0 10px', borderRadius: '7px' }}
              >
                <Plus size={13} strokeWidth={2} />
                <span>Add</span>
              </Button>
            )}
          </div>
        </div>
      </div>
        );
      })()}
    </article>
  );
};

export const SearchResultCard = React.memo(SearchResultCardComponent);
