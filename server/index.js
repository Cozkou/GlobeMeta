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

// In-memory data store
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

// API endpoint for the globe frontend
app.get('/api/globe-data', (req, res) => {
  res.json(globeData);
});

app.get('/api/country/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const cached = globeData[code];
  const maxAgeMs = 60 * 60 * 1000;
  const isFresh = cached && (Date.now() - new Date(cached.updatedAt).getTime() < maxAgeMs);

  if (!isFresh) {
    await refreshCountryData(code);
  }

  const data = globeData[code];
  if (!data) return res.status(404).json({ error: 'Country not found' });
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
async function processMusicBotMessage(messageText, fallbackCountryCode = null) {
  const intent = await parseUserIntent(messageText);
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

  // Fallback: reply based on whatever the user asked (conversational)
  let countryData = null;
  if (code) {
    if (!globeData[code]) await refreshCountryData(code);
    countryData = globeData[code];
  }
  const reply = await generateReply(messageText, { countryData, countryCode: code });
  return { text: reply };
}

// Luffa uses polling, not webhooks. Poll receive API every second.
const LUFFA_RECEIVE_URL = 'https://apibot.luffa.im/robot/receive';
const LUFFA_SEND_URL = 'https://apibot.luffa.im/robot/send';
const LUFFA_SEND_GROUP_URL = 'https://apibot.luffa.im/robot/sendGroup';
const LUFFA_POLL_INTERVAL_MS = 1000;
const LUFFA_MSGID_DEDUPE_MAX = 500;

const seenMsgIds = new Set();
const msgIdQueue = [];
let luffaLastNetworkErrorLog = 0;

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

async function pollLuffa() {
  const secret = process.env.LUFFA_BOT_SECRET;
  if (!secret) return;

  try {
    const res = await axios.post(LUFFA_RECEIVE_URL, { secret }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    let data = res.data;
    if (!Array.isArray(data) && data && (data.data || data.message)) {
      data = data.data || data.message;
    }

    if (!Array.isArray(data)) {
      if (data && Object.keys(data).length > 0) {
        console.log('Luffa receive (unexpected shape):', JSON.stringify(data).slice(0, 400));
      }
      return;
    }

    for (const envelope of data) {
      const { uid, message: msgList, type } = envelope;
      if (!uid || !Array.isArray(msgList)) continue;

      const isGroup = String(type) === '1';

      for (const raw of msgList) {
        let parsed;
        try {
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          continue;
        }
        const text = (parsed?.text || '').trim();
        const msgId = parsed?.msgId;
        if (!text) continue;
        if (msgId && markMsgIdSeen(msgId)) continue;

        console.log('Luffa: processing message from', uid, ':', text.slice(0, 50));
        (async () => {
          try {
            const { text: reply } = await processMusicBotMessage(text, null);
            await sendLuffaMessage(uid, reply, isGroup);
            console.log('Luffa: replied to', uid);
          } catch (err) {
            console.error('Luffa process error:', err.message);
            await sendLuffaMessage(uid, 'Something went wrong. Try again in a moment.', isGroup);
          }
        })();
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
  console.log('Luffa: polling started (receive every 1s)');
  setInterval(pollLuffa, LUFFA_POLL_INTERVAL_MS);
  pollLuffa();
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startLuffaPoller();
});