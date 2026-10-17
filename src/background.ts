// Manifest V3 Background Service Worker
const CLIENT_ID = '52186';

function getSessionStore(): chrome.storage.StorageArea {
  return chrome.storage.session || chrome.storage.local;
}

// Listen for messages from popup to initiate auth flow
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from any external sender or malformed payloads
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'START_AUTH') {
    startTabAuthFlow()
      .then(() => sendResponse({ success: true, started: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response for flow launch confirmation
  }
  return false;
});

// In-memory guard to prevent duplicate processing and distinguish programmatic close from user cancellation
const processingTabs = new Set<number>();

/**
 * Strictly validates AniList OAuth callback URLs against phishing, open-redirect,
 * or arbitrary domain token injection attacks.
 */
function isValidAniListOAuthCallback(rawUrl: string): {
  isValid: boolean;
  token?: string;
  state?: string;
  error?: string;
} {
  try {
    const parsed = new URL(rawUrl);

    // 1. Strict Origin & Path Check:
    // Allow only AniList's official OAuth callback domain/paths (https://anilist.co/api/v2/oauth/pin)
    const isAniListHost =
      parsed.origin === 'https://anilist.co' &&
      (parsed.pathname.startsWith('/api/v2/oauth/') || parsed.pathname.startsWith('/oauth/'));

    if (!isAniListHost) {
      return { isValid: false };
    }

    // 2. OAuth 2.0 Implicit Grant: tokens and state are returned in the hash fragment (#) or query params (?)
    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
    const searchParams = parsed.searchParams;

    // Extract state parameter for CSRF mitigation
    const state = hashParams.get('state') || searchParams.get('state') || undefined;

    // Check for authorization error / denial
    const errorParam = hashParams.get('error') || searchParams.get('error');
    if (errorParam) {
      return { isValid: true, error: errorParam, state };
    }

    // Check for access token
    const token = hashParams.get('access_token') || searchParams.get('access_token');
    if (token && token.trim().length > 0) {
      return { isValid: true, token: token.trim(), state };
    }

    return { isValid: false };
  } catch {
    // Malformed URLs (about:blank, data:, etc.) are ignored safely
    return { isValid: false };
  }
}

async function fetchAndSaveUserProfile(token: string): Promise<void> {
  const query = `
    query ViewerQuery {
      Viewer {
        id
        name
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
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) return;
    const json = await res.json();
    const viewer = json?.data?.Viewer;
    if (!viewer) return;

    const statusMap: Record<string, number> = {};
    viewer.statistics?.anime?.statuses?.forEach((item: { status: string; count: number }) => {
      statusMap[item.status] = item.count;
    });

    const episodesWatched = viewer.statistics?.anime?.episodesWatched ?? 0;
    const minutesWatched = viewer.statistics?.anime?.minutesWatched ?? 0;
    const daysWatched = Math.round((minutesWatched / 1440) * 10) / 10;
    const topGenres = (viewer.statistics?.anime?.genres || []).map((g: { genre: string; count: number; minutesWatched?: number }) => ({
      genre: g.genre,
      count: g.count,
      minutesWatched: g.minutesWatched
    }));

    const profile = {
      id: viewer.id,
      name: viewer.name,
      avatar: {
        large: viewer.avatar?.large,
        medium: viewer.avatar?.medium
      },
      stats: {
        watching: statusMap['CURRENT'] ?? 0,
        completed: statusMap['COMPLETED'] ?? 0,
        planning: statusMap['PLANNING'] ?? 0,
        paused: statusMap['PAUSED'] ?? 0,
        episodesWatched,
        minutesWatched,
        daysWatched,
        topGenres
      }
    };

    await chrome.storage.local.set({
      anilist_user_profile: profile,
      anilist_profile_cached_at: Date.now()
    });
  } catch {
    // If background fetch fails, popup will fetch it upon reopening
  }
}

async function startTabAuthFlow(clientId: string = CLIENT_ID): Promise<void> {
  const sessionStore = getSessionStore();
  const state = crypto.randomUUID();
  const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token&state=${encodeURIComponent(state)}`;

  // If a tab is already open from a previous attempt, close it first
  try {
    const existing = await sessionStore.get(['auth_tab_id']);
    if (existing && existing.auth_tab_id) {
      processingTabs.delete(existing.auth_tab_id as number);
      await chrome.tabs.remove(existing.auth_tab_id as number).catch(() => {});
    }
  } catch {
    // ignore
  }

  const tab = await chrome.tabs.create({ url: authUrl });
  if (!tab || !tab.id) {
    await sessionStore.remove(['auth_tab_id', 'oauth_state']).catch(() => {});
    throw new Error('Could not open AniList authorization tab.');
  }

  // Persist tab ID and expected state in session storage so it survives Service Worker dormancy
  await sessionStore.set({
    auth_tab_id: tab.id,
    oauth_state: state
  });
}

// Top-level listener: Persists across Service Worker lifecycle suspensions
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, updatedTab) => {
  const url = changeInfo.url || updatedTab.url;
  if (!url) {
    return;
  }

  // Prevent duplicate concurrent handling of the same tab
  if (processingTabs.has(tabId)) {
    return;
  }

  const sessionStore = getSessionStore();
  const stored = await sessionStore.get(['auth_tab_id', 'oauth_state']);
  if (!stored || stored.auth_tab_id !== tabId) {
    return;
  }

  const authResult = isValidAniListOAuthCallback(url);
  if (!authResult.isValid) {
    return;
  }

  // Lock this tab to prevent re-entrancy and distinguish from user closure
  processingTabs.add(tabId);

  const expectedState = stored.oauth_state as string | undefined;

  // Clean up session state immediately to prevent duplicate processing
  await sessionStore.remove(['auth_tab_id', 'oauth_state']).catch(() => {});

  // Close the authorization tab immediately
  chrome.tabs.remove(tabId).catch(() => {});

  // CSRF Check: Verify returned state matches our cryptographic nonce if state was configured
  if (expectedState && authResult.state !== expectedState) {
    chrome.runtime.sendMessage({
      type: 'AUTH_ERROR',
      error: 'OAuth security validation failed: state mismatch (potential CSRF).'
    }).catch(() => {});
    return;
  }

  // User denied or error returned from AniList
  if (authResult.error) {
    const errorMsg =
      authResult.error === 'access_denied'
        ? 'AniList authorization was cancelled or denied.'
        : `AniList authorization failed: ${authResult.error}`;
    chrome.runtime.sendMessage({
      type: 'AUTH_ERROR',
      error: errorMsg
    }).catch(() => {});
    return;
  }

  // Valid token received
  if (authResult.token) {
    const token = authResult.token;

    try {
      await chrome.storage.local.set({
        anilist_token: token,
        anilist_is_demo_mode: false
      });

      // Background profile fetch so session is fully initialized even if popup was closed
      await fetchAndSaveUserProfile(token);

      chrome.runtime.sendMessage({
        type: 'AUTH_SUCCESS',
        token
      }).catch(() => {});
    } catch {
      chrome.runtime.sendMessage({
        type: 'AUTH_ERROR',
        error: 'Failed to save authentication token.'
      }).catch(() => {});
    }
  }
});

// Top-level listener: Handles user closing the auth tab before completion
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // If the tab was closed programmatically upon auth success/failure, do not treat as user cancellation
  if (processingTabs.has(tabId)) {
    processingTabs.delete(tabId);
    return;
  }

  const sessionStore = getSessionStore();
  const stored = await sessionStore.get(['auth_tab_id']);
  if (stored && stored.auth_tab_id === tabId) {
    await sessionStore.remove(['auth_tab_id', 'oauth_state']).catch(() => {});
    chrome.runtime.sendMessage({
      type: 'AUTH_ERROR',
      error: 'Authorization tab was closed before completing.'
    }).catch(() => {});
  }
});
