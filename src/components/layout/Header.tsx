import React from 'react';
import { RefreshCw, List, LayoutGrid } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAnime } from '../../context/AnimeContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  showRefresh?: boolean;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  count,
  showRefresh = false,
  viewMode,
  onViewModeChange
}) => {
  const { user } = useAuth();
  const { refreshWatchingList, isLoading } = useAnime();

  return (
    <header
      style={{
        padding: '16px 16px 12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        zIndex: 10
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <h1
            style={{
              fontSize: '16px',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--color-primary)',
              margin: 0,
              lineHeight: 1.2
            }}
          >
            {title}
          </h1>
          {count !== undefined ? (
            <span
              className="font-mono"
              style={{
                fontSize: '12px',
                color: 'var(--color-secondary)',
                fontWeight: 500
              }}
            >
              ({count})
            </span>
          ) : null}
        </div>

        {subtitle || user ? (
          <span
            className="truncate"
            style={{
              fontSize: '12px',
              color: 'var(--color-secondary)',
              lineHeight: 1.2
            }}
          >
            {subtitle ?? `@${user?.name}`}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {viewMode && onViewModeChange ? (
          <div
            role="group"
            aria-label="View layout switcher"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '2px',
              gap: '2px',
              boxSizing: 'border-box'
            }}
          >
            {/* Smooth Sliding Active Pill Indicator */}
            <div
              style={{
                position: 'absolute',
                top: '2px',
                bottom: '2px',
                left: '2px',
                width: '28px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-card)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.14), 0 1px 1px rgba(0, 0, 0, 0.08)',
                border: '1px solid var(--color-border)',
                transform: `translateX(${viewMode === 'grid' ? '30px' : '0px'})`,
                transition: 'transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.0)',
                pointerEvents: 'none',
                zIndex: 1
              }}
            />

            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-label="List view"
              title="List view (Compact)"
              style={{
                position: 'relative',
                zIndex: 2,
                width: '28px',
                height: '26px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'color 0.2s ease, transform 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'list') e.currentTarget.style.color = 'var(--color-secondary)';
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'list') e.currentTarget.style.color = 'var(--color-tertiary)';
              }}
            >
              <List size={14} strokeWidth={viewMode === 'list' ? 2.4 : 1.8} />
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-label="Grid view"
              title="Grid view (Poster)"
              style={{
                position: 'relative',
                zIndex: 2,
                width: '28px',
                height: '26px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--color-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'color 0.2s ease, transform 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'grid') e.currentTarget.style.color = 'var(--color-secondary)';
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'grid') e.currentTarget.style.color = 'var(--color-tertiary)';
              }}
            >
              <LayoutGrid size={14} strokeWidth={viewMode === 'grid' ? 2.4 : 1.8} />
            </button>
          </div>
        ) : null}

        {showRefresh ? (
          <button
            onClick={() => refreshWatchingList()}
            disabled={isLoading}
            aria-label="Refresh watching list"
            title="Refresh watching list"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              color: 'var(--color-secondary)',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-border)',
              transition: 'color 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw
              size={14}
              className={isLoading ? 'animate-spin' : ''}
              style={{
                animation: isLoading ? 'spin 0.8s linear infinite' : 'none'
              }}
            />
          </button>
        ) : null}
      </div>
    </header>
  );
};
