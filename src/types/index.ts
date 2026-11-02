export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

export type MediaType = 'ANIME' | 'MANGA';

export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';

export type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export interface AnimeMedia {
  id: number;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred: string;
  };
  coverImage: {
    extraLarge?: string;
    large: string;
    medium?: string;
    color?: string | null;
  };
  averageScore?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  status: MediaStatus;
  format?: MediaFormat | null;
  type?: MediaType;
  siteUrl?: string;
}

export interface UserListEntry {
  id: number;
  mediaId: number;
  status: MediaListStatus;
  score: number | null;
  progress: number;
  media: AnimeMedia;
}

export interface NormalizedAnimeItem {
  mediaId: number;
  listEntryId?: number;
  title: string;
  coverImage: string;
  coverImageMedium?: string | null;
  coverImageExtraLarge?: string | null;
  coverColor?: string | null;
  userScore: number | null;
  userStatus?: MediaListStatus | null;
  averageScore: number | null;
  progress: number;
  episodes: number | null;
  chapters?: number | null;
  volumes?: number | null;
  status: MediaListStatus;
  format?: string;
  seasonYear?: number | null;
  type?: MediaType;
  siteUrl?: string;
  isPending?: boolean;
  genres?: string[];
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  } | null;
}

export interface PaginatedAnimeResult {
  results: NormalizedAnimeItem[];
  hasNextPage: boolean;
  total?: number;
}

export interface SearchResponse extends PaginatedAnimeResult {
  correctedFrom?: string;
  suggestedQuery?: string;
}

export interface AnimeRelationItem {
  id: number;
  relationType: string;
  title: string;
  format?: string | null;
  seasonYear?: number | null;
  type?: MediaType;
  status?: string | null;
  coverImage: string;
  coverImageMedium?: string | null;
}

export interface AnimeCharacterItem {
  id: number;
  name: string;
  role: string;
  image: string;
  imageMedium?: string | null;
}

export interface AnimeDetail extends NormalizedAnimeItem {
  romajiTitle?: string | null;
  englishTitle?: string | null;
  nativeTitle?: string | null;
  bannerImage?: string | null;
  description?: string | null;
  genres: string[];
  season?: string | null;
  seasonYear?: number | null;
  mediaStatus?: MediaStatus | string | null;
  duration?: number | null;
  studios: string[];
  popularity?: number | null;
  relations?: AnimeRelationItem[];
  characters?: AnimeCharacterItem[];
}

export interface UserGenreStat {
  genre: string;
  count: number;
  minutesWatched?: number;
}

export interface UserProfile {
  id: number;
  name: string;
  bannerImage?: string | null;
  profileColor?: string | null;
  avatar: {
    large?: string;
    medium?: string;
  };
  stats: {
    watching: number;
    completed: number;
    planning: number;
    paused: number;
    dropped: number;
    episodesWatched?: number;
    minutesWatched?: number;
    daysWatched?: number;
    topGenres?: UserGenreStat[];
  };
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type ProfileSortMode = 'SCORE_DESC' | 'TITLE_ASC' | 'AVERAGE_DESC';

export type ActiveTab = 'home' | 'search' | 'profile';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}
