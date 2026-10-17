import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeMode, MediaListStatus, NormalizedAnimeItem } from '../../types';
import { anilistService } from '../../services/anilistClient';
import { storageService } from '../../services/storage';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Skeleton } from '../common/Skeleton';
import {
  Sun,
  Moon,
  Monitor,
  LogOut,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Search,
  X,
  Check,
  BookmarkCheck,
  Clock,
  PauseCircle,
  Edit2,
  Film,
  RotateCw
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
  const [visibleCount, setVisibleCount] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Synchronize status counts from local disk cache and loaded lists
  const [cachedCounts, setCachedCounts] = useState<Partial<Record<MediaListStatus, number>>>({});

  useEffect(() => {
    if (!user?.id) return;
    let isCancelled = false;
    const loadCachedCounts = async () => {
      const statuses: MediaListStatus[] = ['CURRENT', 'COMPLETED', 'PLANNING', 'PAUSED'];
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
        const statuses: MediaListStatus[] = ['CURRENT', 'COMPLETED', 'PLANNING', 'PAUSED'];
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
  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
      statusRequestIdRef.current++;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (hoverPrefetchTimerRef.current) {
        clearTimeout(hoverPrefetchTimerRef.current);
        hoverPrefetchTimerRef.current = null;
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
    { label: 'Watching', status: 'CURRENT', value: watchingCount, icon: <BookmarkCheck size={14} /> },
    { label: 'Completed', status: 'COMPLETED', value: cachedCounts['COMPLETED'] ?? user?.stats?.completed ?? 0, icon: <Check size={14} /> },
    { label: 'Planning', status: 'PLANNING', value: cachedCounts['PLANNING'] ?? user?.stats?.planning ?? 0, icon: <Clock size={14} /> },
    { label: 'Paused', status: 'PAUSED', value: cachedCounts['PAUSED'] ?? user?.stats?.paused ?? 0, icon: <PauseCircle size={14} /> }
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

  // Filtered and alphabetically (A-Z) sorted anime list based on local search filter (memoized)
  const filteredList = useMemo(() => {
    const sorted = [...statusAnimeList].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
    );
    const q = filterQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((anime) =>
      anime.title.toLowerCase().includes(q)
    );
  }, [statusAnimeList, filterQuery]);

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
                className="font-mono"
                style={{
                  fontSize: '12px',
                  color: 'var(--color-secondary)',
                  fontWeight: 500
                }}
              >
                ({statusAnimeList.length})
              </span>
            </div>

            <div
              title="Sorted alphabetically (A-Z)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-secondary)',
                backgroundColor: 'var(--color-badge-bg)',
                padding: '2px 7px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                letterSpacing: '0.04em'
              }}
            >
              <span>A-Z</span>
            </div>
          </div>

          {/* Quick Filter Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 10px',
              height: '34px',
              boxSizing: 'border-box'
            }}
          >
            <Search size={14} style={{ color: 'var(--color-tertiary)', flexShrink: 0 }} />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={`Filter in ${statusTitle.toLowerCase()}...`}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12px',
                color: 'var(--color-primary)'
              }}
            />
            {filterQuery ? (
              <button
                onClick={() => setFilterQuery('')}
                style={{
                  color: 'var(--color-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                  cursor: 'pointer'
                }}
              >
                <X size={13} />
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
              <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                <Skeleton width="52px" height="74px" borderRadius="8px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton width="70%" height="15px" />
                  <Skeleton width="40%" height="12px" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                <Skeleton width="52px" height="74px" borderRadius="8px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton width="60%" height="15px" />
                  <Skeleton width="35%" height="12px" />
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
              {filteredList.slice(0, visibleCount).map((anime) => {
              const currentScore = getUserScore(anime.mediaId, anime.userScore);
              const hasScore =
                currentScore !== null && currentScore !== undefined && currentScore > 0;
              const effectiveItemStatus = getUserStatus(anime.mediaId, selectedStatus);

              const handleOpenAnimeDetail = () => {
                openDetailModal({
                  ...anime,
                  userStatus: effectiveItemStatus,
                  userScore: currentScore
                });
              };

              return (
                <article
                  key={anime.mediaId}
                  className="anime-card-ambient"
                  onMouseEnter={() => {
                    if (hoverPrefetchTimerRef.current) {
                      clearTimeout(hoverPrefetchTimerRef.current);
                    }
                    hoverPrefetchTimerRef.current = setTimeout(() => {
                      anilistService.prefetchAnimeDetails(anime.mediaId);
                    }, 180);
                  }}
                  onMouseLeave={() => {
                    if (hoverPrefetchTimerRef.current) {
                      clearTimeout(hoverPrefetchTimerRef.current);
                      hoverPrefetchTimerRef.current = null;
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
                    onClick={handleOpenAnimeDetail}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenAnimeDetail();
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
                    <img
                      src={anime.coverImageMedium || anime.coverImage}
                      alt={anime.title}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
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
                    <div>
                      <h3
                        className="line-clamp-2"
                        title={`View details for ${anime.title}`}
                        onClick={handleOpenAnimeDetail}
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          lineHeight: 1.25,
                          color: 'var(--color-primary)',
                          margin: 0,
                          cursor: 'pointer',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-secondary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-primary)';
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
                      {hasScore ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openScoreModal(anime);
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
                              ★ {currentScore!.toFixed(1)}
                              <Edit2 size={9} style={{ opacity: 0.7 }} />
                            </span>
                          </Badge>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openScoreModal(anime);
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
                      )}
                    </div>
                  </div>

                  {/* Right Status Badge & External Link */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {effectiveItemStatus === 'COMPLETED' ? (
                      <button
                        type="button"
                        onClick={() => openStatusModal({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                        title="Completed (Click to change status)"
                        className="card-status-badge-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 9px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-success-bg)',
                          color: 'var(--color-success)',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: '1px solid var(--color-success)',
                          cursor: 'pointer'
                        }}
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span>Completed</span>
                      </button>
                    ) : effectiveItemStatus === 'CURRENT' ? (
                      <button
                        type="button"
                        onClick={() => openStatusModal({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                        title="Currently Watching (Click to change status)"
                        className="card-status-badge-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 9px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-watching-bg)',
                          color: 'var(--color-watching)',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: '1px solid var(--color-watching)',
                          cursor: 'pointer'
                        }}
                      >
                        <BookmarkCheck size={12} strokeWidth={2.5} />
                        <span>{anime.progress} / {anime.episodes || anime.chapters || '?'}</span>
                      </button>
                    ) : effectiveItemStatus === 'PLANNING' ? (
                      <button
                        type="button"
                        onClick={() => openStatusModal({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                        title="Planning to Watch (Click to change status)"
                        className="card-status-badge-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 9px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-planning-bg)',
                          color: 'var(--color-planning)',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: '1px solid var(--color-planning)',
                          cursor: 'pointer'
                        }}
                      >
                        <Clock size={12} strokeWidth={2.5} />
                        <span>Planning</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openStatusModal({ ...anime, userStatus: effectiveItemStatus }, effectiveItemStatus)}
                        title="Paused (Click to change status)"
                        className="card-status-badge-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 9px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-paused-bg)',
                          color: 'var(--color-paused)',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: '1px solid var(--color-paused)',
                          cursor: 'pointer'
                        }}
                      >
                        <PauseCircle size={12} strokeWidth={2.5} />
                        <span>Paused</span>
                      </button>
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
            })}
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
        padding: '20px 16px 72px 16px',
        gap: '20px',
        boxSizing: 'border-box'
      }}
    >
      {/* Profile Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '14px',
          padding: '6px 0 2px 0',
          flexShrink: 0
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            overflow: 'hidden',
            backgroundColor: 'var(--color-card)',
            border: '2px solid var(--color-border)',
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
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-secondary)' }}>
              {user?.name?.slice(0, 1).toUpperCase() || 'U'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--color-primary)',
              margin: 0,
              lineHeight: 1.2
            }}
          >
            {user?.name || 'AniList User'}
          </h2>
          <a
            href={user?.name ? `https://anilist.co/user/${user.name}` : 'https://anilist.co'}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '12px',
              color: 'var(--color-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-secondary)';
            }}
          >
            <span>{user?.name ? `anilist.co/user/${user.name}` : 'anilist.co'}</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* 2-Column Clickable Stats Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Sync stats with AniList"
              aria-label="Sync stats with AniList"
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: isRefreshing ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--color-tertiary)',
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-tertiary)')}
            >
              <RotateCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
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
                className="font-mono"
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1
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
                className="font-mono"
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1
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
                className="font-mono"
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  lineHeight: 1.1
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-primary)'
                      }}
                    >
                      {g.percentage}%
                    </span>
                    <span
                      className="font-mono"
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
