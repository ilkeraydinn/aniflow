import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { UserProfile } from '../types';
import { authService } from '../services/auth';
import { anilistService } from '../services/anilistClient';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithOAuth: (clientId?: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isEqualProfile(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.bannerImage === b.bannerImage &&
    a.profileColor === b.profileColor &&
    a.avatar?.large === b.avatar?.large &&
    a.stats?.watching === b.stats?.watching &&
    a.stats?.completed === b.stats?.completed &&
    a.stats?.planning === b.stats?.planning &&
    a.stats?.paused === b.stats?.paused &&
    a.stats?.dropped === b.stats?.dropped &&
    a.stats?.episodesWatched === b.stats?.episodesWatched
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const session = await authService.checkCurrentSession();
      if (session.isAuthenticated && session.user) {
        setUser((prev) => (isEqualProfile(prev, session.user) ? prev : session.user));
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err: unknown) {
      setUser(null);
      setIsAuthenticated(false);
      setError(err instanceof Error ? err.message : 'Failed to verify session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local' && changes.anilist_user_profile) {
          if (changes.anilist_user_profile.newValue) {
            const nextProfile = changes.anilist_user_profile.newValue as UserProfile;
            setUser((currentUser) => {
              if (isEqualProfile(currentUser, nextProfile)) {
                return currentUser; // Preserve reference, skip re-render cascade
              }
              return nextProfile;
            });
            setIsAuthenticated(true);
            setError(null);
          } else {
            setUser(null);
            setIsAuthenticated(false);
            anilistService.clearAllCaches();
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [checkAuth]);


  const loginWithOAuth = useCallback(async (clientId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      anilistService.clearAllCaches();
      const profile = await authService.loginWithWebAuthFlow(clientId);
      setUser(profile);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth login failed.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await authService.loginWithToken(token);
      setUser(profile);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid token.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginAsDemo = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await authService.loginAsDemo();
      setUser(profile);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start demo.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const profile = await anilistService.getViewerProfile(undefined, true);
      setUser((prev) => (isEqualProfile(prev, profile) ? prev : profile));
    } catch {
      // silent refresh error
    }
  }, [isAuthenticated]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      error,
      loginWithOAuth,
      loginWithToken,
      loginAsDemo,
      logout,
      refreshProfile,
      clearError
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      error,
      loginWithOAuth,
      loginWithToken,
      loginAsDemo,
      logout,
      refreshProfile,
      clearError
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
