import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { ThemeMode } from '../types';
import { storageService } from '../services/storage';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemDark(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark);
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const syncTheme = storageService.getThemeSync();
    if (typeof document !== 'undefined') {
      const initialResolved =
        syncTheme === 'system' ? (getSystemDark() ? 'dark' : 'light') : syncTheme;
      document.documentElement.setAttribute('data-theme', initialResolved);
    }
    return syncTheme;
  });

  useEffect(() => {
    storageService.getTheme().then((saved) => {
      if (saved) {
        setThemeState((prev) => (prev === saved ? prev : saved));
      }
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    await storageService.setTheme(newTheme);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
