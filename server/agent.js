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
        "message": "short exciting message to send to user (max 150 chars, include flag emoji)"
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

module.exports = { parseUserIntent, generatePlaylistDetails };