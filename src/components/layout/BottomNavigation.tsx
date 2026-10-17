import React from 'react';
import { ActiveTab } from '../../types';
import { Home, Search, User } from 'lucide-react';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange
}) => {
  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home size={16} strokeWidth={2} />
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search size={16} strokeWidth={2} />
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={16} strokeWidth={2} />
    }
  ];

  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  return (
    <nav
      role="navigation"
      aria-label="Main Navigation"
      style={{
        position: 'relative',
        width: '276px',
        height: '46px',
        borderRadius: '9999px',
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow:
          '0 8px 24px -2px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px',
        boxSizing: 'border-box'
      }}
    >
      {/* Sliding Active Pill Indicator */}
      <div
        style={{
          position: 'absolute',
          top: '3px',
          bottom: '3px',
          left: '3px',
          width: 'calc((100% - 6px) / 3)',
          borderRadius: '9999px',
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-card))',
          border: '1px solid color-mix(in srgb, var(--color-border) 90%, transparent)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
          transform: `translateX(${activeIndex >= 0 ? activeIndex * 100 : 0}%)`,
          transition: 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.0)',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-selected={isActive}
            role="tab"
            aria-label={tab.label}
            style={{
              position: 'relative',
              zIndex: 2,
              flex: 1,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              border: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-secondary)',
              transition: 'color 0.22s ease',
              outline: 'none',
              cursor: 'pointer',
              padding: '0 4px'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-secondary)';
              }
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? 'var(--color-primary)' : 'currentColor',
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition: 'color 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)'
              }}
            >
              {tab.icon}
            </div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                letterSpacing: '0.01em',
                lineHeight: 1
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
