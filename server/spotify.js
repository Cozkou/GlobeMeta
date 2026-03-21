const axios = require('axios');

let accessToken = null;
let tokenExpiry = null;

/**
 * Global cooldown: when Spotify sends a long Retry-After (e.g. hours), we skip all
 * Search API calls until the cooldown expires instead of hammering a banned endpoint.
 */
let spotifyCooldownUntil = 0;

/** One search at a time — parallel `/v1/search` calls (globe + Crystal + bot) easily trigger 429. */
let spotifySearchLock = Promise.resolve();

/**
 * @returns {Promise<() => void>}
 */
async function acquireSpotifySearchLock() {
  const prev = spotifySearchLock;
  let release;
  spotifySearchLock = new Promise((resolve) => {
    release = resolve;
  });
  await prev.catch(() => {});
  return release;
}

/** Max ms per YouTube row for Spotify matching; then skip (no playlist track for that row). */
const CRYSTAL_SPOTIFY_LOOKUP_MS = Math.max(
  5000,
  parseInt(process.env.CRYSTAL_SPOTIFY_LOOKUP_MS || '22000', 10) || 22000,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<{ timedOut: true } | { timedOut: false, value: T }>}
 */
async function withTimeout(promise, ms) {
  let tid;
  const timeoutP = new Promise((resolve) => {
    tid = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value) => {
          clearTimeout(tid);
          return { timedOut: false, value };
        },
        (err) => {
          clearTimeout(tid);
          throw err;
        },
      ),
      timeoutP,
    ]);
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

/**
 * Spotify returns 429 when requests burst; respect Retry-After and back off.
 * @param {object} config - axios request config (e.g. `{ headers: { Authorization: 'Bearer …' } }`)
 */
async function spotifyGet(url, config = {}, { maxRetries = 2 } = {}) {
  const isSearch = typeof url === 'string' && url.includes('/v1/search');
  const run = async () => {
    if (Date.now() < spotifyCooldownUntil) {
      const remainMin = Math.ceil((spotifyCooldownUntil - Date.now()) / 60000);
      const err = new Error(`Spotify API cooldown active (${remainMin} min remaining)`);
      err.response = { status: 429 };
      throw err;
    }

    let attempt = 0;
    while (true) {
      try {
        return await axios.get(url, { timeout: 8000, ...config });
      } catch (e) {
        const status = e.response?.status;
        if (status === 429) {
          const ra = parseInt(e.response?.headers?.['retry-after'], 10);

          // If Spotify asks us to wait more than 5 minutes, set a global cooldown and stop all requests.
          if (Number.isFinite(ra) && ra > 300) {
            spotifyCooldownUntil = Date.now() + ra * 1000;
            const hrs = (ra / 3600).toFixed(1);
            console.error(`[Spotify] Hard rate-limit: Retry-After ${ra}s (~${hrs}h). All requests paused until cooldown expires.`);
            throw e;
          }

          if (attempt < maxRetries) {
            const baseWait =
              Number.isFinite(ra) && ra > 0
                ? Math.min(ra * 1000, 45000)
                : Math.min(1000 * 2 ** attempt, 24000);
            const jitter = Math.floor(Math.random() * 400);
            const waitMs = baseWait + jitter;
            console.warn(
              `[Spotify Web API] 429 rate limit — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`,
            );
            await sleep(waitMs);
            attempt += 1;
            continue;
          }
        }
        throw e;
      }
    }
  };

  if (!isSearch) return run();
  const release = await acquireSpotifySearchLock();
  try {
    return await run();
  } finally {
    release();
  }
}

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
      timeout: 10000,
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

const COMPILATION_BAD = /mixtape|compilation|various artists|karaoke/i;

function isProperTrack(item) {
  if (!item?.id) return false;
  const albumType = item.album?.album_type;
  if (albumType === 'compilation') return false;
  const artist = item.artists?.[0]?.name ?? '';
  if (/^Various Artists$/i.test(artist)) return false;
  const trackName = item.name ?? '';
  const albumName = item.album?.name ?? '';
  if (COMPILATION_BAD.test(trackName) || COMPILATION_BAD.test(albumName)) return false;
  return true;
}

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

async function searchTrackItems(
  token,
  q,
  market,
  limit,
  filterCompilations = false,
  spotifyGetOptions = {},
) {
  const requestLimit = filterCompilations ? Math.min(limit * 3, 50) : limit;
  const params = {
    q,
    type: 'track',
    limit: String(Math.min(requestLimit, 50)),
  };
  if (market) params.market = market;
  const url = `https://api.spotify.com/v1/search?` + new URLSearchParams(params);
  const { data } = await spotifyGet(
    url,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    { maxRetries: 5, ...spotifyGetOptions },
  );
  let items = data.tracks?.items || [];
  if (filterCompilations) {
    items = items.filter(isProperTrack);
  }
  return items.slice(0, limit);
}

async function searchTracks(
  token,
  q,
  market,
  limit,
  filterCompilations = false,
  spotifyGetOptions = {},
) {
  const items = await searchTrackItems(token, q, market, limit, filterCompilations, spotifyGetOptions);
  return items.map(mapTrack).filter(Boolean);
}

/**
 * Tracks trending in that market: genre + year searches (no country name),
 * merged, deduped, sorted by Spotify popularity.
 */
const BETWEEN_SEARCH_MS = 120;

/** Pause before country fallback search so we don’t hammer Search right after a 429. */
const BETWEEN_COUNTRY_FALLBACK_MS = Math.max(
  200,
  parseInt(process.env.SPOTIFY_COUNTRY_GAP_MS || '700', 10) || 700,
);

/** Country panel: extra retries on top of searchTrackItems default (optional). */
const SPOTIFY_COUNTRY_SEARCH = { maxRetries: 6 };

/**
 * Globe / country “top tracks”: Spotify Search API only (`api.spotify.com/v1/search`).
 * Uses **one primary request** per country (was 3+ queries + fallback, which tripped rate limits).
 */
async function getTopTracksForCountry(countryCode) {
  const token = await getAccessToken();
  const market = effectiveMarket(countryCode);
  const code = countryCode.toUpperCase();
  const internal = COUNTRY_GENRES[code] || 'pop';
  const tag = primaryGenreTag(code);
  const y = new Date().getFullYear();

  const primaryQuery =
    internal === 'bollywood' ? `bollywood year:${y}` : `genre:${tag} year:${y}`;

  let tracks = [];
  try {
    tracks = await searchTracks(token, primaryQuery, market, 15, true, SPOTIFY_COUNTRY_SEARCH);
  } catch (e) {
    const st = e.response?.status;
    console.warn('[Spotify country] primary failed:', primaryQuery.slice(0, 72), st || e.message);
    // Do not return on 429 — after backoff, broad `genre:` often succeeds; early return skipped fallback.
  }

  if (tracks.length === 0 && internal !== 'bollywood') {
    try {
      await sleep(BETWEEN_COUNTRY_FALLBACK_MS);
      tracks = await searchTracks(token, `genre:${tag}`, market, 12, true, SPOTIFY_COUNTRY_SEARCH);
    } catch (e) {
      const st = e.response?.status;
      console.warn('[Spotify country] broad genre failed:', st || e.message);
    }
  }

  if (tracks.length === 0 && internal === 'bollywood') {
    try {
      await sleep(BETWEEN_COUNTRY_FALLBACK_MS);
      tracks = await searchTracks(token, `hindi year:${y}`, market, 12, true, SPOTIFY_COUNTRY_SEARCH);
    } catch (e) {
      console.warn('[Spotify country] bollywood fallback failed:', e.response?.status || e.message);
    }
  }

  tracks = dedupeById(tracks);
  tracks.sort((a, b) => b.popularity - a.popularity);
  return tracks.slice(0, 10).map(({ popularity: _p, ...rest }) => rest);
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

function buildMoodSearchQueries(energy, valence) {
  const v = valence;
  const e = energy;
  const y = new Date().getFullYear();
  if (v > 0.65 && e > 0.6) {
    return [`upbeat pop year:${y}`, `feel good hits year:${y}`, `happy pop year:${y - 1}`];
  }
  if (v < 0.4 && e < 0.5) {
    return [`sad acoustic year:${y}`, `mellow ballads year:${y}`, `emotional songs year:${y - 1}`];
  }
  return [`chill pop year:${y}`, `relaxing music year:${y}`, `indie pop year:${y - 1}`];
}

async function runSearchesSequential(token, queries, market, limit, filterCompilations) {
  const batches = [];
  for (let i = 0; i < queries.length; i += 1) {
    if (i > 0) await sleep(BETWEEN_SEARCH_MS);
    try {
      batches.push(await searchTracks(token, queries[i], market, limit, filterCompilations));
    } catch {
      batches.push([]);
    }
  }
  return batches;
}

async function getTracksByMood(energy, valence, danceability) {
  const e = Math.max(0.1, Math.min(1, energy));
  const v = Math.max(0.1, Math.min(1, valence));

  const token = await getAccessToken();
  const queries = buildMoodSearchQueries(e, v);
  const markets = ['US', 'GB', 'CA', 'AU'];

  for (const market of markets) {
    const batches = await runSearchesSequential(token, queries, market, 10, true);
    let flat = batches.flat();
    flat = dedupeById(flat);
    flat = flat.filter((t) => t.preview_url);
    flat.sort((a, b) => b.popularity - a.popularity);
    if (flat.length > 0) return flat.slice(0, 10);
  }

  for (const market of markets) {
    const batches = await runSearchesSequential(token, queries, market, 15, false);
    let flat = batches.flat();
    flat = dedupeById(flat);
    flat = flat.filter((t) => t.preview_url);
    flat.sort((a, b) => b.popularity - a.popularity);
    if (flat.length > 0) return flat.slice(0, 10);
  }

  const moodCountries = [
    { e: 0.8, v: 0.7, code: 'US' },
    { e: 0.6, v: 0.8, code: 'BR' },
    { e: 0.7, v: 0.7, code: 'GB' },
    { e: 0.7, v: 0.6, code: 'CA' },
  ];
  for (const { code } of moodCountries) {
    const fallback = await getTopTracksForCountry(code);
    const withPreview = fallback.filter((t) => t.preview_url);
    if (withPreview.length > 0) return withPreview.slice(0, 10);
  }
  return [];
}

/** Strip typical YouTube cruft so Spotify search matches real songs */
function cleanYoutubeTitleForSearch(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.replace(/\s+/g, ' ').trim();
  const patterns = [
    /\s*[\[(](official\s*)?(music\s*)?video[\])]/gi,
    /\s*[\[(]official\s*audio[\])]/gi,
    /\s*[\[(]lyrics?[\])]/gi,
    /\s*[\[(](hd|4k|8k)[\])]/gi,
    /\s*[\[(]visualizer[\])]/gi,
    /\s*\|\s*vertical\s*video/gi,
    /\s*#\w+/g,
    /\s*•\s*official.*$/i,
    /\s*[\[(]audio[\])]/gi,
    /\s*[\[(]full\s*album[\])]/gi,
    /\s*[\[(]extended\s*(version)?[\])]/gi,
    /\s*[\[(]radio\s*edit[\])]/gi,
    /\s*[\[(][^[\]]*remaster(ed)?[^[\]]*[\])]/gi,
    /\s*[\[(][^[\]]*re-?recorded[^[\]]*[\])]/gi,
    /\s*[\[(][^[\]]*from\s*["']?[^"']+["']?[\])]/gi,
    /\s*[\[(]from\s*["']?[^"']+["']?[\])]/gi,
    /\s*[\[(][^[\]]*\bfeat\.?\s[^[\]]+[\])]/gi,
    /\s*[\[(][^[\]]*\bft\.?\s[^[\]]+[\])]/gi,
    /\s*\(\s*feat\.?\s[^)]+\)/gi,
    /\s*\(\s*ft\.?\s[^)]+\)/gi,
    /\s*[\[(][^[\]]*\bvs\.?\s[^[\]]+[\])]/gi,
    /\s*[\[(]live[^[\]]*[\])]/gi,
    /\s*-\s*live(\s+at\s+[^|-]+)?$/i,
  ];
  for (const re of patterns) s = s.replace(re, ' ');
  s = s.replace(/\s*feat\.?\s[^|-]+/gi, ' ');
  s = s.replace(/\s*ft\.?\s[^|-]+/gi, ' ');
  s = s.replace(/\s*-\s*topic\s*$/i, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 200);
}

function spotifySearchFragment(s) {
  const t = s.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= 100) return t;
  const cut = t.slice(0, 100);
  const sp = cut.lastIndexOf(' ');
  return sp > 40 ? cut.slice(0, sp) : cut;
}

/** For unquoted Spotify field: strip colons / odd chars that break the query */
function spotifyFieldFragment(s) {
  return spotifySearchFragment(s).replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
}

function crystalLookupMarkets(primary) {
  const m = effectiveMarket((primary || 'US').toUpperCase());
  if (m === 'US') return ['US', 'GB'];
  return [m, 'US'];
}

/** YouTube channel name is often the recording artist; skip obvious non-artist channels */
function channelLooksLikeArtist(name) {
  if (!name || name.length < 2 || name.length > 90) return false;
  return !/karaoke|nightcore|\b1\s*hour\b|\bmashup\b|cover\s*songs?|\blyrics?\s*only\b|fan\s*page|bootleg|\bplaylist\b|\bcompilation\b|tuning\s*music|audio\s*library|free\s*music|no\s*copyright/i.test(
    name,
  );
}

/** "Artist - Song" / "Song — Artist" / "Artist: Song" (first separator wins) */
function splitYoutubeArtistTitle(cleaned) {
  if (!cleaned || cleaned.length < 4) return null;
  const seps = [' — ', ' – ', ' - ', ' | ', ' // ', ' : ', ': '];
  for (const sep of seps) {
    const i = cleaned.indexOf(sep);
    if (i === -1) continue;
    const left = cleaned.slice(0, i).trim();
    const right = cleaned.slice(i + sep.length).trim();
    if (left.length >= 2 && right.length >= 2) return { left, right };
  }
  return null;
}

function normalizeMatchStr(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(s, minLen = 3) {
  const n = normalizeMatchStr(s);
  return n.split(/\s+/).filter((w) => w.length >= minLen);
}

/**
 * Prefer tracks whose name/artist overlap the YouTube title & channel, not only Spotify popularity.
 */
function scoreTrackAgainstYoutube(track, cleanedTitle, channelTitle, parts) {
  if (!track?.name) return -1;
  const tn = normalizeMatchStr(track.name);
  const an = normalizeMatchStr(track.artist || '');
  const ct = normalizeMatchStr(cleanedTitle);
  const ch = normalizeMatchStr(
    (channelTitle || '').replace(/\s*-\s*topic\s*$/i, '').trim(),
  );

  let score = 0;
  const titleToks = significantTokens(cleanedTitle, 2);
  for (const w of titleToks) {
    if (w.length < 2) continue;
    if (tn.includes(w)) score += 3;
    if (an.includes(w)) score += 1;
  }
  if (ct.length >= 4 && (tn.includes(ct) || ct.includes(tn))) score += 12;
  if (parts) {
    const L = normalizeMatchStr(parts.left);
    const R = normalizeMatchStr(parts.right);
    if (L.length >= 2 && R.length >= 2) {
      const leftInArtist = an.includes(L) || L.includes(an) || tokenOverlap(L, an) >= 0.5;
      const rightInTrack = tn.includes(R) || R.includes(tn) || tokenOverlap(R, tn) >= 0.5;
      const leftInTrack = tn.includes(L) || L.includes(tn) || tokenOverlap(L, tn) >= 0.5;
      const rightInArtist = an.includes(R) || R.includes(an) || tokenOverlap(R, an) >= 0.5;
      if (leftInArtist && rightInTrack) score += 18;
      if (leftInTrack && rightInArtist) score += 14;
    }
  }
  if (ch.length >= 3) {
    if (an.includes(ch) || ch.includes(an) || tokenOverlap(ch, an) >= 0.45) score += 10;
  }

  const junk = /karaoke|nightcore|8d audio|cover band|tribute|chipmunk|slowed\s*\+\s*reverb/i;
  if (junk.test(track.name) && !junk.test(cleanedTitle)) score -= 25;

  const pop = typeof track.popularity === 'number' ? track.popularity : 0;
  return score + Math.log1p(pop) * 0.35;
}

function tokenOverlap(a, b) {
  const ta = new Set(significantTokens(a, 2));
  const tb = new Set(significantTokens(b, 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

function pickBestFromSpotifyApiItems(items, cleanedTitle, channelTitle, parts) {
  let best = null;
  let bestS = -1e9;
  for (const item of items) {
    const track = mapTrack(item);
    if (!track) continue;
    const s = scoreTrackAgainstYoutube(track, cleanedTitle, channelTitle, parts);
    if (s > bestS) {
      bestS = s;
      best = track;
    }
  }
  if (!best) return { track: null, score: -1e9 };
  if (bestS < 2) {
    const mapped = items.map(mapTrack).filter(Boolean);
    mapped.sort((a, b) => b.popularity - a.popularity);
    return { track: mapped[0] ?? best, score: bestS };
  }
  return { track: best, score: bestS };
}

/**
 * Map YouTube title/channel → Spotify: loose field queries first (quoted phrases are brittle),
 * then channel+title, then plain text; score candidates by overlap with YouTube metadata.
 */
async function searchBestTrackForYoutubeTitle(token, market, rawTitle, channelTitle = '') {
  const cleaned = cleanYoutubeTitleForSearch(rawTitle);
  const rawTrim = (rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const parts = splitYoutubeArtistTitle(cleaned);

  const queries = [];

  if (parts) {
    const a0 = spotifyFieldFragment(parts.left);
    const a1 = spotifyFieldFragment(parts.right);
    const q0 = spotifySearchFragment(parts.left);
    const q1 = spotifySearchFragment(parts.right);
    if (a0 && a1) {
      queries.push(`track:${a1} artist:${a0}`);
      queries.push(`track:${a0} artist:${a1}`);
      queries.push(`${a0} ${a1}`);
      queries.push(`${a1} ${a0}`);
      if (q0 && q1) {
        queries.push(`track:"${q1}" artist:"${q0}"`);
        queries.push(`track:"${q0}" artist:"${q1}"`);
      }
    }
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const t = spotifyFieldFragment(byMatch[1]);
    const a = spotifyFieldFragment(byMatch[2]);
    const tq = spotifySearchFragment(byMatch[1]);
    const aq = spotifySearchFragment(byMatch[2]);
    if (t && a) {
      queries.push(`track:${t} artist:${a}`);
      if (tq && aq) queries.push(`track:"${tq}" artist:"${aq}"`);
    }
  }

  const chRaw = cleanYoutubeTitleForSearch(channelTitle).replace(/\s*-\s*topic\s*$/i, '').trim();
  const ch = spotifyFieldFragment(chRaw);
  const chQ = spotifySearchFragment(chRaw);
  if (ch && channelLooksLikeArtist(chRaw) && cleaned.length >= 3) {
    queries.push(`track:${spotifyFieldFragment(cleaned)} artist:${ch}`);
    queries.push(`${ch} ${spotifyFieldFragment(cleaned)}`);
    if (chQ) {
      queries.push(`track:"${spotifySearchFragment(cleaned)}" artist:"${chQ}"`);
    }
    const beforeParen = cleaned.split('(')[0].trim();
    if (beforeParen.length >= 3 && beforeParen !== cleaned) {
      queries.push(`track:${spotifyFieldFragment(beforeParen)} artist:${ch}`);
    }
  }

  if (cleaned.length >= 2) queries.push(cleaned);
  if (rawTrim.length >= 2 && rawTrim !== cleaned) queries.push(rawTrim);

  const seen = new Set();
  const unique = queries.filter((q) => {
    if (!q || seen.has(q)) return false;
    seen.add(q);
    return true;
  });

  const primaryMarket = effectiveMarket((market || 'US').toUpperCase());
  let globalBest = null;
  let globalScore = -1e9;
  let lastGoodQuery = unique[0] || cleaned || '';

  const LIMIT = 15;
  const EARLY_EXIT_SCORE = 18;
  const MAX_QUERIES = 4;

  const capped = unique.slice(0, MAX_QUERIES);

  for (let j = 0; j < capped.length; j += 1) {
    if (j > 0) await sleep(BETWEEN_SEARCH_MS);
    const q = capped[j];
    try {
      const items = await searchTrackItems(token, q, primaryMarket, LIMIT, false);
      if (items.length > 0) {
        const { track, score } = pickBestFromSpotifyApiItems(items, cleaned, channelTitle, parts);
        if (track && score > globalScore) {
          globalScore = score;
          globalBest = track;
          lastGoodQuery = q;
        }
        if (globalScore >= EARLY_EXIT_SCORE) {
          return { track: globalBest, queryUsed: lastGoodQuery };
        }
      }
    } catch (e) {
      console.warn('Spotify search failed for query:', q.slice(0, 80), e.message);
    }
  }

  if (!globalBest && capped.length > 0) {
    try {
      await sleep(BETWEEN_SEARCH_MS);
      const items = await searchTrackItems(token, capped[0], null, LIMIT, false);
      if (items.length > 0) {
        const { track } = pickBestFromSpotifyApiItems(items, cleaned, channelTitle, parts);
        if (track) return { track, queryUsed: capped[0] };
      }
    } catch {
      /* */
    }
  }

  return { track: globalBest, queryUsed: lastGoodQuery };
}

async function resolveCrystalSessionVideoRow(token, v, market = 'US') {
  try {
    const raced = await withTimeout(
      searchBestTrackForYoutubeTitle(token, market, v.title || '', v.channelTitle || ''),
      CRYSTAL_SPOTIFY_LOOKUP_MS,
    );
    if (raced.timedOut) {
      console.warn(
        'Crystal Spotify lookup timed out (skipped, not in playlist):',
        v.videoId,
        (v.title || '').slice(0, 80),
      );
      return {
        videoId: v.videoId || '',
        youtubeTitle: v.title || '',
        searchQuery: '(lookup timed out — skipped)',
        spotify: null,
      };
    }
    const { track, queryUsed } = raced.value;
    return {
      videoId: v.videoId || '',
      youtubeTitle: v.title || '',
      searchQuery: queryUsed,
      spotify: track
        ? { id: track.id, name: track.name, artist: track.artist, spotify_url: track.spotify_url }
        : null,
    };
  } catch (err) {
    console.error('resolveCrystal row:', v.videoId, err.message);
    return {
      videoId: v.videoId || '',
      youtubeTitle: v.title || '',
      searchQuery: '',
      spotify: null,
    };
  }
}

/**
 * Yields one { index, total, match } per video for streaming NDJSON progress to the client.
 */
async function* iterateCrystalSpotifyMatches(videos, market = 'US') {
  const token = await getAccessToken();
  const list = Array.isArray(videos) ? videos.slice(0, 40) : [];
  const total = list.length;
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) await sleep(BETWEEN_SEARCH_MS);
    const match = await resolveCrystalSessionVideoRow(token, list[i], market);
    yield { index: i + 1, total, match };
  }
}

/**
 * Map each Crystal session YouTube entry to the best-matching Spotify track (search by title).
 * Sequential requests to respect rate limits.
 */
async function resolveCrystalSessionVideosToSpotify(videos, market = 'US') {
  const out = [];
  for await (const chunk of iterateCrystalSpotifyMatches(videos, market)) {
    out.push(chunk.match);
  }
  return out;
}

function getSpotifyCooldownRemaining() {
  return Math.max(0, spotifyCooldownUntil - Date.now());
}

module.exports = {
  getTopTracksForCountry,
  createPlaylist,
  getTracksByMood,
  COUNTRY_GENRES,
  resolveCrystalSessionVideosToSpotify,
  iterateCrystalSpotifyMatches,
  getSpotifyCooldownRemaining,
};
