# Pulse Earth Vibes

Globe UI + Node server that loads **Spotify** top tracks per country and can create playlists.

## Luffa bot (webhook)

When someone messages your Luffa bot, Luffa should **POST** JSON to:

`https://<your-server>/webhook/luffa`

The handler accepts common field shapes for the incoming message and recipient, for example:

- **Message:** `message`, `text`, `content`, or `msg.text`
- **Reply to:** `userId`, `uid`, `groupId`, `recipientId`, or `from`

Set on the server:

| Variable | Purpose |
|----------|---------|
| `LUFFA_BOT_UID` | Bot UID from Luffa |
| `LUFFA_BOT_SECRET` | Bot secret for `https://api.luffa.im/bot/send` |
| `PUBLIC_APP_URL` | Optional. Base URL for “open globe” links (default: production URL) |
| Spotify + `CLAUDE_API_KEY` | Same as running the API locally — needed for intent parsing and playlist copy |

Supported intents (country must be clear in the message so the model returns a `countryCode`):

- Create a playlist from that country’s trending tracks (Spotify playlist URL in the reply)
- Ask what’s trending
- Ask for the “vibe” (energy / danceability / valence)
