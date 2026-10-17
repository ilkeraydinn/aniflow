import { ThemeMode, UserProfile, NormalizedAnimeItem, AnimeDetail } from '../types';

const STORAGE_KEYS = {
  TOKEN: 'anilist_token',
  USER: 'anilist_user_profile',
  PROFILE_TIMESTAMP: 'anilist_profile_cached_at',
  WATCHING_LIST: 'anilist_watching_cache',
  THEME: 'anilist_theme_preference',
  IS_DEMO: 'anilist_is_demo_mode',
  VIEW_MODE: 'anilist_view_mode',
  DETAILS_CACHE: 'anilist_details_cache_v1'
} as const;

// In-memory cache layer to eliminate asynchronous IPC round-trips for frequent reads
const memoryStore: Record<string, unknown> = {};
let isStoreInitialized = false;
let initPromise: Promise<void> | null = null;

// Check if running inside Chrome Extension context with storage permission
const hasChromeStorage = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
};

export async function initStorage(): Promise<void> {
  if (isStoreInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (hasChromeStorage()) {
        const all = await chrome.storage.local.get(null);
        Object.assign(memoryStore, all);

        // Sanitize legacy sensitive entries from localStorage if running inside extension context
        try {
          if (typeof localStorage !== 'undefined') {
            for (const key of Object.values(STORAGE_KEYS)) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // ignore cleanup errors
        }
      } else if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) {
            try {
              memoryStore[k] = JSON.parse(localStorage.getItem(k) || '');
            } catch {
              memoryStore[k] = localStorage.getItem(k);
            }
          }
        }
      }
    } catch {
      // ignore init errors
    } finally {
      isStoreInitialized = true;
      initPromise = null;
    }
  })();

  return initPromise;
}

// Automatically start preloading storage into RAM on module load
initStorage();

// Keep in-memory cache synchronized with external changes (e.g. background worker or options)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        if ('newValue' in change && change.newValue !== undefined) {
          memoryStore[key] = change.newValue;
        } else {
          delete memoryStore[key];
        }
      }
    }
  });
}

export const storageService = {
  async get<T>(key: string): Promise<T | null> {
    if (!isStoreInitialized) {
      await initStorage();
    }
    return (memoryStore[key] as T) ?? null;
  },

  getSync<T>(key: string): T | null {
    if (key in memoryStore) {
      return (memoryStore[key] as T) ?? null;
    }
    // Only fall back to localStorage in local dev environments where chrome.storage is unavailable
    if (!hasChromeStorage() && typeof localStorage !== 'undefined') {
      try {
        const val = localStorage.getItem(key);
        return val ? (JSON.parse(val) as T) : null;
      } catch {
        return null;
      }
    }
    return null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    memoryStore[key] = value;
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: value });
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore
      }
    }
  },

  async remove(key: string): Promise<void> {
    delete memoryStore[key];
    if (hasChromeStorage()) {
      await chrome.storage.local.remove([key]);
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  },

  async removeBatch(keys: string[]): Promise<void> {
    for (const key of keys) {
      delete memoryStore[key];
    }
    if (hasChromeStorage()) {
      await chrome.storage.local.remove(keys);
    } else if (typeof localStorage !== 'undefined') {
      for (const key of keys) {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    }
  },

  // Specialized helpers
  async getToken(): Promise<string | null> {
    return this.get<string>(STORAGE_KEYS.TOKEN);
  },

  getTokenSync(): string | null {
    return this.getSync<string>(STORAGE_KEYS.TOKEN);
  },

  async setToken(token: string): Promise<void> {
    return this.set<string>(STORAGE_KEYS.TOKEN, token);
  },

  async removeToken(): Promise<void> {
    if (!isStoreInitialized) {
      await initStorage();
    }

    const dynamicStatusKeys = Object.keys(memoryStore).filter((key) =>
      key.startsWith('anilist_status_list_')
    );

    if (!hasChromeStorage() && typeof localStorage !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('anilist_status_list_') && !dynamicStatusKeys.includes(k)) {
            dynamicStatusKeys.push(k);
          }
        }
      } catch {
        // ignore
      }
    }

    // Atomic batch remove: cleans all auth, user state, and status list caches in a single IPC call
    await this.removeBatch([
      STORAGE_KEYS.TOKEN,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.PROFILE_TIMESTAMP,
      STORAGE_KEYS.WATCHING_LIST,
      STORAGE_KEYS.IS_DEMO,
      STORAGE_KEYS.DETAILS_CACHE,
      ...dynamicStatusKeys
    ]);
  },

  async getTheme(): Promise<ThemeMode> {
    const theme = await this.get<ThemeMode>(STORAGE_KEYS.THEME);
    return theme || 'system';
  },

  getThemeSync(): ThemeMode {
    const theme = this.getSync<ThemeMode>(STORAGE_KEYS.THEME);
    return theme || 'system';
  },

  async setTheme(theme: ThemeMode): Promise<void> {
    return this.set<ThemeMode>(STORAGE_KEYS.THEME, theme);
  },

  async getCachedProfile(): Promise<UserProfile | null> {
    return this.get<UserProfile>(STORAGE_KEYS.USER);
  },

  async getCachedProfileWithMeta(): Promise<{ profile: UserProfile | null; cachedAt: number }> {
    if (!isStoreInitialized) {
      await initStorage();
    }
    const profile = (memoryStore[STORAGE_KEYS.USER] as UserProfile) || null;
    const cachedAt = (memoryStore[STORAGE_KEYS.PROFILE_TIMESTAMP] as number) || 0;
    return { profile, cachedAt };
  },

  async setCachedProfile(profile: UserProfile): Promise<void> {
    await this.set<UserProfile>(STORAGE_KEYS.USER, profile);
    await this.set<number>(STORAGE_KEYS.PROFILE_TIMESTAMP, Date.now());
  },

  async getCachedWatchingList(): Promise<NormalizedAnimeItem[] | null> {
    return this.get<NormalizedAnimeItem[]>(STORAGE_KEYS.WATCHING_LIST);
  },

  async setCachedWatchingList(list: NormalizedAnimeItem[]): Promise<void> {
    return this.set<NormalizedAnimeItem[]>(STORAGE_KEYS.WATCHING_LIST, list);
  },

  async getCachedStatusList(
    userId: number,
    status: string
  ): Promise<{ list: NormalizedAnimeItem[]; cachedAt: number } | null> {
    const key = `anilist_status_list_${userId}_${status}`;
    return this.get<{ list: NormalizedAnimeItem[]; cachedAt: number }>(key);
  },

  async setCachedStatusList(
    userId: number,
    status: string,
    list: NormalizedAnimeItem[]
  ): Promise<void> {
    const key = `anilist_status_list_${userId}_${status}`;
    await this.set(key, { list, cachedAt: Date.now() });
  },

  getCachedAnimeDetailSync(mediaId: number): { detail: AnimeDetail; cachedAt: number } | null {
    const map = this.getSync<Record<string, { detail: AnimeDetail; cachedAt: number }>>(
      STORAGE_KEYS.DETAILS_CACHE
    );
    if (map && map[String(mediaId)]) {
      return map[String(mediaId)];
    }
    return null;
  },

  async setCachedAnimeDetail(mediaId: number, detail: AnimeDetail): Promise<void> {
    try {
      const existing =
        this.getSync<Record<string, { detail: AnimeDetail; cachedAt: number }>>(
          STORAGE_KEYS.DETAILS_CACHE
        ) || {};
      const next: Record<string, { detail: AnimeDetail; cachedAt: number }> = { ...existing };
      const key = String(mediaId);
      delete next[key];
      next[key] = { detail, cachedAt: Date.now() };

      // Keep only the 25 most recently accessed anime details to minimize memory/disk footprint
      const keys = Object.keys(next);
      if (keys.length > 25) {
        const keysToRemove = keys.slice(0, keys.length - 25);
        for (const k of keysToRemove) {
          delete next[k];
        }
      }
      await this.set(STORAGE_KEYS.DETAILS_CACHE, next);
    } catch {
      // ignore storage quota or write issues
    }
  },

  async updateCachedItem(
    mediaId: number,
    patch: Partial<NormalizedAnimeItem>
  ): Promise<void> {
    try {
      const watching = await this.getCachedWatchingList();
      if (watching && watching.length > 0) {
        let changed = false;
        const updatedWatching = watching.map((item) => {
          if (item.mediaId === mediaId) {
            changed = true;
            return { ...item, ...patch };
          }
          return item;
        });
        if (changed) {
          await this.setCachedWatchingList(updatedWatching);
        }
      }

      const detailsMap = this.getSync<Record<string, { detail: AnimeDetail; cachedAt: number }>>(
        STORAGE_KEYS.DETAILS_CACHE
      );
      if (detailsMap && detailsMap[String(mediaId)]) {
        const entry = detailsMap[String(mediaId)];
        const updatedDetail: AnimeDetail = {
          ...entry.detail,
          ...(patch.userScore !== undefined ? { userScore: patch.userScore } : {}),
          ...(patch.userStatus !== undefined ? { userStatus: patch.userStatus } : {}),
          ...(patch.progress !== undefined ? { progress: patch.progress } : {})
        };
        await this.setCachedAnimeDetail(mediaId, updatedDetail);
      }
    } catch {
      // ignore
    }
  },

  async isDemoMode(): Promise<boolean> {
    const val = await this.get<boolean>(STORAGE_KEYS.IS_DEMO);
    return !!val;
  },

  isDemoModeSync(): boolean {
    const val = this.getSync<boolean>(STORAGE_KEYS.IS_DEMO);
    return !!val;
  },

  async setDemoMode(isDemo: boolean): Promise<void> {
    return this.set<boolean>(STORAGE_KEYS.IS_DEMO, isDemo);
  },

  async getViewMode(): Promise<'list' | 'grid'> {
    const mode = await this.get<'list' | 'grid'>(STORAGE_KEYS.VIEW_MODE);
    return mode === 'grid' ? 'grid' : 'list';
  },

  getViewModeSync(): 'list' | 'grid' {
    const mode = this.getSync<'list' | 'grid'>(STORAGE_KEYS.VIEW_MODE);
    return mode === 'grid' ? 'grid' : 'list';
  },

  async setViewMode(mode: 'list' | 'grid'): Promise<void> {
    return this.set<'list' | 'grid'>(STORAGE_KEYS.VIEW_MODE, mode);
  }
};
