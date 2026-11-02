import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeMode, ProfileSortMode, MediaListStatus, NormalizedAnimeItem } from '../../types';
import { anilistService } from '../../services/anilistClient';
import { storageService } from '../../services/storage';
import { Button } from '../common/Button';
import { Skeleton } from '../common/Skeleton';
import {
  Sun,
  Moon,
  Monitor,
  LogOut,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  Search,
  X,
  Check,
  Eye,
  Clock,
  PauseCircle,
  XCircle,
  Edit2,
  Film,
  RefreshCw,
  Star
} from 'lucide-react';
import { useAnime } from '../../context/AnimeContext';
import { useUIActions } from '../../context/UIContext';
import { getAnimeAuraColor } from '../../utils/auraColor';

const GENRE_COLORS = [
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316'  // Orange
];

const PROFILE_COLOR_MAP: Record<string, string> = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316',
  red: '#ef4444',
  green: '#10b981',
  gray: '#64748b'
};

function resolveProfileAccent(profileColor?: string | null): string {
  if (!profileColor) return PROFILE_COLOR_MAP.blue;
  const normalized = profileColor.trim().toLowerCase();
  if (PROFILE_COLOR_MAP[normalized]) {
    return PROFILE_COLOR_MAP[normalized];
  }
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return PROFILE_COLOR_MAP.blue;
}

interface ProfileAnimeRowProps {
  anime: NormalizedAnimeItem;
  currentScore: number | null;
  effectiveItemStatus: MediaListStatus | null;
  onOpenDetail: (anime: NormalizedAnimeItem) => void;
  onOpenScore: (anime: NormalizedAnimeItem) => void;
  onOpenStatus: (anime: NormalizedAnimeItem, initialStatus?: MediaListStatus | null) => void;
}

const ProfileAnimeRow = React.memo<ProfileAnimeRowProps>(
  ({ anime, currentScore, effectiveItemStatus, onOpenDetail, onOpenScore, onOpenStatus }) => {
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasScore = currentScore !== null && currentScore !== undefined && currentScore > 0;

    const handleOpenAnimeDetail = () => {
      onOpenDetail({
        ...anime,
        userStatus: effectiveItemStatus,
        userScore: currentScore
      });
    };

    return (
      <article
        className="anime-card-ambient"
        onMouseEnter={() => {
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
          }
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
        {/* Pinned Subtle External Link Icon (Frameless, matches Home view) */}
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
          onClick={handleOpenAnimeDetail}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenAnimeDetail();
            }
          }}
          title={`View details for ${anime.title}`}
          style={{
            width: '50px',
            minWidth: '50px',
            minHeight: '66px',
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
          <img
            src={anime.coverImageMedium || anime.coverImage}
            alt={anime.title}
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
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Right Content: 2-Row Balanced Layout (Row 1: Title, Row 2: Specs Left + Score & Status Right) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: '66px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '6px'
          }}
        >
          {/* Row 1: Title & Genres */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingRight: '22px' }}>
            <h3
              className="line-clamp-2 card-title-interactive"
              title={`View details for ${anime.title}`}
              onClick={handleOpenAnimeDetail}
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
          </div>

          {/* Row 2: Left Metadata (TV • 11 eps • AniList 84%) + Right Actions ([★ 10.0 ✎] [✓]) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginTop: 'auto'
            }}
          >
            {/* Left Inline Metadata: Format • Episodes • Year • AniList % */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                color: 'var(--color-secondary)',
                lineHeight: 1,
                minWidth: 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {anime.format ? (
                <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>
                  {anime.format.replace(/_/g, ' ')}
                </span>
              ) : null}

              {anime.format &&
              (anime.episodes ||
                effectiveItemStatus === 'CURRENT' ||
                effectiveItemStatus === 'DROPPED' ||
                effectiveItemStatus === 'PAUSED') ? (
                <span style={{ color: 'var(--color-tertiary)', fontSize: '9px' }}>•</span>
              ) : null}

              {effectiveItemStatus === 'CURRENT' ||
              effectiveItemStatus === 'DROPPED' ||
              effectiveItemStatus === 'PAUSED' ? (
                <span
                  style={{
                    color:
                      effectiveItemStatus === 'DROPPED'
                        ? 'var(--color-error)'
                        : effectiveItemStatus === 'PAUSED'
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

              {anime.seasonYear ? (
                <>
                  {anime.format ||
                  anime.episodes ||
                  effectiveItemStatus === 'CURRENT' ||
                  effectiveItemStatus === 'DROPPED' ||
                  effectiveItemStatus === 'PAUSED' ? (
                    <span style={{ color: 'var(--color-tertiary)', fontSize: '9px' }}>•</span>
                  ) : null}
                  <span style={{ fontWeight: 500 }}>{anime.seasonYear}</span>
                </>
              ) : null}

              {anime.averageScore !== null && anime.averageScore !== undefined ? (
                <>
                  {anime.format ||
                  anime.episodes ||
                  effectiveItemStatus === 'CURRENT' ||
                  effectiveItemStatus === 'DROPPED' ||
                  effectiveItemStatus === 'PAUSED' ||
                  anime.seasonYear ? (
                    <span style={{ color: 'var(--color-tertiary)', fontSize: '9px' }}>•</span>
                  ) : null}
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3.5px' }}>
                    <span>AniList</span>
                    <strong style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {anime.averageScore}%
                    </strong>
                  </span>
                </>
              ) : null}
            </div>

            {/* Right Cluster: Interactive User Score Badge (hidden if unrated in PLANNING) + 32x28px Status Icon Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0
              }}
            >
              {hasScore || effectiveItemStatus !== 'PLANNING' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenScore(anime);
                  }}
                  title={hasScore ? `Your score: ${currentScore!.toFixed(1)} / 10 (Click to edit)` : 'Rate this anime'}
                  className={hasScore ? 'user-score-badge-btn' : 'card-icon-btn-subtle'}
                  style={{
                    height: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4.5px',
                    background: hasScore ? 'var(--color-score-bg)' : 'var(--color-input-bg)',
                    border: hasScore ? '1px solid var(--color-score-border)' : '1px solid var(--color-border)',
                    borderRadius: '7px',
                    padding: '0 7.5px',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    lineHeight: 1,
                    color: hasScore ? 'var(--color-score)' : 'var(--color-secondary)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {hasScore ? (
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
                        {currentScore!.toFixed(1)}
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
              ) : null}

              {effectiveItemStatus === 'COMPLETED' ? (
                <button
                  type="button"
                  onClick={() => onOpenStatus({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                  title="Completed (Click to change status)"
                  aria-label="Completed (Click to change status)"
                  className="card-status-badge-btn"
                  style={{
                    width: '28px',
                    height: '24px',
                    minWidth: '28px',
                    minHeight: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '7px',
                    backgroundColor: 'var(--color-success-bg)',
                    color: 'var(--color-success)',
                    border: '1px solid color-mix(in srgb, var(--color-success) 55%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  <Check size={13.5} strokeWidth={2.5} />
                </button>
              ) : effectiveItemStatus === 'CURRENT' ? (
                <button
                  type="button"
                  onClick={() => onOpenStatus({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                  title={`Currently Watching: Ep ${anime.progress} / ${anime.episodes || anime.chapters || '?'} (Click to change status)`}
                  aria-label="Currently Watching (Click to change status)"
                  className="card-status-badge-btn"
                  style={{
                    width: '28px',
                    height: '24px',
                    minWidth: '28px',
                    minHeight: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '7px',
                    backgroundColor: 'var(--color-watching-bg)',
                    color: 'var(--color-watching)',
                    border: '1px solid color-mix(in srgb, var(--color-watching) 55%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  <Eye size={13.5} strokeWidth={2.3} />
                </button>
              ) : effectiveItemStatus === 'PLANNING' ? (
                <button
                  type="button"
                  onClick={() => onOpenStatus({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                  title="Planning to Watch (Click to change status)"
                  aria-label="Planning to Watch (Click to change status)"
                  className="card-status-badge-btn"
                  style={{
                    width: '28px',
                    height: '24px',
                    minWidth: '28px',
                    minHeight: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '7px',
                    backgroundColor: 'var(--color-planning-bg)',
                    color: 'var(--color-planning)',
                    border: '1px solid color-mix(in srgb, var(--color-planning) 55%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  <Clock size={13.5} strokeWidth={2.3} />
                </button>
              ) : effectiveItemStatus === 'DROPPED' ? (
                <button
                  type="button"
                  onClick={() => onOpenStatus({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                  title={`Dropped: Ep ${anime.progress} / ${anime.episodes || anime.chapters || '?'} (Click to change status)`}
                  aria-label="Dropped (Click to change status)"
                  className="card-status-badge-btn"
                  style={{
                    width: '28px',
                    height: '24px',
                    minWidth: '28px',
                    minHeight: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '7px',
                    backgroundColor: 'var(--color-error-bg)',
                    color: 'var(--color-error)',
                    border: '1px solid color-mix(in srgb, var(--color-error) 55%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  <XCircle size={13.5} strokeWidth={2.3} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenStatus({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                  title={`Paused: Ep ${anime.progress} / ${anime.episodes || anime.chapters || '?'} (Click to change status)`}
                  aria-label="Paused (Click to change status)"
                  className="card-status-badge-btn"
                  style={{
                    width: '28px',
                    height: '24px',
                    minWidth: '28px',
                    minHeight: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '7px',
                    backgroundColor: 'var(--color-paused-bg)',
                    color: 'var(--color-paused)',
                    border: '1px solid color-mix(in srgb, var(--color-paused) 55%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  <PauseCircle size={13.5} strokeWidth={2.3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }
);

interface ProfileViewProps {
  resetTrigger?: number;
}

const ProfileViewComponent: React.FC<ProfileViewProps> = ({ resetTrigger }) => {
  const { user, logout, refreshProfile, isLoading: isAuthLoading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { openScoreModal, openStatusModal, openDetailModal } = useUIActions();
  const {
    getUserScore,
    getUserStatus,
    watchingList,
    isLoading: isWatchingLoading
  } = useAnime();

  // Status drill-down state
  const [selectedStatus, setSelectedStatus] = useState<MediaListStatus | null>(null);
  const [statusTitle, setStatusTitle] = useState<string>('');
  const [statusAnimeList, setStatusAnimeList] = useState<NormalizedAnimeItem[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFilterFocused, setIsFilterFocused] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [sortMode, setSortMode] = useState<ProfileSortMode>(() => storageService.getProfileSortSync());
  const [visibleCount, setVisibleCount] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    storageService.getProfileSort().then((saved) => {
      if (saved) {
        setSortMode((prev) => (prev !== saved ? saved : prev));
      }
    });
  }, []);

  const handleCycleSortMode = () => {
    const nextMode: ProfileSortMode =
      sortMode === 'SCORE_DESC'
        ? 'TITLE_ASC'
        : sortMode === 'TITLE_ASC'
        ? 'AVERAGE_DESC'
        : 'SCORE_DESC';
    setSortMode(nextMode);
    storageService.setProfileSort(nextMode);
  };

  // Synchronize status counts from local disk cache and loaded lists
  const [cachedCounts, setCachedCounts] = useState<Partial<Record<MediaListStatus, number>>>({});

  useEffect(() => {
    if (!user?.id) return;
    let isCancelled = false;
    const loadCachedCounts = async () => {
      const statuses: MediaListStatus[] = ['CURRENT', 'COMPLETED', 'PLANNING', 'DROPPED'];
      const counts: Partial<Record<MediaListStatus, number>> = {};
      for (const st of statuses) {
        try {
          const disk = await storageService.getCachedStatusList(user.id, st);
          if (disk?.list && disk.list.length > 0) {
            counts[st] = disk.list.length;
          }
        } catch {
          // ignore
        }
      }
      if (!isCancelled && Object.keys(counts).length > 0) {
        setCachedCounts(counts);
      }
    };
    loadCachedCounts();
    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshProfile();
      if (user?.id) {
        const statuses: MediaListStatus[] = ['CURRENT', 'COMPLETED', 'PLANNING', 'DROPPED'];
        const counts: Partial<Record<MediaListStatus, number>> = {};
        for (const st of statuses) {
          const disk = await storageService.getCachedStatusList(user.id, st);
          if (disk?.list && disk.list.length > 0) {
            counts[st] = disk.list.length;
          }
        }
        setCachedCounts(counts);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Race condition mitigation refs
  const statusRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
      statusRequestIdRef.current++;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setVisibleCount(30);
  }, [selectedStatus, filterQuery]);

  const themeOptions: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode }> = [
    { mode: 'light', label: 'Light', icon: <Sun size={14} /> },
    { mode: 'dark', label: 'Dark', icon: <Moon size={14} /> },
    { mode: 'system', label: 'System', icon: <Monitor size={14} /> }
  ];

  const activeThemeIndex = Math.max(
    0,
    themeOptions.findIndex((opt) => opt.mode === theme)
  );

  const watchingCount =
    !isWatchingLoading && watchingList
      ? watchingList.length
      : (cachedCounts['CURRENT'] ?? user?.stats?.watching ?? 0);

  const stats: Array<{
    label: string;
    status: MediaListStatus;
    value: number;
    icon: React.ReactNode;
  }> = [
    { label: 'Watching', status: 'CURRENT', value: watchingCount, icon: <Eye size={14} /> },
    { label: 'Completed', status: 'COMPLETED', value: cachedCounts['COMPLETED'] ?? user?.stats?.completed ?? 0, icon: <Check size={14} /> },
    { label: 'Planning', status: 'PLANNING', value: cachedCounts['PLANNING'] ?? user?.stats?.planning ?? 0, icon: <Clock size={14} /> },
    { label: 'Dropped', status: 'DROPPED', value: cachedCounts['DROPPED'] ?? user?.stats?.dropped ?? 0, icon: <XCircle size={14} /> }
  ];

  const handleOpenStatusList = async (status: MediaListStatus, label: string) => {
    // 1. Abort any ongoing network request from previously clicked tab
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 2. Increment request ID to uniquely identify this action
    const requestId = ++statusRequestIdRef.current;

    setSelectedStatus(status);
    setStatusTitle(label);
    setFilterQuery('');
    setListError(null);

    if (!user) return;

    // SWR: Check if disk/RAM cache exists for this status list for instant 0ms rendering
    let hasCached = false;
    try {
      const diskData = await storageService.getCachedStatusList(user.id, status);
      if (statusRequestIdRef.current !== requestId) return;

      if (diskData && diskData.list && diskData.list.length > 0) {
        hasCached = true;
        setStatusAnimeList(diskData.list);
        setCachedCounts((prev) => ({ ...prev, [status]: diskData.list.length }));
        setIsListLoading(false);
      }
    } catch {
      // ignore
    }

    if (statusRequestIdRef.current !== requestId) return;

    // Only wipe list and show skeleton if there was NO cached data for instant render
    if (!hasCached) {
      setStatusAnimeList([]);
      setIsListLoading(true);
    }

    // 3. Background revalidation from AniList
    try {
      const list = await anilistService.getUserAnimeListByStatus(
        user.id,
        status,
        false,
        controller.signal
      );

      // Verify request is still active before updating state
      if (statusRequestIdRef.current !== requestId) return;

      setStatusAnimeList(list);
      setCachedCounts((prev) => ({ ...prev, [status]: list.length }));
    } catch (err: unknown) {
      // Ignore deliberate user cancellations
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      if (statusRequestIdRef.current !== requestId) return;

      if (!hasCached) {
        setListError(err instanceof Error ? err.message : 'Failed to load list.');
      }
    } finally {
      if (statusRequestIdRef.current === requestId) {
        setIsListLoading(false);
      }
    }
  };

  const handleBackToMain = () => {
    // Invalidate in-flight requests & cancel network fetch
    statusRequestIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedStatus(null);
    setStatusAnimeList([]);
    setFilterQuery('');
    setListError(null);
    setIsListLoading(false);
  };

  useEffect(() => {
    if (resetTrigger && selectedStatus !== null) {
      handleBackToMain();
    }
  }, [resetTrigger]);

  const deferredFilterQuery = useDeferredValue(filterQuery);

  // Pre-sorted list with pre-computed lowercase title (only recomputed when list, sortMode, or score overrides change)
  const sortedStatusList = useMemo(() => {
    const enriched = statusAnimeList.map((anime) => {
      const effectiveScore = getUserScore(anime.mediaId, anime.userScore);
      return {
        anime,
        effectiveScore: effectiveScore !== null && effectiveScore > 0 ? effectiveScore : -1,
        avgScore:
          anime.averageScore !== null && anime.averageScore !== undefined
            ? anime.averageScore
            : -1,
        titleLower: anime.title.toLowerCase()
      };
    });

    enriched.sort((a, b) => {
      if (sortMode === 'SCORE_DESC') {
        if (b.effectiveScore !== a.effectiveScore) {
          return b.effectiveScore - a.effectiveScore;
        }
      } else if (sortMode === 'AVERAGE_DESC') {
        if (b.avgScore !== a.avgScore) {
          return b.avgScore - a.avgScore;
        }
      }
      return a.anime.title.localeCompare(b.anime.title, undefined, {
        sensitivity: 'base',
        numeric: true
      });
    });

    return enriched;
  }, [statusAnimeList, sortMode, getUserScore]);

  // Filtered anime list using deferred query and pre-computed lowercase title
  const filteredList = useMemo(() => {
    const q = deferredFilterQuery.trim().toLowerCase();
    if (!q) return sortedStatusList.map((entry) => entry.anime);
    return sortedStatusList
      .filter((entry) => entry.titleLower.includes(q))
      .map((entry) => entry.anime);
  }, [sortedStatusList, deferredFilterQuery]);

  // Memoized top genre distribution metrics
  const genreStats = useMemo(() => {
    const list = user?.stats?.topGenres || [];
    const total = list.reduce((acc, g) => acc + g.count, 0) || 1;
    return list.map((g, idx) => ({
      genre: g.genre,
      count: g.count,
      percentage: Math.round((g.count / total) * 100),
      rawPercentage: (g.count / total) * 100,
      color: GENRE_COLORS[idx % GENRE_COLORS.length]
    }));
  }, [user?.stats?.topGenres]);

  // If a status is selected, show the Drill-Down List View
  if (selectedStatus !== null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        {/* Drill-down Header */}
        <div
          style={{
            padding: '14px 16px 10px 16px',
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={handleBackToMain}
              aria-label="Back to Profile"
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
              <span>Profile</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  margin: 0
                }}
              >
                {statusTitle}
              </h2>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-secondary)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                ({statusAnimeList.length})
              </span>
            </div>

            <button
              type="button"
              onClick={handleCycleSortMode}
              title={
                sortMode === 'SCORE_DESC'
                  ? 'Sorted by Your Score (Click to sort A-Z)'
                  : sortMode === 'TITLE_ASC'
                  ? 'Sorted Alphabetically A-Z (Click to sort by AniList %)'
                  : 'Sorted by AniList Average % (Click to sort by Your Score)'
              }
              aria-label="Cycle sort order"
              className="card-icon-btn-subtle"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4.5px',
                fontSize: '11px',
                fontWeight: 600,
                color: sortMode === 'SCORE_DESC' ? 'var(--color-score)' : 'var(--color-primary)',
                backgroundColor:
                  sortMode === 'SCORE_DESC' ? 'var(--color-score-bg)' : 'var(--color-input-bg)',
                padding: '5px 9px',
                borderRadius: '8px',
                border:
                  sortMode === 'SCORE_DESC'
                    ? '1px solid var(--color-score-border)'
                    : '1px solid var(--color-border)',
                letterSpacing: '0.01em',
                cursor: 'pointer'
              }}
            >
              {sortMode === 'SCORE_DESC' ? (
                <Star
                  size={11}
                  fill="var(--color-score-star)"
                  color="var(--color-score-star)"
                  style={{ flexShrink: 0 }}
                />
              ) : (
                <ArrowUpDown size={11} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
              )}
              <span>
                {sortMode === 'SCORE_DESC'
                  ? 'Score'
                  : sortMode === 'TITLE_ASC'
                  ? 'A-Z'
                  : 'AniList %'}
              </span>
            </button>
          </div>

          {/* Quick Filter Input (Pill-styled to match Search tab) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'var(--color-card)',
              border: isFilterFocused
                ? '1px solid var(--color-primary)'
                : '1px solid var(--color-border)',
              boxShadow: isFilterFocused
                ? '0 6px 18px -2px rgba(0, 0, 0, 0.28), 0 0 0 2px color-mix(in srgb, var(--color-primary) 15%, transparent)'
                : '0 2px 8px -2px rgba(0, 0, 0, 0.14)',
              borderRadius: '9999px',
              padding: '0 14px',
              height: '40px',
              boxSizing: 'border-box',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: isFilterFocused ? 'scale(1.005)' : 'scale(1)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isFilterFocused ? 'var(--color-primary)' : 'var(--color-tertiary)',
                transform: isFilterFocused ? 'scale(1.15) rotate(-8deg)' : 'scale(1) rotate(0deg)',
                transition: 'all 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                flexShrink: 0
              }}
            >
              <Search size={15} strokeWidth={2} />
            </div>
            <input
              ref={filterInputRef}
              type="text"
              value={filterQuery}
              onFocus={() => setIsFilterFocused(true)}
              onBlur={() => setIsFilterFocused(false)}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={`Filter in ${statusTitle.toLowerCase()}...`}
              aria-label={`Filter in ${statusTitle}`}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '13px',
                fontWeight: 400,
                color: 'var(--color-primary)',
                lineHeight: 1
              }}
            />
            {filterQuery ? (
              <button
                type="button"
                onClick={() => {
                  setFilterQuery('');
                  filterInputRef.current?.focus();
                }}
                aria-label="Clear filter query"
                className="clear-search-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-badge-bg)',
                  color: 'var(--color-secondary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'transform 0.15s ease, color 0.15s ease'
                }}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Scrollable Anime List */}
        <div
          onScroll={(e) => {
            const target = e.currentTarget;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 250) {
              setVisibleCount((prev) => Math.min(prev + 25, filteredList.length));
            }
          }}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px 16px 72px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          {isListLoading ? (
            <>
              <div style={{ display: 'flex', gap: '12px', padding: '10px 12px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                <Skeleton width="50px" height="66px" borderRadius="8px" />
                <div style={{ flex: 1, minHeight: '66px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Skeleton width="70%" height="15px" />
                  <Skeleton width="42%" height="11px" />
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Skeleton width="48%" height="12px" />
                    <Skeleton width="32px" height="28px" borderRadius="7px" />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', padding: '10px 12px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                <Skeleton width="50px" height="66px" borderRadius="8px" />
                <div style={{ flex: 1, minHeight: '66px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Skeleton width="60%" height="15px" />
                  <Skeleton width="35%" height="11px" />
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Skeleton width="44%" height="12px" />
                    <Skeleton width="32px" height="28px" borderRadius="7px" />
                  </div>
                </div>
              </div>
            </>
          ) : listError ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-card)',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                margin: 'auto 0'
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--color-secondary)', margin: 0 }}>{listError}</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-card)',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                margin: 'auto 0'
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--color-secondary)', margin: 0 }}>
                {filterQuery
                  ? `No anime matching "${filterQuery}" in ${statusTitle}.`
                  : `No anime currently in ${statusTitle}.`}
              </p>
            </div>
          ) : (
            <>
              {filteredList.slice(0, visibleCount).map((anime) => (
                <ProfileAnimeRow
                  key={anime.mediaId}
                  anime={anime}
                  currentScore={getUserScore(anime.mediaId, anime.userScore)}
                  effectiveItemStatus={getUserStatus(anime.mediaId, selectedStatus)}
                  onOpenDetail={openDetailModal}
                  onOpenScore={openScoreModal}
                  onOpenStatus={openStatusModal}
                />
              ))}
            {visibleCount < filteredList.length && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '12px 0 4px',
                  fontSize: '11px',
                  color: 'var(--color-tertiary)'
                }}
              >
                Showing {visibleCount} of {filteredList.length} anime • Scroll down for more
              </div>
            )}
          </>
          )}
        </div>
      </div>
    );
  }

  const profileAccent = resolveProfileAccent(user?.profileColor);
  const profileUrl = user?.name ? `https://anilist.co/user/${user.name}` : 'https://anilist.co';
  const hasBanner = Boolean(user?.bannerImage);

  // Main Profile View (when selectedStatus is null)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px 16px 72px 16px',
        gap: '20px',
        boxSizing: 'border-box'
      }}
    >
      {/* Profile Hero Card (Full-Card Banner) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: hasBanner ? '128px' : '92px',
          borderRadius: '16px',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          position: 'relative',
          flexShrink: 0
        }}
      >
        {/* Full-Card Background Artwork or Two-Tone Linear Gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
            background: hasBanner
              ? 'var(--color-card)'
              : `linear-gradient(135deg, ${profileAccent}42 0%, ${profileAccent}14 55%, transparent 100%)`
          }}
        >
          {hasBanner ? (
            <>
              <img
                src={user!.bannerImage!}
                alt=""
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  display: 'block'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(0, 0, 0, 0.0) 0%, rgba(0, 0, 0, 0.06) 45%, rgba(8, 10, 16, 0.56) 78%, rgba(8, 10, 16, 0.78) 100%)',
                  pointerEvents: 'none'
                }}
              />
            </>
          ) : null}
        </div>

        {/* Bottom Identity & Actions Row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '12px',
            padding: hasBanner ? '48px 14px 13px 14px' : '18px 14px 14px 14px',
            position: 'relative',
            zIndex: 1
          }}
        >
          {/* Left: Avatar + Name/URL */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '12px',
              minWidth: 0,
              flex: 1
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                overflow: 'hidden',
                backgroundColor: 'var(--color-card)',
                border: hasBanner
                  ? '2px solid rgba(255, 255, 255, 0.24)'
                  : '2px solid var(--color-card)',
                boxShadow: `0 0 0 1.5px ${profileAccent}80, 0 6px 16px rgba(0, 0, 0, 0.35)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {user?.avatar?.large ? (
                <img
                  src={user.avatar.large}
                  alt={user.name}
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-secondary)' }}>
                  {user?.name?.slice(0, 1).toUpperCase() || 'U'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <h2
                style={{
                  fontSize: '17px',
                  fontWeight: 600,
                  color: hasBanner ? '#ffffff' : 'var(--color-primary)',
                  textShadow: hasBanner ? '0 1px 8px rgba(0, 0, 0, 0.65)' : 'none',
                  margin: 0,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {user?.name || 'AniList User'}
              </h2>
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '11.5px',
                  color: hasBanner ? 'rgba(255, 255, 255, 0.78)' : 'var(--color-secondary)',
                  textShadow: hasBanner ? '0 1px 6px rgba(0, 0, 0, 0.65)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = hasBanner ? '#ffffff' : 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = hasBanner
                    ? 'rgba(255, 255, 255, 0.78)'
                    : 'var(--color-secondary)';
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name ? `anilist.co/user/${user.name}` : 'anilist.co'}
                </span>
                <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.85 }} />
              </a>
            </div>
          </div>

          {/* Right: Single Minimalist Glass Sync Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Sync profile & stats with AniList"
            aria-label="Sync profile & stats with AniList"
            className={hasBanner ? 'banner-glass-btn' : 'card-icon-btn-subtle'}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: '2px',
              color: hasBanner ? 'rgba(255, 255, 255, 0.92)' : 'var(--color-secondary)',
              backgroundColor: hasBanner ? 'rgba(10, 12, 20, 0.34)' : 'var(--color-input-bg)',
              backdropFilter: hasBanner ? 'blur(12px) saturate(180%)' : 'none',
              WebkitBackdropFilter: hasBanner ? 'blur(12px) saturate(180%)' : 'none',
              border: hasBanner
                ? `1px solid ${profileAccent}55`
                : `1px solid ${profileAccent}40`,
              boxShadow: hasBanner
                ? `0 0 0 0.5px ${profileAccent}26, 0 4px 14px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.14)`
                : 'none',
              cursor: isRefreshing ? 'wait' : 'pointer',
              padding: 0
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2-Column Clickable Stats Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3
            style={{
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-secondary)',
              margin: 0
            }}
          >
            Anime Statistics
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--color-tertiary)' }}>
            Click to view list
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px'
          }}
        >
          {stats.map((stat) => (
            <button
              key={stat.label}
              onClick={() => handleOpenStatusList(stat.status, stat.label)}
              aria-label={`View ${stat.label} anime list (${stat.value})`}
              className="stat-card-btn"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s ease, background-color 0.15s ease, transform 0.1s ease',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--color-secondary)', fontWeight: 500 }}>
                  {stat.label}
                </span>
                <ChevronRight size={13} style={{ color: 'var(--color-tertiary)' }} />
              </div>

              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {stat.value}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Watch Time Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <h3
          style={{
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-secondary)',
            margin: 0
          }}
        >
          Watch Time
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px'
          }}
        >
          {/* Days Watched */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--color-secondary)', fontWeight: 500 }}>
                Days Watched
              </span>
              <Clock size={13} style={{ color: 'var(--color-tertiary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {user?.stats?.daysWatched !== undefined
                  ? user.stats.daysWatched
                  : Math.round(((user?.stats?.minutesWatched || 0) / 1440) * 10) / 10}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-secondary)' }}>days</span>
            </div>
          </div>

          {/* Episodes Watched */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--color-secondary)', fontWeight: 500 }}>
                Episodes Watched
              </span>
              <Film size={13} style={{ color: 'var(--color-tertiary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {(user?.stats?.episodesWatched ?? 0).toLocaleString()}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-secondary)' }}>episodes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Genre Distribution */}
      {user?.stats?.topGenres && user.stats.topGenres.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-secondary)',
                margin: 0
              }}
            >
              Genre Distribution
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: 500 }}>
              Top Genres
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {/* Multi-segment Stacked Bar */}
            <div
              style={{
                width: '100%',
                height: '10px',
                borderRadius: '5px',
                backgroundColor: 'var(--color-input-bg)',
                overflow: 'hidden',
                display: 'flex',
                gap: '1px'
              }}
            >
              {genreStats.map((g) => (
                <div
                  key={g.genre}
                  style={{
                    height: '100%',
                    width: `${g.rawPercentage}%`,
                    backgroundColor: g.color,
                    transition: 'width 0.4s ease'
                  }}
                  title={`${g.genre}: ${g.count} anime (${g.percentage}%)`}
                />
              ))}
            </div>

            {/* Genre Legend Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px 12px'
              }}
            >
              {genreStats.map((g) => (
                <div
                  key={g.genre}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11.5px',
                    lineHeight: 1.2
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: g.color,
                        flexShrink: 0
                      }}
                    />
                    <span
                      className="line-clamp-1"
                      style={{
                        color: 'var(--color-primary)',
                        fontWeight: 500
                      }}
                    >
                      {g.genre}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-primary)'
                      }}
                    >
                      {g.percentage}%
                    </span>
                    <span
                      title={`${g.count} anime`}
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 500,
                        color: 'color-mix(in srgb, var(--color-primary) 65%, var(--color-secondary))'
                      }}
                    >
                      ({g.count})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Theme Preference */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <h3
          style={{
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-secondary)',
            margin: 0
          }}
        >
          Appearance
        </h3>

        <div
          role="radiogroup"
          aria-label="Theme selection"
          style={{
            position: 'relative',
            display: 'flex',
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '3px',
            overflow: 'hidden',
            userSelect: 'none'
          }}
        >
          {/* Animated Sliding Pill Indicator */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '3px',
              bottom: '3px',
              left: '3px',
              width: 'calc((100% - 6px) / 3)',
              borderRadius: '7px',
              backgroundColor: 'var(--color-primary)',
              transform: `translateX(${activeThemeIndex * 100}%)`,
              transition:
                'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
              pointerEvents: 'none',
              zIndex: 1
            }}
          />

          {themeOptions.map((opt) => {
            const isSelected = theme === opt.mode;

            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setTheme(opt.mode)}
                role="radio"
                aria-checked={isSelected}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected
                    ? 'var(--color-primary-inverse)'
                    : 'var(--color-secondary)',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = 'var(--color-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = 'var(--color-secondary)';
                  }
                }}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Logout Action */}
      <div style={{ marginTop: 'auto', paddingTop: '10px', flexShrink: 0 }}>
        <Button
          variant="outlined"
          fullWidth={true}
          onClick={logout}
          isLoading={isAuthLoading}
          aria-label="Sign out of AniList"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-primary)',
            padding: '11px 16px'
          }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  );
};

export const ProfileView = React.memo(ProfileViewComponent);
