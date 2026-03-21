require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 8888;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'https://globe-meta.vercel.app/callback';

const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private',
  'user-read-email',
].join(' ');

app.get('/', (req, res) => {
  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  res.send(
    `<h2>GlobeMeta — Spotify Auth</h2>` +
    `<p>1. <a href="${authUrl}" target="_blank">Click here to authorize Spotify</a></p>` +
    `<p>2. After authorizing, you'll be redirected to a URL like:<br><code>https://globe-meta.vercel.app/callback?code=XXXXXX</code></p>` +
    `<p>3. Copy the <code>code</code> value from the URL and paste it below:</p>` +
    `<form action="/exchange" method="get">` +
    `<input name="code" placeholder="Paste the code here" style="width:500px;padding:8px;font-size:14px"/>` +
    `<button type="submit" style="padding:8px 16px;margin-left:8px">Get Token</button>` +
    `</form>`
  );
});

app.get('/exchange', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('No code provided.');

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        auth: { username: CLIENT_ID, password: CLIENT_SECRET },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token } = response.data;

    console.log('\n========================================');
    console.log('NEW REFRESH TOKEN (copy this to .env):');
    console.log(refresh_token);
    console.log('========================================\n');

    res.send(
      `<h2>Success!</h2>` +
      `<p>Your new refresh token has been printed in the terminal.</p>` +
      `<p>Copy it into your <code>server/.env</code> as <code>SPOTIFY_REFRESH_TOKEN</code>, then restart the server.</p>` +
      `<pre>${refresh_token}</pre>`
    );
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.send(`<h2>Error</h2><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT} in your browser to authorize Spotify.`);
});
