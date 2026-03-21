require('dotenv').config();
const axios = require('axios');

async function test() {
  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      }),
      {
        auth: {
          username: process.env.SPOTIFY_CLIENT_ID,
          password: process.env.SPOTIFY_CLIENT_SECRET,
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const token = tokenRes.data.access_token;
    const scope = tokenRes.data.scope;
    console.log('\nScopes on this token:', scope || '(none returned)');
    console.log('Has playlist-modify-public:', scope?.includes('playlist-modify-public') ? 'YES' : 'NO');

    const me = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('Logged in as:', me.data.display_name, `(${me.data.id})`);

    console.log('\nTrying to create a test playlist...');
    const playlist = await axios.post(
      'https://api.spotify.com/v1/me/playlists',
      { name: 'GlobeMeta Test (delete me)', description: 'Test playlist', public: false },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('SUCCESS! Playlist created:', playlist.data.external_urls.spotify);
    console.log('(You can delete it from Spotify)');
  } catch (err) {
    console.error('\nFAILED:', err.response?.status, err.response?.data || err.message);
    if (err.response?.status === 403) {
      console.error('\n>>> Your refresh token is missing playlist scopes.');
      console.error('>>> Run: node auth.js');
      console.error('>>> Then authorize and paste the new SPOTIFY_REFRESH_TOKEN into .env');
    }
  }
}

test();
