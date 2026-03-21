/**
 * Shared heuristics for YouTube search results (Crystal Ball + globe).
 */

function isLyricVideo(item) {
  const title = (item.snippet?.title || '').toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase();
  const combined = `${title} ${desc}`;
  return /\blyric\b|lyrics\s*video/i.test(combined);
}

/**
 * Drop playlist-style uploads, remixes, covers, karaoke, and common reupload edits.
 */
function isExcludedPlaylistRemixCover(item) {
  const titleRaw = item.snippet?.title || '';
  const title = titleRaw.toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase().slice(0, 1000);
  const channel = (item.snippet?.channelTitle || '').toLowerCase();
  const blob = `${title} ${desc} ${channel}`;

  if (/taylor['\u2019]s\s+version\b/i.test(titleRaw)) return false;

  if (
    /\bplaylist\b|\bplaylists\b|\bfull\s+album\b|\bcomplete\s+album\b|\bentire\s+album\b|\ball\s+songs\b|\bnon-?stop\b|\b\d+\s*hours?\b|\bhours?\s+of\b|\bhour\s+loop\b|\bmega\s+mix\b|\bgreatest\s+hits\b|\bdiscography\b|\bcompilation\b|\bsupercut\b|\b\d+\s*songs?\s+in\b|\btop\s+\d+\s+songs\b|\b100\s+songs\b|\bmix\s*202\d\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  if (
    /\bremix\b|\brmx\b|\bre-?mix(ed)?\b|\bmash-?up\b|\bmashup\b|\bnightcore\b|\b8d\s+audio\b|\b8d\s+sound\b|\bslowed\s*(down|reverb|\+)?\b|\bsped\s*up\b|\bspeed\s*(up|song)\b|\bfan\s+edit\b|\btik\s*tok\s+version\b|\bvc\b|\bedit\s*audio\b|\bbootleg\b|\bextended\s+mix\b|\bclub\s+mix\b|\bdance\s+mix\b|\bphonk\b|\btype\s+beat\b|\bvaporwave\s+edit\b|\bchopped\b|\bscrewed\b|\breimagined\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  if (
    /\bcover\b|\bcovers\b|\bcovered\s+by\b|\bcover\s+of\b|\bmy\s+cover\b|\bfirst\s+cover\b|\bkaraoke\b|\bpiano\s+cover\b|\bguitar\s+cover\b|\bcello\s+cover\b|\bviolin\s+cover\b|\borchestral\s+cover\b|\bfemale\s+cover\b|\bmale\s+cover\b|\btribute\b|\bnot\s+official\b|\bfan\s+cover\b|\bduet\s+cover\b|\bwho\s+sang\s+it\s+better\b|\breaction\s+to\b|\breacts\s+to\b|\blive\s+cover\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  // Mega uploads, reuploads, templates
  if (
    /\b\d+\s*songs?\s+in\s+\d+\b|\bnon-?stop\s+mix\b|\bultimate\s+playlist\b|\bcapcut\b|\btransition\b|\bfree\s+download\b|\bno\s+copyright\s+sounds?\b|\bnocopyright\b|\bradio\s+edit\s+loop\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  if (
    /\b(karaoke|cover|covers|remix|nightcore|mashup|sped\s*up|slowed|8d|instrumental)\b/i.test(channel) &&
    !/\bvevo\b|\brecords\b|\bmusic\b.*\bofficial\b/i.test(channel)
  ) {
    return true;
  }

  return false;
}

function isAllowedYoutubeMusicVideo(item) {
  return Boolean(item?.id?.videoId) && !isExcludedPlaylistRemixCover(item);
}

function isInstrumentalOrLofi(item) {
  const title = (item.snippet?.title || '').toLowerCase();
  const channel = (item.snippet?.channelTitle || '').toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase().slice(0, 600);
  const blob = `${title} ${channel} ${desc}`;
  return /\binstrumental\b|\binstrumentals?\s+only\b|\bofficial\s+instrumental\b|\blofi\b|\blo-fi\b|\blo fi\b|\bpiano\s+version\b|\bstudy\s+music\b|\bsleep\s+music\b|\bmeditation\b|\bambient\b|\bbackground\s+music\b|\bno\s+vocals\b|\bbeat\s+only\b|\bvocals\s+removed\b|\bremove\s+vocals\b|\brelaxing\s+piano\b|\borchestral\s+version\b|\bstrings\s+version\b/i.test(
    blob,
  );
}

/**
 * Extra exclusions for globe “original singles” (stricter than Crystal random picks).
 */
function isGlobeDerivativeOrNoise(item) {
  const titleRaw = item.snippet?.title || '';
  const title = titleRaw.toLowerCase();
  const desc = (item.snippet?.description || '').toLowerCase().slice(0, 800);
  const channel = (item.snippet?.channelTitle || '').toLowerCase();
  const blob = `${title} ${desc} ${channel}`;

  if (/\[.*\bcover\b.*\]|\(.*\bcover\b.*\)/i.test(titleRaw)) return true;
  if (/\bvs\.?\s+[^|]+vs\.?\b/i.test(blob)) return true;
  if (/\b1\s*hour\b|\b10\s*hours?\b|\bhour\s+version\b|\bloop\b.*\bhour\b/i.test(blob)) return true;
  if (/\btop\s+\d+\s+(songs?|hits?|tracks?)\b/i.test(blob)) return true;
  if (/\ball\s+songs\b|\bevery\s+song\b|\bfull\s+soundtrack\b/i.test(blob)) return true;
  if (/\bchipmunk\b|\buse\s+headphones\b|\b8d\s+surround\b/i.test(blob)) return true;
  if (/\bconcert\s+compilation\b|\btour\s+highlights\b|\bbest\s+live\s+moments\b/i.test(blob)) return true;

  return false;
}

/**
 * Higher score = more likely an official release (used to rank globe results).
 */
function globeOfficialScore(item) {
  let s = 0;
  const title = (item.snippet?.title || '').toLowerCase();
  const ch = (item.snippet?.channelTitle || '').toLowerCase();

  if (/\bofficial\s*(music\s*)?(video|audio|mv|visualizer)\b/.test(title)) s += 5;
  else if (/\bofficial\b/.test(title)) s += 2;

  if (/\bvevo\b/.test(ch)) s += 4;
  if (/\s-\s*topic\s*$/i.test(ch) || /\s-\s*topic$/i.test(ch)) s += 3;
  if (/\b(records|music group|entertainment|label|official)\b/i.test(ch) && !/cover|remix|karaoke|nightcore/i.test(ch)) {
    s += 1;
  }

  if (/\b(cover|remix|karaoke|nightcore|mashup|slowed|sped\s*up|1\s*hour|hour\s+loop)\b/i.test(title)) s -= 8;

  return s;
}

module.exports = {
  isLyricVideo,
  isExcludedPlaylistRemixCover,
  isAllowedYoutubeMusicVideo,
  isInstrumentalOrLofi,
  isGlobeDerivativeOrNoise,
  globeOfficialScore,
};
