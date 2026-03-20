require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getTopTracksForCountry, createPlaylist, COUNTRY_GENRES } = require('./spotify');
const { parseUserIntent, generatePlaylistDetails } = require('./agent');

const app = express();
app.use(express.json());

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

  return {
    text: `Try asking me:\n• "Make me a playlist from Brazil"\n• "What's trending in Japan?"\n• "What's the vibe in Nigeria?"`,
  };
}

function extractLuffaWebhookPayload(body) {
  if (!body || typeof body !== 'object') return { text: '', recipientId: null };
  const text =
    body.message ??
    body.text ??
    body.content ??
    (body.msg && (body.msg.text ?? body.msg.content)) ??
    '';
  const recipientId =
    body.userId ??
    body.uid ??
    body.user_id ??
    body.groupId ??
    body.group_id ??
    body.recipientId ??
    body.from ??
    null;
  return { text: String(text).trim(), recipientId };
}

// Luffa: point your bot webhook URL here (e.g. https://your-host/webhook/luffa)
app.post('/webhook/luffa', async (req, res) => {
  res.sendStatus(200);

  const { text, recipientId } = extractLuffaWebhookPayload(req.body);
  if (!text) {
    console.warn('Luffa webhook: empty message', JSON.stringify(req.body).slice(0, 200));
    return;
  }
  if (!recipientId) {
    console.warn('Luffa webhook: no recipient id in payload', JSON.stringify(req.body).slice(0, 200));
    return;
  }
  if (!process.env.LUFFA_BOT_UID || !process.env.LUFFA_BOT_SECRET) {
    console.error('Luffa webhook: set LUFFA_BOT_UID and LUFFA_BOT_SECRET to send replies');
    return;
  }

  try {
    const { text: reply } = await processMusicBotMessage(text, null);
    console.log('Luffa reply length:', reply.length);
    await sendLuffaMessage(recipientId, reply);
  } catch (err) {
    console.error('Luffa webhook error:', err.message);
    try {
      await sendLuffaMessage(recipientId, 'Something went wrong fetching Spotify data. Try again in a moment.');
    } catch (_) {
      /* ignore */
    }
  }
});

async function sendLuffaMessage(recipientId, text) {
  try {
    await axios.post('https://api.luffa.im/bot/send', {
      botUid: process.env.LUFFA_BOT_UID,
      secretKey: process.env.LUFFA_BOT_SECRET,
      recipientId,
      message: text,
    });
  } catch (err) {
    console.error('Luffa send error:', err.message);
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});