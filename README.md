# GlobeMeta

A **3D globe** for exploring country trending music (**YouTube** search + regional bias), a **Crystal Ball** session with webcam mood → music (YouTube playback + **YouTube playlists** on your account), **Artist shuffle** (random tracks by any artist from the sidebar), a **home** mini-game, and an optional **Luffa** chat bot that mirrors many of those flows.

## Quick start

```bash
# Install frontend deps (repo root)
npm install

# API server deps + start (second terminal)
cd server && npm install && node index.js   # default http://127.0.0.1:4000
```

```bash
# Frontend (proxies /api → server)
npm run dev
```

Copy **`server/.env.example`** → **`server/.env`** and fill in what you need (see **Environment variables** below). For **creating playlists** (globe + Crystal), add **Google OAuth** credentials and run **`cd server && node youtube-auth.js`** once to obtain **`YOUTUBE_OAUTH_REFRESH_TOKEN`**. If Google returns **403 access_denied**, add your Gmail under **OAuth consent screen → Test users** while the app is in **Testing**.

**Production build:** `npm run build` then `npm run preview` — note that **`vite preview`** uses a proxy for `/api` in this repo so API calls still reach your local server when configured.

---

## Environment variables

There are **two** env locations:

| File | Used by |
|------|---------|
| **`server/.env`** | Express API (`cd server && node index.js`) |
| **`.env`** at the **repo root** (optional) | Vite frontend — only variables prefixed with **`VITE_`** are exposed to the browser |

Annotated templates: **`server/.env.example`** (API) and **`.env.example`** at the repo root (frontend). **Never commit** real `.env` files or tokens.

### Minimum for core app (globe, Crystal Ball, Artist shuffle, country panel)

**In `server/.env`:**

- **`YOUTUBE_API_KEY`** — Create a project in [Google Cloud](https://console.cloud.google.com/), enable **YouTube Data API v3**, create an **API key**.  
  Needed for: country trending search, Crystal YouTube picks, **Artist shuffle** (`/api/youtube-random-by-artist`), and Luffa country flows.

That is the **only required** server variable for those features.

**Frontend API URL:** For local dev with **`npm run dev`**, you can **omit** **`VITE_API_URL`**: the app calls **`/api/...`** and Vite proxies to the server (see `vite.config.ts`, default target `http://127.0.0.1:4000`).  
Set **`VITE_API_URL=https://your-api-host`** in the **root** `.env` when the UI is hosted separately and must talk to a public API (e.g. production).

### YouTube playlists (“Create YouTube playlist” on globe / Crystal)

**In `server/.env`**, add OAuth (after **`node youtube-auth.js`**):

- **`GOOGLE_CLIENT_ID`**
- **`GOOGLE_CLIENT_SECRET`**
- **`YOUTUBE_OAUTH_REFRESH_TOKEN`**

Without these, **search and playback still work**; **creating** playlists on your YouTube account does not.

### Optional (server)

| Variable | Purpose |
|----------|---------|
| **`YOUTUBE_API_KEY_2`** | Second API key (e.g. another GCP project). Used automatically when the first key hits **quota** (`quotaExceeded`). |
| **`GLOBE_COUNTRY_CACHE_MS`** | How long to reuse `/api/country` results before calling YouTube again (ms). Default **86400000** (24h). Minimum enforced in code: 60s. |
| **`PUBLIC_APP_URL`** | Base URL in Luffa link text (default in code: deployed app URL). No trailing slash. |
| **`PORT`** | API port (default **`4000`**). |

### Luffa bot (only if you use the bot)

| Variable | Purpose |
|----------|---------|
| **`LUFFA_BOT_SECRET`** | **Required** for polling `apibot.luffa.im` and sending replies (robot key from Luffa). |
| **`CLAUDE_API_KEY`** | Optional; powers `parseUserIntent`, `generateReply`, digest copy, etc. Without it, the bot uses short canned fallbacks. |
| **`LUFFA_BROADCAST_GROUP_UID`** | Optional; if set, **broadcasts** (digest, alerts, battles, playlist notifications) go to this **group**. If unset, broadcasts go to all **known DM users** (anyone who has messaged the bot). |
| **`LUFFA_POLL_MS`** | Poll interval in ms (default ~**700**; clamped **250–3000**). |
| **`LUFFA_DEBUG`** | Set to **`1`** to log every poll. |
| **`LUFFA_BATTLE_SHOWCASE_MS`** | Length of **`SHOWCASE-BATTLE`** poll (ms). Default **20000** (20s); minimum **5000**. Scheduled battles still use a long window. |

### Spotify (optional)

Not required for globe, Crystal YouTube, Artist shuffle, or **YouTube** playlists.

| Variable | Purpose |
|----------|---------|
| **`SPOTIFY_CLIENT_ID`**, **`SPOTIFY_CLIENT_SECRET`**, **`SPOTIFY_REFRESH_TOKEN`** | Luffa **mood** matching, **`SHOWCASE-MOOD`**, optional **`/api/crystal-youtube-to-spotify`**. |
| **`CRYSTAL_SPOTIFY_LOOKUP_MS`**, **`SPOTIFY_COUNTRY_GAP_MS`** | Tune search timing / backoff when Spotify is enabled. |

### Quota reminder

- **YouTube Data API:** Each **`search.list`** costs **100** quota units; default daily quota is often **10,000**. A second key (**`YOUTUBE_API_KEY_2`**) and longer **`GLOBE_COUNTRY_CACHE_MS`** reduce pressure.
- **Spotify:** Heavy use can return **HTTP 429**; the server includes backoff helpers.

### Quick reference table

| Variable | Required for |
|----------|----------------|
| `YOUTUBE_API_KEY` | Globe, Crystal, Artist shuffle, Luffa country data |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `YOUTUBE_OAUTH_REFRESH_TOKEN` | Creating **YouTube** playlists from the app |
| `VITE_API_URL` | Only when the frontend is **not** using same-origin `/api` + proxy |
| `LUFFA_BOT_SECRET` | Luffa bot |
| `CLAUDE_API_KEY` | Rich Luffa AI replies (optional) |
| `SPOTIFY_*` | Luffa mood + optional Crystal→Spotify matching only |

---

## App routes (frontend)

- **`/`** — Home (Piano Tiles background + Enter)
- **`/globe`** — Globe Mixer: spin globe, click countries, trending YouTube picks, create **YouTube** playlist
- **`/crystal`** — Crystal Ball: webcam + mood-driven music, archive session, **YouTube** playlist from session videos
- **Sidebar (all globe layout pages)** — **Artist shuffle** (disc icon under Crystal): enter an artist, random YouTube audio; play/pause, skip +15s, next random, stop session
- **`/archive`** — Lists saved Globe playlists and Crystal Ball sessions from the server (`GET /api/archive`)

---

## Luffa bot (polling)

Luffa uses **polling**, not webhooks. The server calls `https://apibot.luffa.im/robot/receive` on an interval and replies via `robot/send` (DM) or `robot/sendGroup` (group).

**Setup:** Set `LUFFA_BOT_SECRET` in `server/.env`. For AI intents and richer replies, set **`CLAUDE_API_KEY`**. Without Claude, the bot uses short canned fallbacks.

**Run:** `cd server && node index.js`. You should see Luffa polling logs; when the inbox is empty, an **idle heartbeat** appears about every **15 seconds**. For **every-poll** logs, set `LUFFA_DEBUG=1`. Replies are processed **one at a time** so bursts of DMs don’t pile up. Short greetings like `hi` skip Claude (**fast path**).

### User-facing bot behavior

- **Country playlist** — e.g. “make a playlist from Brazil” → creates a **YouTube** playlist (needs OAuth env); reply includes the **playlist URL** (plain text so clients can linkify it).
- **Trending / vibe** — top picks or energy/danceability/valence for a named country (YouTube-backed globe cache).
- **Crystal Ball via chat** — mood-style messages → `analyzeVibe` + **optional Spotify** mood search → reply with links (**requires** `SPOTIFY_REFRESH_TOKEN`).
- **Scheduled (mock for demos):**
  - **Daily digest** (~9:00 local server time) — “what the world is vibing to” (mock track list + optional Claude copy).
  - **Globe alerts** (every few hours) — mock “genre/artist spike in a country”.
  - **Country battle** (periodic) — users reply **`1`** or **`2`** to vote; results broadcast after the voting window.

When someone creates a playlist from the **website** (`POST /api/create-playlist`), the server can **broadcast** a short message with the new playlist link to Luffa (same broadcast rules as above).

---

## Hackathon-only: instant showcase commands

> **These commands exist only for hackathon demos and judging.** They are **not** a stable public API. Type the phrase **alone** in a Luffa DM or group (any letter case); the message must match exactly after trim.

| Command | Effect |
|---------|--------|
| `SHOWCASE-DIGEST` | Runs the **daily digest** immediately (broadcast). |
| `SHOWCASE-ALERT` | Sends a **globe alert** immediately (mock, broadcast). |
| `SHOWCASE-BATTLE` | Starts a **country battle** poll immediately (broadcast; **~20s** voting window by default, see `LUFFA_BATTLE_SHOWCASE_MS`). |
| `SHOWCASE-PLAYLIST` | Sends a **demo** “new playlist” notification with a sample link (broadcast). |
| `SHOWCASE-MOOD` | Runs **Crystal Ball mood matching** once — **requires Spotify** in `.env`; replies to **you** (not a full broadcast). |

Do not rely on these in production; remove or gate them if you ship beyond a hackathon.

---

## API / quota notes

See **Environment variables → Quota reminder** for units, cache, and second API key. In short: **YouTube** search costs quota per request; **Spotify** (if enabled) can return **429** — the server uses backoff helpers.

---

## Archive (Globe + Crystal)

JSON files live under **`archive/`** at the repo root (gitignored).

- **`POST /api/crystal-archive`** — Crystal Ball “End & save”: stores session videos and optional playlist link (legacy field may include old Spotify match rows).
- **`POST /api/create-playlist`** (Globe) — After a **YouTube** playlist is created, a **`globe-*.json`** entry is written with the playlist URL, country, and a short track preview list.
- **`GET /api/archive`** — Lists all entries (newest first) for the **`/archive`** page.

Optional: tune legacy Crystal→Spotify matching with **`CRYSTAL_SPOTIFY_LOOKUP_MS`** in `server/.env` if `SPOTIFY_*` is set.

---

## Tech stack (high level)

- **Frontend:** React, TypeScript, Vite, Tailwind, React Router, Three.js (globe), face-api + TensorFlow MoveNet (Crystal Ball), YouTube IFrame API (Crystal + Artist shuffle).
- **Backend:** Node.js, Express, YouTube Data API (+ OAuth for playlists), optional Spotify Web API, optional Anthropic (Claude), Luffa HTTP polling.

---

## License / project

Private project (`"private": true` in `package.json`). Adjust as needed for your hackathon submission.
