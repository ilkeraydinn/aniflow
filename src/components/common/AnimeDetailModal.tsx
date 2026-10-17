import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NormalizedAnimeItem, AnimeDetail, MediaListStatus } from '../../types';
import { anilistService } from '../../services/anilistClient';
import { useAnime } from '../../context/AnimeContext';
import { useUIActions, useUIState } from '../../context/UIContext';
import { Badge } from './Badge';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import { formatAiringCountdown } from '../home/AnimeCard';
import {
  ArrowLeft,
  X,
  ExternalLink,
  Star,
  Check,
  Clock,
  Eye,
  PauseCircle,
  Plus,
  Edit2,
  Sparkles,
  Layers,
  ChevronRight,
  BookOpen,
  ZoomIn,
  Users
} from 'lucide-react';

function formatCharacterRole(role: string): string {
  switch (role) {
    case 'MAIN':
      return 'Main';
    case 'SUPPORTING':
      return 'Supporting';
    case 'BACKGROUND':
      return 'Background';
    default:
      return role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : 'Supporting';
  }
}

function formatRelationLabel(type: string): string {
  switch (type) {
    case 'PREQUEL':
      return 'Prequel';
    case 'SEQUEL':
      return 'Sequel';
    case 'PARENT':
      return 'Parent Story';
    case 'SIDE_STORY':
      return 'Side Story';
    case 'SPIN_OFF':
      return 'Spin-Off';
    case 'ALTERNATIVE':
      return 'Alternative';
    case 'SOURCE':
      return 'Source Material';
    case 'SUMMARY':
      return 'Summary';
    case 'COMPILATION':
      return 'Compilation';
    default:
      return type.replace(/_/g, ' ');
  }
}

interface AnimeDetailModalProps {
  anime: NormalizedAnimeItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AnimeDetailModal: React.FC<AnimeDetailModalProps> = ({
  anime,
  isOpen,
  onClose
}) => {
  const {
    openStatusModal,
    openScoreModal,
    openDetailModal,
    goBackDetailModal,
    navigateToGenre
  } = useUIActions();
  const { detailHistory } = useUIState();
  const {
    watchingList,
    getUserScore,
    getUserStatus,
    incrementProgress,
    pendingMediaIds
  } = useAnime();

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [fetchedDetail, setDetail] = useState<AnimeDetail | null>(null);
  const [isFetching, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDescExpanded, setIsDescExpanded] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);

  // Cover image lightbox zoom state
  const [isImageZoomed, setIsImageZoomed] = useState<boolean>(false);
  const [isClosingZoom, setIsClosingZoom] = useState<boolean>(false);
  const [isCoverHovered, setIsCoverHovered] = useState<boolean>(false);

  const handleCloseZoom = useCallback(() => {
    if (isClosingZoom) return;
    setIsClosingZoom(true);
    setTimeout(() => {
      setIsImageZoomed(false);
      setIsClosingZoom(false);
    }, 180);
  }, [isClosingZoom]);

  const handleBack = useCallback(() => {
    if (detailHistory.length > 0) {
      goBackDetailModal();
    } else {
      onClose();
    }
  }, [detailHistory.length, goBackDetailModal, onClose]);

  // Close on ESC (closes zoomed image first if open, else goes back in history or closes modal)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImageZoomed) {
          handleCloseZoom();
        } else {
          handleBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleBack, isImageZoomed, handleCloseZoom]);

  // Reset zoom state on modal close or media switch
  useEffect(() => {
    setIsImageZoomed(false);
    setIsClosingZoom(false);
    setIsCoverHovered(false);
  }, [anime?.mediaId, isOpen]);

  // Fetch rich anime/manga details when opened or when media changes
  useEffect(() => {
    if (!isOpen || !anime) {
      setDetail(null);
      setIsLoading(false);
      setError(null);
      setIsDescExpanded(false);
      setImgError(false);
      return;
    }

    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    setError(null);
    setImgError(false);
    setIsDescExpanded(false);

    const cached = anilistService.getCachedAnimeDetailsSync(anime.mediaId);
    if (cached) {
      setDetail(cached);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setDetail(null);
    setIsLoading(true);

    anilistService
      .getAnimeDetails(anime.mediaId)
      .then((data) => {
        if (isMounted) {
          setDetail(data);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Could not load details');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, anime?.mediaId]);

  if (!isOpen || !anime) return null;

  const syncCachedDetail = anilistService.getCachedAnimeDetailsSync(anime.mediaId);
  const detail: AnimeDetail | null =
    fetchedDetail && fetchedDetail.mediaId === anime.mediaId
      ? fetchedDetail
      : syncCachedDetail;
  const isLoading = !detail && isFetching;

  const isManga =
    detail?.type === 'MANGA' ||
    anime.type === 'MANGA' ||
    detail?.format === 'MANGA' ||
    detail?.format === 'NOVEL' ||
    detail?.format === 'ONE_SHOT' ||
    anime.format === 'MANGA' ||
    anime.format === 'NOVEL' ||
    anime.format === 'ONE_SHOT';

  // Real-time reactive status & score overrides from AnimeContext
  const effectiveStatus = getUserStatus(
    anime.mediaId,
    detail?.userStatus || anime.userStatus
  );
  const effectiveScore = getUserScore(
    anime.mediaId,
    detail?.userScore ?? anime.userScore
  );

  const displayTitle = detail?.title || anime.title;
  const secondaryTitle = detail?.englishTitle && detail.englishTitle !== displayTitle
    ? detail.englishTitle
    : detail?.romajiTitle && detail.romajiTitle !== displayTitle
    ? detail.romajiTitle
    : null;

  const currentProgress =
    watchingList.find((w) => w.mediaId === anime.mediaId)?.progress ??
    detail?.progress ??
    anime.progress;

  const isPending = pendingMediaIds.has(anime.mediaId);
  const totalUnits = isManga
    ? (detail?.chapters ?? anime.chapters ?? null)
    : (detail?.episodes ?? anime.episodes ?? null);
  const isCompleted =
    typeof totalUnits === 'number' &&
    totalUnits > 0 &&
    currentProgress >= totalUnits;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="anime-detail-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1100,
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          zIndex: 10,
          flexShrink: 0
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          title={
            detailHistory.length > 0
              ? `Back to ${detailHistory[detailHistory.length - 1].title}`
              : 'Close details'
          }
          className="card-icon-btn-subtle"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-input-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-primary)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        <span
          className="line-clamp-1"
          style={{
            flex: 1,
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-secondary)',
            textAlign: 'center',
            padding: '0 12px'
          }}
        >
          {displayTitle}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {(detail?.siteUrl || anime.siteUrl) ? (
            <a
              href={detail?.siteUrl || anime.siteUrl}
              target="_blank"
              rel="noreferrer"
              title="Open on AniList"
              aria-label="Open on AniList"
              className="card-icon-btn-subtle"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-input-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              <ExternalLink size={14} />
            </a>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="card-icon-btn-subtle"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-primary)',
              cursor: 'pointer'
            }}
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* Scrollable Content Body */}
      <div
        ref={contentScrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Optional Banner Image */}
        {detail?.bannerImage ? (
          <div
            style={{
              width: '100%',
              height: '90px',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            <img
              src={detail.bannerImage}
              alt=""
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, var(--color-bg) 100%)'
              }}
            />
          </div>
        ) : null}

        {/* Hero Section */}
        <div
          style={{
            padding: detail?.bannerImage ? '0 16px 16px 16px' : '16px',
            marginTop: detail?.bannerImage ? '-36px' : '0',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            gap: '14px'
          }}
        >
          {/* Cover Art (Clickable to Enlarge) */}
          <div
            onClick={() => {
              if (!imgError && (detail?.coverImage || anime.coverImage)) {
                setIsImageZoomed(true);
              }
            }}
            onMouseEnter={() => setIsCoverHovered(true)}
            onMouseLeave={() => setIsCoverHovered(false)}
            title="Click to enlarge cover image"
            style={{
              width: '74px',
              height: '106px',
              minWidth: '74px',
              borderRadius: '10px',
              overflow: 'hidden',
              backgroundColor: 'var(--color-card)',
              border: `1px solid color-mix(in srgb, ${detail?.coverColor || anime.coverColor || 'var(--color-border)'} ${isCoverHovered ? '65%' : '35%'}, var(--color-border))`,
              boxShadow: isCoverHovered
                ? `0 12px 30px color-mix(in srgb, ${detail?.coverColor || anime.coverColor || '#000000'} 45%, transparent), 0 4px 10px rgba(0, 0, 0, 0.3)`
                : `0 8px 24px color-mix(in srgb, ${detail?.coverColor || anime.coverColor || '#000000'} 30%, transparent), 0 2px 6px rgba(0, 0, 0, 0.2)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: !imgError ? 'zoom-in' : 'default',
              position: 'relative',
              transform: isCoverHovered && !imgError ? 'scale(1.03)' : 'scale(1)',
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease'
            }}
          >
            {!imgError ? (
              <>
                <img
                  src={detail?.coverImage || anime.coverImage}
                  alt={displayTitle}
                  onError={() => setImgError(true)}
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {/* Subtle Hover Zoom-in Badge */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.30)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isCoverHovered ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    color: '#ffffff',
                    pointerEvents: 'none'
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0, 0, 0, 0.65)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      transform: isCoverHovered ? 'scale(1)' : 'scale(0.8)',
                      transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                  >
                    <ZoomIn size={14} />
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: '10px', color: 'var(--color-tertiary)' }}>No Image</span>
            )}
          </div>

          {/* Titles & Primary Badges */}
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
            <h1
              id="anime-detail-title"
              className="line-clamp-2"
              title={displayTitle}
              style={{
                fontSize: '15px',
                fontWeight: 600,
                lineHeight: 1.25,
                color: 'var(--color-primary)',
                margin: 0
              }}
            >
              {displayTitle}
            </h1>

            {secondaryTitle ? (
              <span
                className="line-clamp-1"
                title={secondaryTitle}
                style={{
                  fontSize: '11.5px',
                  fontWeight: 400,
                  color: 'color-mix(in srgb, var(--color-primary) 72%, var(--color-secondary))',
                  marginTop: '-2px',
                  lineHeight: 1.3
                }}
              >
                {secondaryTitle}
              </span>
            ) : null}

            {/* Quick Metadata Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {(detail?.format || anime.format) ? (
                <Badge variant="outline">{detail?.format || anime.format}</Badge>
              ) : null}

              {!isManga && (detail?.episodes || anime.episodes) ? (
                <Badge variant="outline">{detail?.episodes || anime.episodes} eps</Badge>
              ) : null}

              {isManga && (detail?.chapters || anime.chapters) ? (
                <Badge variant="outline">{detail?.chapters || anime.chapters} ch</Badge>
              ) : null}

              {!isManga && detail?.duration ? (
                <Badge variant="outline">{detail.duration}m/ep</Badge>
              ) : null}

              {(detail?.averageScore || anime.averageScore) ? (
                <Badge variant="neutral">
                  <span className="font-mono">
                    ★ {detail?.averageScore || anime.averageScore}%
                  </span>
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Quick Action Bar (Status, Score, Progress) */}
        <div
          style={{
            margin: '0 16px 14px 16px',
            padding: '12px',
            backgroundColor: 'var(--color-card)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* List Status Selector Button */}
            <button
              type="button"
              onClick={() =>
                openStatusModal(
                  {
                    ...anime,
                    type: isManga ? 'MANGA' : 'ANIME',
                    format: detail?.format || anime.format,
                    userStatus: effectiveStatus,
                    userScore: effectiveScore ?? anime.userScore,
                    progress: currentProgress
                  },
                  effectiveStatus
                )
              }
              title="Click to change list status"
              style={{
                flex: 1,
                minWidth: '120px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                backgroundColor:
                  effectiveStatus === 'COMPLETED'
                    ? 'var(--color-success-bg)'
                    : effectiveStatus === 'PLANNING'
                    ? 'var(--color-planning-bg)'
                    : effectiveStatus === 'CURRENT'
                    ? 'var(--color-watching-bg)'
                    : effectiveStatus === 'PAUSED'
                    ? 'var(--color-paused-bg)'
                    : 'var(--color-input-bg)',
                color:
                  effectiveStatus === 'COMPLETED'
                    ? 'var(--color-success)'
                    : effectiveStatus === 'PLANNING'
                    ? 'var(--color-planning)'
                    : effectiveStatus === 'CURRENT'
                    ? 'var(--color-watching)'
                    : effectiveStatus === 'PAUSED'
                    ? 'var(--color-paused)'
                    : 'var(--color-primary)',
                border:
                  effectiveStatus === 'COMPLETED'
                    ? '1px solid var(--color-success)'
                    : effectiveStatus === 'PLANNING'
                    ? '1px solid var(--color-planning)'
                    : effectiveStatus === 'CURRENT'
                    ? '1px solid var(--color-watching)'
                    : effectiveStatus === 'PAUSED'
                    ? '1px solid var(--color-paused)'
                    : '1px solid var(--color-border)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {effectiveStatus === 'COMPLETED' ? (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>Completed</span>
                </>
              ) : effectiveStatus === 'CURRENT' ? (
                <>
                  {isManga ? (
                    <BookOpen size={13} strokeWidth={2.5} />
                  ) : (
                    <Eye size={13} strokeWidth={2.5} />
                  )}
                  <span>{isManga ? 'Reading' : 'Watching'}</span>
                </>
              ) : effectiveStatus === 'PLANNING' ? (
                <>
                  <Clock size={13} strokeWidth={2.5} />
                  <span>{isManga ? 'Plan to Read' : 'Planning'}</span>
                </>
              ) : effectiveStatus === 'PAUSED' ? (
                <>
                  <PauseCircle size={13} strokeWidth={2.5} />
                  <span>Paused</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>+ Add to List</span>
                </>
              )}
            </button>

            {/* Score Button */}
            <button
              type="button"
              onClick={() =>
                openScoreModal({
                  ...anime,
                  type: isManga ? 'MANGA' : 'ANIME',
                  format: detail?.format || anime.format,
                  userStatus: effectiveStatus,
                  userScore: effectiveScore ?? anime.userScore
                })
              }
              title={isManga ? 'Click to rate this manga' : 'Click to rate this anime'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '7px 12px',
                borderRadius: '8px',
                backgroundColor: effectiveScore ? 'var(--color-primary)' : 'var(--color-input-bg)',
                color: effectiveScore ? 'var(--color-primary-inverse)' : 'var(--color-primary)',
                border: effectiveScore ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Star size={13} fill={effectiveScore ? 'currentColor' : 'none'} />
              <span>{effectiveScore ? `${effectiveScore.toFixed(1)}` : 'Rate'}</span>
              <Edit2 size={10} style={{ opacity: 0.7 }} />
            </button>
          </div>

          {/* Progress (If watching/reading) */}
          {effectiveStatus === 'CURRENT' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid var(--color-border)',
                fontSize: '12px'
              }}
            >
              <span style={{ color: 'var(--color-secondary)' }}>
                Progress:{' '}
                <strong style={{ color: 'var(--color-primary)' }}>
                  {currentProgress} / {totalUnits ?? '?'}
                </strong>{' '}
                {isManga ? 'chapters' : 'episodes'}
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDetail((prev) =>
                    prev ? { ...prev, progress: currentProgress + 1 } : null
                  );
                  incrementProgress({
                    ...anime,
                    progress: currentProgress
                  });
                }}
                disabled={isCompleted || isPending}
                isLoading={isPending}
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                {isManga ? '+1 Chapter' : '+1 Episode'}
              </Button>
            </div>
          ) : null}

          {/* Airing Countdown Pill (Anime only) */}
          {!isManga && (detail?.nextAiringEpisode || anime.nextAiringEpisode) ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                paddingTop: '8px',
                borderTop: '1px solid var(--color-border)',
                fontSize: '11.5px',
                color: 'var(--color-primary)'
              }}
            >
              <Clock size={12} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
              <span>
                Next Episode:{' '}
                <strong style={{ color: 'var(--color-primary)' }}>
                  {formatAiringCountdown(detail?.nextAiringEpisode || anime.nextAiringEpisode!)}
                </strong>
              </span>
            </div>
          ) : null}
        </div>

        {/* GENRES SECTION (User emphasis: "Önemli özellikleri göstersin yeter örneğin genres") */}
        <div style={{ padding: '0 16px 14px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px'
            }}
          >
            <Sparkles size={13} style={{ color: 'var(--color-secondary)' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-secondary)'
              }}
            >
              Genres
            </span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Skeleton width="56px" height="24px" borderRadius="6px" />
              <Skeleton width="64px" height="24px" borderRadius="6px" />
              <Skeleton width="48px" height="24px" borderRadius="6px" />
            </div>
          ) : detail?.genres && detail.genres.length > 0 ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {detail.genres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => navigateToGenre(genre)}
                  title={`Discover ${genre} anime`}
                  className="card-icon-btn-subtle"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-primary)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                  }}
                >
                  {genre}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--color-tertiary)' }}>No genres listed.</span>
          )}
        </div>

        {/* Production & Information Grid */}
        <div style={{ padding: '0 16px 14px 16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              backgroundColor: 'var(--color-card)',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid var(--color-border)'
            }}
          >
            {/* Studio or Format */}
            <div>
              <span style={{ fontSize: '10px', color: 'var(--color-tertiary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {isManga ? 'Format' : 'Studio'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-primary)' }}>
                {isManga
                  ? (detail?.format || anime.format || 'MANGA')
                  : detail?.studios && detail.studios.length > 0
                  ? detail.studios.join(', ')
                  : isLoading
                  ? 'Loading...'
                  : 'Unknown'}
              </span>
            </div>

            {/* Season & Year or Type */}
            <div>
              <span style={{ fontSize: '10px', color: 'var(--color-tertiary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {isManga ? 'Type' : 'Season'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-primary)' }}>
                {isManga
                  ? 'Manga / Publishing'
                  : detail?.season && detail?.seasonYear
                  ? `${detail.season} ${detail.seasonYear}`
                  : isLoading
                  ? 'Loading...'
                  : 'N/A'}
              </span>
            </div>

            {/* Status */}
            <div>
              <span style={{ fontSize: '10px', color: 'var(--color-tertiary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                Status
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-primary)' }}>
                {detail?.status ? detail.status.replace(/_/g, ' ') : 'N/A'}
              </span>
            </div>

            {/* Episodes or Chapters */}
            <div>
              <span style={{ fontSize: '10px', color: 'var(--color-tertiary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {isManga ? 'Chapters' : 'Episodes'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-primary)' }}>
                {isManga
                  ? (detail?.chapters || anime.chapters) ? `${detail?.chapters || anime.chapters} ch` : 'Unknown'
                  : (detail?.episodes || anime.episodes) ? `${detail?.episodes || anime.episodes} eps` : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Synopsis / Description */}
        <div style={{ padding: '0 16px 20px 16px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-secondary)',
              display: 'block',
              marginBottom: '8px'
            }}
          >
            Synopsis
          </span>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton width="100%" height="14px" borderRadius="4px" />
              <Skeleton width="92%" height="14px" borderRadius="4px" />
              <Skeleton width="75%" height="14px" borderRadius="4px" />
            </div>
          ) : detail?.description ? (
            <div>
              <p
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: 'var(--color-secondary)',
                  margin: 0,
                  whiteSpace: 'pre-line',
                  display: isDescExpanded ? 'block' : '-webkit-box',
                  WebkitLineClamp: isDescExpanded ? undefined : 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: isDescExpanded ? 'visible' : 'hidden'
                }}
              >
                {detail.description}
              </p>

              {detail.description.length > 200 ? (
                <button
                  type="button"
                  onClick={() => setIsDescExpanded(!isDescExpanded)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '6px 0 0 0',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {isDescExpanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </div>
          ) : error ? (
            <span style={{ fontSize: '12px', color: 'var(--color-tertiary)' }}>
              Could not load additional synopsis details.
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--color-tertiary)' }}>
              No synopsis available.
            </span>
          )}
        </div>

        {/* CHARACTERS SECTION (2 Columns x up to 3 Rows, Max 6 Characters) */}
        {(isLoading || (detail?.characters && detail.characters.length > 0)) ? (
          <div style={{ padding: '0 16px 20px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px'
              }}
            >
              <Users size={13} style={{ color: 'var(--color-secondary)' }} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-secondary)'
                }}
              >
                Characters
              </span>
            </div>

            {isLoading ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px'
                }}
              >
                <Skeleton width="100%" height="58px" borderRadius="10px" />
                <Skeleton width="100%" height="58px" borderRadius="10px" />
                <Skeleton width="100%" height="58px" borderRadius="10px" />
                <Skeleton width="100%" height="58px" borderRadius="10px" />
              </div>
            ) : detail?.characters && detail.characters.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px'
                }}
              >
                {detail.characters.slice(0, 6).map((char) => (
                  <div
                    key={char.id}
                    title={`${char.name} (${formatCharacterRole(char.role)})`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      minWidth: 0
                    }}
                  >
                    {/* Character Portrait */}
                    <div
                      style={{
                        width: '44px',
                        height: '58px',
                        minWidth: '44px',
                        overflow: 'hidden',
                        backgroundColor: 'var(--color-input-bg)',
                        flexShrink: 0
                      }}
                    >
                      <img
                        src={char.imageMedium || char.image}
                        alt={char.name}
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                      />
                    </div>

                    {/* Character Name & Role */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: '46px',
                        padding: '0 8px 0 0',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span
                        className="line-clamp-2"
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 500,
                          color: 'var(--color-primary)',
                          lineHeight: 1.25
                        }}
                      >
                        {char.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--color-tertiary)',
                          fontWeight: 400
                        }}
                      >
                        {formatCharacterRole(char.role)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* RELATIONS SECTION (User: İlgili Sezonlar / Prequel - Sequel) */}
        <div style={{ padding: '0 16px 20px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '10px'
            }}
          >
            <Layers size={13} style={{ color: 'var(--color-secondary)' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-secondary)'
              }}
            >
              Relations & Connected Series {detail?.relations ? `(${detail.relations.length})` : ''}
            </span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton width="100%" height="54px" borderRadius="10px" />
              <Skeleton width="100%" height="54px" borderRadius="10px" />
            </div>
          ) : detail?.relations && detail.relations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {detail.relations.map((rel) => {
                const isSequel = rel.relationType === 'SEQUEL';
                const isPrequel = rel.relationType === 'PREQUEL';

                return (
                  <div
                    key={`${rel.id}_${rel.relationType}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const relStatus = getUserStatus(rel.id, null);
                      const relScore = getUserScore(rel.id, null);
                      const isRelManga = rel.format === 'MANGA' || rel.format === 'NOVEL' || rel.format === 'ONE_SHOT' || rel.type === 'MANGA';
                      const relAnime: NormalizedAnimeItem = {
                        mediaId: rel.id,
                        title: rel.title,
                        coverImage: rel.coverImage,
                        userScore: relScore,
                        userStatus: relStatus,
                        averageScore: null,
                        progress: 0,
                        episodes: null,
                        chapters: null,
                        type: isRelManga ? 'MANGA' : 'ANIME',
                        status: relStatus || (rel.status as MediaListStatus) || 'PLANNING',
                        format: rel.format || (isRelManga ? 'MANGA' : 'TV'),
                        siteUrl: isRelManga
                          ? `https://anilist.co/manga/${rel.id}`
                          : `https://anilist.co/anime/${rel.id}`
                      };
                      openDetailModal(relAnime);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const relStatus = getUserStatus(rel.id, null);
                        const relScore = getUserScore(rel.id, null);
                        const isRelManga = rel.format === 'MANGA' || rel.format === 'NOVEL' || rel.format === 'ONE_SHOT' || rel.type === 'MANGA';
                        const relAnime: NormalizedAnimeItem = {
                          mediaId: rel.id,
                          title: rel.title,
                          coverImage: rel.coverImage,
                          userScore: relScore,
                          userStatus: relStatus,
                          averageScore: null,
                          progress: 0,
                          episodes: null,
                          chapters: null,
                          type: isRelManga ? 'MANGA' : 'ANIME',
                          status: relStatus || (rel.status as MediaListStatus) || 'PLANNING',
                          format: rel.format || (isRelManga ? 'MANGA' : 'TV'),
                          siteUrl: isRelManga
                            ? `https://anilist.co/manga/${rel.id}`
                            : `https://anilist.co/anime/${rel.id}`
                        };
                        openDetailModal(relAnime);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-card)',
                      border: isSequel
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease, transform 0.1s ease',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-card-subtle)';
                      e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-card)';
                      e.currentTarget.style.borderColor = isSequel
                        ? 'var(--color-primary)'
                        : 'var(--color-border)';
                    }}
                  >
                    {/* Cover Thumbnail */}
                    <div
                      style={{
                        width: '38px',
                        height: '52px',
                        minWidth: '38px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        backgroundColor: 'var(--color-input-bg)',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      <img
                        src={rel.coverImageMedium || rel.coverImage}
                        alt={rel.title}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>

                    {/* Middle Info */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: isSequel
                              ? 'var(--color-primary)'
                              : isPrequel
                              ? 'var(--color-badge-bg)'
                              : 'var(--color-input-bg)',
                            color: isSequel
                              ? 'var(--color-primary-inverse)'
                              : 'var(--color-primary)',
                            border: '1px solid var(--color-border)'
                          }}
                        >
                          {formatRelationLabel(rel.relationType)}
                        </span>
                        {rel.format ? (
                          <span style={{ fontSize: '10px', color: 'var(--color-tertiary)' }}>
                            {rel.format}
                          </span>
                        ) : null}
                      </div>

                      <span
                        className="line-clamp-1"
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--color-primary)',
                          lineHeight: 1.3
                        }}
                      >
                        {rel.title}
                      </span>
                    </div>

                    <ChevronRight size={14} style={{ color: 'var(--color-tertiary)', flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--color-tertiary)' }}>
              No related series found.
            </span>
          )}
        </div>
      </div>

      {/* Lightbox / Zoomed Cover Art Overlay */}
      {(isImageZoomed || isClosingZoom) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged cover image"
          onClick={handleCloseZoom}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1300,
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            boxSizing: 'border-box',
            cursor: 'zoom-out',
            animation: isClosingZoom
              ? 'zoomBackdropExit 0.18s cubic-bezier(0.2, 0, 0, 1) forwards'
              : 'zoomBackdropEnter 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          {/* Zoomed Image Card Container */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleCloseZoom();
            }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '280px',
              maxHeight: '410px',
              aspectRatio: '1 / 1.42',
              borderRadius: '16px',
              overflow: 'hidden',
              backgroundColor: 'var(--color-card)',
              border: `1px solid color-mix(in srgb, ${detail?.coverColor || anime?.coverColor || '#ffffff'} 35%, rgba(255, 255, 255, 0.2))`,
              boxShadow: `0 24px 64px -8px rgba(0, 0, 0, 0.8), 0 0 48px color-mix(in srgb, ${detail?.coverColor || anime?.coverColor || '#ffffff'} 30%, transparent), 0 4px 16px rgba(0, 0, 0, 0.4)`,
              cursor: 'zoom-out',
              animation: isClosingZoom
                ? 'zoomImageExit 0.18s cubic-bezier(0.2, 0, 0, 1) forwards'
                : 'zoomImageEnter 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <img
              src={
                detail?.coverImageExtraLarge ||
                anime?.coverImageExtraLarge ||
                detail?.coverImage ||
                anime?.coverImage
              }
              alt={displayTitle}
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
