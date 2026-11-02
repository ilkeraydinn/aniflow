import React, { useState, useEffect } from 'react';
import { useAnime } from '../../context/AnimeContext';
import { useUIActions } from '../../context/UIContext';
import { Header } from '../layout/Header';
import { AnimeCard } from './AnimeCard';
import { AnimeGridCard } from './AnimeGridCard';
import { AnimeCardSkeleton, AnimeGridCardSkeleton } from '../common/Skeleton';
import { Button } from '../common/Button';
import { ActiveTab } from '../../types';
import { Search, AlertCircle } from 'lucide-react';
import { storageService } from '../../services/storage';

interface HomeViewProps {
  onNavigateTab: (tab: ActiveTab) => void;
}

const HomeViewComponent: React.FC<HomeViewProps> = ({ onNavigateTab }) => {
  const { watchingList, isLoading, error, pendingMediaIds, incrementProgress, refreshWatchingList } =
    useAnime();
  const { openDetailModal, openScoreModal } = useUIActions();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => storageService.getViewModeSync());

  useEffect(() => {
    storageService.getViewMode().then((saved) => {
      if (saved) {
        setViewMode((prev) => (prev !== saved ? saved : prev));
      }
    });
  }, []);

  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    storageService.setViewMode(mode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Header
        title="Currently Watching"
        count={watchingList.length}
        showRefresh={true}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 16px 72px 16px',
          display: viewMode === 'grid' ? 'grid' : 'flex',
          gridTemplateColumns: viewMode === 'grid' ? 'repeat(2, 1fr)' : undefined,
          gridAutoRows: viewMode === 'grid' ? '260px' : undefined,
          flexDirection: viewMode === 'list' ? 'column' : undefined,
          gap: '12px',
          alignContent: 'start'
        }}
      >

        {/* Loading Skeletons */}
        {isLoading && watchingList.length === 0 ? (
          viewMode === 'grid' ? (
            <>
              <AnimeGridCardSkeleton />
              <AnimeGridCardSkeleton />
              <AnimeGridCardSkeleton />
              <AnimeGridCardSkeleton />
            </>
          ) : (
            <>
              <AnimeCardSkeleton />
              <AnimeCardSkeleton />
              <AnimeCardSkeleton />
              <AnimeCardSkeleton />
            </>
          )
        ) : error && watchingList.length === 0 ? (
          /* Error State */
          <div
            style={{
              gridColumn: viewMode === 'grid' ? '1 / -1' : undefined,
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'var(--color-card)',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              margin: 'auto 0'
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertCircle size={20} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)' }}>
                Unable to load watching list
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--color-secondary)',
                  marginTop: '4px',
                  lineHeight: 1.4
                }}
              >
                {error}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refreshWatchingList()}>
              Try Again
            </Button>
          </div>
        ) : watchingList.length === 0 ? (
          /* Empty State */
          <div
            style={{
              gridColumn: viewMode === 'grid' ? '1 / -1' : undefined,
              padding: '36px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'var(--color-card)',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              margin: 'auto 0'
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                backgroundColor: 'var(--color-badge-bg)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Search size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)', margin: 0 }}>
                No active anime in list
              </h3>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--color-secondary)',
                  marginTop: '6px',
                  lineHeight: 1.4
                }}
              >
                You are not currently watching any titles on AniList. Search and add your favorite series.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigateTab('search')}
              style={{ marginTop: '4px' }}
            >
              Search Anime
            </Button>
          </div>
        ) : (
          /* Anime Card List / Poster Grid */
          watchingList.map((item) =>
            viewMode === 'grid' ? (
              <AnimeGridCard
                key={item.mediaId}
                item={item}
                onIncrement={incrementProgress}
                onOpenDetail={openDetailModal}
                onOpenScore={openScoreModal}
                isPending={pendingMediaIds.has(item.mediaId)}
              />
            ) : (
              <AnimeCard
                key={item.mediaId}
                item={item}
                onIncrement={incrementProgress}
                onOpenDetail={openDetailModal}
                onOpenScore={openScoreModal}
                isPending={pendingMediaIds.has(item.mediaId)}
              />
            )
          )
        )}
      </div>
    </div>
  );
};

export const HomeView = React.memo(HomeViewComponent);
