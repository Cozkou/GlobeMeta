const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const axios = require('axios');
const {
  getTopTracksForCountry,
  createPlaylist,
  getTracksByMood,
  COUNTRY_GENRES,
  resolveCrystalSessionVideosToSpotify,
  iterateCrystalSpotifyMatches,
  getSpotifyCooldownRemaining,
} = require('./spotify');
const { parseUserIntent, generatePlaylistDetails, generateReply, analyzeVibe, generateYouTubeSearchQuery, generateCrystalSessionPlaylistDetails } = require('./agent');

const app = express();
app.use(express.json());

/** Crystal “End & save” dumps — repo root `archive/` (placeholder until a real archive UI exists). */
const CRYSTAL_ARCHIVE_DIR = path.join(__dirname, '..', 'archive');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * In-memory cache for `/api/country` and `/api/create-playlist` (globe).
 * Populated only via Spotify Web API (`getTopTracksForCountry` in spotify.js).
 * Does not use YouTube — YOUTUBE_* keys are for Crystal Ball routes only.
 */
let globeData = {};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const GENRE_MOOD = {
  'hip-hop':    { energy: 0.80, danceability: 0.75, valence: 0.60 },
  'latin':      { energy: 0.85, danceability: 0.90, valence: 0.80 },
  'afrobeats':  { energy: 0.82, danceability: 0.88, valence: 0.78 },
  'k-pop':      { energy: 0.78, danceability: 0.80, valence: 0.72 },
  'j-pop':      { energy: 0.65, danceability: 0.70, valence: 0.68 },
  'electronic': { energy: 0.88, danceability: 0.85, valence: 0.65 },
  'pop':        { energy: 0.70, danceability: 0.72, valence: 0.65 },
  'bollywood':  { energy: 0.75, danceability: 0.82, valence: 0.76 },
};

/** Fetches top tracks from Spotify Search API for the given market; never calls YouTube. */
async function refreshCountryData(countryCode) {
  try {
    const code = countryCode.toUpperCase();
    const tracks = await getTopTracksForCountry(code);
    if (!tracks || tracks.length === 0) return;

    const genre = COUNTRY_GENRES[code] || 'pop';
    const mood = GENRE_MOOD[genre] || GENRE_MOOD['pop'];
    const countryName = regionNames.of(code) || code;

    globeData[code] = {
      country: countryName,
      code,
      tracks,
      energy: mood.energy,
      danceability: mood.danceability,
      valence: mood.valence,
      updatedAt: new Date().toISOString(),
    };

    console.log(`Updated data for ${countryName}`);
  } catch (err) {
    console.error(`Failed to update ${countryCode}:`, err.message);
  }
}

app.get('/api/spotify-status', (req, res) => {
  const cooldownMs = getSpotifyCooldownRemaining();
  res.json({
    ok: cooldownMs === 0,
    cooldownMs,
    cooldownMinutes: Math.ceil(cooldownMs / 60000),
    message: cooldownMs > 0
      ? `Spotify rate-limited — cooldown expires in ~${Math.ceil(cooldownMs / 60000)} minutes`
      : 'Spotify API available',
  });
});

// API endpoint for the globe frontend
app.get('/api/globe-data', (req, res) => {
  res.json(globeData);
});

app.get('/api/country/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const cached = globeData[code];
  const maxAgeMs = 60 * 60 * 1000;
  const isFresh = cached && (Date.now() - new Date(cached.updatedAt).getTime() < maxAgeMs);

  let servedStale = false;
  if (!isFresh) {
    try {
      await Promise.race([
        refreshCountryData(code),
        // Allow Spotify 429 Retry-After + retries (see spotify.js spotifyGet).
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 45000)),
      ]);
    } catch (err) {
      console.warn('refreshCountryData timed out or failed for', code, err.message);
      if (globeData[code]) servedStale = true;
    }
  }

  const data = globeData[code];
  if (!data) {
    return res.status(404).json({ error: 'Country not found — Spotify may be rate-limiting. Try again in a moment.' });
  }
  if (servedStale) res.setHeader('X-Country-Data-Stale', '1');
  res.json(data);
});

app.post('/api/vibe-analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
    const vibe = await analyzeVibe(text);
    res.json(vibe);
  } catch (err) {
    console.error('Vibe analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- YouTube Data API (Crystal Ball: /api/youtube-*, browser playback). Not used for globe/country. ---

function isLyricVideo(item) {
  const title = (item.snippet?.title || '').toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase();
  const combined = `${title} ${desc}`;
  return /\blyric\b|lyrics\s*video/i.test(combined);
}

/**
 * Drop playlist-style uploads, remixes, covers, karaoke, and common reupload edits.
 * (Official re-records like "Taylor's Version" stay allowed.)
 */
function isExcludedPlaylistRemixCover(item) {
  const titleRaw = item.snippet?.title || '';
  const title = titleRaw.toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase().slice(0, 1000);
  const channel = (item.snippet?.channelTitle || '').toLowerCase();
  const blob = `${title} ${desc} ${channel}`;

  if (/taylor['’]s\s+version\b/i.test(titleRaw)) return false;

  // Playlist / mega-compilation style videos (still type=video on YouTube)
  if (
    /\bplaylist\b|\bplaylists\b|\bfull\s+album\b|\bcomplete\s+album\b|\bentire\s+album\b|\ball\s+songs\b|\bnon-?stop\b|\b\d+\s*hours?\b|\bhours?\s+of\b|\bhour\s+loop\b|\bmega\s+mix\b|\bgreatest\s+hits\b|\bdiscography\b|\bcompilation\b|\bsupercut\b|\b\d+\s*songs?\s+in\b|\btop\s+\d+\s+songs\b|\b100\s+songs\b|\bmix\s*202\d\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  // Remixes, edits, meme audio
  if (
    /\bremix\b|\brmx\b|\bmash-?up\b|\bmashup\b|\bnightcore\b|\b8d\s+audio\b|\b8d\s+sound\b|\bslowed\s*(down|reverb|\+)?\b|\bsped\s*up\b|\bspeed\s*(up|song)\b|\bfan\s+edit\b|\btik\s*tok\s+version\b|\bvc\b|\bedit\s*audio\b|\bbootleg\b|\bextended\s+mix\b|\bclub\s+mix\b|\bdance\s+mix\b|\bphonk\b|\btype\s+beat\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  // Covers, karaoke, tributes, reaction-style
  if (
    /\bcover\b|\bcovers\b|\bcovered\s+by\b|\bkaraoke\b|\bpiano\s+cover\b|\bacoustic\s+cover\b|\borchestral\s+cover\b|\bfemale\s+cover\b|\bmale\s+cover\b|\btribute\b|\bnot\s+official\b|\bfan\s+cover\b|\breaction\s+to\b|\breacts\s+to\b|\blive\s+cover\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  // Channels that mostly publish non-original audio
  if (
    /\b(karaoke|cover|covers|remix|nightcore|mashup|sped\s*up|slowed|8d|instrumental)\b/i.test(channel) &&
    !/\bvevo\b|\brecords\b|\bmusic\b.*\bofficial\b/i.test(channel)
  ) {
    return true;
  }

  return false;
}

function isAllowedYoutubeMusicVideo(item) {
  return Boolean(item?.id?.videoId) && !isExcludedPlaylistRemixCover(item);
}

function isKeyError(err) {
  const status = err.response?.status;
  const code = err.response?.data?.error?.code;
  return status === 403 || status === 401 || code === 403 || code === 401;
}

async function youtubeSearch(query, key, maxResults = 20) {
  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: { part: 'snippet', q: query, type: 'video', maxResults, key },
  });
  return data;
}

async function youtubeSearchWithFallback(query) {
  const keys = [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean);
  if (keys.length === 0) return null;
  let lastErr;
  for (const key of keys) {
    try {
      return await youtubeSearch(query, key);
    } catch (err) {
      lastErr = err;
      if (isKeyError(err) && keys.indexOf(key) < keys.length - 1) continue;
      throw err;
    }
  }
  throw lastErr;
}

app.post('/api/youtube-by-happiness', async (req, res) => {
  try {
    const keys = [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean);
    if (keys.length === 0) return res.status(503).json({ error: 'YOUTUBE_API_KEY not set' });

    const h = Math.max(0, Math.min(1, parseFloat(req.body.happiness) || 0.5));
    const queries =
      h > 0.6
        ? ['happy pop official audio', 'feel good songs official music video', 'upbeat hits official audio']
        : h < 0.4
          ? ['sad ballad official audio', 'calm acoustic official', 'emotional songs official audio']
          : ['chill pop official audio', 'relaxing music official', 'easy listening official audio'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const data = await youtubeSearchWithFallback(query);

    const candidates = (data.items || []).filter(isAllowedYoutubeMusicVideo);
    const lyricItems = candidates.filter(isLyricVideo);
    const chosen = (lyricItems.length > 0 ? lyricItems : candidates).slice(0, 5);
    const videos = chosen.map((v) => ({
      videoId: v.id.videoId,
      title: v.snippet?.title || 'Music',
      channelTitle: v.snippet?.channelTitle || '',
    }));
    if (videos.length === 0) {
      return res.status(404).json({ error: 'No video found' });
    }
    res.json({ videos });
  } catch (err) {
    console.error('YouTube by happiness error:', err.message, err.response?.data);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/youtube-by-vibe', async (req, res) => {
  try {
    const keys = [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean);
    if (keys.length === 0) return res.status(503).json({ error: 'YOUTUBE_API_KEY not set' });

    const vibe = await analyzeVibe(req.body.text || 'chill music');
    const query = await generateYouTubeSearchQuery(req.body.text || 'chill music', vibe);

    const data = await youtubeSearchWithFallback(`${query} official audio`);

    const candidates = (data.items || []).filter(isAllowedYoutubeMusicVideo);
    const lyricItems = candidates.filter(isLyricVideo);
    const video = lyricItems[0] || candidates[0];
    if (!video?.id?.videoId) {
      return res.status(404).json({ error: 'No video found' });
    }

    res.json({
      videoId: video.id.videoId,
      title: video.snippet?.title || 'Music',
      channelTitle: video.snippet?.channelTitle || '',
    });
  } catch (err) {
    console.error('YouTube by vibe error:', err.message, err.response?.data);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tracks-by-mood', async (req, res) => {
  try {
    const { energy = 0.5, valence = 0.5, danceability = 0.5 } = req.body;
    const tracks = await getTracksByMood(
      parseFloat(energy) || 0.5,
      parseFloat(valence) || 0.5,
      parseFloat(danceability) || 0.5
    );
    if (tracks.length === 0) {
      console.warn('tracks-by-mood: no tracks with preview_url found');
    }
    res.json({ tracks });
  } catch (err) {
    console.error('Tracks by mood error:', err.message, err.response?.data);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/debug-previews', async (req, res) => {
  try {
    const us = await getTopTracksForCountry('US');
    const sample = us.slice(0, 5).map((t) => ({
      name: t.name,
      artist: t.artist,
      hasPreview: !!t.preview_url,
    }));
    res.json({ usSample: sample, total: us.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crystal-youtube-to-spotify', async (req, res) => {
  try {
    const { videos } = req.body;
    if (!Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ error: 'videos array required' });
    }
    const normalized = videos.slice(0, 40).map((v) => ({
      videoId: String(v.videoId ?? ''),
      title: String(v.title ?? ''),
      channelTitle: String(v.channelTitle ?? ''),
    }));

    const accept = (req.headers.accept || '').toLowerCase();
    const wantsJson = accept.includes('application/json') && !accept.includes('application/x-ndjson');

    if (wantsJson) {
      const matches = await resolveCrystalSessionVideosToSpotify(normalized);
      return res.json({ matches });
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`${JSON.stringify({ type: 'start', total: normalized.length })}\n`);

    for await (const chunk of iterateCrystalSpotifyMatches(normalized)) {
      res.write(
        `${JSON.stringify({
          type: 'progress',
          current: chunk.index,
          total: chunk.total,
          workingOn: chunk.match.youtubeTitle,
          match: chunk.match,
        })}\n`,
      );
    }
    res.write(`${JSON.stringify({ type: 'done' })}\n`);
    res.end();
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('crystal-youtube-to-spotify:', detail);
    if (!res.headersSent) {
      return res.status(500).json({ error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    }
    try {
      res.write(`${JSON.stringify({ type: 'error', error: String(detail) })}\n`);
    } catch {
      /* ignore */
    }
    res.end();
  }
});

app.post('/api/crystal-archive', async (req, res) => {
  try {
    const { sessionVideos, spotifyMatches, playlist } = req.body || {};
    if (!Array.isArray(sessionVideos) || sessionVideos.length === 0) {
      return res.status(400).json({ error: 'sessionVideos non-empty array required' });
    }
    const trimmedVideos = sessionVideos.slice(0, 80).map((v) => ({
      videoId: String(v.videoId ?? ''),
      title: String(v.title ?? ''),
      channelTitle: String(v.channelTitle ?? ''),
    }));
    await fs.mkdir(CRYSTAL_ARCHIVE_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crystal-${stamp}-${id.slice(0, 8)}.json`;
    const filepath = path.join(CRYSTAL_ARCHIVE_DIR, filename);
    const payload = {
      version: 1,
      archivedAt: new Date().toISOString(),
      sessionVideos: trimmedVideos,
      spotifyMatches: Array.isArray(spotifyMatches) ? spotifyMatches : null,
      playlist:
        playlist && typeof playlist === 'object'
          ? { url: playlist.url ?? null, name: playlist.name ?? null }
          : null,
    };
    await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, filename, id });
  } catch (err) {
    console.error('crystal-archive:', err);
    res.status(500).json({ error: err.message || 'Archive failed' });
  }
});

app.post('/api/create-session-playlist', async (req, res) => {
  try {
    const { trackIds = [], tracks = [], name } = req.body;
    const ids = Array.isArray(trackIds) ? trackIds : [];
    const trackList = Array.isArray(tracks) ? tracks : [];
    const allIds = ids.length > 0 ? ids : trackList.map((t) => t.id).filter(Boolean);
    if (allIds.length === 0) {
      return res.status(400).json({ error: 'trackIds or tracks array required' });
    }
    let playlistName = name;
    let playlistDesc = 'Songs from your Crystal Ball session — generated by Pulse Earth Vibes';
    if (trackList.length > 0) {
      try {
        const details = await generateCrystalSessionPlaylistDetails(trackList);
        playlistName = details.name;
        playlistDesc = details.description;
      } catch (e) {
        console.warn('Crystal playlist details fallback:', e.message);
      }
    }
    const trackUris = allIds.map((id) => `spotify:track:${id}`);
    const url = await createPlaylist(playlistName || 'My Crystal Ball Session', playlistDesc, trackUris);
    res.json({ url, name: playlistName });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('Session playlist error:', detail);
    res.status(500).json({ error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }
});

app.post('/api/create-playlist', async (req, res) => {
  try {
    const { countryCode } = req.body;
    const code = countryCode?.toUpperCase();
    if (!globeData[code]) await refreshCountryData(code);
    const countryData = globeData[code];
    if (!countryData) return res.status(404).json({ error: 'No data for this country' });

    const details = await generatePlaylistDetails(countryData.country, countryData.tracks);
    const trackUris = countryData.tracks.map(t => `spotify:track:${t.id}`);
    const url = await createPlaylist(details.name, details.description, trackUris);
    const trackList = countryData.tracks.slice(0, 10).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`);

    res.json({ url, name: details.name, description: details.description, tracks: trackList });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('Create playlist error:', detail);
    res.status(500).json({ error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }
});

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://globe-meta.vercel.app').replace(/\/$/, '');

/**
 * Shared path: parse intent → fetch Spotify top tracks for country → playlist / trending / vibe.
 * @param {string} messageText - user message
 * @param {string|null} fallbackCountryCode - optional 2-letter code when the model omits country (unused by Luffa)
 * @returns {{ text: string }}
 */
function luffaFallbackReply(messageText) {
  const t = (messageText || '').trim().toLowerCase();
  if (/^(hi|hello|hey|sup|yo)\b|^hii\b/.test(t)) {
    return `Hi! I'm Pulse Earth Vibes — I help you discover music from around the world. Try "What's trending in Japan?" or open ${PUBLIC_APP_URL}/globe 🌍`;
  }
  return `I'm Pulse Earth Vibes. Ask for trending tracks or a playlist from any country (e.g. Brazil, Japan), or visit ${PUBLIC_APP_URL}/globe`;
}

/** Short pure greetings — answer immediately without Claude (avoids slow parallel bursts). */
function isQuickGreetingOnly(text) {
  const t = (text || '').trim();
  if (t.length === 0 || t.length > 32) return false;
  const lower = t.toLowerCase();
  if (['hi', 'hey', 'hello', 'sup', 'yo', 'hii', 'hi!', 'hey!', 'hello!'].includes(lower)) return true;
  return /^(hi|hello|hey|sup|yo|hii)[!.\s]*$/i.test(t);
}

/**
 * If Claude’s JSON misses country/intent, map “top tracks in USA”-style text to get_trending + ISO code.
 * Order: longer phrases first (e.g. United States before US).
 */
const COUNTRY_PHRASE_TO_ISO = [
  [/united\s+states|u\.s\.a\.?|(?<![a-z])usa(?![a-z])/i, 'US', 'United States'],
  [/\bamerica\b/i, 'US', 'United States'],
  [/united\s+kingdom|u\.k\.|britain|(?<![a-z])uk(?![a-z])|england|scotland|wales/i, 'GB', 'United Kingdom'],
  [/north\s+korea/i, 'KP', 'North Korea'],
  [/south\s+korea/i, 'KR', 'South Korea'],
  [/(?<![a-z])korea(?![a-z])/i, 'KR', 'South Korea'],
  [/\bjapan\b/i, 'JP', 'Japan'],
  [/\bbrazil\b/i, 'BR', 'Brazil'],
  [/\bmexico\b/i, 'MX', 'Mexico'],
  [/\bcanada\b/i, 'CA', 'Canada'],
  [/\baustralia\b/i, 'AU', 'Australia'],
  [/\bindia\b/i, 'IN', 'India'],
  [/\bfrance\b/i, 'FR', 'France'],
  [/\bgermany\b/i, 'DE', 'Germany'],
  [/\bspain\b/i, 'ES', 'Spain'],
  [/\bitaly\b/i, 'IT', 'Italy'],
  [/\bnetherlands\b|\bholland\b/i, 'NL', 'Netherlands'],
  [/\bchina\b/i, 'CN', 'China'],
  [/\bindonesia\b/i, 'ID', 'Indonesia'],
  [/\bthailand\b/i, 'TH', 'Thailand'],
  [/\bvietnam\b/i, 'VN', 'Vietnam'],
  [/\bphilippines\b/i, 'PH', 'Philippines'],
  [/\bargentina\b/i, 'AR', 'Argentina'],
  [/\bcolombia\b/i, 'CO', 'Colombia'],
  [/\bnigeria\b/i, 'NG', 'Nigeria'],
  [/\bsouth\s+africa\b/i, 'ZA', 'South Africa'],
  [/\begypt\b/i, 'EG', 'Egypt'],
  [/\bturkey\b/i, 'TR', 'Turkey'],
  [/\bsweden\b/i, 'SE', 'Sweden'],
  [/\bnorway\b/i, 'NO', 'Norway'],
  [/\bpoland\b/i, 'PL', 'Poland'],
  [/\bukraine\b/i, 'UA', 'Ukraine'],
  [/\brussia\b/i, 'RU', 'Russia'],
];

const TRENDING_REQUEST_RE =
  /\b(top\s+tracks?|trending|what'?s\s+(hot|trending)|charts?|chart\s+hits|popular\s+(songs?|tracks?)|hits\s+in|hot\s+tracks?|give\s+me\s+(the\s+)?(top|hot)\b)/i;

function matchCountryCodeFromText(t) {
  for (const [re, code, name] of COUNTRY_PHRASE_TO_ISO) {
    if (re.test(t)) return { code, name };
  }
  return null;
}

/** @returns {{ intent: string, countryCode: string, country: string, mood: null } | null} */
function inferTrendingIntentFromText(raw) {
  const t = (raw || '').trim();
  if (t.length < 6) return null;
  if (!TRENDING_REQUEST_RE.test(t) && !/\b(trending|top\s+tracks?|charts?)\b/i.test(t)) return null;
  const c = matchCountryCodeFromText(t);
  if (!c) return null;
  return {
    intent: 'get_trending',
    countryCode: c.code,
    country: c.name,
    mood: null,
  };
}

async function processMusicBotMessage(messageText, fallbackCountryCode = null) {
  if (!process.env.CLAUDE_API_KEY) {
    return { text: luffaFallbackReply(messageText) };
  }

  if (isQuickGreetingOnly(messageText)) {
    return { text: luffaFallbackReply(messageText) };
  }

  let intent;
  try {
    intent = await parseUserIntent(messageText);
  } catch (e) {
    console.warn('parseUserIntent failed:', e.message);
    return { text: luffaFallbackReply(messageText) };
  }

  const heuristic = inferTrendingIntentFromText(messageText);
  if (heuristic) {
    if (intent.intent === 'unknown') {
      intent = { ...intent, ...heuristic };
    } else if (
      ['get_trending', 'get_vibe', 'create_playlist'].includes(intent.intent) &&
      !intent.countryCode &&
      heuristic.countryCode
    ) {
      intent = {
        ...intent,
        countryCode: heuristic.countryCode,
        country: intent.country || heuristic.country,
      };
    }
  }

  const code = (intent.countryCode || fallbackCountryCode || '').toUpperCase() || null;

  if ((intent.intent === 'create_playlist' || intent.intent === 'get_trending' || intent.intent === 'get_vibe') && code) {
    if (!globeData[code]) await refreshCountryData(code);
    const cd = globeData[code];
    if (!cd) {
      return { text: `I couldn't find music data for ${intent.country || 'that country'}. Try a different one!` };
    }

    if (intent.intent === 'create_playlist') {
      const details = await generatePlaylistDetails(cd.country, cd.tracks);
      const trackUris = cd.tracks.map(t => `spotify:track:${t.id}`);
      const playlistUrl = await createPlaylist(details.name, details.description, trackUris);
      const trackList = cd.tracks.slice(0, 10).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join('\n');
      return {
        text: `${details.message}\n\n🎵 ${details.name}\n${playlistUrl}\n\n${trackList}`,
      };
    }

    if (intent.intent === 'get_trending') {
      const trackList = cd.tracks.slice(0, 5).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join('\n');
      return {
        text: `🔥 Trending in ${cd.country}:\n${trackList}\n\nExplore the globe: ${PUBLIC_APP_URL}/globe`,
      };
    }

    return {
      text: `The vibe in ${cd.country} right now:\n⚡ Energy ${Math.round(cd.energy * 100)}%\n💃 Danceability ${Math.round(cd.danceability * 100)}%\n😊 Valence ${Math.round(cd.valence * 100)}%\n\n${PUBLIC_APP_URL}/globe`,
    };
  }

  let countryData = null;
  if (code) {
    if (!globeData[code]) await refreshCountryData(code);
    countryData = globeData[code];
  }
  try {
    const reply = await generateReply(messageText, { countryData, countryCode: code });
    return { text: reply };
  } catch (e) {
    console.warn('generateReply failed:', e.message);
    return { text: luffaFallbackReply(messageText) };
  }
}

// Luffa uses polling, not webhooks. Poll receive API every second.
const LUFFA_RECEIVE_URL = 'https://apibot.luffa.im/robot/receive';
const LUFFA_SEND_URL = 'https://apibot.luffa.im/robot/send';
const LUFFA_SEND_GROUP_URL = 'https://apibot.luffa.im/robot/sendGroup';
/** Luffa often returns [] until a message is ready — slightly faster default picks up traffic sooner (set LUFFA_POLL_MS 250–3000). */
const LUFFA_POLL_INTERVAL_MS = Math.min(3000, Math.max(250, parseInt(process.env.LUFFA_POLL_MS || '700', 10) || 700));
const LUFFA_MSGID_DEDUPE_MAX = 500;

const seenMsgIds = new Set();
const msgIdQueue = [];
let luffaLastNetworkErrorLog = 0;
/** Throttle “still polling” lines so the console isn’t silent, without logging every 1s. */
let luffaLastHeartbeatLog = 0;
const LUFFA_HEARTBEAT_MS = 15000;

/** Process Luffa DMs one at a time so Claude/Spotify work isn’t parallel-bursts (which felt “frozen then all replies at once”). */
const luffaReplyQueue = [];
let luffaReplyWorkerRunning = false;

function enqueueLuffaReply(uid, text, isGroup) {
  luffaReplyQueue.push({ uid, text, isGroup });
  void runLuffaReplyWorker();
}

async function runLuffaReplyWorker() {
  if (luffaReplyWorkerRunning) return;
  luffaReplyWorkerRunning = true;
  try {
    while (luffaReplyQueue.length > 0) {
      const job = luffaReplyQueue.shift();
      if (!job) break;
      const { uid, text, isGroup } = job;
      try {
        const { text: reply } = await processMusicBotMessage(text, null);
        await sendLuffaMessage(uid, reply, isGroup);
        console.log(`[Luffa] ${new Date().toISOString()} reply sent → uid=${uid}${isGroup ? ' (group)' : ''}`);
      } catch (err) {
        console.error('Luffa process error:', err.message);
        try {
          await sendLuffaMessage(uid, 'Something went wrong. Try again in a moment.', isGroup);
        } catch (sendErr) {
          console.error('Luffa: failed to send error reply:', sendErr.message);
        }
      }
    }
  } finally {
    luffaReplyWorkerRunning = false;
    if (luffaReplyQueue.length > 0) void runLuffaReplyWorker();
  }
}

function markMsgIdSeen(msgId) {
  if (!msgId || seenMsgIds.has(msgId)) return true;
  seenMsgIds.add(msgId);
  msgIdQueue.push(msgId);
  if (msgIdQueue.length > LUFFA_MSGID_DEDUPE_MAX) {
    const old = msgIdQueue.shift();
    seenMsgIds.delete(old);
  }
  return false;
}

function stripMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

async function sendLuffaMessage(uid, text, isGroup = false) {
  const secret = process.env.LUFFA_BOT_SECRET;
  if (!secret) return;
  const url = isGroup ? LUFFA_SEND_GROUP_URL : LUFFA_SEND_URL;
  const msgPayload = { text: stripMarkdown(text) };
  const body = isGroup
    ? { secret, uid, msg: JSON.stringify(msgPayload), type: '1' }
    : { secret, uid, msg: JSON.stringify(msgPayload) };
  try {
    const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
    if (res.status !== 200 || (res.data && res.data.code !== undefined && res.data.code !== 0)) {
      console.log('Luffa send response:', res.status, JSON.stringify(res.data).slice(0, 200));
    }
  } catch (err) {
    console.error('Luffa send error:', err.message, err.response?.data ? JSON.stringify(err.response.data) : '');
  }
}

/** Aligns with luffa-bot-python-sdk: double-encoded JSON, plain strings, alternate text keys. */
function coerceLuffaMessageToObject(raw) {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    let s = raw.trim();
    for (let i = 0; i < 2; i += 1) {
      try {
        const obj = JSON.parse(s);
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) return obj;
        if (Array.isArray(obj) && obj[0] && typeof obj[0] === 'object') return obj[0];
        if (typeof obj === 'string') {
          s = obj;
          continue;
        }
        break;
      } catch {
        break;
      }
    }
    if (s.length > 0) return { text: s };
  }
  return null;
}

function extractLuffaMessageText(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
  for (const key of ['msg', 'content', 'message']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  if (typeof obj.urlLink === 'string' && obj.urlLink.trim()) return obj.urlLink.trim();
  return '';
}

function luffaDedupeId(obj) {
  const keys = ['msgId', 'msgid', 'mid', 'message_id', 'id'];
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim()) {
      return `luffa:${String(v)}`;
    }
  }
  return `luffa:sha1:${crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex')}`;
}

async function pollLuffa() {
  const secret = process.env.LUFFA_BOT_SECRET;
  if (!secret) return;

  try {
    const res = await axios.post(LUFFA_RECEIVE_URL, { secret }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    let data = res.data;
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.prototype.hasOwnProperty.call(data, 'data')) {
      data = data.data;
    }
    if (!Array.isArray(data) && data && (data.data || data.message)) {
      data = data.data || data.message;
    }

    if (!Array.isArray(data)) {
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        console.log('Luffa receive (unexpected shape):', JSON.stringify(data).slice(0, 400));
      }
      return;
    }

    const envCount = data.length;
    let rawSlotCount = 0;
    for (const env of data) {
      const ml = env && (env.message ?? env.messages);
      if (Array.isArray(ml)) rawSlotCount += ml.length;
    }

    const debugPoll = process.env.LUFFA_DEBUG === '1';
    const now = Date.now();
    if (debugPoll) {
      console.log(
        `Luffa: poll OK — HTTP ${res.status}, ${envCount} envelope(s), ${rawSlotCount} message slot(s)`,
      );
    } else if (envCount > 0 || rawSlotCount > 0) {
      console.log(
        `Luffa: message received — ${envCount} envelope(s), ${rawSlotCount} raw message slot(s)`,
      );
    } else if (now - luffaLastHeartbeatLog >= LUFFA_HEARTBEAT_MS) {
      luffaLastHeartbeatLog = now;
      console.log(
        `[Luffa] idle — last /receive had 0 envelopes (normal: Luffa queues server-side; your DM may show on the next non-empty poll). LUFFA_DEBUG=1 logs every poll.`,
      );
    }

    for (const envelope of data) {
      if (!envelope || typeof envelope !== 'object') continue;
      const uid = envelope.uid;
      const msgList = envelope.message ?? envelope.messages;
      if (!uid || !Array.isArray(msgList)) continue;

      const isGroup = String(envelope.type) === '1';

      for (const raw of msgList) {
        const parsed = coerceLuffaMessageToObject(raw);
        if (!parsed) continue;
        const text = extractLuffaMessageText(parsed);
        if (!text) continue;
        const dedupeId = luffaDedupeId(parsed);
        if (markMsgIdSeen(dedupeId)) {
          if (process.env.LUFFA_DEBUG === '1') {
            console.log('[Luffa] skip duplicate (already handled):', dedupeId.slice(0, 48));
          }
          continue;
        }

        const preview = text.length > 90 ? `${text.slice(0, 90)}…` : text;
        console.log(
          `[Luffa] ${new Date().toISOString()} inbox ← uid=${uid}${isGroup ? ' group' : ''} | ${preview}`,
        );
        enqueueLuffaReply(uid, text, isGroup);
      }
    }
  } catch (err) {
    if (err.code === 'ECONNABORTED') return;
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      if (Date.now() - luffaLastNetworkErrorLog > 60000) {
        console.warn('Luffa: cannot reach apibot.luffa.im (check network). Polling continues.');
        luffaLastNetworkErrorLog = Date.now();
      }
    } else {
      console.error('Luffa poll error:', err.message);
    }
  }
}

function startLuffaPoller() {
  const secret = process.env.LUFFA_BOT_SECRET;
  if (!secret) {
    console.log('Luffa: LUFFA_BOT_SECRET not set, bot polling disabled');
    return;
  }
  if (!process.env.CLAUDE_API_KEY) {
    console.warn('Luffa: CLAUDE_API_KEY not set — bot uses short text fallbacks (add to server/.env for full AI replies)');
  }
  console.log(
    `Luffa: polling every ${LUFFA_POLL_INTERVAL_MS}ms — IN/reply lines use ISO timestamps; ~15s idle heartbeat when queue empty.`,
  );
  setInterval(pollLuffa, LUFFA_POLL_INTERVAL_MS);
  pollLuffa();
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startLuffaPoller();
});