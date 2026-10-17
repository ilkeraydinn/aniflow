import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { NormalizedAnimeItem, ToastMessage, MediaListStatus } from '../types';

export interface DiscoverGenreRequest {
  genre: string;
  timestamp: number;
}

export interface UIStateContextType {
  toasts: ToastMessage[];
  scoreModalAnime: NormalizedAnimeItem | null;
  statusModalAnime: NormalizedAnimeItem | null;
  statusModalInitialStatus: MediaListStatus | null;
  detailAnime: NormalizedAnimeItem | null;
  detailHistory: NormalizedAnimeItem[];
  discoverGenreRequest: DiscoverGenreRequest | null;
  isCelebrating: boolean;
  celebratingTitle: string | null;
}

export interface UIActionsContextType {
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: string) => void;
  openScoreModal: (anime: NormalizedAnimeItem) => void;
  closeScoreModal: () => void;
  openStatusModal: (anime: NormalizedAnimeItem, initialStatus?: MediaListStatus | null) => void;
  closeStatusModal: () => void;
  openDetailModal: (anime: NormalizedAnimeItem) => void;
  goBackDetailModal: () => void;
  closeDetailModal: () => void;
  navigateToGenre: (genre: string) => void;
  triggerCelebration: (title?: string) => void;
  stopCelebration: () => void;
}

export type UIContextType = UIStateContextType & UIActionsContextType;

const UIStateContext = createContext<UIStateContextType | undefined>(undefined);
const UIActionsContext = createContext<UIActionsContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [scoreModalAnime, setScoreModalAnime] = useState<NormalizedAnimeItem | null>(null);
  const [statusModalAnime, setStatusModalAnime] = useState<NormalizedAnimeItem | null>(null);
  const [statusModalInitialStatus, setStatusModalInitialStatus] = useState<MediaListStatus | null>(null);
  const [detailAnime, setDetailAnime] = useState<NormalizedAnimeItem | null>(null);
  const [detailHistory, setDetailHistory] = useState<NormalizedAnimeItem[]>([]);
  const [discoverGenreRequest, setDiscoverGenreRequest] = useState<DiscoverGenreRequest | null>(null);
  const [isCelebrating, setIsCelebrating] = useState<boolean>(false);
  const [celebratingTitle, setCelebratingTitle] = useState<string | null>(null);

  const toastTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup all pending toast timers on unmount
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Toast actions with active timer management
  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);

    const timer = setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
      toastTimersRef.current.delete(id);
    }, 3800);

    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  // Score modal actions
  const openScoreModal = useCallback((anime: NormalizedAnimeItem) => {
    setScoreModalAnime(anime);
  }, []);

  const closeScoreModal = useCallback(() => {
    setScoreModalAnime(null);
  }, []);

  // Status modal actions
  const openStatusModal = useCallback((anime: NormalizedAnimeItem, initialStatus?: MediaListStatus | null) => {
    setStatusModalAnime(anime);
    setStatusModalInitialStatus(initialStatus ?? null);
  }, []);

  const closeStatusModal = useCallback(() => {
    setStatusModalAnime(null);
    setStatusModalInitialStatus(null);
  }, []);

  // Detail modal actions with navigation stack
  const openDetailModal = useCallback((anime: NormalizedAnimeItem) => {
    setDetailAnime((current) => {
      if (current && current.mediaId !== anime.mediaId) {
        setDetailHistory((prev) => [...prev, current]);
      }
      return anime;
    });
  }, []);

  const goBackDetailModal = useCallback(() => {
    setDetailHistory((prev) => {
      if (prev.length === 0) {
        setDetailAnime(null);
        return prev;
      }
      const nextHistory = prev.slice(0, -1);
      const previousAnime = prev[prev.length - 1];
      setDetailAnime(previousAnime);
      return nextHistory;
    });
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetailHistory([]);
    setDetailAnime(null);
  }, []);

  const navigateToGenre = useCallback((genre: string) => {
    setDetailHistory([]);
    setDetailAnime(null);
    setDiscoverGenreRequest({ genre, timestamp: Date.now() });
  }, []);

  // Celebration actions
  const triggerCelebration = useCallback((title?: string) => {
    setCelebratingTitle(title || null);
    setIsCelebrating(true);
  }, []);

  const stopCelebration = useCallback(() => {
    setIsCelebrating(false);
    setCelebratingTitle(null);
  }, []);

  const stateValue = useMemo<UIStateContextType>(
    () => ({
      toasts,
      scoreModalAnime,
      statusModalAnime,
      statusModalInitialStatus,
      detailAnime,
      detailHistory,
      discoverGenreRequest,
      isCelebrating,
      celebratingTitle
    }),
    [
      toasts,
      scoreModalAnime,
      statusModalAnime,
      statusModalInitialStatus,
      detailAnime,
      detailHistory,
      discoverGenreRequest,
      isCelebrating,
      celebratingTitle
    ]
  );

  const actionsValue = useMemo<UIActionsContextType>(
    () => ({
      showToast,
      dismissToast,
      openScoreModal,
      closeScoreModal,
      openStatusModal,
      closeStatusModal,
      openDetailModal,
      goBackDetailModal,
      closeDetailModal,
      navigateToGenre,
      triggerCelebration,
      stopCelebration
    }),
    [
      showToast,
      dismissToast,
      openScoreModal,
      closeScoreModal,
      openStatusModal,
      closeStatusModal,
      openDetailModal,
      goBackDetailModal,
      closeDetailModal,
      navigateToGenre,
      triggerCelebration,
      stopCelebration
    ]
  );

  return (
    <UIActionsContext.Provider value={actionsValue}>
      <UIStateContext.Provider value={stateValue}>
        {children}
      </UIStateContext.Provider>
    </UIActionsContext.Provider>
  );
};

export const useUIState = (): UIStateContextType => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within a UIProvider');
  }
  return context;
};

export const useUIActions = (): UIActionsContextType => {
  const context = useContext(UIActionsContext);
  if (!context) {
    throw new Error('useUIActions must be used within a UIProvider');
  }
  return context;
};

export const useUI = (): UIContextType => {
  const state = useUIState();
  const actions = useUIActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};
