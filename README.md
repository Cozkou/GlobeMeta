# Pulse Earth Vibes

Globe UI + Node server that loads **Spotify** top tracks per country and can create playlists.

## Luffa bot (polling)

Luffa uses **polling**, not webhooks. The server polls `https://apibot.luffa.im/robot/receive` every second and replies via `robot/send` (DM) or `robot/sendGroup` (group).

**Setup:** Set `LUFFA_BOT_SECRET` in `server/.env` (your Robot Key from the Luffa dashboard). For full AI replies (intents + conversational “hi”), also set **`CLAUDE_API_KEY`** (Anthropic). Without it, the bot still answers with short canned fallbacks. No webhook URL or ngrok needed.

**Run:** `cd server && node index.js`. You should see `Luffa: polling started`, then about every **15 seconds** an idle line while the inbox is empty. When something is queued you’ll see `Luffa: message received — …` then `queued message` / `reply sent`. Replies are processed **one at a time** so bursts of DMs don’t all finish Claude at once (which used to feel like a freeze then a wall of replies). Short greetings like `hi` use a **fast path** without calling Claude. For **every-tick** poll logs, set `LUFFA_DEBUG=1` in `server/.env`.

Supported intents (country must be in the message):

- Create a playlist from that country's trending tracks (Spotify URL in reply)
- Ask what's trending
- Ask for the "vibe" (energy / danceability / valence)
