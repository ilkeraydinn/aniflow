import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NormalizedAnimeItem, MediaListStatus } from '../types';
import { anilistService } from '../services/anilistClient';
import { storageService } from '../services/storage';
import { useAuth } from './AuthContext';
import { useUIActions } from './UIContext';

export interface AnimeContextType {
  watchingList: NormalizedAnimeItem[];
  isLoading: boolean;
  error: string | null;
  pendingMediaIds: Set<number>;
  updateAnimeScore: (mediaId: number, score: number | null) => Promise<boolean>;
  getUserScore: (mediaId: number, fallbackScore?: number | null) => number | null;
  getUserStatus: (mediaId: number, fallbackStatus?: MediaListStatus | null) => MediaListStatus | null;
  refreshWatchingList: () => Promise<void>;
  incrementProgress: (item: NormalizedAnimeItem) => Promise<void>;
  addAnimeToWatching: (anime: NormalizedAnimeItem) => Promise<boolean>;
  addAnimeWithStatus: (anime: NormalizedAnimeItem, status: MediaListStatus) => Promise<boolean>;
  isMediaInWatchingList: (mediaId: number) => boolean;
}

const AnimeContext = createContext<AnimeContextType | undefined>(undefined);

export const AnimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { showToast, triggerCelebration } = useUIActions();

  const [watchingList, setWatchingList] = useState<NormalizedAnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMediaIds, setPendingMediaIds] = useState<Set<number>>(new Set());
  const [userScoreOverrides, setUserScoreOverrides] = useState<Record<number, number | null>>({});
  const [userStatusOverrides, setUserStatusOverrides] = useState<Record<number, MediaListStatus | null>>({});

  // Synchronous ref to freeze pending checks inside useCallback with 0 dependencies
  const pendingMediaIdsRef = useRef<Set<number>>(new Set());
  // Tracks whether watchingList changed due to local optimistic mutation and should be persisted
  const shouldPersistWatchingRef = useRef<boolean>(false);

  // O(1) lookup index by mediaId to avoid O(n) linear scans during SearchView / ProfileView renders
  const watchingMap = useMemo(() => {
    const map = new Map<number, NormalizedAnimeItem>();
    for (const item of watchingList) {
      map.set(item.mediaId, item);
    }
    return map;
  }, [watchingList]);

  useEffect(() => {
    if (!shouldPersistWatchingRef.current) return;
    shouldPersistWatchingRef.current = false;
    storageService.setCachedWatchingList(watchingList).catch(() => {});
  }, [watchingList]);

  const getUserScore = useCallback(
    (mediaId: number, fallbackScore?: number | null): number | null => {
      if (Object.prototype.hasOwnProperty.call(userScoreOverrides, mediaId)) {
        const override = userScoreOverrides[mediaId];
        return override !== null && override !== undefined && override > 0 ? override : null;
      }
      return fallbackScore !== null && fallbackScore !== undefined && fallbackScore > 0
        ? fallbackScore
        : null;
    },
    [userScoreOverrides]
  );

  const getUserStatus = useCallback(
    (mediaId: number, fallbackStatus?: MediaListStatus | null): MediaListStatus | null => {
      if (Object.prototype.hasOwnProperty.call(userStatusOverrides, mediaId)) {
        return userStatusOverrides[mediaId];
      }
      // O(1) lookup in active watching list
      const watchingItem = watchingMap.get(mediaId);
      if (watchingItem) {
        return watchingItem.userStatus || watchingItem.status || 'CURRENT';
      }
      return fallbackStatus ?? null;
    },
    [userStatusOverrides, watchingMap]
  );

  const userId = user?.id;
  const inFlightWatchingListRef = useRef<boolean>(false);

  const loadWatchingList = useCallback(async (isRefresh = false) => {
    if (!isAuthenticated || !userId) {
      setWatchingList([]);
      setUserScoreOverrides({});
      setUserStatusOverrides({});
      return;
    }

    if (inFlightWatchingListRef.current) {
      return;
    }

    // 1. SWR Pattern: Load from persistent disk storage immediately (0ms delay, no skeleton!)
    let hasCachedData = false;
    let isFreshCache = false;
    if (!isRefresh) {
      try {
        const { list: cached, cachedAt } = await storageService.getCachedWatchingListWithMeta();
        if (cached && cached.length > 0) {
          hasCachedData = true;
          isFreshCache = Date.now() - cachedAt < 45000;
          setWatchingList(
            cached.map((item) =>
              item.userScore !== null && item.userScore !== undefined && item.userScore <= 0
                ? { ...item, userScore: null }
                : item
            )
          );
          setIsLoading(false);
        }
      } catch {
        // ignore storage read issues
      }
    }

    // Skip background GraphQL revalidation if cached watching list was fetched within the last 45s
    if (!isRefresh && isFreshCache) {
      return;
    }

    if (!hasCachedData) {
      setIsLoading(true);
    }

    try {
      inFlightWatchingListRef.current = true;
      setError(null);
      // 2. Revalidate in background with AniList API
      const list = await anilistService.getUserWatchingList(userId);
      setWatchingList(list);
    } catch (err: unknown) {
      if (!hasCachedData) {
        setError(err instanceof Error ? err.message : 'Could not fetch your watching list.');
      }
    } finally {
      setIsLoading(false);
      inFlightWatchingListRef.current = false;
    }
  }, [isAuthenticated, userId]);

  const refreshWatchingList = useCallback(async () => {
    await loadWatchingList(true);
  }, [loadWatchingList]);

  useEffect(() => {
    loadWatchingList(false);
  }, [loadWatchingList]);

  const isMediaInWatchingList = useCallback(
    (mediaId: number) => {
      return watchingMap.has(mediaId);
    },
    [watchingMap]
  );

  // Optimistic increment progress with rollback on error - frozen reference via pendingMediaIdsRef
  const incrementProgress = useCallback(async (item: NormalizedAnimeItem) => {
    const mediaId = item.mediaId;

    // Concurrency protection: prevent duplicate spam clicks while mutation is in-flight
    if (pendingMediaIdsRef.current.has(mediaId)) {
      return;
    }

    const totalUnits =
      item.type === 'MANGA' || item.format === 'MANGA' || item.format === 'NOVEL' || item.format === 'ONE_SHOT'
        ? (item.chapters ?? item.episodes ?? null)
        : (item.episodes ?? item.chapters ?? null);

    // Check if already completed
    if (typeof totalUnits === 'number' && totalUnits > 0 && item.progress >= totalUnits) {
      return;
    }

    const previousProgress = item.progress;
    const newProgress = previousProgress + 1;
    const isCompleted = typeof totalUnits === 'number' && totalUnits > 0 && newProgress >= totalUnits;
    const nextStatus: MediaListStatus = isCompleted ? 'COMPLETED' : 'CURRENT';

    if (isCompleted) {
      setUserStatusOverrides((prev) => ({ ...prev, [mediaId]: 'COMPLETED' }));
    }

    // 1. Pure optimistic UI update; effect persists watchingList once outside updater
    shouldPersistWatchingRef.current = true;
    setWatchingList((prevList) =>
      isCompleted
        ? prevList.filter((entry) => entry.mediaId !== mediaId)
        : prevList.map((entry) => {
            if (entry.mediaId === mediaId) {
              return {
                ...entry,
                progress: newProgress,
                status: nextStatus,
                userStatus: nextStatus
              };
            }
            return entry;
          })
    );

    // Mark as pending (both in ref for 0-dep callback and in state for UI indicator)
    pendingMediaIdsRef.current.add(mediaId);
    setPendingMediaIds((prev) => new Set(prev).add(mediaId));

    try {
      // 2. Perform AniList mutation
      await anilistService.updateMediaProgress(mediaId, newProgress, totalUnits);
      if (isCompleted) {
        triggerCelebration(item.title);
      }
    } catch (err: unknown) {
      // 3. Rollback on failure
      if (isCompleted) {
        setUserStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });
      }

      shouldPersistWatchingRef.current = true;
      setWatchingList((prevList) => {
        if (isCompleted) {
          const exists = prevList.some((entry) => entry.mediaId === mediaId);
          if (!exists) {
            return [
              {
                ...item,
                progress: previousProgress,
                status: item.status,
                userStatus: item.userStatus ?? item.status
              },
              ...prevList
            ];
          }
          return prevList.map((entry) =>
            entry.mediaId === mediaId
              ? {
                  ...entry,
                  progress: previousProgress,
                  status: item.status,
                  userStatus: item.userStatus ?? item.status
                }
              : entry
          );
        }
        return prevList.map((entry) => {
          if (entry.mediaId === mediaId) {
            return {
              ...entry,
              progress: previousProgress,
              status: item.status,
              userStatus: item.userStatus ?? item.status
            };
          }
          return entry;
        });
      });

      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to update episode progress on AniList.';
      showToast(errorMsg, 'error');
    } finally {
      // Unmark pending in both ref and state
      pendingMediaIdsRef.current.delete(mediaId);
      setPendingMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    }
  }, [showToast, triggerCelebration]);

  const addAnimeWithStatus = useCallback(async (
    anime: NormalizedAnimeItem,
    status: MediaListStatus
  ): Promise<boolean> => {
    try {
      const res = await anilistService.addAnimeToList(anime.mediaId, status);

      // Record status override so search and profile views immediately reflect it
      setUserStatusOverrides((prev) => ({ ...prev, [anime.mediaId]: res.status }));

      if (status === 'CURRENT') {
        const preservedProgress = res.progress ?? anime.progress ?? 0;
        const newItem: NormalizedAnimeItem = {
          ...anime,
          status: 'CURRENT',
          userStatus: 'CURRENT',
          progress: preservedProgress
        };

        shouldPersistWatchingRef.current = true;
        setWatchingList((prev) => {
          const exists = prev.some((item) => item.mediaId === anime.mediaId);
          if (exists) {
            return prev.map((item) =>
              item.mediaId === anime.mediaId
                ? { ...item, status: 'CURRENT', userStatus: 'CURRENT', progress: preservedProgress }
                : item
            );
          }
          return [newItem, ...prev];
        });

        const isManga =
          anime.type === 'MANGA' ||
          anime.format === 'MANGA' ||
          anime.format === 'NOVEL' ||
          anime.format === 'ONE_SHOT';

        showToast(`Added "${anime.title}" to ${isManga ? 'Reading' : 'Watching'} list!`, 'success');
      } else {
        // If moved to Planning, Completed, Paused, etc., remove from watching list if it was there
        shouldPersistWatchingRef.current = true;
        setWatchingList((prev) => prev.filter((item) => item.mediaId !== anime.mediaId));

        const isManga =
          anime.type === 'MANGA' ||
          anime.format === 'MANGA' ||
          anime.format === 'NOVEL' ||
          anime.format === 'ONE_SHOT';

        const label =
          status === 'PLANNING'
            ? (isManga ? 'Plan to Read' : 'Planning to Watch')
            : status === 'COMPLETED'
            ? 'Completed'
            : status === 'PAUSED'
            ? 'Paused'
            : 'Dropped';
        showToast(`Added "${anime.title}" to ${label}!`, 'success');
      }

      return true;
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to update list status on AniList.',
        'error'
      );
      return false;
    }
  }, [showToast]);

  const addAnimeToWatching = useCallback(async (anime: NormalizedAnimeItem): Promise<boolean> => {
    return addAnimeWithStatus(anime, 'CURRENT');
  }, [addAnimeWithStatus]);

  const updateAnimeScore = useCallback(async (
    mediaId: number,
    newScore: number | null
  ): Promise<boolean> => {
    try {
      const res = await anilistService.updateMediaScore(mediaId, newScore ?? 0);

      // Optimistically update watchingList if this anime is in it
      setWatchingList((prev) =>
        prev.map((item) =>
          item.mediaId === mediaId ? { ...item, userScore: res.score } : item
        )
      );

      // Record score override so all views instantly reflect the new score
      setUserScoreOverrides((prev) => ({ ...prev, [mediaId]: res.score }));

      if (res.score !== null && res.score > 0) {
        showToast(`Score updated to ${res.score.toFixed(1)} ★`, 'success');
      } else {
        showToast('Score removed.', 'info');
      }

      return true;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to update score on AniList.';
      showToast(errorMsg, 'error');
      return false;
    }
  }, [showToast]);

  const value = useMemo(
    () => ({
      watchingList,
      isLoading,
      error,
      pendingMediaIds,
      updateAnimeScore,
      getUserScore,
      getUserStatus,
      refreshWatchingList,
      incrementProgress,
      addAnimeToWatching,
      addAnimeWithStatus,
      isMediaInWatchingList
    }),
    [
      watchingList,
      isLoading,
      error,
      pendingMediaIds,
      updateAnimeScore,
      getUserScore,
      getUserStatus,
      refreshWatchingList,
      incrementProgress,
      addAnimeToWatching,
      addAnimeWithStatus,
      isMediaInWatchingList
    ]
  );

  return (
    <AnimeContext.Provider value={value}>
      {children}
    </AnimeContext.Provider>
  );
};

export const useAnime = (): AnimeContextType => {
  const context = useContext(AnimeContext);
  if (!context) {
    throw new Error('useAnime must be used within an AnimeProvider');
  }
  return context;
};
