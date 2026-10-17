import { storageService } from './storage';
import { anilistService } from './anilistClient';
import { UserProfile } from '../types';

// Default AniList OAuth Client ID (or users can provide their own/personal token)
export const DEFAULT_CLIENT_ID = '52186';

export const authService = {
  getAuthUrl(clientId = DEFAULT_CLIENT_ID, state?: string): string {
    const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
    return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token${stateParam}`;
  },

  async loginWithWebAuthFlow(clientId = DEFAULT_CLIENT_ID): Promise<UserProfile> {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise<UserProfile>((resolve, reject) => {
        let isDone = false;

        const cleanup = () => {
          if (isDone) return;
          isDone = true;
          try {
            if (chrome.runtime?.onMessage?.removeListener) {
              chrome.runtime.onMessage.removeListener(onMessage);
            }
            if (chrome.storage?.onChanged?.removeListener) {
              chrome.storage.onChanged.removeListener(onStorageChange);
            }
          } catch {
            // ignore cleanup errors
          }
        };

        const handleToken = async (token: string) => {
          cleanup();
          try {
            const profile = await this.loginWithToken(token);
            resolve(profile);
          } catch (err) {
            reject(err);
          }
        };

        const onMessage = (msg: unknown) => {
          if (typeof msg === 'object' && msg !== null) {
            const payload = msg as { type?: string; token?: string; error?: string };
            if (payload.type === 'AUTH_SUCCESS' && payload.token) {
              handleToken(payload.token);
            } else if (payload.type === 'AUTH_ERROR') {
              cleanup();
              reject(new Error(payload.error || 'Authorization was cancelled.'));
            }
          }
        };

        const onStorageChange = (
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string
        ) => {
          if (areaName === 'local' && changes['anilist_token']?.newValue) {
            handleToken(changes['anilist_token'].newValue);
          }
        };

        // Attach listeners before sending message
        if (chrome.runtime?.onMessage?.addListener) {
          chrome.runtime.onMessage.addListener(onMessage);
        }
        if (chrome.storage?.onChanged?.addListener) {
          chrome.storage.onChanged.addListener(onStorageChange);
        }

        // Send start signal to background service worker
        chrome.runtime.sendMessage({ type: 'START_AUTH', clientId }, (res) => {
          if (chrome.runtime.lastError) {
            cleanup();
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && !res.success) {
            cleanup();
            reject(new Error(res.error || 'Failed to start authorization tab.'));
          }
        });
      });
    } else {
      // In standard browser dev preview
      window.open(this.getAuthUrl(), '_blank');
      throw new Error('Please authorize in the opened tab and paste your Personal Access Token.');
    }
  },


  async loginWithToken(token: string): Promise<UserProfile> {
    let cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('Please enter a valid AniList token.');
    }

    // If user pasted the whole callback URL, extract the token
    const tokenMatch = cleanToken.match(/access_token=([^&]+)/);
    if (tokenMatch && tokenMatch[1]) {
      cleanToken = tokenMatch[1];
    }

    // Clear any stale caches before verifying new token
    anilistService.clearAllCaches();

    // Verify token by querying Viewer
    const profile = await anilistService.getViewerProfile(cleanToken);
    await storageService.setDemoMode(false);
    await storageService.setToken(cleanToken);
    await storageService.setCachedProfile(profile);

    return profile;
  },


  async loginAsDemo(): Promise<UserProfile> {
    anilistService.clearAllCaches();
    await storageService.setDemoMode(true);
    const profile = await anilistService.getViewerProfile();
    return profile;
  },

  async logout(): Promise<void> {
    anilistService.clearAllCaches();
    await storageService.removeToken();
  },

  async checkCurrentSession(): Promise<{ isAuthenticated: boolean; user: UserProfile | null }> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      await storageService.setDemoMode(false);
    }

    const token = await storageService.getToken();
    if (!token) {
      return { isAuthenticated: false, user: null };
    }

    try {
      const cached = await storageService.getCachedProfile();
      if (cached) {
        // Asynchronously revalidate in background with token
        anilistService.getViewerProfile(token).catch(async (err: unknown) => {
          const msg = (err instanceof Error ? err.message : '').toLowerCase();
          if (
            msg.includes('expired') ||
            msg.includes('revoked') ||
            msg.includes('invalid token') ||
            msg.includes('unauthenticated') ||
            msg.includes('unauthorized')
          ) {
            anilistService.clearAllCaches();
            await storageService.removeToken();
          }
        });
        return { isAuthenticated: true, user: cached };
      }

      const user = await anilistService.getViewerProfile(token);
      return { isAuthenticated: true, user };
    } catch {
      // Token expired or invalid
      anilistService.clearAllCaches();
      await storageService.removeToken();
      return { isAuthenticated: false, user: null };
    }
  }
};
