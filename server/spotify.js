const axios = require('axios');

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: process.env.SPOTIFY_CLIENT_ID,
        password: process.env.SPOTIFY_CLIENT_SECRET,
      },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return accessToken;
}

/** Rough genre hint per country — drives search, not literal country-name queries */
const COUNTRY_GENRES = {
  US: 'hip-hop',
  GB: 'pop',
  BR: 'latin',
  NG: 'afrobeats',
  KR: 'k-pop',
  JP: 'j-pop',
  DE: 'electronic',
  FR: 'pop',
  MX: 'latin',
  IN: 'bollywood',
  AR: 'latin',
  ZA: 'afrobeats',
  AU: 'pop',
  ES: 'latin',
  IT: 'pop',
};

/** Map our labels → Spotify search genre tags */
const GENRE_TO_SEARCH_TAG = {
  'hip-hop': 'hip-hop',
  pop: 'pop',
  latin: 'latin',
  afrobeats: 'afrobeat',
  'k-pop': 'k-pop',
  'j-pop': 'j-pop',
  electronic: 'electronic',
  bollywood: 'indian',
};

const MARKET_FALLBACK = 'US';

function mapTrack(item) {
  if (!item?.id) return null;
  return {
    id: item.id,
    name: item.name,
    artist: item.artists?.[0]?.name ?? 'Unknown',
    preview_url: item.preview_url ?? null,
    spotify_url: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
    popularity: typeof item.popularity === 'number' ? item.popularity : 0,
  };
}

function dedupeById(tracks) {
  const seen = new Set();
  return tracks.filter((t) => {
    if (!t?.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function effectiveMarket(countryCode) {
  const c = countryCode.toUpperCase();
  const invalid = new Set(['AQ', 'BV', 'HM', 'TF']);
  if (invalid.has(c)) return MARKET_FALLBACK;
  return c;
}

function primaryGenreTag(countryCode) {
  const internal = COUNTRY_GENRES[countryCode.toUpperCase()] || 'pop';
  return GENRE_TO_SEARCH_TAG[internal] || internal;
}

/**
 * Several genre/year queries (no country name) so results feel like music from that market,
 * not novelty songs titled after the place.
 */
function buildSearchQueries(countryCode) {
  const code = countryCode.toUpperCase();
  const internal = COUNTRY_GENRES[code] || 'pop';
  const tag = primaryGenreTag(code);
  const y = new Date().getFullYear();
  const y1 = y - 1;
  const y2 = y - 2;

  /** Keyword search (not “India” the country name as sole query — uses scene + year) */
  if (internal === 'bollywood') {
    return [
      `bollywood year:${y}`,
      `hindi year:${y}`,
      `punjabi year:${y1}`,
    ];
  }

  const latin = [
    `genre:${tag} year:${y}`,
    `genre:reggaeton year:${y}`,
    `genre:latin-pop year:${y1}`,
  ];
  const hiphop = [`genre:${tag} year:${y}`, `genre:rap year:${y1}`, `genre:hip-hop year:${y2}`];
  const pop = [`genre:pop year:${y}`, `genre:indie year:${y1}`, `genre:dance year:${y}`];
  const kpop = [`genre:k-pop year:${y}`, `genre:k-pop year:${y1}`,
  ];
  const jpop = [`genre:j-pop year:${y}`, `genre:j-pop year:${y1}`,
  ];
  const electronic = [`genre:electronic year:${y}`, `genre:house year:${y1}`, `genre:techno year:${y}`];
  const afro = [`genre:afrobeat year:${y}`, `genre:afrobeat year:${y1}`, `genre:hip-hop year:${y}`];

  if (tag === 'latin') return latin;
  if (tag === 'hip-hop') return hiphop;
  if (tag === 'k-pop') return kpop;
  if (tag === 'j-pop') return jpop;
  if (tag === 'electronic') return electronic;
  if (tag === 'afrobeat') return afro;
  return pop;
}

async function searchTracks(token, q, market, limit) {
  const url =
    `https://api.spotify.com/v1/search?` +
    new URLSearchParams({
      q,
      type: 'track',
      market,
      limit: String(limit),
    });
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (data.tracks?.items || []).map(mapTrack).filter(Boolean);
}

/**
 * Tracks trending in that market: genre + year searches (no country name),
 * merged, deduped, sorted by Spotify popularity.
 */
async function getTopTracksForCountry(countryCode) {
  const token = await getAccessToken();
  const market = effectiveMarket(countryCode);
  const queries = buildSearchQueries(countryCode.toUpperCase());
  const perQuery = 4;

  const batches = await Promise.all(
    queries.map((q) => searchTracks(token, q, market, perQuery).catch(() => [])),
  );

  let flat = batches.flat();
  flat = dedupeById(flat);
  flat.sort((a, b) => b.popularity - a.popularity);

  const out = flat.slice(0, 10).map(({ popularity: _p, ...rest }) => rest);

  if (out.length >= 5) return out;

  // Last resort: single broad genre search in market
  try {
    const tag = primaryGenreTag(countryCode);
    const extra = await searchTracks(token, `genre:${tag}`, market, 10);
    const merged = dedupeById([...flat.map((t) => ({ ...t, popularity: t.popularity ?? 0 })), ...extra]);
    merged.sort((a, b) => b.popularity - a.popularity);
    return merged.slice(0, 10).map(({ popularity: _p, ...rest }) => rest);
  } catch (e) {
    console.error('getTopTracksForCountry fallback failed:', e.response?.data || e.message);
    return out;
  }
}

async function createPlaylist(name, description, trackUris) {
  const token = await getAccessToken();

  const playlistResponse = await axios.post(
    'https://api.spotify.com/v1/me/playlists',
    { name, description, public: true },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const playlistId = playlistResponse.data.id;

  await axios.post(
    `https://api.spotify.com/v1/playlists/${playlistId}/items`,
    { uris: trackUris },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return playlistResponse.data.external_urls.spotify;
}

module.exports = { getTopTracksForCountry, createPlaylist, COUNTRY_GENRES };
