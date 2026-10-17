<div align="center">
  <img src="public/icons/icon128.png" alt="AniFlow Logo" width="84" height="84" />

  # AniFlow

  **Fluid & ambient anime tracker for AniList — built as a fast, lightweight Manifest V3 browser extension.**

  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-02A9FF?style=flat-square)
  ![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square)
  ![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square)
</div>

---

## ✨ Features

- **⚡ Instant Stale-While-Revalidate (SWR) Sync**
  Opens in `0ms` from local cache while silently revalidating your watching list and profile statistics in the background.
- **📺 Airing Countdowns & Unwatched Episode Indicators**
  Automatically sorts your *Currently Watching* list by upcoming broadcast schedule and highlights unwatched aired episodes (`● Ep X Out` / `● N New Eps`) right next to the airing timer.
- **🎉 Optimistic `+1` Progress & Micro-Celebrations**
  Increment episode or chapter progress with a single click, complete with instant UI updates, automatic rollback on network errors, and a celebration overlay when completing a series.
- **🔍 Smart Search & Multi-Genre Discover**
  Includes typo-tolerant fuzzy search fallback, popularity-aware relevance ranking, and a 3-mode Discover feed (*Trending*, *Top Rated*, *Upcoming*) with multi-genre filtering.
- **🗂️ Rich Media Details & Relation History Stack**
  Inspect synopses, studios, airing status, main characters, enlargeable cover art, clickable genre tags, and navigate seamlessly back and forth across *Prequels*, *Sequels*, and *Side Stories*.
- **📊 Profile Insights & List Drill-Down**
  View your total episodes watched, days watched, top genres, and browse/edit your *Watching*, *Completed*, *Planning*, and *Paused* lists in either **List** or **Poster Grid** view.
- **🎨 Ambient Aura UI & Theme Support**
  Dynamic per-card ambient glow derived from each anime's cover art, auto-hiding scrollbars, and full **Dark**, **Light**, and **System** theme support.

---

## 🚀 Installation (Load Unpacked)

### 1. Clone & Build
```bash
git clone https://github.com/ilkeraydinn/aniflow.git
cd aniflow
npm install
npm run build
```

### 2. Load into Chrome / Brave / Edge
1. Open your browser and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select the generated **`dist`** folder inside the `aniflow` project directory.
5. Pin **AniFlow** to your browser toolbar and sign in with your AniList account!

---

## 🛠️ Development Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite development server for UI preview |
| `npm run build` | Run TypeScript type-checking (`tsc`) and build production extension into `dist/` |
| `npm run preview` | Preview the production build locally |

---

## 🔒 Security & Privacy

- **Direct AniList OAuth 2.0:** Authentication communicates strictly with `https://anilist.co` and `https://graphql.anilist.co` using CSRF `state` verification.
- **Zero Third-Party Servers:** Your AniList access token is stored exclusively on your device inside `chrome.storage.local` and is never sent to any external analytics or proxy server.
- **Complete Session Cleanup:** Logging out atomically purges your token, profile, and all cached status lists from local storage.

---

## ⚠️ Disclaimer

**AniFlow** is an unofficial, open-source third-party extension and is **not** affiliated with, maintained, authorized, or endorsed by **AniList**. All anime/manga metadata and cover artwork are provided by the official [AniList GraphQL API](https://github.com/AniList/ApiV2-GraphQL-Docs).
