import {
  NormalizedAnimeItem,
  UserProfile,
  MediaListStatus,
  AnimeDetail,
  AnimeRelationItem,
  AnimeCharacterItem,
  PaginatedAnimeResult,
  SearchResponse
} from '../types';
import { storageService } from './storage';
import { addTitlesToCorpus, findFuzzyCorrection } from './fuzzySearch';

let mockDataPromise: Promise<typeof import('./mockData')> | null = null;
function loadMockData(): Promise<typeof import('./mockData')> {
  if (!mockDataPromise) {
    mockDataPromise = import('./mockData');
  }
  return mockDataPromise;
}

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';


interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; status?: number }>;
}

// In-memory cache for search queries, discover queries, and details with LRU/bounded eviction
const MAX_CACHE_ENTRIES = 60;
const searchCache = new Map<string, PaginatedAnimeResult>();
const userListCache = new Map<string, NormalizedAnimeItem[]>();
const detailsCache = new Map<number, AnimeDetail>();
const inFlightDetailsPromises = new Map<number, Promise<AnimeDetail>>();
let sessionPrefetchCount = 0;
const MAX_SESSION_PREFETCHES = 20;
let cachedProfilePromise: Promise<UserProfile> | null = null;
let lastProfileFetchTime = 0;
let lastFetchedProfile: UserProfile | null = null;
let lastFetchedToken: string | null = null;
const PROFILE_CACHE_TTL_MS = 60000; // 60 seconds (RAM)
const DISK_PROFILE_TTL_MS = 300000; // 5 minutes (Disk)

function clearAllInMemoryCaches(): void {
  userListCache.clear();
  searchCache.clear();
  detailsCache.clear();
  inFlightDetailsPromises.clear();
  cachedProfilePromise = null;
  lastFetchedProfile = null;
  lastProfileFetchTime = 0;
  lastFetchedToken = null;
}

export function updateItemInCaches(
  mediaId: number,
  patch: Partial<NormalizedAnimeItem>,
  options?: { skipWatchingList?: boolean }
): void {
  // 1. Update in detailsCache if loaded
  if (detailsCache.has(mediaId)) {
    const detail = detailsCache.get(mediaId)!;
    if (patch.userScore !== undefined) detail.userScore = patch.userScore;
    if (patch.userStatus !== undefined) detail.userStatus = patch.userStatus;
    if (patch.progress !== undefined) detail.progress = patch.progress;
  }

  // 2. Selectively update item in userListCache without clearing other lists
  for (const [key, list] of userListCache.entries()) {
    let modified = false;
    const updated = list.map((item) => {
      if (item.mediaId === mediaId) {
        modified = true;
        return { ...item, ...patch };
      }
      return item;
    });
    if (modified) {
      userListCache.set(key, updated);
    }
  }

  // 3. Selectively update item in search results cache
  for (const [key, paginated] of searchCache.entries()) {
    let modified = false;
    const updated = paginated.results.map((item) => {
      if (item.mediaId === mediaId) {
        modified = true;
        return { ...item, ...patch };
      }
      return item;
    });
    if (modified) {
      searchCache.set(key, { ...paginated, results: updated });
    }
  }

  // 4. Update in persistent disk cache
  storageService.updateCachedItem(mediaId, patch, options).catch(() => {});
}

export function invalidateStatusListCache(status?: MediaListStatus): void {
  if (!status) {
    userListCache.clear();
    return;
  }
  for (const key of userListCache.keys()) {
    if (key.endsWith(`_${status}`)) {
      userListCache.delete(key);
    }
  }
}

function getBoundedCache<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const val = map.get(key)!;
  map.delete(key);
  map.set(key, val);
  return val;
}

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxEntries = MAX_CACHE_ENTRIES): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) {
      map.delete(firstKey);
    }
  }
  map.set(key, value);
}

interface RateLimitState {
  remaining: number;
  resetTime: number;
}

const rateLimitState: RateLimitState = {
  remaining: 90,
  resetTime: 0
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttleIfNearRateLimit(): Promise<void> {
  const now = Date.now();
  // Pre-emptive throttling if AniList rate limit quota drops below 10
  if (rateLimitState.remaining < 10 && rateLimitState.resetTime > now) {
    const waitTime = Math.min(rateLimitState.resetTime - now, 1200);
    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }
}

async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null,
  retryCount = 0,
  signal?: AbortSignal
): Promise<T> {
  const isDemo = await storageService.isDemoMode();
  if (isDemo) {
    throw new Error('DEMO_MODE_ACTIVE');
  }

  if (signal?.aborted) {
    const abortErr = new Error('AbortError');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  await throttleIfNearRateLimit();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const authToken = token || (await storageService.getToken());
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let isTimedOut = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, 12000);

  const onAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }

    // Track AniList rate limit headers
    const remainingHeader = res.headers.get('X-RateLimit-Remaining');
    if (remainingHeader) {
      const parsed = parseInt(remainingHeader, 10);
      if (!isNaN(parsed)) rateLimitState.remaining = parsed;
    }
    const resetHeader = res.headers.get('X-RateLimit-Reset');
    if (resetHeader) {
      const parsedReset = parseInt(resetHeader, 10);
      if (!isNaN(parsedReset)) {
        const resetMs = parsedReset > 1000000000 ? parsedReset * 1000 : Date.now() + parsedReset * 1000;
        rateLimitState.resetTime = resetMs;
      }
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('Retry-After');
      let waitSeconds = 2;
      if (retryAfterHeader) {
        const parsedRetry = parseInt(retryAfterHeader, 10);
        if (!isNaN(parsedRetry) && parsedRetry > 0) {
          waitSeconds = Math.min(parsedRetry, 60);
        }
      }

      if (retryCount === 0) {
        console.warn(`[AniList Rate Limit] 429 hit. Retrying in ${waitSeconds}s...`);
        await sleep(waitSeconds * 1000);
        return executeGraphQL<T>(query, variables, token, retryCount + 1, signal);
      }

      throw new Error('AniList API rate limit reached. Please wait a moment.');
    }

    // 1. Check for 5xx Server Errors (Cloudflare Bad Gateway 502, Service Unavailable 503, Gateway Timeout 504, etc.)
    if (!res.ok && res.status >= 500) {
      throw new Error(
        `AniList sunucularına şu anda ulaşılamıyor (${res.status} ${res.statusText || 'Server Error'}). Lütfen bir süre sonra tekrar deneyin.`
      );
    }

    // 2. Check for 401/403 (Verify it's not a Cloudflare WAF HTML challenge before wiping auth)
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 401 || res.status === 403) {
      if (contentType.includes('text/html')) {
        throw new Error(
          'AniList Cloudflare koruması veya erişim kısıtlaması ile karşılaşıldı (403). Lütfen bir süre sonra tekrar deneyin.'
        );
      }
      clearAllInMemoryCaches();
      await storageService.removeToken();
      throw new Error('Authentication expired or revoked. Please log in again.');
    }

    // 3. Check for HTML body on non-2xx responses
    if (!contentType.includes('application/json') && contentType.includes('text/html')) {
      throw new Error(
        `AniList servisinden beklenmeyen HTML yanıtı alındı (${res.status}). Sunucu bakımda olabilir.`
      );
    }

    // 4. Safely parse JSON body, preventing raw SyntaxError crashes
    let json: GraphQLResponse<T>;
    try {
      json = await res.json();
    } catch {
      throw new Error(
        !res.ok
          ? `AniList sunucusundan beklenmeyen yanıt alındı (${res.status}).`
          : 'AniList sunucusu geçersiz yanıt döndürdü (JSON formatında çözümlenemedi).'
      );
    }

    const isAuthError =
      json.errors &&
      json.errors.some((e) => {
        const msg = (e.message || '').toLowerCase();
        return (
          msg.includes('invalid token') ||
          msg.includes('unauthenticated') ||
          msg.includes('unauthorized') ||
          msg.includes('token expired') ||
          msg.includes('not authenticated')
        );
      });

    if (isAuthError) {
      clearAllInMemoryCaches();
      await storageService.removeToken();
      throw new Error('Authentication expired or revoked. Please log in again.');
    }

    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0]?.message || 'GraphQL request failed');
    }

    if (!json.data) {
      throw new Error('No data received from AniList');
    }

    return json.data;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    if (err instanceof Error) {
      // 1. Gerçek ağ zaman aşımı (12s limit doldu ve kullanıcı bilerek iptal etmedi)
      if (isTimedOut && !signal?.aborted) {
        const timeoutErr = new Error(
          'AniList sunucusu 12 saniye içinde yanıt vermedi. Lütfen internet bağlantınızı kontrol edin.'
        );
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }

      // 2. Kullanıcı bilinçli iptali (yeni tuşa basıldı, sekme kapatıldı vb.)
      if (signal?.aborted || err.name === 'AbortError') {
        const abortErr = new Error('AbortError');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      throw err;
    }
    throw new Error('An unexpected network error occurred.');
  }
}

export const anilistService = {
  clearAllCaches(): void {
    clearAllInMemoryCaches();
  },

  async getViewerProfile(token?: string, forceRefresh = false): Promise<UserProfile> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_USER_PROFILE } = await loadMockData();
      return MOCK_USER_PROFILE;
    }

    const effectiveToken = token || (await storageService.getToken()) || undefined;

    // Invalidate in-memory caches if token changed to a different account
    if (token && lastFetchedToken && token !== lastFetchedToken) {
      clearAllInMemoryCaches();
    }

    const now = Date.now();

    if (!forceRefresh) {
      // 1. If in-memory request is already in-flight, return it
      if (cachedProfilePromise) {
        return cachedProfilePromise;
      }

      // 2. Return fresh in-memory profile if within 60s TTL
      if (lastFetchedProfile && now - lastProfileFetchTime < PROFILE_CACHE_TTL_MS) {
        return lastFetchedProfile;
      }

      // 3. Return disk profile if within 5-minute disk TTL (handles popup reopenings with 0ms delay)
      const diskMeta = await storageService.getCachedProfileWithMeta();
      if (
        diskMeta.profile &&
        now - diskMeta.cachedAt < DISK_PROFILE_TTL_MS &&
        diskMeta.profile.profileColor !== undefined
      ) {
        lastFetchedProfile = diskMeta.profile;
        lastProfileFetchTime = diskMeta.cachedAt;
        if (effectiveToken) lastFetchedToken = effectiveToken;
        return diskMeta.profile;
      }
    }

    cachedProfilePromise = (async () => {
      const query = `
        query ViewerQuery {
          Viewer {
            id
            name
            bannerImage
            options {
              profileColor
            }
            avatar {
              large
              medium
            }
            statistics {
              anime {
                count
                episodesWatched
                minutesWatched
                genres(limit: 6, sort: COUNT_DESC) {
                  genre
                  count
                  minutesWatched
                }
                statuses {
                  status
                  count
                }
              }
            }
          }
        }
      `;

      try {
        const data = await executeGraphQL<{
          Viewer: {
            id: number;
            name: string;
            bannerImage?: string | null;
            options?: { profileColor?: string | null };
            avatar?: { large?: string; medium?: string };
            statistics?: {
              anime?: {
                count?: number;
                episodesWatched?: number;
                minutesWatched?: number;
                genres?: Array<{
                  genre: string;
                  count: number;
                  minutesWatched?: number;
                }>;
                statuses?: Array<{ status: string; count: number }>;
              };
            };
          };
        }>(query, {}, effectiveToken);

        const viewer = data.Viewer;

        // 1. List counts baseline from Viewer.statistics
        const statusMap: Record<string, number> = {};
        viewer.statistics?.anime?.statuses?.forEach((item) => {
          statusMap[item.status] = item.count;
        });

        const stats = {
          watching: statusMap['CURRENT'] ?? 0,
          completed: statusMap['COMPLETED'] ?? 0,
          planning: statusMap['PLANNING'] ?? 0,
          paused: statusMap['PAUSED'] ?? 0,
          dropped: statusMap['DROPPED'] ?? 0
        };

        const episodesWatched = viewer.statistics?.anime?.episodesWatched ?? 0;
        const minutesWatched = viewer.statistics?.anime?.minutesWatched ?? 0;
        const daysWatched = Math.round((minutesWatched / 1440) * 10) / 10;
        const topGenres = (viewer.statistics?.anime?.genres || []).map((g) => ({
          genre: g.genre,
          count: g.count,
          minutesWatched: g.minutesWatched
        }));

        const profile: UserProfile = {
          id: viewer.id,
          name: viewer.name,
          bannerImage: viewer.bannerImage ?? null,
          profileColor: viewer.options?.profileColor ?? 'blue',
          avatar: {
            large: viewer.avatar?.large,
            medium: viewer.avatar?.medium
          },
          stats: {
            ...stats,
            episodesWatched,
            minutesWatched,
            daysWatched,
            topGenres
          }
        };

        lastFetchedProfile = profile;
        lastProfileFetchTime = Date.now();
        if (effectiveToken) lastFetchedToken = effectiveToken;
        await storageService.setCachedProfile(profile);
        return profile;
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'DEMO_MODE_ACTIVE') {
          const { MOCK_USER_PROFILE } = await loadMockData();
          return MOCK_USER_PROFILE;
        }
        const cached = await storageService.getCachedProfile();
        if (cached) return cached;
        throw err;
      } finally {
        cachedProfilePromise = null;
      }
    })();

    return cachedProfilePromise;
  },

  async getUserWatchingList(userId: number): Promise<NormalizedAnimeItem[]> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_WATCHING_LIST } = await loadMockData();
      return MOCK_WATCHING_LIST;
    }

    const query = `
      query UserAnimeList($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
          lists {
            entries {
              id
              mediaId
              status
              score(format: POINT_10_DECIMAL)
              progress
              media {
                id
                title {
                  romaji
                  english
                  userPreferred
                }
                coverImage {
                  large
                  medium
                  color
                }
                averageScore
                episodes
                status
                format
                genres
                nextAiringEpisode {
                  episode
                  airingAt
                  timeUntilAiring
                }
              }
            }
          }
        }
      }
    `;

    try {
      const data = await executeGraphQL<{
        MediaListCollection: {
          lists?: Array<{
            entries?: Array<{
              id: number;
              mediaId: number;
              status: MediaListStatus;
              score?: number | null;
              progress: number;
              media: {
                id: number;
                title: {
                  romaji?: string | null;
                  english?: string | null;
                  userPreferred?: string | null;
                };
                coverImage: {
                  large?: string | null;
                  medium?: string | null;
                  color?: string | null;
                };
                averageScore?: number | null;
                episodes?: number | null;
                status: string;
                format?: string | null;
                genres?: string[];
                nextAiringEpisode?: {
                  episode: number;
                  airingAt: number;
                  timeUntilAiring: number;
                } | null;
              };
            }>;
          }>;
        };
      }>(query, { userId });

      const entries = data.MediaListCollection?.lists?.flatMap((l) => l.entries || []) || [];

      const normalized: NormalizedAnimeItem[] = entries.map((entry) => {
        const preferredTitle =
          entry.media.title.userPreferred ||
          entry.media.title.english ||
          entry.media.title.romaji ||
          'Untitled Anime';

        const largeCover =
          entry.media.coverImage?.large ||
          entry.media.coverImage?.medium ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg';

        return {
          mediaId: entry.media.id,
          listEntryId: entry.id,
          title: preferredTitle,
          coverImage: largeCover,
          coverImageMedium:
            entry.media.coverImage?.medium ||
            largeCover,
          coverImageExtraLarge: largeCover,
          coverColor: entry.media.coverImage?.color || null,
          userScore:
            entry.score !== undefined && entry.score !== null && Number(entry.score) > 0
              ? Number(entry.score)
              : null,
          userStatus: entry.status,
          averageScore: entry.media.averageScore ?? null,
          progress: entry.progress ?? 0,
          episodes: entry.media.episodes ?? null,
          status: entry.status,
          format: entry.media.format || 'TV',
          genres: entry.media.genres || [],
          siteUrl: `https://anilist.co/anime/${entry.media.id}`,
          nextAiringEpisode: entry.media.nextAiringEpisode
            ? {
                episode: entry.media.nextAiringEpisode.episode,
                airingAt: entry.media.nextAiringEpisode.airingAt,
                timeUntilAiring: entry.media.nextAiringEpisode.timeUntilAiring
              }
            : null
        };
      });

      normalized.sort((a, b) => {
        const aAiring = a.nextAiringEpisode;
        const bAiring = b.nextAiringEpisode;

        if (aAiring && bAiring) {
          const aTime = aAiring.airingAt ?? aAiring.timeUntilAiring;
          const bTime = bAiring.airingAt ?? bAiring.timeUntilAiring;
          if (aTime !== bTime) {
            return aTime - bTime;
          }
        } else if (aAiring && !bAiring) {
          return -1;
        } else if (!aAiring && bAiring) {
          return 1;
        }

        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
      });

      addTitlesToCorpus(normalized.map((item) => item.title));
      await storageService.setCachedWatchingList(normalized);
      setBoundedCache(userListCache, `user_list_${userId}_CURRENT`, normalized);
      return normalized;

    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'DEMO_MODE_ACTIVE') {
        const { MOCK_WATCHING_LIST } = await loadMockData();
        return MOCK_WATCHING_LIST;
      }
      const cached = await storageService.getCachedWatchingList();
      if (cached) return cached;
      throw err;
    }
  },

  getCachedAnimeDetailsSync(mediaId: number): AnimeDetail | null {
    const inRam = getBoundedCache(detailsCache, mediaId);
    if (inRam && inRam.mediaStatus) {
      return inRam;
    }
    const persisted = storageService.getCachedAnimeDetailSync(mediaId);
    if (
      persisted?.detail &&
      Array.isArray(persisted.detail.characters) &&
      Boolean(persisted.detail.mediaStatus)
    ) {
      setBoundedCache(detailsCache, mediaId, persisted.detail);
      return persisted.detail;
    }
    return null;
  },

  prefetchAnimeDetails(mediaId: number): void {
    // Limit concurrency to 1, preserve rate-limit headroom, and cap per-session prefetches
    if (
      this.getCachedAnimeDetailsSync(mediaId) ||
      inFlightDetailsPromises.size > 0 ||
      rateLimitState.remaining < 40 ||
      sessionPrefetchCount >= MAX_SESSION_PREFETCHES
    ) {
      return;
    }
    sessionPrefetchCount++;
    // Prefetch only into RAM (persistToDisk = false); disk persistence happens when modal actually opens
    this.getAnimeDetails(mediaId, false, false).catch(() => {});
  },

  async getAnimeDetails(
    mediaId: number,
    forceRefresh = false,
    persistToDisk = true
  ): Promise<AnimeDetail> {
    if (!forceRefresh) {
      const cached = this.getCachedAnimeDetailsSync(mediaId);
      if (cached) {
        if (persistToDisk && !storageService.getCachedAnimeDetailSync(mediaId)) {
          storageService.setCachedAnimeDetail(mediaId, cached).catch(() => {});
        }
        return cached;
      }
      const persisted = await storageService.getCachedAnimeDetail(mediaId);
      if (
        persisted?.detail &&
        Array.isArray(persisted.detail.characters) &&
        Boolean(persisted.detail.mediaStatus)
      ) {
        setBoundedCache(detailsCache, mediaId, persisted.detail);
        return persisted.detail;
      }
    }

    if (inFlightDetailsPromises.has(mediaId)) {
      return inFlightDetailsPromises.get(mediaId)!;
    }

    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_WATCHING_LIST } = await loadMockData();
      const mockItem =
        MOCK_WATCHING_LIST.find((m) => m.mediaId === mediaId) || MOCK_WATCHING_LIST[0];
      const mockDetail: AnimeDetail = {
        ...mockItem,
        romajiTitle: mockItem.title,
        englishTitle: mockItem.title,
        genres: ['Action', 'Adventure', 'Fantasy'],
        studios: ['Demo Animation Studio'],
        season: 'FALL',
        seasonYear: 2024,
        mediaStatus: mockItem.nextAiringEpisode ? 'RELEASING' : 'FINISHED',
        duration: 24,
        description: 'An exciting story following unique characters on an unforgettable journey.',
        nextAiringEpisode: mockItem.nextAiringEpisode || null,
        relations: [
          {
            id: 154587,
            relationType: 'PREQUEL',
            title: 'Frieren: Beyond Journey’s End Season 1',
            format: 'TV',
            seasonYear: 2023,
            status: 'FINISHED',
            coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n1HJZcLrqJgg.jpg'
          },
          {
            id: 173516,
            relationType: 'SEQUEL',
            title: 'Frieren: Beyond Journey’s End Season 2',
            format: 'TV',
            seasonYear: 2026,
            status: 'NOT_YET_RELEASED',
            coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx173516-m3wPZ85Z1Uuh.jpg'
          },
          {
            id: 153518,
            relationType: 'SIDE_STORY',
            title: 'Sousou no Frieren: Tokubetsu-hen',
            format: 'ONA',
            seasonYear: 2023,
            status: 'FINISHED',
            coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-7FjO5qNvh5jU.jpg'
          }
        ],
        characters: [
          {
            id: 176754,
            name: 'Frieren',
            role: 'MAIN',
            image: 'https://s4.anilist.co/file/anilistcdn/character/large/b176754-Ya46QWt0cQ05.png'
          },
          {
            id: 183965,
            name: 'Fern',
            role: 'MAIN',
            image: 'https://s4.anilist.co/file/anilistcdn/character/large/b183965-b2r36S822k7l.png'
          },
          {
            id: 183966,
            name: 'Stark',
            role: 'MAIN',
            image: 'https://s4.anilist.co/file/anilistcdn/character/large/b183966-R1kH7a1y0g9z.png'
          },
          {
            id: 184323,
            name: 'Himmel',
            role: 'SUPPORTING',
            image: 'https://s4.anilist.co/file/anilistcdn/character/large/b184323-L3vB9x5m1c4n.png'
          }
        ]
      };
      return mockDetail;
    }

    const query = `
      query MediaDetails($id: Int) {
        Media(id: $id) {
          id
          type
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description(asHtml: false)
          genres
          averageScore
          popularity
          episodes
          chapters
          volumes
          duration
          status
          format
          season
          seasonYear
          startDate {
            year
          }
          studios(isMain: true) {
            nodes {
              id
              name
            }
          }
          siteUrl
          nextAiringEpisode {
            episode
            airingAt
            timeUntilAiring
          }
          characters(sort: [ROLE, RELEVANCE, ID], perPage: 6) {
            edges {
              id
              role
              node {
                id
                name {
                  userPreferred
                  full
                }
                image {
                  large
                  medium
                }
              }
            }
          }
          relations {
            edges {
              relationType(version: 2)
              node {
                id
                type
                title {
                  romaji
                  english
                  native
                  userPreferred
                }
                format
                seasonYear
                startDate {
                  year
                }
                status
                coverImage {
                  large
                  medium
                }
              }
            }
          }
          mediaListEntry {
            id
            status
            score(format: POINT_10_DECIMAL)
            progress
          }
        }
      }
    `;

    const fetchPromise = (async (): Promise<AnimeDetail> => {
      try {
        const data = await executeGraphQL<{
        Media: {
          id: number;
          type?: 'ANIME' | 'MANGA';
          title: {
            romaji?: string | null;
            english?: string | null;
            native?: string | null;
            userPreferred?: string | null;
          };
          coverImage?: {
            extraLarge?: string | null;
            large?: string | null;
            medium?: string | null;
            color?: string | null;
          };
          bannerImage?: string | null;
          description?: string | null;
          genres?: string[];
          averageScore?: number | null;
          popularity?: number | null;
          episodes?: number | null;
          chapters?: number | null;
          volumes?: number | null;
          duration?: number | null;
          status: string;
          format?: string | null;
          season?: string | null;
          seasonYear?: number | null;
          startDate?: {
            year?: number | null;
          } | null;
          studios?: {
            nodes?: Array<{ id: number; name: string }>;
          };
          siteUrl?: string | null;
          nextAiringEpisode?: {
            episode: number;
            airingAt: number;
            timeUntilAiring: number;
          } | null;
          characters?: {
            edges?: Array<{
              id?: number;
              role?: string | null;
              node?: {
                id: number;
                name?: {
                  userPreferred?: string | null;
                  full?: string | null;
                } | null;
                image?: {
                  large?: string | null;
                  medium?: string | null;
                } | null;
              } | null;
            } | null>;
          } | null;
          relations?: {
            edges?: Array<{
              relationType: string;
              node?: {
                id: number;
                type?: 'ANIME' | 'MANGA';
                title?: {
                  romaji?: string | null;
                  english?: string | null;
                  native?: string | null;
                  userPreferred?: string | null;
                };
                format?: string | null;
                seasonYear?: number | null;
                startDate?: {
                  year?: number | null;
                } | null;
                status?: string | null;
                coverImage?: {
                  large?: string | null;
                  medium?: string | null;
                };
              } | null;
            } | null>;
          };
          mediaListEntry?: {
            id: number;
            status: MediaListStatus;
            score?: number | null;
            progress: number;
          } | null;
        };
      }>(query, { id: mediaId });

      const media = data.Media;
      const preferredTitle =
        media.title.userPreferred ||
        media.title.english ||
        media.title.romaji ||
        'Untitled Media';

      const studiosList =
        media.studios?.nodes?.map((n) => n.name).filter(Boolean) || [];

      let cleanDesc: string | null = null;
      if (media.description) {
        cleanDesc = media.description
          .replace(/<br\s*[\/]?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
      }

      const relationPriority: Record<string, number> = {
        PREQUEL: 1,
        SEQUEL: 2,
        PARENT: 3,
        SIDE_STORY: 4,
        SPIN_OFF: 5,
        ALTERNATIVE: 6,
        SUMMARY: 7,
        COMPILATION: 8,
        SOURCE: 9,
        OTHER: 10
      };

      const relations: AnimeRelationItem[] = (media.relations?.edges || [])
        .filter((edge): edge is NonNullable<typeof edge> & { node: NonNullable<NonNullable<typeof edge>['node']> } => Boolean(edge && edge.node))
        .map((edge) => {
          const node = edge.node;
          const relTitle =
            node.title?.userPreferred ||
            node.title?.english ||
            node.title?.romaji ||
            'Untitled Media';

          return {
            id: node.id,
            type: node.type,
            relationType: edge.relationType,
            title: relTitle,
            format: node.format || null,
            seasonYear: node.seasonYear ?? node.startDate?.year ?? null,
            status: node.status || null,
            coverImage:
              node.coverImage?.large ||
              node.coverImage?.medium ||
              'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
            coverImageMedium:
              node.coverImage?.medium ||
              node.coverImage?.large ||
              'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg'
          };
        })
        .sort((a, b) => {
          const pA = relationPriority[a.relationType] ?? 99;
          const pB = relationPriority[b.relationType] ?? 99;
          return pA - pB;
        })
        .slice(0, 10);

      const characters: AnimeCharacterItem[] = (media.characters?.edges || [])
        .filter(
          (edge): edge is NonNullable<typeof edge> & { node: NonNullable<NonNullable<typeof edge>['node']> } =>
            Boolean(edge && edge.node)
        )
        .slice(0, 6)
        .map((edge) => {
          const node = edge.node;
          const charName =
            node.name?.userPreferred ||
            node.name?.full ||
            'Unknown Character';

          return {
            id: node.id,
            name: charName,
            role: edge.role || 'SUPPORTING',
            image:
              node.image?.large ||
              node.image?.medium ||
              'https://s4.anilist.co/file/anilistcdn/character/large/default.jpg',
            imageMedium:
              node.image?.medium ||
              node.image?.large ||
              null
          };
        });

      const isMangaMedia =
        media.type === 'MANGA' ||
        media.format === 'MANGA' ||
        media.format === 'NOVEL' ||
        media.format === 'ONE_SHOT';

      const detail: AnimeDetail = {
        mediaId: media.id,
        listEntryId: media.mediaListEntry?.id,
        title: preferredTitle,
        romajiTitle: media.title.romaji,
        englishTitle: media.title.english,
        nativeTitle: media.title.native,
        coverImage:
          media.coverImage?.large ||
          media.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverImageMedium:
          media.coverImage?.medium ||
          media.coverImage?.large ||
          media.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg',
        coverImageExtraLarge:
          media.coverImage?.extraLarge ||
          media.coverImage?.large ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverColor: media.coverImage?.color || null,
        bannerImage: media.bannerImage || null,
        description: cleanDesc,
        genres: media.genres || [],
        averageScore: media.averageScore ?? null,
        popularity: media.popularity ?? null,
        episodes: media.episodes ?? null,
        chapters: media.chapters ?? null,
        volumes: media.volumes ?? null,
        duration: media.duration ?? null,
        status: media.mediaListEntry?.status || 'PLANNING',
        mediaStatus: media.status || null,
        userStatus: media.mediaListEntry?.status || null,
        userScore:
          media.mediaListEntry?.score !== undefined &&
          media.mediaListEntry?.score !== null &&
          Number(media.mediaListEntry.score) > 0
            ? Number(media.mediaListEntry.score)
            : null,
        progress: media.mediaListEntry?.progress ?? 0,
        type: isMangaMedia ? 'MANGA' : 'ANIME',
        format: media.format || (isMangaMedia ? 'MANGA' : 'TV'),
        season: media.season || null,
        seasonYear: media.seasonYear ?? media.startDate?.year ?? null,
        studios: studiosList,
        siteUrl: media.siteUrl || (isMangaMedia ? `https://anilist.co/manga/${media.id}` : `https://anilist.co/anime/${media.id}`),
        relations,
        characters,
        nextAiringEpisode: media.nextAiringEpisode
          ? {
              episode: media.nextAiringEpisode.episode,
              airingAt: media.nextAiringEpisode.airingAt,
              timeUntilAiring: media.nextAiringEpisode.timeUntilAiring
            }
          : null
      };

      setBoundedCache(detailsCache, mediaId, detail);
      if (persistToDisk) {
        storageService.setCachedAnimeDetail(mediaId, detail).catch(() => {});
      }
      return detail;
      } finally {
        inFlightDetailsPromises.delete(mediaId);
      }
    })();

    inFlightDetailsPromises.set(mediaId, fetchPromise);
    return fetchPromise;
  },

  async getUserAnimeListByStatus(
    userId: number,
    status: MediaListStatus,
    forceRefresh = false,
    signal?: AbortSignal
  ): Promise<NormalizedAnimeItem[]> {
    if (status === 'CURRENT') {
      return this.getUserWatchingList(userId);
    }

    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_WATCHING_LIST } = await loadMockData();
      return MOCK_WATCHING_LIST.map((item) => ({
        ...item,
        status,
        userStatus: status
      }));
    }

    const cacheKey = `user_list_${userId}_${status}`;
    if (!forceRefresh) {
      const inRam = getBoundedCache(userListCache, cacheKey);
      if (inRam && inRam.some((i) => Array.isArray(i.genres))) {
        return inRam;
      }
      const diskData = await storageService.getCachedStatusList(userId, status);
      if (
        diskData &&
        Date.now() - diskData.cachedAt < 300000 &&
        diskData.list.some((i) => Array.isArray(i.genres))
      ) {
        setBoundedCache(userListCache, cacheKey, diskData.list);
        return diskData.list;
      }
    }

    const query = `
      query UserAnimeListByStatus($userId: Int, $status: MediaListStatus) {
        MediaListCollection(userId: $userId, type: ANIME, status: $status) {
          lists {
            entries {
              id
              mediaId
              status
              score(format: POINT_10_DECIMAL)
              progress
              media {
                id
                title {
                  romaji
                  english
                  userPreferred
                }
                coverImage {
                  large
                  medium
                  color
                }
                averageScore
                episodes
                status
                format
                genres
                nextAiringEpisode {
                  episode
                  airingAt
                  timeUntilAiring
                }
              }
            }
          }
        }
      }
    `;

    try {
      const data = await executeGraphQL<{
        MediaListCollection: {
          lists?: Array<{
            entries?: Array<{
              id: number;
              mediaId: number;
              status: MediaListStatus;
              score?: number | null;
              progress: number;
              media: {
                id: number;
                title: {
                  romaji?: string | null;
                  english?: string | null;
                  userPreferred?: string | null;
                };
                coverImage: {
                  large?: string | null;
                  medium?: string | null;
                  color?: string | null;
                };
                averageScore?: number | null;
                episodes?: number | null;
                status: string;
                format?: string | null;
                genres?: string[];
                nextAiringEpisode?: {
                  episode: number;
                  airingAt: number;
                  timeUntilAiring: number;
                } | null;
              };
            }>;
          }>;
        };
      }>(query, { userId, status }, null, 0, signal);

      const entries = data.MediaListCollection?.lists?.flatMap((l) => l.entries || []) || [];

      const normalized: NormalizedAnimeItem[] = entries.map((entry) => {
        const preferredTitle =
          entry.media.title.userPreferred ||
          entry.media.title.english ||
          entry.media.title.romaji ||
          'Untitled Anime';

        const largeCover =
          entry.media.coverImage?.large ||
          entry.media.coverImage?.medium ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg';

        return {
          mediaId: entry.media.id,
          listEntryId: entry.id,
          title: preferredTitle,
          coverImage: largeCover,
          coverImageMedium:
            entry.media.coverImage?.medium ||
            largeCover,
          coverImageExtraLarge: largeCover,
          coverColor: entry.media.coverImage?.color || null,
          userScore:
            entry.score !== undefined && entry.score !== null && Number(entry.score) > 0
              ? Number(entry.score)
              : null,
          userStatus: entry.status,
          averageScore: entry.media.averageScore ?? null,
          progress: entry.progress ?? 0,
          episodes: entry.media.episodes ?? null,
          status: entry.status,
          format: entry.media.format || 'TV',
          genres: entry.media.genres || [],
          siteUrl: `https://anilist.co/anime/${entry.media.id}`,
          nextAiringEpisode: entry.media.nextAiringEpisode
            ? {
                episode: entry.media.nextAiringEpisode.episode,
                airingAt: entry.media.nextAiringEpisode.airingAt,
                timeUntilAiring: entry.media.nextAiringEpisode.timeUntilAiring
              }
            : null
        };
      });

      normalized.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
      );

      addTitlesToCorpus(normalized.map((item) => item.title));
      setBoundedCache(userListCache, cacheKey, normalized);
      await storageService.setCachedStatusList(userId, status, normalized);

      // Reconcile user profile stats with real list length
      const statusKeyMap: Record<MediaListStatus, 'watching' | 'completed' | 'planning' | 'paused' | 'dropped' | null> = {
        CURRENT: 'watching',
        COMPLETED: 'completed',
        PLANNING: 'planning',
        PAUSED: 'paused',
        DROPPED: 'dropped',
        REPEATING: null
      };
      const statKey = statusKeyMap[status];
      if (statKey) {
        storageService.getCachedProfile().then((profile) => {
          if (profile && profile.stats && profile.stats[statKey] !== normalized.length) {
            profile.stats[statKey] = normalized.length;
            lastFetchedProfile = profile;
            storageService.setCachedProfile(profile).catch(() => {});
          }
        }).catch(() => {});
      }

      return normalized;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      if (err instanceof Error && err.message === 'DEMO_MODE_ACTIVE') {
        const { MOCK_WATCHING_LIST } = await loadMockData();
        return MOCK_WATCHING_LIST;
      }
      const diskData = await storageService.getCachedStatusList(userId, status);
      if (diskData?.list) return diskData.list;
      throw err;
    }
  },


  async updateMediaProgress(
    mediaId: number,
    progress: number,
    totalEpisodes?: number | null
  ): Promise<{ id: number; progress: number; status: MediaListStatus }> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      // simulate latency
      await new Promise((resolve) => setTimeout(resolve, 300));
      const status: MediaListStatus =
        totalEpisodes && progress >= totalEpisodes ? 'COMPLETED' : 'CURRENT';
      updateItemInCaches(
        mediaId,
        { progress, status, userStatus: status },
        { skipWatchingList: true }
      );
      if (status === 'COMPLETED') {
        invalidateStatusListCache('CURRENT');
        invalidateStatusListCache('COMPLETED');
      }
      return { id: 999, progress, status };
    }

    const mutation = `
      mutation UpdateProgress($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
          id
          mediaId
          progress
          status
        }
      }
    `;

    const status: MediaListStatus =
      totalEpisodes && progress >= totalEpisodes ? 'COMPLETED' : 'CURRENT';

    const data = await executeGraphQL<{
      SaveMediaListEntry: {
        id: number;
        mediaId: number;
        progress: number;
        status: MediaListStatus;
      };
    }>(mutation, { mediaId, progress, status });

    const result = data.SaveMediaListEntry;

    // Selective Invalidation: update item in memory & detail caches; watchingList disk write is handled by AnimeContext
    updateItemInCaches(
      mediaId,
      {
        progress: result.progress,
        status: result.status,
        userStatus: result.status
      },
      { skipWatchingList: true }
    );

    if (result.status === 'COMPLETED') {
      invalidateStatusListCache('CURRENT');
      invalidateStatusListCache('COMPLETED');
    }

    return result;
  },

  async updateMediaScore(
    mediaId: number,
    score: number
  ): Promise<{ id: number; score: number | null }> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const finalScore = score > 0 ? score : null;
      updateItemInCaches(mediaId, { userScore: finalScore });
      return { id: 999, score: finalScore };
    }

    const mutation = `
      mutation UpdateScore($mediaId: Int, $scoreRaw: Int) {
        SaveMediaListEntry(mediaId: $mediaId, scoreRaw: $scoreRaw) {
          id
          mediaId
          score(format: POINT_10_DECIMAL)
          status
        }
      }
    `;

    // `score` is interpreted using the user's AniList score format (POINT_100, POINT_5, ...),
    // whereas `scoreRaw` is always 0-100. Convert our 0-10 value so any format saves correctly.
    const clamped = Number.isFinite(score) ? Math.min(10, Math.max(0, score)) : 0;
    const scoreRaw = Math.round(clamped * 10);

    const data = await executeGraphQL<{
      SaveMediaListEntry: {
        id: number;
        mediaId: number;
        score: number | null;
        status: MediaListStatus;
      };
    }>(mutation, { mediaId, scoreRaw });

    const newScore = data.SaveMediaListEntry.score;
    const finalScore =
      newScore !== undefined && newScore !== null && Number(newScore) > 0
        ? Number(newScore)
        : null;

    // Selective Invalidation: update item's userScore across all cached lists and details
    updateItemInCaches(mediaId, { userScore: finalScore });

    return {
      id: data.SaveMediaListEntry.id,
      score: finalScore
    };
  },

  async searchAnime(
    query: string,
    page = 1,
    perPage = 15,
    signal?: AbortSignal
  ): Promise<PaginatedAnimeResult> {
    const trimmed = query.trim();
    if (!trimmed) return { results: [], hasNextPage: false };

    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_SEARCH_RESULTS } = await loadMockData();
      const filtered = MOCK_SEARCH_RESULTS.filter((a) =>
        a.title.toLowerCase().includes(trimmed.toLowerCase())
      );
      const items = filtered.length > 0 ? filtered : MOCK_SEARCH_RESULTS;
      const start = (page - 1) * perPage;
      const slice = items.slice(start, start + perPage);
      return {
        results: slice,
        hasNextPage: start + perPage < items.length,
        total: items.length
      };
    }

    const cacheKey = `${trimmed.toLowerCase()}_${page}_${perPage}`;
    const cachedSearch = getBoundedCache(searchCache, cacheKey);
    if (cachedSearch) {
      return cachedSearch;
    }

    const graphQuery = `
      query SearchAnime($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            total
          }
          media(search: $search, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC], isAdult: false) {
            id
            title {
              romaji
              english
              userPreferred
            }
            coverImage {
              extraLarge
              large
              medium
              color
            }
            averageScore
            popularity
            episodes
            status
            format
            seasonYear
            startDate {
              year
            }
            siteUrl
            genres
            mediaListEntry {
              id
              status
              score(format: POINT_10_DECIMAL)
              progress
            }
          }
        }
      }
    `;

    const fetchPerPage = perPage;
    const data = await executeGraphQL<{
      Page: {
        pageInfo?: {
          hasNextPage: boolean;
          total?: number;
        };
        media: Array<{
          id: number;
          title: {
            romaji?: string | null;
            english?: string | null;
            userPreferred?: string | null;
          };
          coverImage: {
            extraLarge?: string | null;
            large?: string | null;
            medium?: string | null;
            color?: string | null;
          };
          averageScore?: number | null;
          popularity?: number | null;
          episodes?: number | null;
          status: string;
          format?: string | null;
          seasonYear?: number | null;
          startDate?: {
            year?: number | null;
          } | null;
          siteUrl?: string | null;
          genres?: string[];
          mediaListEntry?: {
            id: number;
            status: MediaListStatus;
            score?: number | null;
            progress: number;
          } | null;
        }>;
      };
    }>(graphQuery, { search: trimmed, page, perPage: fetchPerPage }, null, 0, signal);

    const normalizeForRanking = (text: string): string =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normQuery = normalizeForRanking(trimmed);
    const queryWords = normQuery ? normQuery.split(' ') : [];
    const mediaList = data.Page.media || [];

    const scoredResults = mediaList.map((item, index) => {
      const preferredTitle =
        item.title.userPreferred || item.title.english || item.title.romaji || 'Untitled Anime';

      const entry = item.mediaListEntry;
      const pop = item.popularity ?? 0;
      const isObscure = pop < 1500 && item.status !== 'NOT_YET_RELEASED';

      // 1. Title Match Score across userPreferred, english, and romaji
      const candidates = [item.title.userPreferred, item.title.english, item.title.romaji]
        .filter((t): t is string => Boolean(t))
        .map(normalizeForRanking)
        .filter(Boolean);

      let bestTitleScore = 0;
      for (const candidate of candidates) {
        let score = 0;
        const lenDiff = Math.max(0, candidate.length - normQuery.length);
        if (candidate === normQuery) {
          // Prevent obscure 100-viewer indie shorts (e.g. "Tokyo") from hijacking single-word searches
          score = isObscure ? 22 : pop < 5000 ? 55 : 85;
        } else if (candidate.startsWith(normQuery + ' ')) {
          score = 64 - Math.min(16, lenDiff * 0.3);
        } else if (candidate.startsWith(normQuery)) {
          score = 50 - Math.min(16, lenDiff * 0.3);
        } else if (candidate.includes(normQuery)) {
          score = 34 - Math.min(12, lenDiff * 0.2);
        } else if (queryWords.length > 1 && queryWords.every((w) => candidate.includes(w))) {
          score = 26;
        }
        if (score > bestTitleScore) {
          bestTitleScore = score;
        }
      }

      // 2. Gentle tie-breaker from AniList's base SEARCH_MATCH order
      const baseRankScore = Math.max(0, (fetchPerPage - index) * 0.5);

      // 3. Format weight (prioritize main TV series/movies over specials/music unless explicitly searched)
      const fmt = item.format || 'TV';
      let formatScore = 0;
      if (fmt === 'TV') formatScore = 22;
      else if (fmt === 'MOVIE') formatScore = isObscure ? -5 : 12;
      else if (fmt === 'ONA') formatScore = 8;
      else if (fmt === 'TV_SHORT') formatScore = 4;
      else if (fmt === 'OVA') formatScore = normQuery.includes('ova') ? 12 : -10;
      else if (fmt === 'SPECIAL') formatScore = normQuery.includes('special') ? 12 : -18;
      else if (fmt === 'MUSIC') formatScore = normQuery.includes('music') ? 12 : -35;

      // 4. Power-law Popularity & Rating Quality Score (separates 500k hits from 200-viewer indie shorts)
      let popScore = 0;
      if (pop < 500 && item.status !== 'NOT_YET_RELEASED') {
        popScore = -45;
      } else if (pop < 1500 && item.status !== 'NOT_YET_RELEASED') {
        popScore = -25;
      } else if (pop < 5000) {
        popScore = 5;
      } else {
        popScore = 15 + Math.min(60, Math.sqrt(pop / 10000) * 8.5);
      }

      let ratingScore = 0;
      if (item.averageScore !== null && item.averageScore !== undefined) {
        if (item.averageScore >= 75) ratingScore = 12;
        else if (item.averageScore >= 65) ratingScore = 6;
        else if (item.averageScore < 50) ratingScore = -25;
      } else if (item.status !== 'NOT_YET_RELEASED') {
        ratingScore = -15;
      }

      // 5. User's own list boost
      let userListBoost = 0;
      if (entry?.status === 'CURRENT' || entry?.status === 'PLANNING' || entry?.status === 'REPEATING') {
        userListBoost = 18;
      } else if (entry?.status === 'COMPLETED' || entry?.status === 'PAUSED') {
        userListBoost = 12;
      } else if (entry?.status === 'DROPPED') {
        userListBoost = 8;
      }

      const relevanceScore =
        bestTitleScore + baseRankScore + formatScore + popScore + ratingScore + userListBoost;

      const normalizedItem: NormalizedAnimeItem = {
        mediaId: item.id,
        listEntryId: entry?.id,
        title: preferredTitle,
        coverImage:
          item.coverImage?.large ||
          item.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverImageMedium:
          item.coverImage?.medium ||
          item.coverImage?.large ||
          item.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg',
        coverImageExtraLarge:
          item.coverImage?.extraLarge ||
          item.coverImage?.large ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverColor: item.coverImage?.color || null,
        userScore:
          entry?.score !== undefined && entry?.score !== null && Number(entry.score) > 0
            ? Number(entry.score)
            : null,
        userStatus: entry?.status || null,
        averageScore: item.averageScore ?? null,
        progress: entry?.progress ?? 0,
        episodes: item.episodes ?? null,
        status: entry?.status || 'PLANNING',
        format: item.format || 'TV',
        seasonYear: item.seasonYear ?? item.startDate?.year ?? null,
        siteUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`,
        genres: item.genres || []
      };

      return {
        normalizedItem,
        relevanceScore,
        originalIndex: index
      };
    });

    scoredResults.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.originalIndex - b.originalIndex;
    });

    const results: NormalizedAnimeItem[] = scoredResults.map((entry) => entry.normalizedItem);

    const paginated: PaginatedAnimeResult = {
      results,
      hasNextPage: data.Page.pageInfo?.hasNextPage ?? false,
      total: data.Page.pageInfo?.total
    };

    setBoundedCache(searchCache, cacheKey, paginated);
    return paginated;
  },

  async getDiscoverAnime(
    mode: 'TRENDING' | 'TOP_RATED' | 'UPCOMING' = 'TRENDING',
    page = 1,
    perPage = 15,
    genres?: string[] | string | null
  ): Promise<PaginatedAnimeResult> {
    const genresList: string[] = Array.isArray(genres)
      ? genres.filter((g) => g && g !== 'All')
      : typeof genres === 'string' && genres !== 'All'
      ? [genres]
      : [];

    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      const { MOCK_SEARCH_RESULTS } = await loadMockData();
      let list = [...MOCK_SEARCH_RESULTS];
      if (mode === 'UPCOMING') {
        const upcoming = list.filter((m) => m.status === 'PLANNING' || m.mediaId >= 160000);
        list = upcoming.length > 0 ? upcoming : list;
      }
      if (genresList.length > 0) {
        const byGenre = list.filter((m) =>
          genresList.every((g) => m.genres?.includes(g))
        );
        list = byGenre.length > 0 ? byGenre : list;
      }
      const start = (page - 1) * perPage;
      const paged = list.slice(start, start + perPage);
      return {
        results: paged.length > 0 ? paged : list.slice(0, perPage),
        hasNextPage: start + perPage < list.length,
        total: list.length
      };
    }

    const genreKey =
      genresList.length > 0
        ? [...genresList].sort().join('-').toLowerCase()
        : 'all';
    const cacheKey = `discover_${mode}_${genreKey}_${page}_${perPage}`;
    const cachedDiscover = getBoundedCache(searchCache, cacheKey);
    if (cachedDiscover) {
      return cachedDiscover;
    }

    let sortParam: string[];
    let statusParam: string | undefined;

    if (mode === 'UPCOMING') {
      sortParam = ['POPULARITY_DESC'];
      statusParam = 'NOT_YET_RELEASED';
    } else if (mode === 'TOP_RATED') {
      sortParam = ['SCORE_DESC', 'POPULARITY_DESC'];
      statusParam = undefined;
    } else {
      sortParam = ['TRENDING_DESC', 'POPULARITY_DESC'];
      statusParam = undefined;
    }

    const genreInParam = genresList.length > 0 ? genresList : undefined;

    const graphQuery = `
      query GetDiscoverAnime($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $genreIn: [String]) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            total
          }
          media(type: ANIME, sort: $sort, status: $status, genre_in: $genreIn, isAdult: false) {
            id
            title {
              romaji
              english
              userPreferred
            }
            coverImage {
              extraLarge
              large
              medium
              color
            }
            averageScore
            episodes
            status
            format
            seasonYear
            startDate {
              year
            }
            siteUrl
            genres
            mediaListEntry {
              id
              status
              score(format: POINT_10_DECIMAL)
              progress
            }
          }
        }
      }
    `;

    const data = await executeGraphQL<{
      Page: {
        pageInfo?: {
          hasNextPage: boolean;
          total?: number;
        };
        media: Array<{
          id: number;
          title: {
            romaji?: string | null;
            english?: string | null;
            userPreferred?: string | null;
          };
          coverImage: {
            extraLarge?: string | null;
            large?: string | null;
            medium?: string | null;
            color?: string | null;
          };
          averageScore?: number | null;
          episodes?: number | null;
          status: string;
          format?: string | null;
          seasonYear?: number | null;
          startDate?: {
            year?: number | null;
          } | null;
          siteUrl?: string | null;
          genres?: string[];
          mediaListEntry?: {
            id: number;
            status: MediaListStatus;
            score?: number | null;
            progress: number;
          } | null;
        }>;
      };
    }>(graphQuery, {
      page,
      perPage,
      sort: sortParam,
      status: statusParam,
      genreIn: genreInParam
    });

    const results: NormalizedAnimeItem[] = (data.Page.media || []).map((item) => {
      const preferredTitle =
        item.title.userPreferred || item.title.english || item.title.romaji || 'Untitled Anime';

      const entry = item.mediaListEntry;

      return {
        mediaId: item.id,
        listEntryId: entry?.id,
        title: preferredTitle,
        coverImage:
          item.coverImage?.large ||
          item.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverImageMedium:
          item.coverImage?.medium ||
          item.coverImage?.large ||
          item.coverImage?.extraLarge ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg',
        coverImageExtraLarge:
          item.coverImage?.extraLarge ||
          item.coverImage?.large ||
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
        coverColor: item.coverImage?.color || null,
        userScore:
          entry?.score !== undefined && entry?.score !== null && Number(entry.score) > 0
            ? Number(entry.score)
            : null,
        userStatus: entry?.status || null,
        averageScore: item.averageScore ?? null,
        progress: entry?.progress ?? 0,
        episodes: item.episodes ?? null,
        status: entry?.status || 'PLANNING',
        format: item.format || 'TV',
        seasonYear: item.seasonYear ?? item.startDate?.year ?? null,
        siteUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`,
        genres: item.genres || []
      };
    });

    addTitlesToCorpus(results.map((item) => item.title));

    const paginated: PaginatedAnimeResult = {
      results,
      hasNextPage: data.Page.pageInfo?.hasNextPage ?? false,
      total: data.Page.pageInfo?.total
    };

    setBoundedCache(searchCache, cacheKey, paginated);
    return paginated;
  },

  async searchAnimeWithFuzzyFallback(
    query: string,
    page = 1,
    perPage = 15,
    signal?: AbortSignal
  ): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { results: [], hasNextPage: false };

    // 1. Direct AniList search
    const directResponse = await this.searchAnime(trimmed, page, perPage, signal);
    if (directResponse.results.length > 0) {
      addTitlesToCorpus(directResponse.results.map((r) => r.title));
      return directResponse;
    }

    // 2. Intelligent fuzzy match suggestion without burning a duplicate GraphQL request
    if (page === 1) {
      const correction = findFuzzyCorrection(trimmed);
      if (correction && correction.toLowerCase() !== trimmed.toLowerCase()) {
        // If the correction is already in memory cache, return it instantly at 0 network cost!
        const cacheKey = `${correction.toLowerCase()}_1_${perPage}`;
        const cached = getBoundedCache(searchCache, cacheKey);
        if (cached) {
          return {
            results: cached.results,
            hasNextPage: cached.hasNextPage,
            total: cached.total,
            correctedFrom: trimmed,
            suggestedQuery: correction
          };
        }

        // Return empty results with suggestedQuery so UI provides a one-click suggestion chip
        return {
          results: [],
          hasNextPage: false,
          total: 0,
          correctedFrom: trimmed,
          suggestedQuery: correction
        };
      }
      return { results: [], hasNextPage: false, suggestedQuery: correction || undefined };
    }

    return { results: [], hasNextPage: false };
  },



  async addAnimeToList(
    mediaId: number,
    status: MediaListStatus = 'CURRENT'
  ): Promise<{ id: number; mediaId: number; status: MediaListStatus; progress: number }> {
    const isDemo = await storageService.isDemoMode();
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      updateItemInCaches(mediaId, { status, userStatus: status });
      invalidateStatusListCache(status);
      invalidateStatusListCache('CURRENT');
      return { id: Math.floor(Math.random() * 10000), mediaId, status, progress: 0 };
    }

    const mutation = `
      mutation AddAnime($mediaId: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status) {
          id
          mediaId
          progress
          status
        }
      }
    `;

    // Note: progress is intentionally NOT sent. AniList initialises new entries at 0,
    // and omitting it keeps the existing progress when the entry is already on the list.
    const data = await executeGraphQL<{
      SaveMediaListEntry: {
        id: number;
        mediaId: number;
        progress: number;
        status: MediaListStatus;
      };
    }>(mutation, {
      mediaId,
      status
    });

    const entry = data.SaveMediaListEntry;

    // Selective update: update card status and preserve existing progress in caches
    updateItemInCaches(mediaId, {
      status: entry.status,
      userStatus: entry.status,
      progress: entry.progress
    });
    invalidateStatusListCache(entry.status);
    invalidateStatusListCache('CURRENT');

    return entry;
  }
};
