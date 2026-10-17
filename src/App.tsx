import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useAnime } from './context/AnimeContext';
import { useUI } from './context/UIContext';
import { ActiveTab } from './types';
import { LoginView } from './components/auth/LoginView';
import { HomeView } from './components/home/HomeView';
import { SearchView } from './components/search/SearchView';
import { ProfileView } from './components/profile/ProfileView';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { ToastContainer } from './components/common/Toast';
import { Skeleton } from './components/common/Skeleton';
import { ScoreModal } from './components/common/ScoreModal';
import { AddToListModal } from './components/common/AddToListModal';
import { AnimeDetailModal } from './components/common/AnimeDetailModal';
import { CelebrationOverlay } from './components/common/CelebrationOverlay';

const TAB_INDEX_MAP: Record<ActiveTab, number> = {
  home: 0,
  search: 1,
  profile: 2
};

export const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    toasts,
    dismissToast,
    scoreModalAnime,
    closeScoreModal,
    statusModalAnime,
    statusModalInitialStatus,
    closeStatusModal,
    detailAnime,
    closeDetailModal,
    discoverGenreRequest,
    isCelebrating,
    celebratingTitle,
    stopCelebration
  } = useUI();
  const { updateAnimeScore, addAnimeWithStatus, getUserStatus } = useAnime();
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set<ActiveTab>(['home']));
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [profileResetTrigger, setProfileResetTrigger] = useState(0);

  useEffect(() => {
    const scrollTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

    const handleScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      target.classList.add('is-scrolling');

      const existingTimer = scrollTimers.get(target);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        target.classList.remove('is-scrolling');
        scrollTimers.delete(target);
      }, 750);

      scrollTimers.set(target, timer);
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  const handleTabChange = useCallback((newTab: ActiveTab) => {
    if (newTab === 'profile') {
      setProfileResetTrigger((prev) => prev + 1);
    }
    setActiveTab((prevTab) => {
      if (newTab === prevTab) return prevTab;
      const currentIdx = TAB_INDEX_MAP[prevTab];
      const nextIdx = TAB_INDEX_MAP[newTab];
      setTransitionDirection(nextIdx >= currentIdx ? 'forward' : 'backward');
      return newTab;
    });
    setVisitedTabs((prev) => (prev.has(newTab) ? prev : new Set(prev).add(newTab)));
  }, []);

  useEffect(() => {
    if (discoverGenreRequest) {
      handleTabChange('search');
    }
  }, [discoverGenreRequest, handleTabChange]);

  if (authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '24px 20px',
          gap: '16px',
          justifyContent: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Skeleton width="48px" height="48px" borderRadius="12px" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton width="60%" height="18px" />
            <Skeleton width="40%" height="12px" />
          </div>
        </div>
        <Skeleton width="100%" height="80px" borderRadius="14px" />
        <Skeleton width="100%" height="80px" borderRadius="14px" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <LoginView />
      </>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <CelebrationOverlay
        isActive={isCelebrating}
        animeTitle={celebratingTitle}
        onComplete={stopCelebration}
      />

      <ScoreModal
        anime={scoreModalAnime}
        isOpen={!!scoreModalAnime}
        onClose={closeScoreModal}
        onSave={updateAnimeScore}
      />

      <AddToListModal
        anime={statusModalAnime}
        isOpen={!!statusModalAnime}
        currentStatus={
          statusModalAnime
            ? getUserStatus(
                statusModalAnime.mediaId,
                statusModalInitialStatus ||
                  statusModalAnime.userStatus ||
                  (statusModalAnime.status === 'CURRENT' ? 'CURRENT' : null)
              )
            : null
        }
        onClose={closeStatusModal}
        onSelectStatus={addAnimeWithStatus}
      />

      <AnimeDetailModal
        anime={detailAnime}
        isOpen={!!detailAnime}
        onClose={closeDetailModal}
      />

      {/* Main Tab View with Slide & Fade Transition */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        {visitedTabs.has('home') && (
          <div
            className={
              activeTab === 'home'
                ? transitionDirection === 'forward'
                  ? 'tab-pane-transition-forward'
                  : 'tab-pane-transition-backward'
                : undefined
            }
            style={{
              display: activeTab === 'home' ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
              minHeight: 0
            }}
          >
            <HomeView onNavigateTab={handleTabChange} />
          </div>
        )}

        {visitedTabs.has('search') && (
          <div
            className={
              activeTab === 'search'
                ? transitionDirection === 'forward'
                  ? 'tab-pane-transition-forward'
                  : 'tab-pane-transition-backward'
                : undefined
            }
            style={{
              display: activeTab === 'search' ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
              minHeight: 0
            }}
          >
            <SearchView />
          </div>
        )}

        {visitedTabs.has('profile') && (
          <div
            className={
              activeTab === 'profile'
                ? transitionDirection === 'forward'
                  ? 'tab-pane-transition-forward'
                  : 'tab-pane-transition-backward'
                : undefined
            }
            style={{
              display: activeTab === 'profile' ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
              minHeight: 0
            }}
          >
            <ProfileView resetTrigger={profileResetTrigger} />
          </div>
        )}
      </main>

      {/* Bottom Gradient Fade Layer (Hardware-optimized, zero backdrop-filter) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '76px',
          pointerEvents: 'none',
          zIndex: 90,
          background:
            'linear-gradient(to top, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 85%, transparent) 40%, transparent 100%)'
        }}
      />

      {/* Floating Pill Bottom Navigation Dock */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 100
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      </div>
    </div>

  );
};
