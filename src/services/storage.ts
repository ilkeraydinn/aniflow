import { ThemeMode, ProfileSortMode, UserProfile, NormalizedAnimeItem, AnimeDetail } from '../types';

const STORAGE_KEYS = {
  TOKEN: 'anilist_token',
  USER: 'anilist_user_profile',
  PROFILE_TIMESTAMP: 'anilist_profile_cached_at',
  WATCHING_LIST: 'anilist_watching_cache',
  WATCHING_TIMESTAMP: 'anilist_watching_cached_at',
  THEME: 'anilist_theme_preference',
  IS_DEMO: 'anilist_is_demo_mode',
  VIEW_MODE: 'anilist_view_mode',
  PROFILE_SORT: 'anilist_profile_sort',
  LEGACY_DETAILS_CACHE: 'anilist_details_cache_v1',
  DETAILS_LRU: 'anilist_details_lru_v2'
} as const;

const DETAIL_KEY_PREFIX = 'anilist_detail_';
const STATUS_LIST_KEY_PREFIX = 'anilist_status_list_';
const MAX_PERSISTED_DETAILS = 25;

// Critical startup keys loaded eagerly on popup open; large lists/details load lazily on demand
const BOOTSTRAP_KEYS: string[] = [
  STORAGE_KEYS.TOKEN,
  STORAGE_KEYS.USER,
  STORAGE_KEYS.PROFILE_TIMESTAMP,
  STORAGE_KEYS.WATCHING_LIST,
  STORAGE_KEYS.WATCHING_TIMESTAMP,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.IS_DEMO,
  STORAGE_KEYS.VIEW_MODE,
  STORAGE_KEYS.PROFILE_SORT,
  STORAGE_KEYS.DETAILS_LRU
];

// In-memory cache layer to eliminate asynchronous IPC round-trips for frequent reads
const memoryStore: Record<string, unknown> = {};
const loadedKeys = new Set<string>();
let isStoreInitialized = false;
let initPromise: Promise<void> | null = null;

// Check if running inside Chrome Extension context with storage permission
const hasChromeStorage = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
};

async function getAllStorageKeys(): Promise<string[]> {
  if (hasChromeStorage()) {
    try {
      if (typeof chrome.storage.local.getKeys === 'function') {
        return await chrome.storage.local.getKeys();
      }
      const all = await chrome.storage.local.get(null);
      return Object.keys(all);
    } catch {
      return Object.keys(memoryStore);
    }
  }
  if (typeof localStorage !== 'undefined') {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    return keys;
  }
  return Object.keys(memoryStore);
}

export async function initStorage(): Promise<void> {
  if (isStoreInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (hasChromeStorage()) {
        const initial = await chrome.storage.local.get(BOOTSTRAP_KEYS);
        Object.assign(memoryStore, initial);
        for (const key of BOOTSTRAP_KEYS) {
          loadedKeys.add(key);
        }

        // Asynchronously clean up legacy monolithic details cache key if still present
        chrome.storage.local.remove([STORAGE_KEYS.LEGACY_DETAILS_CACHE]).catch(() => {});

        // Sanitize legacy sensitive entries from localStorage if running inside extension context
        try {
          if (typeof localStorage !== 'undefined') {
            for (const key of Object.values(STORAGE_KEYS)) {
              if (key !== STORAGE_KEYS.THEME) {
                localStorage.removeItem(key);
              }
            }
          }
        } catch {
          // ignore cleanup errors
        }
      } else if (typeof localStorage !== 'undefined') {
        for (const k of BOOTSTRAP_KEYS) {
          loadedKeys.add(k);
          const raw = localStorage.getItem(k);
          if (raw !== null) {
            try {
              memoryStore[k] = JSON.parse(raw);
            } catch {
              memoryStore[k] = raw;
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

// Automatically start preloading critical startup keys into RAM on module load
initStorage();

// Keep in-memory cache synchronized with external changes (e.g. background worker or options)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        loadedKeys.add(key);
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
    if (key in memoryStore) {
      return (memoryStore[key] as T) ?? null;
    }
    if (!loadedKeys.has(key)) {
      loadedKeys.add(key);
      if (hasChromeStorage()) {
        try {
          const res = await chrome.storage.local.get([key]);
          if (key in res && res[key] !== undefined) {
            memoryStore[key] = res[key];
            return res[key] as T;
          }
        } catch {
          // ignore read error
        }
      } else if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(key);
          if (raw !== null) {
            const parsed = JSON.parse(raw) as T;
            memoryStore[key] = parsed;
            return parsed;
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  },

  getSync<T>(key: string): T | null {
    if (key in memoryStore) {
      return (memoryStore[key] as T) ?? null;
    }
    // Fall back to localStorage for synchronous theme read or dev environments
    if ((!hasChromeStorage() || key === STORAGE_KEYS.THEME) && typeof localStorage !== 'undefined') {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) {
          return JSON.parse(val) as T;
        }
      } catch {
        return null;
      }
    }
    return null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    memoryStore[key] = value;
    loadedKeys.add(key);
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

  async setBatch(entries: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      memoryStore[key] = value;
      loadedKeys.add(key);
    }
    if (hasChromeStorage()) {
      await chrome.storage.local.set(entries);
    } else if (typeof localStorage !== 'undefined') {
      for (const [key, value] of Object.entries(entries)) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          // ignore
        }
      }
    }
  },

  async remove(key: string): Promise<void> {
    delete memoryStore[key];
    loadedKeys.add(key);
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
    if (keys.length === 0) return;
    for (const key of keys) {
      delete memoryStore[key];
      loadedKeys.add(key);
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

    const allKeys = await getAllStorageKeys();
    const dynamicKeys = allKeys.filter(
      (key) => key.startsWith(STATUS_LIST_KEY_PREFIX) || key.startsWith(DETAIL_KEY_PREFIX)
    );

    // Atomic batch remove: cleans all auth, user state, sharded details, and status list caches in a single IPC call
    await this.removeBatch([
      STORAGE_KEYS.TOKEN,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.PROFILE_TIMESTAMP,
      STORAGE_KEYS.WATCHING_LIST,
      STORAGE_KEYS.WATCHING_TIMESTAMP,
      STORAGE_KEYS.IS_DEMO,
      STORAGE_KEYS.LEGACY_DETAILS_CACHE,
      STORAGE_KEYS.DETAILS_LRU,
      ...dynamicKeys
    ]);
  },

  async cleanupStaleUserLists(activeUserId: number): Promise<void> {
    try {
      const allKeys = await getAllStorageKeys();
      const activePrefix = `${STATUS_LIST_KEY_PREFIX}${activeUserId}_`;
      const staleKeys = allKeys.filter(
        (key) => key.startsWith(STATUS_LIST_KEY_PREFIX) && !key.startsWith(activePrefix)
      );
      if (staleKeys.length > 0) {
        await this.removeBatch(staleKeys);
      }
    } catch {
      // ignore cleanup issues
    }
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
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(theme));
      }
    } catch {
      // ignore
    }
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
    await this.setBatch({
      [STORAGE_KEYS.USER]: profile,
      [STORAGE_KEYS.PROFILE_TIMESTAMP]: Date.now()
    });
    this.cleanupStaleUserLists(profile.id).catch(() => {});
  },

  async getCachedWatchingList(): Promise<NormalizedAnimeItem[] | null> {
    return this.get<NormalizedAnimeItem[]>(STORAGE_KEYS.WATCHING_LIST);
  },

  async getCachedWatchingListWithMeta(): Promise<{
    list: NormalizedAnimeItem[] | null;
    cachedAt: number;
  }> {
    if (!isStoreInitialized) {
      await initStorage();
    }
    const list = (memoryStore[STORAGE_KEYS.WATCHING_LIST] as NormalizedAnimeItem[]) || null;
    const cachedAt = (memoryStore[STORAGE_KEYS.WATCHING_TIMESTAMP] as number) || 0;
    return { list, cachedAt };
  },

  async setCachedWatchingList(list: NormalizedAnimeItem[]): Promise<void> {
    await this.setBatch({
      [STORAGE_KEYS.WATCHING_LIST]: list,
      [STORAGE_KEYS.WATCHING_TIMESTAMP]: Date.now()
    });
  },

  async getCachedStatusList(
    userId: number,
    status: string
  ): Promise<{ list: NormalizedAnimeItem[]; cachedAt: number } | null> {
    const key = `${STATUS_LIST_KEY_PREFIX}${userId}_${status}`;
    return this.get<{ list: NormalizedAnimeItem[]; cachedAt: number }>(key);
  },

  async setCachedStatusList(
    userId: number,
    status: string,
    list: NormalizedAnimeItem[]
  ): Promise<void> {
    const key = `${STATUS_LIST_KEY_PREFIX}${userId}_${status}`;
    await this.set(key, { list, cachedAt: Date.now() });
  },

  getCachedAnimeDetailSync(mediaId: number): { detail: AnimeDetail; cachedAt: number } | null {
    const key = `${DETAIL_KEY_PREFIX}${mediaId}`;
    return this.getSync<{ detail: AnimeDetail; cachedAt: number }>(key);
  },

  async getCachedAnimeDetail(mediaId: number): Promise<{ detail: AnimeDetail; cachedAt: number } | null> {
    const key = `${DETAIL_KEY_PREFIX}${mediaId}`;
    return this.get<{ detail: AnimeDetail; cachedAt: number }>(key);
  },

  async setCachedAnimeDetail(mediaId: number, detail: AnimeDetail): Promise<void> {
    try {
      const detailKey = `${DETAIL_KEY_PREFIX}${mediaId}`;
      const existingLru = this.getSync<number[]>(STORAGE_KEYS.DETAILS_LRU) || [];
      const nextLru = existingLru.filter((id) => id !== mediaId);
      nextLru.push(mediaId);

      const evictedIds: number[] = [];
      while (nextLru.length > MAX_PERSISTED_DETAILS) {
        const evicted = nextLru.shift();
        if (evicted !== undefined) {
          evictedIds.push(evicted);
        }
      }

      if (evictedIds.length > 0) {
        await this.removeBatch(evictedIds.map((id) => `${DETAIL_KEY_PREFIX}${id}`));
      }

      await this.setBatch({
        [detailKey]: { detail, cachedAt: Date.now() },
        [STORAGE_KEYS.DETAILS_LRU]: nextLru
      });
    } catch {
      // ignore storage quota or write issues
    }
  },

  async updateCachedItem(
    mediaId: number,
    patch: Partial<NormalizedAnimeItem>,
    options?: { skipWatchingList?: boolean }
  ): Promise<void> {
    try {
      if (!options?.skipWatchingList) {
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
      }

      const lru = this.getSync<number[]>(STORAGE_KEYS.DETAILS_LRU) || [];
      const detailKey = `${DETAIL_KEY_PREFIX}${mediaId}`;
      if (detailKey in memoryStore || lru.includes(mediaId)) {
        const entry = await this.getCachedAnimeDetail(mediaId);
        if (entry?.detail) {
          const updatedDetail: AnimeDetail = {
            ...entry.detail,
            ...(patch.userScore !== undefined ? { userScore: patch.userScore } : {}),
            ...(patch.userStatus !== undefined ? { userStatus: patch.userStatus } : {}),
            ...(patch.progress !== undefined ? { progress: patch.progress } : {})
          };
          await this.setCachedAnimeDetail(mediaId, updatedDetail);
        }
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
  },

  async getProfileSort(): Promise<ProfileSortMode> {
    const mode = await this.get<ProfileSortMode>(STORAGE_KEYS.PROFILE_SORT);
    return mode === 'TITLE_ASC' || mode === 'AVERAGE_DESC' || mode === 'SCORE_DESC'
      ? mode
      : 'SCORE_DESC';
  },

  getProfileSortSync(): ProfileSortMode {
    const mode = this.getSync<ProfileSortMode>(STORAGE_KEYS.PROFILE_SORT);
    return mode === 'TITLE_ASC' || mode === 'AVERAGE_DESC' || mode === 'SCORE_DESC'
      ? mode
      : 'SCORE_DESC';
  },

  async setProfileSort(mode: ProfileSortMode): Promise<void> {
    return this.set<ProfileSortMode>(STORAGE_KEYS.PROFILE_SORT, mode);
  }
};
