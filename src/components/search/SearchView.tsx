import React, { useState, useEffect, useRef } from 'react';
import { NormalizedAnimeItem } from '../../types';
import { anilistService } from '../../services/anilistClient';
import { useAnime } from '../../context/AnimeContext';
import { useUIActions, useUIState } from '../../context/UIContext';
import { SearchResultCard } from './SearchResultCard';
import { Search, X, AlertCircle, Flame, Star, Sparkles, Calendar, Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Skeleton } from '../common/Skeleton';
import { Button } from '../common/Button';

type DiscoverMode = 'TRENDING' | 'TOP_RATED' | 'UPCOMING';

const GENRES = [
  'All',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller'
] as const;

const SearchViewComponent: React.FC = () => {
  const { addAnimeToWatching, isMediaInWatchingList, getUserScore, getUserStatus } = useAnime();
  const { openScoreModal, openStatusModal, openDetailModal, showToast } = useUIActions();
  const { discoverGenreRequest } = useUIState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedAnimeItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasNextPage, setSearchHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMeta, setSearchMeta] = useState<{
    correctedFrom?: string;
    suggestedQuery?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFetchingMoreRef = useRef(false);

  // Search Bar Animation States
  const [isFocused, setIsFocused] = useState(false);
  const PLACEHOLDER_SUGGESTIONS = [
    'Search anime on AniList...',
    'Try "Solo Leveling"...',
    'Try "Frieren"...',
    'Try "Jujutsu Kaisen"...',
    'Try "Bleach"...',
    'Try "One Piece"...',
    'Try "Attack on Titan"...'
  ];
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  // Directly rotate placeholder without triggering component re-renders every 3.2s
  useEffect(() => {
    if (query) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % PLACEHOLDER_SUGGESTIONS.length;
      if (inputRef.current) {
        inputRef.current.placeholder = PLACEHOLDER_SUGGESTIONS[idx];
      }
    }, 3200);
    return () => clearInterval(interval);
  }, [query]);

  // Discover / Recommendations state
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>('TRENDING');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [discoverList, setDiscoverList] = useState<NormalizedAnimeItem[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverHasNextPage, setDiscoverHasNextPage] = useState(true);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverRetryCount, setDiscoverRetryCount] = useState(0);

  const handleRetryDiscover = () => {
    setDiscoverRetryCount((c) => c + 1);
  };

  // Genre chips desktop scroll controls
  const genreScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollArrows = () => {
    const el = genreScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  };

  const scrollGenres = (direction: 'left' | 'right') => {
    const el = genreScrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -150 : 150;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(updateScrollArrows, 200);
  };

  const isSearchActive = query.trim().length > 0;

  // Horizontal mouse wheel scrolling for genre chips
  useEffect(() => {
    if (isSearchActive) return;

    const el = genreScrollRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
          const atEnd = el.scrollLeft >= maxScroll && e.deltaY > 0;
          if (!atStart && !atEnd) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                updateScrollArrows();
                rafId = null;
              });
            }
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    updateScrollArrows();

    const timer = setTimeout(updateScrollArrows, 150);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      clearTimeout(timer);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isSearchActive]);

  // Handle Discover mode switch
  const handleModeChange = (mode: DiscoverMode) => {
    if (mode === discoverMode) return;
    setDiscoverMode(mode);
    setDiscoverPage(1);
    setDiscoverList([]);
    setDiscoverHasNextPage(true);
    setDiscoverError(null);
  };

  // Handle Genre selection with 2-genre multi-select & toggle off
  const handleGenreSelect = (genre: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e?.currentTarget) {
      e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (genre === 'All') {
      if (selectedGenres.length === 0) return;
      setSelectedGenres([]);
      setDiscoverPage(1);
      setDiscoverList([]);
      setDiscoverHasNextPage(true);
      setDiscoverError(null);
      return;
    }

    let newGenres: string[];
    if (selectedGenres.includes(genre)) {
      // Toggle off / deselect
      newGenres = selectedGenres.filter((g) => g !== genre);
    } else {
      // Allow up to 2 genres; if already 2, drop oldest and add this one
      if (selectedGenres.length >= 2) {
        newGenres = [selectedGenres[1], genre];
      } else {
        newGenres = [...selectedGenres, genre];
      }
    }

    setSelectedGenres(newGenres);
    setDiscoverPage(1);
    setDiscoverList([]);
    setDiscoverHasNextPage(true);
    setDiscoverError(null);
  };

  const displayedGenres = React.useMemo(() => {
    const base = GENRES as readonly string[];
    const extra = selectedGenres.filter((g) => !base.includes(g));
    if (extra.length === 0) return base;
    return ['All', ...extra, ...base.slice(1)];
  }, [selectedGenres]);

  // Apply genre filter requested from AnimeDetailModal
  useEffect(() => {
    if (!discoverGenreRequest) return;
    const targetGenre = discoverGenreRequest.genre;
    setQuery('');
    setSelectedGenres([targetGenre]);
    setDiscoverPage(1);
    setDiscoverList([]);
    setDiscoverHasNextPage(true);
    setDiscoverError(null);

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    const timer = setTimeout(() => {
      const container = genreScrollRef.current;
      if (!container) return;
      const chip = container.querySelector<HTMLElement>(`[data-genre="${CSS.escape(targetGenre)}"]`);
      if (chip) {
        chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      setTimeout(updateScrollArrows, 220);
    }, 60);

    return () => clearTimeout(timer);
  }, [discoverGenreRequest]);

  // Fetch discover anime when mounting, switching mode, or changing genres
  useEffect(() => {
    if (isSearchActive) return;

    let isCancelled = false;

    const fetchDiscover = async () => {
      setIsDiscoverLoading(true);
      setDiscoverError(null);
      try {
        const data = await anilistService.getDiscoverAnime(
          discoverMode,
          1,
          15,
          selectedGenres
        );
        if (!isCancelled) {
          setDiscoverList(data.results);
          setDiscoverHasNextPage(data.hasNextPage);
          setDiscoverPage(1);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setDiscoverError(err instanceof Error ? err.message : 'Could not load discover titles.');
        }
      } finally {
        if (!isCancelled) {
          setIsDiscoverLoading(false);
        }
      }
    };

    fetchDiscover();

    return () => {
      isCancelled = true;
    };
  }, [discoverMode, selectedGenres, isSearchActive, discoverRetryCount]);

  // Debounced search (300ms) with network-level AbortController and min-character threshold
  useEffect(() => {
    const trimmed = query.trim();

    // 1. Min character threshold: Do not query API for 1-2 character inputs
    if (!trimmed || trimmed.length < 3) {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
      setResults([]);
      setSearchMeta(null);
      setIsLoading(false);
      setError(null);
      setHasSearched(false);
      setSearchPage(1);
      setSearchHasNextPage(false);
      return;
    }

    // Do NOT set isLoading = true synchronously on keydown to prevent UI flicker / jitter!
    setError(null);

    const timer = setTimeout(async () => {
      // Abort previous in-flight HTTP request if still running
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;

      // Only trigger loading state when debounce timer fires and request actually starts
      setIsLoading(true);

      try {
        const response = await anilistService.searchAnimeWithFuzzyFallback(
          trimmed,
          1,
          15,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setResults(response.results);
          setSearchHasNextPage(response.hasNextPage);
          setSearchMeta({
            correctedFrom: response.correctedFrom,
            suggestedQuery: response.suggestedQuery
          });
          setHasSearched(true);
          setSearchPage(1);
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : '';
          if (msg !== 'AbortError') {
            setError(msg || 'Search failed. Please try again.');
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
        searchAbortControllerRef.current = null;
      }
    };
  }, [query]);

  // Infinite Scroll & Load More pagination trigger
  const handleLoadMore = async () => {
    if (isFetchingMoreRef.current || isLoadingMore || isLoading || isDiscoverLoading) {
      return;
    }

    if (isSearchActive) {
      if (!searchHasNextPage) return;
      isFetchingMoreRef.current = true;
      setIsLoadingMore(true);
      const nextPage = searchPage + 1;
      try {
        const actualQuery = searchMeta?.suggestedQuery || query.trim();
        const response = await anilistService.searchAnime(actualQuery, nextPage, 15);
        setResults((prev) => {
          const existingIds = new Set(prev.map((i) => i.mediaId));
          const unique = response.results.filter((i) => !existingIds.has(i.mediaId));
          return [...prev, ...unique];
        });
        setSearchPage(nextPage);
        setSearchHasNextPage(response.hasNextPage);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to load more titles.', 'error');
      } finally {
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    } else {
      if (!discoverHasNextPage) return;
      isFetchingMoreRef.current = true;
      setIsLoadingMore(true);
      const nextPage = discoverPage + 1;
      try {
        const data = await anilistService.getDiscoverAnime(
          discoverMode,
          nextPage,
          15,
          selectedGenres
        );
        setDiscoverList((prev) => {
          const existingIds = new Set(prev.map((i) => i.mediaId));
          const unique = data.results.filter((i) => !existingIds.has(i.mediaId));
          return [...prev, ...unique];
        });
        setDiscoverPage(nextPage);
        setDiscoverHasNextPage(data.hasNextPage);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to load more anime.', 'error');
      } finally {
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = remaining < 140;

    const canLoad = isSearchActive
      ? searchHasNextPage && !isLoading && !isLoadingMore
      : discoverHasNextPage && !isDiscoverLoading && !isLoadingMore;

    if (isNearBottom && canLoad && !isFetchingMoreRef.current) {
      handleLoadMore();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Top Gradient Fade Layer (Hardware-optimized, zero backdrop-filter) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '70px',
          pointerEvents: 'none',
          zIndex: 30,
          background:
            'linear-gradient(to bottom, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 85%, transparent) 40%, transparent 100%)'
        }}
      />

      {/* Floating Pill Search Bar Dock */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 16px',
          pointerEvents: 'none',
          zIndex: 40
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: '388px',
            height: '46px',
            borderRadius: '9999px',
            backgroundColor: 'var(--color-card)',
            border: isFocused
              ? '1px solid var(--color-primary)'
              : '1px solid var(--color-border)',
            boxShadow: isFocused
              ? '0 10px 24px -2px rgba(0, 0, 0, 0.35), 0 0 0 2px color-mix(in srgb, var(--color-primary) 15%, transparent)'
              : '0 8px 24px -2px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 16px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isFocused ? 'scale(1.01)' : 'scale(1)'
          }}
        >
          {/* Animated Search / Loading Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFocused ? 'var(--color-primary)' : 'var(--color-tertiary)',
              transform: isFocused ? 'scale(1.15) rotate(-8deg)' : 'scale(1) rotate(0deg)',
              transition: 'all 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
              flexShrink: 0
            }}
          >
            {isLoading ? (
              <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />
            ) : (
              <Search size={16} strokeWidth={2} />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER_SUGGESTIONS[0]}
            aria-label="Search anime on AniList"
            autoFocus
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '13px',
              fontWeight: 400,
              color: 'var(--color-primary)',
              lineHeight: 1
            }}
          />

          {/* Animated Spring Clear Button */}
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSearchMeta(null);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="clear-search-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-badge-bg)',
                color: 'var(--color-secondary)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'transform 0.15s ease, color 0.15s ease'
              }}
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          ) : null}

          {/* Laser Loading Beam when searching AniList API */}
          {isLoading && (
            <div
              className="search-loading-beam"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '60%',
                height: '2px',
                background:
                  'linear-gradient(90deg, transparent, var(--color-primary), color-mix(in srgb, var(--color-primary) 50%, transparent), transparent)',
                boxShadow: '0 0 8px color-mix(in srgb, var(--color-primary) 40%, transparent)',
                zIndex: 2
              }}
            />
          )}
        </div>
      </div>

      {/* Main Content Area with Infinite Scroll */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '70px 16px 76px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {isSearchActive ? (
          /* SEARCH MODE */
          <>
            {/* Auto-correction Notice Banner */}
            {searchMeta?.correctedFrom && results.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-badge-bg)',
                  border: '1px solid var(--color-border)',
                  fontSize: '12px',
                  color: 'var(--color-secondary)'
                }}
              >
                <Sparkles size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span>
                  Showing results for <strong style={{ color: 'var(--color-primary)' }}>"{searchMeta.suggestedQuery}"</strong>{' '}
                  <span style={{ opacity: 0.8 }}>(corrected from "{searchMeta.correctedFrom}")</span>
                </span>
              </div>
            ) : null}

            {isLoading && results.length === 0 ? (
              <>
                <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <Skeleton width="52px" height="74px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton width="70%" height="15px" />
                    <Skeleton width="40%" height="12px" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <Skeleton width="52px" height="74px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton width="60%" height="15px" />
                    <Skeleton width="35%" height="12px" />
                  </div>
                </div>
              </>
            ) : error ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'var(--color-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border)',
                  margin: 'auto 0'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-error-bg)',
                    color: 'var(--color-error)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <AlertCircle size={18} />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-secondary)' }}>{error}</p>
              </div>
            ) : hasSearched && results.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'var(--color-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-badge-bg)',
                    color: 'var(--color-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Search size={18} strokeWidth={1.8} />
                </div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)', margin: 0 }}>
                    No exact match found
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--color-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    No anime titles matched "{query}".
                  </p>
                </div>

                {searchMeta?.suggestedQuery ? (
                  <button
                    onClick={() => setQuery(searchMeta.suggestedQuery!)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-primary-inverse)',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginTop: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Did you mean: "{searchMeta.suggestedQuery}"?</span>
                  </button>
                ) : null}
              </div>
            ) : query.trim().length > 0 && query.trim().length < 3 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--color-tertiary)'
                }}
              >
                <Search size={22} strokeWidth={1.5} style={{ opacity: 0.6 }} />
                <span style={{ fontSize: '13px' }}>Type at least 3 characters to search...</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  opacity: isLoading ? 0.6 : 1,
                  transition: 'opacity 0.2s ease'
                }}
              >
                {results.map((anime) => (
                  <SearchResultCard
                    key={anime.mediaId}
                    anime={anime}
                    isAlreadyAdded={isMediaInWatchingList(anime.mediaId)}
                    userStatus={getUserStatus(anime.mediaId, isMediaInWatchingList(anime.mediaId) ? 'CURRENT' : anime.userStatus)}
                    userScore={getUserScore(anime.mediaId, anime.userScore ?? null)}
                    onOpenScoreModal={openScoreModal}
                    onOpenStatusModal={openStatusModal}
                    onOpenDetailModal={openDetailModal}
                    onAdd={addAnimeToWatching}
                  />
                ))}

                {/* Infinite Scroll Bottom Controls for Search */}
                {isLoadingMore ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px 0',
                      color: 'var(--color-tertiary)',
                      fontSize: '12px'
                    }}
                  >
                    <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span>Loading more titles...</span>
                  </div>
                ) : searchHasNextPage ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px 0' }}>
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 16px',
                        borderRadius: '20px',
                        backgroundColor: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-secondary)',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                        e.currentTarget.style.color = 'var(--color-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-secondary)';
                      }}
                    >
                      <span>Load More</span>
                    </button>
                  </div>
                ) : results.length > 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '16px 0 8px 0',
                      color: 'var(--color-tertiary)',
                      fontSize: '11px',
                      letterSpacing: '0.02em'
                    }}
                  >
                    Showing all {results.length} results
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : (
          /* DISCOVER / RECOMMENDATIONS MODE (When query is empty) */
          <>
            {/* Discover Header with 3-Mode Segmented Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 2px 6px 2px',
                flexShrink: 0,
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  Discover
                </span>
              </div>

              {/* 3-Mode Toggle: Trending | Top Rated | Upcoming */}
              <div
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '2px',
                  overflow: 'hidden',
                  userSelect: 'none'
                }}
              >
                {/* Animated Sliding Pill */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '2px',
                    bottom: '2px',
                    left: '2px',
                    width: 'calc((100% - 4px) / 3)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-primary)',
                    transform: `translateX(${
                      discoverMode === 'TRENDING' ? '0%' : discoverMode === 'TOP_RATED' ? '100%' : '200%'
                    })`,
                    transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                />

                <button
                  type="button"
                  onClick={() => handleModeChange('TRENDING')}
                  aria-pressed={discoverMode === 'TRENDING'}
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    fontWeight: discoverMode === 'TRENDING' ? 600 : 400,
                    color:
                      discoverMode === 'TRENDING'
                        ? 'var(--color-primary-inverse)'
                        : 'var(--color-secondary)',
                    cursor: 'pointer',
                    transition: 'color 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Flame size={11} />
                  <span>Trending</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange('TOP_RATED')}
                  aria-pressed={discoverMode === 'TOP_RATED'}
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    fontWeight: discoverMode === 'TOP_RATED' ? 600 : 400,
                    color:
                      discoverMode === 'TOP_RATED'
                        ? 'var(--color-primary-inverse)'
                        : 'var(--color-secondary)',
                    cursor: 'pointer',
                    transition: 'color 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Star size={11} />
                  <span>Top Rated</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange('UPCOMING')}
                  aria-pressed={discoverMode === 'UPCOMING'}
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11px',
                    fontWeight: discoverMode === 'UPCOMING' ? 600 : 400,
                    color:
                      discoverMode === 'UPCOMING'
                        ? 'var(--color-primary-inverse)'
                        : 'var(--color-secondary)',
                    cursor: 'pointer',
                    transition: 'color 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Calendar size={11} />
                  <span>Upcoming</span>
                </button>
              </div>
            </div>

            {/* Horizontal Scrollable Minimalist Genre Chips with Desktop Scroll Controls */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                minWidth: 0,
                flexShrink: 0
              }}
            >
              {/* Left Arrow Button */}
              {canScrollLeft && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'linear-gradient(to right, var(--color-bg) 70%, transparent)',
                    paddingRight: '14px',
                    pointerEvents: 'none'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => scrollGenres('left')}
                    aria-label="Scroll left"
                    title="Previous genres"
                    style={{
                      pointerEvents: 'auto',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      boxShadow: '0 2px 5px rgba(0, 0, 0, 0.25)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <ChevronLeft size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Scrollable Track */}
              <div
                ref={genreScrollRef}
                onScroll={updateScrollArrows}
                className="no-scrollbar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  scrollBehavior: 'smooth',
                  padding: '2px 0 6px 0',
                  width: '100%',
                  minWidth: 0
                }}
              >
                {displayedGenres.map((genre) => {
                  const isSelected = genre === 'All' ? selectedGenres.length === 0 : selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      data-genre={genre}
                      onClick={(e) => handleGenreSelect(genre, e)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: isSelected ? 600 : 400,
                        whiteSpace: 'nowrap',
                        border: isSelected
                          ? '1px solid var(--color-primary)'
                          : '1px solid var(--color-border)',
                        backgroundColor: isSelected
                          ? 'var(--color-primary)'
                          : 'var(--color-card)',
                        color: isSelected
                          ? 'var(--color-primary-inverse)'
                          : 'var(--color-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        lineHeight: 1.2,
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                          e.currentTarget.style.color = 'var(--color-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                          e.currentTarget.style.color = 'var(--color-secondary)';
                        }
                      }}
                    >
                      <span>{genre}</span>
                      {isSelected && genre !== 'All' ? (
                        <span
                          style={{
                            fontSize: '11px',
                            lineHeight: 1,
                            opacity: 0.85,
                            fontWeight: 700
                          }}
                        >
                          ×
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Right Arrow Button */}
              {canScrollRight && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'linear-gradient(to left, var(--color-bg) 70%, transparent)',
                    paddingLeft: '14px',
                    pointerEvents: 'none'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => scrollGenres('right')}
                    aria-label="Scroll right"
                    title="More genres"
                    style={{
                      pointerEvents: 'auto',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      boxShadow: '0 2px 5px rgba(0, 0, 0, 0.25)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <ChevronRight size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>

            {/* Recommendations List */}
            {isDiscoverLoading && discoverList.length === 0 ? (
              <>
                <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <Skeleton width="52px" height="74px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton width="65%" height="15px" />
                    <Skeleton width="45%" height="12px" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <Skeleton width="52px" height="74px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton width="75%" height="15px" />
                    <Skeleton width="40%" height="12px" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', padding: '10px', borderRadius: '14px', backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <Skeleton width="52px" height="74px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton width="55%" height="15px" />
                    <Skeleton width="35%" height="12px" />
                  </div>
                </div>
              </>
            ) : discoverError && discoverList.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  backgroundColor: 'var(--color-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
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
                  <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)', margin: 0 }}>
                    Failed to Load Discover Titles
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--color-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    {discoverError}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetryDiscover}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={13} />
                  <span>Try Again</span>
                </Button>
              </div>
            ) : discoverList.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'var(--color-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-badge-bg)',
                    color: 'var(--color-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Search size={18} strokeWidth={1.8} />
                </div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)', margin: 0 }}>
                    No anime found
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--color-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    No {discoverMode === 'UPCOMING' ? 'upcoming ' : ''}titles found for {selectedGenres.length > 0 ? `genre(s) "${selectedGenres.join(' + ')}"` : 'this category'}.
                  </p>
                </div>
                {selectedGenres.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleGenreSelect('All')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-primary-inverse)',
                      fontSize: '11px',
                      fontWeight: 500,
                      marginTop: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Reset to All Genres
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {discoverList.map((anime) => (
                  <SearchResultCard
                    key={anime.mediaId}
                    anime={anime}
                    isAlreadyAdded={isMediaInWatchingList(anime.mediaId)}
                    userStatus={getUserStatus(anime.mediaId, isMediaInWatchingList(anime.mediaId) ? 'CURRENT' : anime.userStatus)}
                    userScore={getUserScore(anime.mediaId, anime.userScore ?? null)}
                    onOpenScoreModal={openScoreModal}
                    onOpenStatusModal={openStatusModal}
                    onOpenDetailModal={openDetailModal}
                    onAdd={addAnimeToWatching}
                  />
                ))}

                {/* Infinite Scroll Bottom Controls for Discover */}
                {isLoadingMore ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px 0',
                      color: 'var(--color-tertiary)',
                      fontSize: '12px'
                    }}
                  >
                    <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span>Loading more anime...</span>
                  </div>
                ) : discoverHasNextPage ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px 0' }}>
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 16px',
                        borderRadius: '20px',
                        backgroundColor: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-secondary)',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                        e.currentTarget.style.color = 'var(--color-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-secondary)';
                      }}
                    >
                      <span>Load More</span>
                    </button>
                  </div>
                ) : discoverList.length > 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '16px 0 8px 0',
                      color: 'var(--color-tertiary)',
                      fontSize: '11px',
                      letterSpacing: '0.02em'
                    }}
                  >
                    Showing all {discoverList.length} titles
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const SearchView = React.memo(SearchViewComponent);
