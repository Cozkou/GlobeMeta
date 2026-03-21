# GlobeMeta

A **3D globe** for exploring country trending music (**YouTube** search + regional bias), a **Crystal Ball** session with webcam mood → music (YouTube playback + **YouTube playlists** on your account), a **home** mini-game, and an optional **Luffa** chat bot that mirrors many of those flows.

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

Copy **`server/.env.example`** → **`server/.env`** and fill in at least **`YOUTUBE_API_KEY`** for globe + Crystal search. For **creating playlists** (globe + Crystal), add **Google OAuth** credentials and run **`node youtube-auth.js`** once to obtain **`YOUTUBE_OAUTH_REFRESH_TOKEN`**. If Google returns **403 access_denied**, add your Gmail under **OAuth consent screen → Test users** while the app is in **Testing**. See **Environment** below.

**Production build:** `npm run build` then `npm run preview` — note that **`vite preview`** uses a proxy for `/api` in this repo so API calls still reach your local server when configured.

---

## Environment variables

Full comments live in **`server/.env.example`**. Summary:

| Variable | Purpose |
|----------|---------|
| `YOUTUBE_API_KEY` (+ optional `_2`) | Globe country picks + Crystal Ball YouTube search |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_OAUTH_REFRESH_TOKEN` | Create **YouTube** playlists (OAuth; use `node youtube-auth.js`) |
| `SPOTIFY_*` (optional) | Luffa mood matching + optional **`/api/crystal-youtube-to-spotify`** only |
| `CLAUDE_API_KEY` | Luffa intents, replies, digest copy (optional but recommended for the bot) |
| `LUFFA_BOT_SECRET` | Luffa robot key — enables polling bot |
| `LUFFA_POLL_MS` | Poll interval ms (default ~700; range 250–3000) |
| `LUFFA_DEBUG` | `1` = log every poll |
| `LUFFA_BROADCAST_GROUP_UID` | Optional group UID for **broadcasts** (digest, alerts, battles, playlist notifications). If unset, broadcasts go to all **known DM users** (anyone who has messaged the bot) |
| `PUBLIC_APP_URL` | Base URL in bot messages (default in code points at deployed app) |
| `PORT` | API server port (default `4000`) |

Never commit real `.env` files or tokens.

---

## App routes (frontend)

- **`/`** — Home (Piano Tiles background + Enter)
- **`/globe`** — Globe Mixer: spin globe, click countries, trending YouTube picks, create **YouTube** playlist
- **`/crystal`** — Crystal Ball: webcam + mood-driven music, archive session, **YouTube** playlist from session videos
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
| `SHOWCASE-BATTLE` | Starts a **country battle** poll immediately (broadcast). |
| `SHOWCASE-PLAYLIST` | Sends a **demo** “new playlist” notification with a sample link (broadcast). |
| `SHOWCASE-MOOD` | Runs **Crystal Ball mood matching** once — **requires Spotify** in `.env`; replies to **you** (not a full broadcast). |

Do not rely on these in production; remove or gate them if you ship beyond a hackathon.

---

## API / quota notes

- **YouTube Data API** — Search + playlist writes consume **quota units**. For hackathon scale, defaults are usually enough; avoid hammering the API from many parallel clients.
- **Spotify (optional)** — If enabled, heavy usage can trigger **HTTP 429**; the server includes backoff helpers for search.

---

## Archive (Globe + Crystal)

JSON files live under **`archive/`** at the repo root (gitignored).

- **`POST /api/crystal-archive`** — Crystal Ball “End & save”: stores session videos and optional playlist link (legacy field may include old Spotify match rows).
- **`POST /api/create-playlist`** (Globe) — After a **YouTube** playlist is created, a **`globe-*.json`** entry is written with the playlist URL, country, and a short track preview list.
- **`GET /api/archive`** — Lists all entries (newest first) for the **`/archive`** page.

Optional: tune legacy Crystal→Spotify matching with **`CRYSTAL_SPOTIFY_LOOKUP_MS`** in `server/.env` if `SPOTIFY_*` is set.

---

## Tech stack (high level)

- **Frontend:** React, TypeScript, Vite, Tailwind, React Router, Three.js (globe), face-api (Crystal Ball).
- **Backend:** Node.js, Express, YouTube Data API (+ OAuth for playlists), optional Spotify Web API, optional Anthropic (Claude), Luffa HTTP polling.

---

## License / project

Private project (`"private": true` in `package.json`). Adjust as needed for your hackathon submission.
