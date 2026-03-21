/**
 * One-time Google OAuth to obtain YOUTUBE_OAUTH_REFRESH_TOKEN.
 * Run: cd server && node youtube-auth.js
 * Add http://127.0.0.1:8890/oauth2callback as Authorized redirect URI in Google Cloud Console.
 */
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const PORT = 8890;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const SCOPES = ['https://www.googleapis.com/auth/youtube'].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const app = express();

app.get('/', (_req, res) => {
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    '&response_type=code' +
    '&access_type=offline' +
    '&prompt=consent' +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  res.send(
    `<h2>GlobeMeta — YouTube playlist access</h2>` +
      `<p><a href="${authUrl}">Authorize YouTube</a> (creates playlists on your Google account).</p>` +
      `<p>After Google redirects here with <code>?code=...</code>, we print <code>YOUTUBE_OAUTH_REFRESH_TOKEN</code> in the terminal.</p>`,
  );
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing code. Start from <a href="/">home</a>.');
  }

  try {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
    );

    const refresh = tokenRes.data.refresh_token;
    console.log('\n========================================');
    if (refresh) {
      console.log('Add to server/.env:\n');
      console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN=${refresh}`);
    } else {
      console.log('No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and try again with prompt=consent (already set).');
      console.log('access_token (short-lived):', tokenRes.data.access_token?.slice(0, 24) + '…');
    }
    console.log('========================================\n');

    res.send(
      refresh
        ? '<p>Success. Copy <strong>YOUTUBE_OAUTH_REFRESH_TOKEN</strong> from the terminal into server/.env, then restart the API.</p>'
        : '<p>Check terminal output. You may need to revoke the app and authorize again.</p>',
    );
  } catch (e) {
    console.error('Token exchange failed:', e.response?.data || e.message);
    res.status(500).send('Token exchange failed — see server terminal.');
  }
});

app.listen(PORT, () => {
  console.log(`YouTube OAuth helper: http://127.0.0.1:${PORT}`);
  console.log(`Redirect URI (add in Google Cloud Console): ${REDIRECT_URI}`);
  console.log(
    'If Google shows 403 access_denied: OAuth consent screen → add this Google account under Test users (when app is in Testing), or use External + test users — see README.',
  );
});
