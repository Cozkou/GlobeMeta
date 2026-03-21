const axios = require('axios');

function isKeyError(err) {
  const status = err.response?.status;
  const code = err.response?.data?.error?.code;
  return status === 403 || status === 401 || code === 403 || code === 401;
}

/** True when the key/project hit the daily YouTube Data API search quota (not an auth bug). */
function isYoutubeQuotaExceededError(err) {
  const errors = err.response?.data?.error?.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => e?.reason === 'quotaExceeded' || e?.domain === 'youtube.quota');
}

function formatYoutubeApiError(err) {
  const msg = err.response?.data?.error?.message;
  if (typeof msg === 'string') return msg.replace(/<[^>]+>/g, '').trim();
  return err.message || String(err);
}

function getYoutubeApiKeys() {
  return [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean);
}

/**
 * @param {string} query
 * @param {string} key
 * @param {number} [maxResults]
 * @param {string|null} [regionCode] ISO 3166-1 alpha-2 for globe bias
 */
async function youtubeSearch(query, key, maxResults = 20, regionCode = null) {
  const params = {
    part: 'snippet',
    q: query,
    type: 'video',
    videoCategoryId: '10',
    maxResults,
    key,
  };
  if (regionCode) params.regionCode = regionCode;
  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', { params });
  return data;
}

async function youtubeSearchWithFallback(query, maxResults = 20, regionCode = null) {
  const keys = getYoutubeApiKeys();
  if (keys.length === 0) return null;
  let lastErr;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    try {
      return await youtubeSearch(query, key, maxResults, regionCode);
    } catch (err) {
      lastErr = err;
      const tryNext = isKeyError(err) && i < keys.length - 1;
      if (tryNext && isYoutubeQuotaExceededError(err)) {
        console.warn(
          '[YouTube API] Quota exceeded on one key; trying YOUTUBE_API_KEY_2 (if set).',
          formatYoutubeApiError(err).slice(0, 120),
        );
      }
      if (tryNext) continue;
      if (isYoutubeQuotaExceededError(err)) {
        const e = new Error(
          'YouTube Data API daily quota exceeded. Wait for reset (Pacific midnight), add YOUTUBE_API_KEY_2 from another Google Cloud project, or request a higher quota in Google Cloud Console.',
        );
        e.code = 'YOUTUBE_QUOTA_EXCEEDED';
        e.cause = err;
        throw e;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  isKeyError,
  isYoutubeQuotaExceededError,
  formatYoutubeApiError,
  getYoutubeApiKeys,
  youtubeSearch,
  youtubeSearchWithFallback,
};
