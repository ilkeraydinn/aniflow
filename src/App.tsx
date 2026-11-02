import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import { useAnime } from './context/AnimeContext';
import { useUIState, useUIActions } from './context/UIContext';
import { ActiveTab } from './types';
import { HomeView } from './components/home/HomeView';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { ToastContainer } from './components/common/Toast';
import { Skeleton } from './components/common/Skeleton';
import { CelebrationOverlay } from './components/common/CelebrationOverlay';

const LoginView = React.lazy(() =>
  import('./components/auth/LoginView').then((m) => ({ default: m.LoginView }))
);
const SearchView = React.lazy(() =>
  import('./components/search/SearchView').then((m) => ({ default: m.SearchView }))
);
const ProfileView = React.lazy(() =>
  import('./components/profile/ProfileView').then((m) => ({ default: m.ProfileView }))
);
const ScoreModal = React.lazy(() =>
  import('./components/common/ScoreModal').then((m) => ({ default: m.ScoreModal }))
);
const AddToListModal = React.lazy(() =>
  import('./components/common/AddToListModal').then((m) => ({ default: m.AddToListModal }))
);
const AnimeDetailModal = React.lazy(() =>
  import('./components/common/AnimeDetailModal').then((m) => ({ default: m.AnimeDetailModal }))
);

const TAB_INDEX_MAP: Record<ActiveTab, number> = {
  home: 0,
  search: 1,
  profile: 2
};

// Isolated toast host for unauthenticated view so UI state changes do not re-render AppContent
const ToastHost: React.FC = React.memo(() => {
  const { toasts } = useUIState();
  const { dismissToast } = useUIActions();
  return <ToastContainer toasts={toasts} onDismiss={dismissToast} />;
});

// Isolated modal & overlay host so UI state changes (toasts, modals, celebrations) never re-render AppContent or tab views
const GlobalUIOverlays: React.FC<{ onNavigateTab: (tab: ActiveTab) => void }> = React.memo(
  ({ onNavigateTab }) => {
    const {
      toasts,
      scoreModalAnime,
      statusModalAnime,
      statusModalInitialStatus,
      detailAnime,
      detailHistory,
      discoverGenreRequest,
      isCelebrating,
      celebratingTitle
    } = useUIState();
    const {
      dismissToast,
      closeScoreModal,
      closeStatusModal,
      closeDetailModal,
      stopCelebration
    } = useUIActions();
    const { updateAnimeScore, addAnimeWithStatus, getUserStatus } = useAnime();

    useEffect(() => {
      if (discoverGenreRequest) {
        onNavigateTab('search');
      }
    }, [discoverGenreRequest, onNavigateTab]);

    const previousDetailTitle =
      detailHistory.length > 0 ? detailHistory[detailHistory.length - 1].title : null;

    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <CelebrationOverlay
          isActive={isCelebrating}
          animeTitle={celebratingTitle}
          onComplete={stopCelebration}
        />

        {scoreModalAnime ? (
          <Suspense fallback={null}>
            <ScoreModal
              anime={scoreModalAnime}
              isOpen={true}
              onClose={closeScoreModal}
              onSave={updateAnimeScore}
            />
          </Suspense>
        ) : null}

        {statusModalAnime ? (
          <Suspense fallback={null}>
            <AddToListModal
              anime={statusModalAnime}
              isOpen={true}
              currentStatus={getUserStatus(
                statusModalAnime.mediaId,
                statusModalInitialStatus ||
                  statusModalAnime.userStatus ||
                  (statusModalAnime.status === 'CURRENT' ? 'CURRENT' : null)
              )}
              onClose={closeStatusModal}
              onSelectStatus={addAnimeWithStatus}
            />
          </Suspense>
        ) : null}

        {detailAnime ? (
          <Suspense fallback={null}>
            <AnimeDetailModal
              anime={detailAnime}
              isOpen={true}
              onClose={closeDetailModal}
              previousTitle={previousDetailTitle}
            />
          </Suspense>
        ) : null}
      </>
    );
  }
);

export const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set<ActiveTab>(['home']));
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [profileResetTrigger, setProfileResetTrigger] = useState(0);

  useEffect(() => {
    const scrollTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

    const handleScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const existingTimer = scrollTimers.get(target);
      if (existingTimer) {
        clearTimeout(existingTimer);
      } else {
        target.classList.add('is-scrolling');
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
        <ToastHost />
        <Suspense fallback={null}>
          <LoginView />
        </Suspense>
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
      <GlobalUIOverlays onNavigateTab={handleTabChange} />

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
            <Suspense fallback={null}>
              <SearchView isActive={activeTab === 'search'} />
            </Suspense>
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
            <Suspense fallback={null}>
              <ProfileView resetTrigger={profileResetTrigger} />
            </Suspense>
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
