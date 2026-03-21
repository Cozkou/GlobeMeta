const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function parseUserIntent(message) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Extract the intent from this message sent to a music bot. 
      Return ONLY valid JSON with no extra text.
      
      Message: "${message}"
      
      Return format:
      {
        "intent": "create_playlist" | "get_trending" | "get_vibe" | "unknown",
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
      content: `Create a Spotify playlist name and description for a playlist of trending music from ${country}.
      Tracks include: ${trackList}
      
      Return ONLY valid JSON:
      {
        "name": "creative playlist name (max 50 chars)",
        "description": "engaging description (max 100 chars)",
        "message": "short exciting message to send to user (max 150 chars, include flag emoji, no markdown)"
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
      message: `Here's what ${country} is listening to right now 🎵`
    };
  }
}

/**
 * Generate a helpful reply for any user message. Used when intent doesn't match
 * create_playlist / get_trending / get_vibe, or when no country is specified.
 */
async function generateReply(userMessage, context = {}) {
  const { countryData, countryCode } = context;
  let contextBlock = 'You are Pulse Earth Vibes, a friendly music bot. You help people discover trending music from around the world via Spotify. You can create playlists, list trending tracks, and describe the vibe (energy, danceability, valence) for any country.';
  if (countryData) {
    const tracks = countryData.tracks.slice(0, 5).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join('\n');
    contextBlock += `\n\nCurrent context: User asked about ${countryData.country}. Top tracks: ${tracks}. Energy ${Math.round(countryData.energy * 100)}%, Danceability ${Math.round(countryData.danceability * 100)}%, Valence ${Math.round(countryData.valence * 100)}%.`;
  } else {
    contextBlock += '\n\nNo specific country was mentioned. If the user asks about music, suggest they try a country (e.g. "What\'s trending in Japan?" or "Make me a playlist from Brazil"). Keep replies concise and friendly.';
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${contextBlock}\n\nUser message: "${userMessage}"\n\nReply as the bot. Be helpful, concise, and on-topic. Use emojis sparingly. Do not use markdown (no asterisks, underscores, or backticks).`
    }]
  });

  try {
    return response.content[0].text.trim();
  } catch {
    return "I'm Pulse Earth Vibes — I help you discover trending music from around the world! Try asking: \"What's trending in Japan?\" or \"Make me a playlist from Brazil\" 🎵";
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
    return { name: 'My Crystal Ball Session', description: 'Songs from your face-detection session' };
  }
  const trackList = tracks.map((t) => `${t.name} by ${t.artist}`).join(', ');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Create a Spotify playlist name and description for a Crystal Ball session. These songs were picked based on the user's facial expressions (happiness) during the session.
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
      name: (parsed.name || 'My Crystal Ball Session').slice(0, 50),
      description: (parsed.description || 'Songs from your face-detection session').slice(0, 120),
    };
  } catch {
    return { name: 'My Crystal Ball Session', description: 'Songs from your face-detection session' };
  }
}

module.exports = { parseUserIntent, generatePlaylistDetails, generateReply, analyzeVibe, generateYouTubeSearchQuery, generateCrystalSessionPlaylistDetails };