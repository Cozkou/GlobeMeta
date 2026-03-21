const axios = require('axios');

let accessToken = null;
let tokenExpiry = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getYouTubeAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error(
      'YouTube playlist OAuth not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN in server/.env',
    );
    err.code = 'YOUTUBE_OAUTH_MISSING';
    throw err;
  }

  const { data } = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
      timeout: 15000,
    },
  );

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 120) * 1000;
  return accessToken;
}

/**
 * Create a public YouTube playlist and append videos (order preserved, deduped).
 * @param {string} title
 * @param {string} description
 * @param {string[]} videoIds
 * @returns {Promise<string>} playlist watch URL
 */
async function createYouTubePlaylist(title, description, videoIds) {
  const token = await getYouTubeAccessToken();
  const ids = [...new Set((videoIds || []).filter(Boolean))];
  if (ids.length === 0) throw new Error('No videos to add to playlist');

  const { data: playlist } = await axios.post(
    'https://www.googleapis.com/youtube/v3/playlists',
    {
      snippet: {
        title: String(title || 'GlobeMeta').slice(0, 150),
        description: String(description || '').slice(0, 4900),
      },
      status: { privacyStatus: 'public' },
    },
    {
      params: { part: 'snippet,status' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    },
  );

  const playlistId = playlist.id;
  if (!playlistId) throw new Error('YouTube did not return a playlist id');

  for (let i = 0; i < ids.length; i += 1) {
    await axios.post(
      'https://www.googleapis.com/youtube/v3/playlistItems',
      {
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId: ids[i] },
        },
      },
      {
        params: { part: 'snippet' },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      },
    );
    if (i < ids.length - 1) await sleep(120);
  }

  return `https://www.youtube.com/playlist?list=${playlistId}`;
}

function isYouTubePlaylistConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.YOUTUBE_OAUTH_REFRESH_TOKEN,
  );
}

module.exports = {
  createYouTubePlaylist,
  getYouTubeAccessToken,
  isYouTubePlaylistConfigured,
};
