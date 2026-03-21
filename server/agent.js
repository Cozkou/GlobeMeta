const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function parseUserIntent(message) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Extract the intent from this message sent to GlobeMeta, a chill music bot. The backend has YouTube music picks per country (globe); use get_trending when the user wants charts, trending, hot tracks, or "top tracks" for a country.
      Return ONLY valid JSON with no extra text.

      Examples:
      Message: "give me top tracks in the USA"
      {"intent":"get_trending","country":"United States","countryCode":"US","mood":null}
      Message: "what's trending in Japan right now"
      {"intent":"get_trending","country":"Japan","countryCode":"JP","mood":null}
      Message: "make a playlist from Brazil"
      {"intent":"create_playlist","country":"Brazil","countryCode":"BR","mood":null}
      Message: "what's the vibe in France"
      {"intent":"get_vibe","country":"France","countryCode":"FR","mood":null}

      Message: "${message}"

      Message: "I'm feeling happy, play me something"
      {"intent":"crystal_mood","country":null,"countryCode":null,"mood":"happy"}
      Message: "I'm sad, what should I listen to?"
      {"intent":"crystal_mood","country":null,"countryCode":null,"mood":"sad"}
      Message: "play me something energetic"
      {"intent":"crystal_mood","country":null,"countryCode":null,"mood":"energetic"}

      Return format:
      {
        "intent": "create_playlist" | "get_trending" | "get_vibe" | "crystal_mood" | "unknown",
        "country": "country name or null",
        "countryCode": "2-letter ISO code or null",
        "mood": "any mood mentioned or null"
      }`
    }]
  });

  try {
    const text = response.content[0].text.trim();
    return JSON.parse(text);
  } catch {
    return { intent: 'unknown', country: null, countryCode: null, mood: null };
  }
}

async function generatePlaylistDetails(country, tracks) {
  const trackList = tracks.map(t => `${t.name} by ${t.artist}`).join(', ');
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Create a YouTube playlist name and description for a playlist of trending music videos from ${country}.
      Tracks include: ${trackList}
      
      Return ONLY valid JSON:
      {
        "name": "creative playlist name (max 50 chars)",
        "description": "engaging description (max 100 chars)",
        "message": "short warm message for GlobeMeta on Luffa (max 150 chars, relaxed tone like texting a friend, flag emoji ok, no markdown, no em dashes; you may sign off as GlobeMeta)"
      }`
    }]
  });

  try {
    const text = response.content[0].text.trim();
    return JSON.parse(text);
  } catch {
    return {
      name: `${country} Vibes`,
      description: `Trending music from ${country}`,
      message: `Here's what ${country} is into right now 🎵`
    };
  }
}

/**
 * Generate a helpful reply for any user message. Used when intent doesn't match
 * create_playlist / get_trending / get_vibe, or when no country is specified.
 */
async function generateReply(userMessage, context = {}) {
  const { countryData, countryCode } = context;
  let contextBlock = 'You are GlobeMeta, a relaxed, friendly music bot (think low-key group chat, not corporate). You help people discover trending music from around the world via YouTube (globe picks, playlists, vibe stats). Never claim you lack real data. If the user names a country, the app can load that country\'s picks; nudge them toward clear asks like trending or top tracks. Never use em dashes (the long dash character) in your replies.';
  if (countryData) {
    const tracks = countryData.tracks.slice(0, 5).map((t, i) => `${i + 1}. ${t.name} · ${t.artist}`).join('\n');
    contextBlock += `\n\nCurrent context: User asked about ${countryData.country}. Top tracks: ${tracks}. Energy ${Math.round(countryData.energy * 100)}%, Danceability ${Math.round(countryData.danceability * 100)}%, Valence ${Math.round(countryData.valence * 100)}%.`;
  } else {
    contextBlock += '\n\nNo specific country was mentioned. If they are asking about music, gently suggest naming a country or trying the globe. Keep it short and chill.';
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${contextBlock}\n\nUser message: "${userMessage}"\n\nReply as GlobeMeta. Helpful, short, on-topic, chill tone. Emojis sparingly. No markdown (no asterisks, underscores, backticks). No em dashes.`
    }]
  });

  try {
    return response.content[0].text.trim();
  } catch {
    return "I'm GlobeMeta. I help you find what's trending around the world. Try \"what's trending in Japan?\" or \"playlist from Brazil\" if you want 🎵";
  }
}

/**
 * Analyze text for vibe/mood. Returns energy, valence, danceability (0-1).
 */
async function analyzeVibe(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Analyze the mood/vibe of this text. Return ONLY valid JSON, no extra text.
      
Text: "${text}"

Return format:
{
  "energy": 0.0-1.0,
  "valence": 0.0-1.0,
  "danceability": 0.0-1.0,
  "mood": "one word label"
}

Guidelines: energy=high for excited/angry/intense, low for calm/sad/sleepy. valence=high for happy/positive, low for sad/negative. danceability=high for upbeat/groovy, low for slow/contemplative.`
    }]
  });

  try {
    const parsed = JSON.parse(response.content[0].text.trim());
    return {
      energy: Math.max(0.1, Math.min(1, parseFloat(parsed.energy) || 0.5)),
      valence: Math.max(0.1, Math.min(1, parseFloat(parsed.valence) || 0.5)),
      danceability: Math.max(0.1, Math.min(1, parseFloat(parsed.danceability) || 0.5)),
      mood: parsed.mood || 'neutral',
    };
  } catch {
    return { energy: 0.5, valence: 0.5, danceability: 0.5, mood: 'neutral' };
  }
}

/**
 * Generate a YouTube search query for music matching the vibe.
 */
async function generateYouTubeSearchQuery(text, vibe) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Generate a short YouTube music search query (4-8 words) for songs matching this vibe.
Text: "${text}"
Mood: ${vibe.mood || 'neutral'}, Energy: ${Math.round((vibe.energy || 0.5) * 100)}%, Valence: ${Math.round((vibe.valence || 0.5) * 100)}%

Avoid words that attract playlists, remixes, or covers (do not use: playlist, remix, cover, karaoke, nightcore, mashup, 8d, slowed, mix).
Return ONLY the search query, nothing else. Examples: "upbeat pop official audio 2024", "calm acoustic guitar official", "energetic dance hits official video".`
    }]
  });
  return response.content[0].text.trim().slice(0, 80) || 'chill music';
}

async function generateCrystalSessionPlaylistDetails(tracks) {
  if (!tracks || tracks.length === 0) {
    return { name: 'GlobeMeta Crystal Ball', description: 'Songs from your GlobeMeta face-detection session' };
  }
  const trackList = tracks.map((t) => `${t.name} by ${t.artist}`).join(', ');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Create a YouTube playlist name and description for a GlobeMeta Crystal Ball session. These videos were picked based on the user's facial expressions (happiness) during the session.
Tracks: ${trackList}

Return ONLY valid JSON:
{
  "name": "creative playlist name (max 50 chars, e.g. 'Mood Waves' or 'Face the Music')",
  "description": "engaging description (max 120 chars, mention it was generated from face detection)"
}`
    }]
  });
  try {
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    return {
      name: (parsed.name || 'GlobeMeta Crystal Ball').slice(0, 50),
      description: (parsed.description || 'Songs from your GlobeMeta face-detection session').slice(0, 120),
    };
  } catch {
    return { name: 'GlobeMeta Crystal Ball', description: 'Songs from your GlobeMeta face-detection session' };
  }
}

async function generateMoodSongReply(mood, tracks) {
  if (!tracks || tracks.length === 0) {
    return `Couldn't line up a track for that mood yet. Try wording it another way?`;
  }
  const top = tracks[0];
  const trackList = tracks.slice(0, 3).map((t, i) => `${i + 1}. ${t.name} · ${t.artist}`).join('\n');

  const listen = top.youtube_url || top.spotify_url || '';
  if (!process.env.CLAUDE_API_KEY) {
    return `For your "${mood}" mood:\n\n${trackList}\n\n${listen}`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `The user said they feel "${mood}". Matched tracks (GlobeMeta Crystal Ball on Luffa):\n${trackList}\n\nWrite 1-2 short sentences as GlobeMeta, chill and warm, recommending the top pick. No markdown. One emoji max is fine. No em dashes. End with "Listen here:" then newline.`,
      }],
    });
    const reply = response.content[0].text.trim();
    return `${reply}\n${listen}\n\n${trackList}`;
  } catch {
    return `For your "${mood}" mood:\n\n${trackList}\n\n${listen}`;
  }
}

async function generateDigestMessage(countrySummaries) {
  if (!process.env.CLAUDE_API_KEY) {
    return `Morning from GlobeMeta. Loose read on what different corners of the world are into:\n\n${countrySummaries}`;
  }
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Write a short, easy morning music digest from GlobeMeta. Chill, friendly, like a friend texting. No markdown. Light emoji ok. Do not use em dashes. Data:\n\n${countrySummaries}\n\nUnder 200 words. Greet casually and mention GlobeMeta once at the end.`,
      }],
    });
    return response.content[0].text.trim();
  } catch {
    return `Morning from GlobeMeta. Loose read on what different corners of the world are into:\n\n${countrySummaries}`;
  }
}

module.exports = { parseUserIntent, generatePlaylistDetails, generateReply, analyzeVibe, generateYouTubeSearchQuery, generateCrystalSessionPlaylistDetails, generateMoodSongReply, generateDigestMessage };