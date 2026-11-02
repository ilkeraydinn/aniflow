import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NormalizedAnimeItem, AnimeDetail, MediaListStatus } from '../../types';
import { anilistService } from '../../services/anilistClient';
import { useAnime } from '../../context/AnimeContext';
import { useUIActions } from '../../context/UIContext';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import { formatAiringCountdown } from '../home/AnimeCard';
import { ProgressBar } from '../home/ProgressBar';
import {
  ArrowLeft,
  X,
  ExternalLink,
  Star,
  Check,
  Clock,
  Eye,
  PauseCircle,
  XCircle,
  Plus,
  Edit2,
  Sparkles,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ZoomIn,
  Users
} from 'lucide-react';

function formatMediaStatus(status?: string | null, hasNextAiring?: boolean): string {
  if (!status) return hasNextAiring ? 'Airing' : 'N/A';
  switch (status) {
    case 'RELEASING':
      return 'Airing';
    case 'FINISHED':
      return 'Finished';
    case 'NOT_YET_RELEASED':
      return 'Upcoming';
    case 'CANCELLED':
      return 'Cancelled';
    case 'HIATUS':
      return 'On Hiatus';
    default:
      return hasNextAiring ? 'Airing' : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}

function formatSeasonLabel(season?: string | null, year?: number | null): string {
  const formattedSeason = season
    ? season.charAt(0).toUpperCase() + season.slice(1).toLowerCase()
    : null;
  if (formattedSeason && year) return `${formattedSeason} ${year}`;
  if (year) return `${year}`;
  if (formattedSeason) return formattedSeason;
  return 'TBA';
}

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
  previousTitle?: string | null;
}

const AnimeDetailModalComponent: React.FC<AnimeDetailModalProps> = ({
  anime,
  isOpen,
  onClose,
  previousTitle
}) => {
  const {
    openStatusModal,
    openScoreModal,
    openDetailModal,
    goBackDetailModal,
    navigateToGenre
  } = useUIActions();
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
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  const handleCloseZoom = useCallback(() => {
    if (isClosingZoom) return;
    setIsClosingZoom(true);
    setTimeout(() => {
      setIsImageZoomed(false);
      setIsClosingZoom(false);
    }, 180);
  }, [isClosingZoom]);

  const handleBack = useCallback(() => {
    if (previousTitle) {
      goBackDetailModal();
    } else {
      onClose();
    }
  }, [previousTitle, goBackDetailModal, onClose]);

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
    setIsScrolled(false);
  }, [anime?.mediaId, isOpen]);

  // Fetch rich anime/manga details when opened or when media changes
  useEffect(() => {
    if (!isOpen || !anime) {
      setDetail(null);
      setIsLoading(false);
      setError(null);
      setIsDescExpanded(false);
      setImgError(false);
      setIsScrolled(false);
      return;
    }

    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    setIsScrolled(false);
    setError(null);
    setImgError(false);
    setIsDescExpanded(false);

    const cached = anilistService.getCachedAnimeDetailsSync(anime.mediaId);
    if (cached) {
      setDetail(cached);
      setIsLoading(false);
      // Persist to disk if it was only prefetched in RAM
      anilistService.getAnimeDetails(anime.mediaId).catch(() => {});
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
      {/* Top Navigation Bar (Floats transparently over banner at top; turns solid on scroll) */}
      {(() => {
        const hasBanner = Boolean(detail?.bannerImage);
        const isTransparentHeader = hasBanner && !isScrolled;
        const headerBtnClass = isTransparentHeader
          ? 'banner-glass-btn'
          : 'card-icon-btn-subtle';
        const headerBtnStyle: React.CSSProperties = {
          width: '30px',
          height: '30px',
          borderRadius: isTransparentHeader ? '999px' : '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isTransparentHeader
            ? 'rgba(0, 0, 0, 0.24)'
            : 'var(--color-input-bg)',
          backdropFilter: isTransparentHeader
            ? 'blur(12px) saturate(180%)'
            : undefined,
          WebkitBackdropFilter: isTransparentHeader
            ? 'blur(12px) saturate(180%)'
            : undefined,
          border: isTransparentHeader
            ? '1px solid rgba(255, 255, 255, 0.24)'
            : '1px solid var(--color-border)',
          boxShadow: isTransparentHeader
            ? '0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
            : 'none',
          color: isTransparentHeader ? '#ffffff' : 'var(--color-primary)',
          cursor: 'pointer'
        };

        return (
          <header
            style={{
              position: hasBanner ? 'absolute' : 'relative',
              top: 0,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: isTransparentHeader
                ? 'none'
                : '1px solid var(--color-border)',
              backgroundColor: isTransparentHeader
                ? 'transparent'
                : 'var(--color-card)',
              zIndex: 20,
              flexShrink: 0,
              transition: 'background-color 0.2s ease'
            }}
          >
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              title={
                previousTitle
                  ? `Back to ${previousTitle}`
                  : 'Back'
              }
              className={headerBtnClass}
              style={headerBtnStyle}
            >
              <ArrowLeft size={15} />
            </button>

            <span
              className="line-clamp-1"
              style={{
                flex: 1,
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-secondary)',
                textAlign: 'center',
                padding: '0 12px',
                opacity: isTransparentHeader ? 0 : 1,
                transform: isTransparentHeader ? 'translateY(4px)' : 'translateY(0)',
                pointerEvents: isTransparentHeader ? 'none' : 'auto',
                transition: 'opacity 0.2s ease, transform 0.2s ease'
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
                  className={headerBtnClass}
                  style={headerBtnStyle}
                >
                  <ExternalLink size={14} />
                </a>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                title="Close"
                className={headerBtnClass}
                style={headerBtnStyle}
              >
                <X size={15} />
              </button>
            </div>
          </header>
        );
      })()}

      {/* Scrollable Content Body */}
      <div
        ref={contentScrollRef}
        onScroll={(e) => {
          const scrolledPastBanner = e.currentTarget.scrollTop > 85;
          if (scrolledPastBanner !== isScrolled) {
            setIsScrolled(scrolledPastBanner);
          }
        }}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Optional Full-Bleed Banner Image */}
        {detail?.bannerImage ? (
          <div
            style={{
              width: '100%',
              height: '185px',
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
                objectPosition: 'center 25%',
                display: 'block'
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.02) 32%, rgba(0,0,0,0.08) 55%, color-mix(in srgb, var(--color-bg) 78%, transparent) 82%, var(--color-bg) 100%)'
              }}
            />
          </div>
        ) : null}

        {/* Hero Section */}
        <div
          style={{
            padding: detail?.bannerImage ? '0 16px 16px 16px' : '16px',
            marginTop: detail?.bannerImage ? '-48px' : '0',
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

            {/* Quick Metadata Inline Row */}
            {(() => {
              const rawFormat = detail?.format || anime.format;
              const formatLabel = rawFormat ? rawFormat.replace(/_/g, ' ') : null;
              const episodesCount = !isManga ? (detail?.episodes || anime.episodes) : null;
              const chaptersCount = isManga ? (detail?.chapters || anime.chapters) : null;
              const durationMins = !isManga ? detail?.duration : null;
              const scoreValue = detail?.averageScore || anime.averageScore;
              const coverAccent = detail?.coverColor || anime.coverColor;

              const inlineItems: React.ReactNode[] = [];

              if (episodesCount) {
                inlineItems.push(
                  <span key="eps" style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {episodesCount}
                    </strong>{' '}
                    {episodesCount === 1 ? 'ep' : 'eps'}
                  </span>
                );
              }

              if (chaptersCount) {
                inlineItems.push(
                  <span key="ch" style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {chaptersCount}
                    </strong>{' '}
                    ch
                  </span>
                );
              }

              if (durationMins) {
                inlineItems.push(
                  <span key="dur" style={{ whiteSpace: 'nowrap' }}>
                    {durationMins}m/ep
                  </span>
                );
              }

              if (scoreValue) {
                inlineItems.push(
                  <span
                    key="score"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'baseline',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    <span style={{ color: 'var(--color-secondary)' }}>AniList</span>
                    <strong style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {scoreValue}%
                    </strong>
                  </span>
                );
              }

              if (!formatLabel && inlineItems.length === 0) return null;

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    flexWrap: 'wrap',
                    marginTop: '1px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--color-secondary)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {formatLabel ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        lineHeight: 1.25,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        backgroundColor: coverAccent
                          ? `color-mix(in srgb, ${coverAccent} 16%, var(--color-card))`
                          : 'var(--color-badge-bg)',
                        color: 'var(--color-primary)',
                        border: coverAccent
                          ? `1px solid color-mix(in srgb, ${coverAccent} 38%, var(--color-border))`
                          : '1px solid var(--color-border)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {formatLabel}
                    </span>
                  ) : null}

                  {inlineItems.map((item, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 || formatLabel ? (
                        <span
                          aria-hidden="true"
                          style={{
                            color: 'var(--color-tertiary)',
                            opacity: 0.65,
                            fontSize: '10px',
                            userSelect: 'none'
                          }}
                        >
                          •
                        </span>
                      ) : null}
                      {item}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Quick Action Bar (Status, Score, Progress, Airing) */}
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
                    : effectiveStatus === 'DROPPED'
                    ? 'var(--color-error-bg)'
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
                    : effectiveStatus === 'DROPPED'
                    ? 'var(--color-error)'
                    : 'var(--color-primary)',
                border:
                  effectiveStatus === 'COMPLETED'
                    ? '1px solid color-mix(in srgb, var(--color-success) 55%, transparent)'
                    : effectiveStatus === 'PLANNING'
                    ? '1px solid color-mix(in srgb, var(--color-planning) 55%, transparent)'
                    : effectiveStatus === 'CURRENT'
                    ? '1px solid color-mix(in srgb, var(--color-watching) 55%, transparent)'
                    : effectiveStatus === 'PAUSED'
                    ? '1px solid color-mix(in srgb, var(--color-paused) 55%, transparent)'
                    : effectiveStatus === 'DROPPED'
                    ? '1px solid color-mix(in srgb, var(--color-error) 55%, transparent)'
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
              ) : effectiveStatus === 'DROPPED' ? (
                <>
                  <XCircle size={13} strokeWidth={2.5} />
                  <span>Dropped</span>
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
              title={
                effectiveScore && effectiveScore > 0
                  ? `Your score: ${effectiveScore.toFixed(1)} / 10 (Click to edit)`
                  : isManga
                  ? 'Click to rate this manga'
                  : 'Click to rate this anime'
              }
              className={effectiveScore && effectiveScore > 0 ? 'user-score-badge-btn' : 'card-icon-btn-subtle'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5.5px',
                padding: '7px 12px',
                borderRadius: '8px',
                backgroundColor:
                  effectiveScore && effectiveScore > 0 ? 'var(--color-score-bg)' : 'var(--color-input-bg)',
                color:
                  effectiveScore && effectiveScore > 0 ? 'var(--color-score)' : 'var(--color-secondary)',
                border:
                  effectiveScore && effectiveScore > 0
                    ? '1px solid var(--color-score-border)'
                    : '1px solid var(--color-border)',
                fontSize: '12px',
                fontWeight: effectiveScore && effectiveScore > 0 ? 700 : 600,
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Star
                size={13}
                fill={effectiveScore && effectiveScore > 0 ? 'var(--color-score-star)' : 'none'}
                color={effectiveScore && effectiveScore > 0 ? 'var(--color-score-star)' : 'currentColor'}
              />
              <span>
                {effectiveScore && effectiveScore > 0 ? `${effectiveScore.toFixed(1)}` : '+ Rate'}
              </span>
              {effectiveScore && effectiveScore > 0 ? (
                <Edit2 size={10} style={{ opacity: 0.75 }} />
              ) : null}
            </button>
          </div>

          {/* Visual Single-Row Progress Bar + Compact '+' Button (Shown for Watching, Paused, and Dropped) */}
          {effectiveStatus === 'CURRENT' ||
          effectiveStatus === 'PAUSED' ||
          effectiveStatus === 'DROPPED' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingTop: '10px',
                borderTop: '1px solid var(--color-border)'
              }}
            >
              <ProgressBar
                current={currentProgress}
                total={totalUnits}
                status={effectiveStatus}
              />

              {effectiveStatus === 'CURRENT' ? (
                isCompleted ? (
                  <div
                    title={isManga ? 'Manga completed' : 'Anime completed'}
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
                    onClick={() => {
                      setDetail((prev) =>
                        prev ? { ...prev, progress: currentProgress + 1 } : null
                      );
                      incrementProgress({
                        ...anime,
                        progress: currentProgress
                      });
                    }}
                    disabled={isPending}
                    isLoading={isPending}
                    title={`${isManga ? '+1 Chapter' : '+1 Episode'} (${currentProgress} -> ${currentProgress + 1})`}
                    aria-label={`Increment progress from ${currentProgress} to ${currentProgress + 1}`}
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
                )
              ) : null}
            </div>
          ) : null}

          {/* Airing Countdown & Unwatched Episode Badge (Consistent with Home Tab) */}
          {!isManga && (detail?.nextAiringEpisode || anime.nextAiringEpisode) ? (() => {
            const airingInfo = (detail?.nextAiringEpisode || anime.nextAiringEpisode)!;
            const airedEpisodes = Math.max(0, airingInfo.episode - 1);
            const unwatchedAiredCount =
              effectiveStatus === 'CURRENT'
                ? Math.max(0, airedEpisodes - (currentProgress || 0))
                : 0;

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  flexWrap: 'wrap',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--color-border)'
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    color: 'var(--color-secondary)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                  title={`Next episode: Ep ${airingInfo.episode}`}
                >
                  <Clock size={12} style={{ color: 'var(--color-tertiary)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>
                    {formatAiringCountdown(airingInfo)}
                  </span>
                </div>

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
                      padding: '3px 7.5px',
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

        {/* GENRES SECTION */}
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

        {/* Compact 3-Column Info Strip (Studio, Season, Media Status — zero redundancy) */}
        <div style={{ padding: '0 16px 14px 16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '8px',
              backgroundColor: 'var(--color-card)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid var(--color-border)'
            }}
          >
            {/* Studio or Format */}
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--color-tertiary)',
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  marginBottom: '2px'
                }}
              >
                {isManga ? 'Format' : 'Studio'}
              </span>
              <span
                className="line-clamp-1"
                title={
                  isManga
                    ? (detail?.format || anime.format || 'MANGA')
                    : detail?.studios && detail.studios.length > 0
                    ? detail.studios.join(', ')
                    : undefined
                }
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}
              >
                {isManga
                  ? (detail?.format || anime.format || 'MANGA')
                  : detail?.studios && detail.studios.length > 0
                  ? detail.studios.join(', ')
                  : isLoading
                  ? 'Loading...'
                  : 'TBA'}
              </span>
            </div>

            {/* Season & Year */}
            <div
              style={{
                minWidth: 0,
                paddingLeft: '10px',
                borderLeft: '1px solid var(--color-border)'
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--color-tertiary)',
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  marginBottom: '2px'
                }}
              >
                {isManga ? 'Year' : 'Season'}
              </span>
              <span
                className="line-clamp-1"
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}
              >
                {isLoading && !detail
                  ? 'Loading...'
                  : isManga
                  ? (detail?.seasonYear || anime.seasonYear || 'TBA')
                  : formatSeasonLabel(detail?.season, detail?.seasonYear ?? anime.seasonYear)}
              </span>
            </div>

            {/* True Media Airing Status */}
            <div
              style={{
                minWidth: 0,
                paddingLeft: '10px',
                borderLeft: '1px solid var(--color-border)'
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--color-tertiary)',
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  marginBottom: '2px'
                }}
              >
                Status
              </span>
              {(() => {
                const hasNextAiring = Boolean(detail?.nextAiringEpisode || anime.nextAiringEpisode);
                const statusLabel = isLoading && !detail
                  ? 'Loading...'
                  : formatMediaStatus(detail?.mediaStatus, hasNextAiring);
                const isAiring = statusLabel === 'Airing';

                return (
                  <span
                    className="line-clamp-1"
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: isAiring ? 'var(--color-watching)' : 'var(--color-primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    {isAiring ? (
                      <span
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-watching)',
                          flexShrink: 0
                        }}
                      />
                    ) : null}
                    <span>{statusLabel}</span>
                  </span>
                );
              })()}
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
              <div style={{ position: 'relative' }}>
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
              </div>

              {detail.description.length > 200 ? (
                <button
                  type="button"
                  onClick={() => setIsDescExpanded(!isDescExpanded)}
                  className="card-icon-btn-subtle"
                  style={{
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--color-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <span>{isDescExpanded ? 'Show less' : 'Read more'}</span>
                  {isDescExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
                <Skeleton width="100%" height="56px" borderRadius="10px" />
                <Skeleton width="100%" height="56px" borderRadius="10px" />
                <Skeleton width="100%" height="56px" borderRadius="10px" />
                <Skeleton width="100%" height="56px" borderRadius="10px" />
              </div>
            ) : detail?.characters && detail.characters.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px'
                }}
              >
                {detail.characters.slice(0, 6).map((char) => {
                  const isMainRole = char.role === 'MAIN';
                  return (
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
                          width: '42px',
                          height: '56px',
                          minWidth: '42px',
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

                      {/* Character Name & Role (Centered vertically with balanced gap) */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '4px 8px 4px 0',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: '3px'
                        }}
                      >
                        <span
                          className="line-clamp-1"
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-primary)',
                            lineHeight: 1.25
                          }}
                        >
                          {char.name}
                        </span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            color: isMainRole ? 'var(--color-secondary)' : 'var(--color-tertiary)',
                            fontWeight: isMainRole ? 500 : 400,
                            lineHeight: 1.2
                          }}
                        >
                          {formatCharacterRole(char.role)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* RELATIONS SECTION (Prequel / Sequel / Connected Series) */}
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
                const formatText = rel.format ? rel.format.replace(/_/g, ' ') : null;
                const specsMeta = [formatText, rel.seasonYear].filter(Boolean).join(' • ');

                const handleSelectRelation = () => {
                  const relStatus = getUserStatus(rel.id, null);
                  const relScore = getUserScore(rel.id, null);
                  const isRelManga =
                    rel.format === 'MANGA' ||
                    rel.format === 'NOVEL' ||
                    rel.format === 'ONE_SHOT' ||
                    rel.type === 'MANGA';
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
                    seasonYear: rel.seasonYear ?? null,
                    type: isRelManga ? 'MANGA' : 'ANIME',
                    status: relStatus || (rel.status as MediaListStatus) || 'PLANNING',
                    format: rel.format || (isRelManga ? 'MANGA' : 'TV'),
                    siteUrl: isRelManga
                      ? `https://anilist.co/manga/${rel.id}`
                      : `https://anilist.co/anime/${rel.id}`
                  };
                  openDetailModal(relAnime);
                };

                return (
                  <div
                    key={`${rel.id}_${rel.relationType}`}
                    role="button"
                    tabIndex={0}
                    onClick={handleSelectRelation}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectRelation();
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
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
                      e.currentTarget.style.borderColor = 'var(--color-border)';
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
                        border: '1px solid var(--color-border)',
                        flexShrink: 0
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
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            padding: '1.5px 6.5px',
                            borderRadius: '5px',
                            backgroundColor: isSequel
                              ? 'var(--color-watching-bg)'
                              : isPrequel
                              ? 'var(--color-badge-bg)'
                              : 'var(--color-input-bg)',
                            color: isSequel
                              ? 'var(--color-watching)'
                              : 'var(--color-secondary)',
                            border: isSequel
                              ? '1px solid color-mix(in srgb, var(--color-watching) 35%, transparent)'
                              : '1px solid var(--color-border)'
                          }}
                        >
                          {formatRelationLabel(rel.relationType)}
                        </span>
                        {specsMeta ? (
                          <span
                            style={{
                              fontSize: '10.5px',
                              color: 'var(--color-tertiary)',
                              fontWeight: 500,
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            {specsMeta}
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

export const AnimeDetailModal = React.memo(AnimeDetailModalComponent);
