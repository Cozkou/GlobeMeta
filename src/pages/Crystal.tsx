import { useRef, useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import * as faceapi from '@vladmandic/face-api';
import { Loader2, Music, Archive } from 'lucide-react';

/** Circular RGB audio-wave visualizer drawn on a <canvas> right at the crystal ball edge. */
function CircularWaveCanvas({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]);
  const velRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BAR_COUNT = 120;
    if (barsRef.current.length !== BAR_COUNT) {
      barsRef.current = Array.from({ length: BAR_COUNT }, () => 0);
      velRef.current = Array.from({ length: BAR_COUNT }, () => 0);
    }
    const bars = barsRef.current;
    const vel = velRef.current;
    let raf = 0;
    let frame = 0;

    const hslForAngle = (angle: number): string => {
      const t = ((angle / (Math.PI * 2)) + 1) % 1;
      const m = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const hue = 270 + m * 210;
      return `hsl(${hue % 360}, 100%, 58%)`;
    };

    const draw = () => {
      const { width, height } = canvas;
      const cx = width / 2;
      const cy = height / 2;
      const ballRadius = Math.min(cx, cy) * 0.36;
      const maxBarLen = ballRadius * 0.35;

      ctx.clearRect(0, 0, width, height);

      if (!playing) {
        // Decay all bars to 0 when not playing
        for (let i = 0; i < BAR_COUNT; i++) {
          bars[i] *= 0.9;
          vel[i] *= 0.8;
        }
        if (bars.some(b => b > 0.01)) {
          // Still decaying — keep drawing
        } else {
          raf = requestAnimationFrame(draw);
          return;
        }
      } else {
        frame++;
        // Random impulsive spikes — several bars get kicked each frame
        const spikeCount = Math.random() < 0.3 ? Math.floor(3 + Math.random() * 8) : Math.floor(Math.random() * 3);
        for (let s = 0; s < spikeCount; s++) {
          const idx = Math.floor(Math.random() * BAR_COUNT);
          const strength = 0.5 + Math.random() * 0.5;
          vel[idx] = Math.max(vel[idx], strength);
          // Bleed into neighbors for organic look
          if (idx > 0) vel[idx - 1] = Math.max(vel[idx - 1], strength * 0.5);
          if (idx < BAR_COUNT - 1) vel[idx + 1] = Math.max(vel[idx + 1], strength * 0.5);
        }

        // Occasional big burst — hits a cluster of bars hard
        if (Math.random() < 0.06) {
          const center = Math.floor(Math.random() * BAR_COUNT);
          const spread = 4 + Math.floor(Math.random() * 10);
          for (let j = -spread; j <= spread; j++) {
            const idx = (center + j + BAR_COUNT) % BAR_COUNT;
            const falloff = 1 - Math.abs(j) / (spread + 1);
            vel[idx] = Math.max(vel[idx], (0.7 + Math.random() * 0.3) * falloff);
          }
        }

        for (let i = 0; i < BAR_COUNT; i++) {
          bars[i] += vel[i] * 0.6;
          bars[i] = Math.min(bars[i], 1);
          // Fast decay — bars drop quickly so spikes are sharp
          vel[i] *= 0.7;
          bars[i] *= 0.88;
        }
      }

      const barWidth = Math.max(2, (Math.PI * 2 * ballRadius) / BAR_COUNT * 0.5);

      for (let i = 0; i < BAR_COUNT; i++) {
        if (bars[i] < 0.01) continue;
        const h = bars[i] * maxBarLen;
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const x1 = cx + cos * (ballRadius + 2);
        const y1 = cy + sin * (ballRadius + 2);
        const x2 = cx + cos * (ballRadius + 2 + h);
        const y2 = cy + sin * (ballRadius + 2 + h);

        const color = hslForAngle(angle);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = barWidth;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio);
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = parent.clientWidth + 'px';
      canvas.style.height = parent.clientHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [playing]);

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  };

  return <canvas ref={canvasRef} style={style} />;
}

const API_BASE = import.meta.env.VITE_API_URL || '';
/** Min time between auto–music changes from mood shifts */
const HAPPINESS_DEBOUNCE_MS = 10_000;
/** Smoothed happiness must move this much (0–1) before a new track fetch */
const HAPPINESS_MUSIC_JUMP_THRESHOLD = 0.18;
/** ~seconds to settle toward the live face reading (higher = calmer bar) */
const HAPPINESS_SMOOTH_TIME_CONSTANT_S = 2.5;
const MAX_HAPPINESS_DT_S = 0.12;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

type YouTubeVideo = { source: 'youtube'; videoId: string; title: string; channelTitle?: string };

type CrystalSpotifyMatch = {
  videoId: string;
  youtubeTitle: string;
  searchQuery: string;
  spotify: { id: string; name: string; artist: string; spotify_url: string } | null;
};

function happinessFromExpressions(expressions: Record<string, number>): number {
  if (!expressions) return 0.5;
  const happy = expressions.happy ?? 0;
  const surprised = expressions.surprised ?? 0;
  const sad = expressions.sad ?? 0;
  const angry = expressions.angry ?? 0;
  const fearful = expressions.fearful ?? 0;
  const disgusted = expressions.disgusted ?? 0;
  const positive = happy + surprised * 0.4;
  const negative = sad + angry * 0.7 + fearful * 0.5 + disgusted * 0.4;
  return Math.max(0, Math.min(1, 0.5 + positive * 0.5 - negative * 0.5));
}

function moodLabel(h: number): { text: string; emoji: string } {
  if (h >= 0.75) return { text: 'Happy', emoji: '😊' };
  if (h >= 0.6) return { text: 'Upbeat', emoji: '🙂' };
  if (h <= 0.25) return { text: 'Down', emoji: '😢' };
  if (h <= 0.4) return { text: 'Mellow', emoji: '😔' };
  return { text: 'Neutral', emoji: '😐' };
}

function isSmiling(expressions: Record<string, number>): boolean {
  if (!expressions) return false;
  const happy = expressions.happy ?? 0;
  return happy > 0.5;
}

const YT_ERROR_CODES = new Set([2, 5, 100, 101, 150]);
/** Start at 0 — skipping ahead (e.g. 90s) breaks short videos and often triggers “Playback ID” embed errors. */
const YT_START_SECONDS = 0;

function youtubePlayerVars(): Record<string, number | string> {
  if (typeof window === 'undefined') {
    return { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 };
  }
  return {
    autoplay: 1,
    controls: 0,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    origin: window.location.origin,
  };
}

type YTPlayerApi = {
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (v: number) => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
};

/**
 * Two stacked iframe players: one plays audible; the other cues the next track muted so swaps are immediate.
 */
function CrystalYouTubeDualStage({
  active,
  preload,
  onError,
  onEnded,
}: {
  active: YouTubeVideo | null;
  preload: YouTubeVideo | null;
  onError: () => void;
  onEnded: () => void;
}) {
  const slot0Ref = useRef<HTMLDivElement>(null);
  const slot1Ref = useRef<HTMLDivElement>(null);
  const playersRef = useRef<[YTPlayerApi | null, YTPlayerApi | null]>([null, null]);
  const activeSlotRef = useRef(0);
  const slotVideoIdRef = useRef<[string | null, string | null]>([null, null]);
  const [playersReady, setPlayersReady] = useState(false);
  const [topSlot, setTopSlot] = useState(0);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);
  onErrorRef.current = onError;
  onEndedRef.current = onEnded;

  useEffect(() => {
    const el0 = slot0Ref.current;
    const el1 = slot1Ref.current;
    if (!el0 || !el1) return;
    let cancelled = false;

    (window as unknown as { ytReady?: Promise<void> }).ytReady?.then(() => {
      if (cancelled) return;
      const YT = (window as unknown as {
        YT?: {
          Player: new (
            el: HTMLElement,
            opts: {
              width?: string;
              height?: string;
              playerVars?: Record<string, number | string>;
              events?: {
                onStateChange?: (e: { target: YTPlayerApi; data: number }) => void;
                onError?: (e: { target: YTPlayerApi; data: number }) => void;
              };
            }
          ) => YTPlayerApi;
        };
      }).YT;
      if (!YT?.Player) return;

      const make = (el: HTMLElement, slot: 0 | 1) =>
        new YT.Player(el, {
          width: '100%',
          height: '100%',
          playerVars: youtubePlayerVars(),
          events: {
            onReady: (e: { target: YTPlayerApi }) => {
              if (slot === activeSlotRef.current) {
                try { e.target.playVideo(); } catch { /* */ }
                setTimeout(() => {
                  try { e.target.unMute(); e.target.setVolume(100); e.target.playVideo(); } catch { /* */ }
                }, 300);
              }
            },
            onStateChange: (e) => {
              if (e.data !== 0) return;
              if (slot !== activeSlotRef.current) return;
              onEndedRef.current();
            },
            onError: (e) => {
              if (slot !== activeSlotRef.current) return;
              if (YT_ERROR_CODES.has(e.data)) onErrorRef.current();
            },
          },
        });

      const p0 = make(el0, 0);
      const p1 = make(el1, 1);
      playersRef.current = [p0, p1];
      if (!cancelled) setPlayersReady(true);
    });

    return () => {
      cancelled = true;
      setPlayersReady(false);
      playersRef.current[0]?.destroy?.();
      playersRef.current[1]?.destroy?.();
      playersRef.current = [null, null];
      slotVideoIdRef.current = [null, null];
    };
  }, []);

  const activeId = active?.videoId ?? null;
  const preloadId = preload?.videoId ?? null;

  useEffect(() => {
    if (!playersReady) return;
    const [p0, p1] = playersRef.current;
    if (!p0 || !p1) return;

    if (!activeId) {
      try {
        p0.pauseVideo();
        p1.pauseVideo();
        p0.mute();
        p1.mute();
      } catch {
        /* iframe API */
      }
      slotVideoIdRef.current = [null, null];
      return;
    }

    const a = activeSlotRef.current;
    const b = 1 - a;
    const pA = a === 0 ? p0 : p1;
    const pB = a === 0 ? p1 : p0;

    if (slotVideoIdRef.current[b] === activeId) {
      try {
        pA.pauseVideo();
        pA.mute();
        pB.unMute();
        pB.setVolume(100);
        pB.playVideo();
        activeSlotRef.current = b;
        slotVideoIdRef.current[a] = null;
        slotVideoIdRef.current[b] = activeId;
        setTopSlot(b);
      } catch {
        /* */
      }
      return;
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    try {
      pB.pauseVideo();
      pB.mute();
      pA.loadVideoById({ videoId: activeId, startSeconds: YT_START_SECONDS });
      slotVideoIdRef.current[a] = activeId;
      // Aggressive play+unmute chain — user already interacted (clicked Play), so autoplay should work.
      const forcePlay = () => { try { pA.playVideo(); pA.unMute(); pA.setVolume(100); } catch { /* */ } };
      timeouts.push(window.setTimeout(forcePlay, 80));
      timeouts.push(window.setTimeout(forcePlay, 400));
      timeouts.push(window.setTimeout(forcePlay, 1200));
      timeouts.push(window.setTimeout(forcePlay, 2500));
    } catch {
      /* */
    }
    return () => {
      timeouts.forEach((id) => clearTimeout(id));
    };
  }, [activeId, playersReady]);

  useEffect(() => {
    if (!playersReady) return;
    const [p0, p1] = playersRef.current;
    if (!p0 || !p1) return;

    const a = activeSlotRef.current;
    const b = 1 - a;
    const pB = a === 0 ? p1 : p0;

    if (!preloadId || preloadId === activeId) {
      try {
        pB.pauseVideo();
        pB.mute();
        pB.stopVideo();
      } catch {
        /* */
      }
      slotVideoIdRef.current[b] = null;
      return;
    }

    if (slotVideoIdRef.current[b] === preloadId) return;

    try {
      pB.mute();
      pB.cueVideoById({ videoId: preloadId, startSeconds: YT_START_SECONDS });
      slotVideoIdRef.current[b] = preloadId;
    } catch {
      /* */
    }
  }, [preloadId, activeId, playersReady]);

  return (
    <div className="relative w-full aspect-video bg-black">
      <div
        ref={slot0Ref}
        className={`absolute inset-0 transition-opacity duration-150 ${
          topSlot === 0 ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
        }`}
      />
      <div
        ref={slot1Ref}
        className={`absolute inset-0 transition-opacity duration-150 ${
          topSlot === 1 ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
        }`}
      />
    </div>
  );
}

const Crystal = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastHappinessRef = useRef(0.5);
  const smoothedHappinessRef = useRef(0.5);
  const lastHappinessSampleTsRef = useRef(performance.now());
  const lastMusicRef = useRef(0);
  const [youtubeQueue, setYoutubeQueue] = useState<YouTubeVideo[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [happiness, setHappiness] = useState(0.5);
  const [currentItem, setCurrentItem] = useState<YouTubeVideo | null>(null);
  const [sessionItems, setSessionItems] = useState<YouTubeVideo[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [spotifyMatches, setSpotifyMatches] = useState<CrystalSpotifyMatch[] | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{
    current: number;
    total: number;
    workingOn: string;
  } | null>(null);
  const [resolveElapsedSec, setResolveElapsedSec] = useState(0);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<{ url: string; name?: string } | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFilename, setArchiveFilename] = useState<string | null>(null);

  const sessionResolveKey = useMemo(
    () =>
      sessionEnded && sessionItems.length > 0
        ? sessionItems.map((v) => `${v.videoId}\t${v.title}`).join('\n')
        : '',
    [sessionEnded, sessionItems],
  );

  useEffect(() => {
    if (!resolveLoading) {
      setResolveElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setResolveElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 400);
    return () => window.clearInterval(id);
  }, [resolveLoading]);

  useEffect(() => {
    if (!sessionResolveKey) return;
    let cancelled = false;
    const ac = new AbortController();
    setResolveLoading(true);
    setResolveError(null);
    setResolveProgress(null);
    setSpotifyMatches(null);
    setPlaylistResult(null);
    setPlaylistError(null);

    const videosPayload = sessionItems.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.channelTitle ?? '',
    }));

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/crystal-youtube-to-spotify`, {
          method: 'POST',
          signal: ac.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson, application/json;q=0.9',
          },
          body: JSON.stringify({ videos: videosPayload }),
        });

        const ct = res.headers.get('content-type') || '';

        if (!res.ok) {
          const text = await res.text();
          let msg = text.slice(0, 200);
          try {
            const j = JSON.parse(text) as { error?: string };
            if (typeof j.error === 'string') msg = j.error;
          } catch {
            /* use text */
          }
          throw new Error(msg || `Server error (${res.status})`);
        }

        if (ct.includes('application/json')) {
          const data = (await res.json()) as { matches?: CrystalSpotifyMatch[] };
          if (!cancelled) setSpotifyMatches(data.matches || []);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body from server');

        const decoder = new TextDecoder();
        let buffer = '';
        const collected: CrystalSpotifyMatch[] = [];

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: {
              type?: string;
              total?: number;
              current?: number;
              workingOn?: string;
              match?: CrystalSpotifyMatch;
              error?: string;
            };
            try {
              msg = JSON.parse(line) as typeof msg;
            } catch {
              continue;
            }
            if (msg.type === 'start' && typeof msg.total === 'number') {
              if (!cancelled) {
                setResolveProgress({ current: 0, total: msg.total, workingOn: 'Starting…' });
              }
            } else if (msg.type === 'progress' && msg.match) {
              collected.push(msg.match);
              if (!cancelled) {
                setSpotifyMatches([...collected]);
                setResolveProgress({
                  current: msg.current ?? collected.length,
                  total: msg.total ?? collected.length,
                  workingOn: msg.workingOn || msg.match.youtubeTitle || '',
                });
              }
            } else if (msg.type === 'error') {
              throw new Error(msg.error || 'Match stream failed');
            }
          }
        }

        if (!cancelled) setResolveProgress(null);
      } catch (e: unknown) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        if (!cancelled) setResolveError(e instanceof Error ? e.message : 'Could not match tracks');
      } finally {
        if (!cancelled) {
          setResolveLoading(false);
          setResolveProgress(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionResolveKey encodes sessionItems
  }, [sessionResolveKey]);

  const handleCreateSpotifyPlaylist = useCallback(async () => {
    if (!spotifyMatches) return;
    const matched = spotifyMatches.filter((m) => m.spotify);
    const byId = new Map<string, { id: string; name: string; artist: string }>();
    for (const m of matched) {
      if (m.spotify && !byId.has(m.spotify.id)) {
        byId.set(m.spotify.id, { id: m.spotify.id, name: m.spotify.name, artist: m.spotify.artist });
      }
    }
    const tracks = [...byId.values()];
    if (tracks.length === 0) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    try {
      const res = await fetch(`${API_BASE}/api/create-session-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: tracks.map((t) => t.id),
          tracks,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Playlist failed');
      setPlaylistResult({ url: json.url, name: json.name });
    } catch (e: unknown) {
      setPlaylistError(e instanceof Error ? e.message : 'Playlist failed');
    } finally {
      setPlaylistLoading(false);
    }
  }, [spotifyMatches]);

  const closeSessionModal = useCallback(() => {
    setSessionItems([]);
    setCurrentItem(null);
    setSessionEnded(false);
    setSpotifyMatches(null);
    setResolveError(null);
    setResolveLoading(false);
    setResolveProgress(null);
    setPlaylistResult(null);
    setPlaylistError(null);
  }, []);

  const fetchYouTubeByHappiness = useCallback(async (h: number): Promise<YouTubeVideo[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/youtube-by-happiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ happiness: h }),
      });
      if (!res.ok) return [];
      const { videos } = await res.json();
      return (videos || []).map((v: { videoId: string; title: string; channelTitle?: string }) => ({
        source: 'youtube' as const,
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle || '',
      }));
    } catch {
      return [];
    }
  }, []);

  const playMusicForHappiness = useCallback(
    async (h: number) => {
      setLoading(true);
      setError(null);
      try {
        const youtubeVideos = await fetchYouTubeByHappiness(h);
        if (youtubeVideos.length > 0) {
          const [first, ...rest] = youtubeVideos;
          setYoutubeQueue(rest);
          setCurrentItem(first);
          setSessionItems((prev) => [...prev, first]);
        } else {
          setError('No music available. Add YOUTUBE_API_KEY to server/.env');
        }
      } catch (e) {
        setError('Could not fetch music.');
      } finally {
        setLoading(false);
      }
    },
    [fetchYouTubeByHappiness]
  );

  const detectFace = useCallback(async () => {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || !modelsLoaded || video.paused || video.readyState < 2) {
      requestAnimationFrame(detectFace);
      return;
    }

    try {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceExpressions();

      const ctx = overlayCanvas.getContext('2d');
      if (ctx) {
        let displayWidth = video.offsetWidth;
        let displayHeight = video.offsetHeight;
        if (displayWidth <= 0 || displayHeight <= 0) {
          const parent = overlayCanvas.parentElement;
          if (parent) {
            displayWidth = parent.clientWidth;
            displayHeight = parent.clientHeight;
          }
        }
        if (displayWidth <= 0 || displayHeight <= 0) {
          requestAnimationFrame(detectFace);
          return;
        }
        if (overlayCanvas.width !== displayWidth || overlayCanvas.height !== displayHeight) {
          overlayCanvas.width = displayWidth;
          overlayCanvas.height = displayHeight;
        }
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        if (!result) {
          ctx.font = '11px system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = 'center';
          ctx.fillText('Looking for face...', displayWidth / 2, displayHeight / 2);
        } else if (video.videoWidth > 0 && video.videoHeight > 0) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const scale = Math.max(displayWidth / vw, displayHeight / vh);
          const cropX = (vw * scale - displayWidth) / 2;
          const cropY = (vh * scale - displayHeight) / 2;
          const toDisplay = (p: { x: number; y: number }) => ({
            x: p.x * scale - cropX,
            y: p.y * scale - cropY,
          });

          const box = result.detection.box;
          const b = toDisplay({ x: box.x, y: box.y });
          const bw = box.width * scale;
          const bh = box.height * scale;
          ctx.strokeStyle = 'rgba(0,255,245,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x, b.y, bw, bh);

          const landmarks = result.landmarks as faceapi.FaceLandmarks68;
          const mouthIndices = new Set([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]);
          landmarks.positions.forEach((p, i) => {
            const d = toDisplay(p);
            ctx.beginPath();
            ctx.arc(d.x, d.y, mouthIndices.has(i) ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = mouthIndices.has(i) ? 'rgba(255,100,150,0.95)' : 'rgba(0,255,245,0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          const mouth = landmarks.getMouth();
          ctx.strokeStyle = isSmiling(result.expressions) ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          mouth.forEach((p, i) => {
            const d = toDisplay(p);
            if (i === 0) ctx.moveTo(d.x, d.y);
            else ctx.lineTo(d.x, d.y);
          });
          ctx.closePath();
          ctx.stroke();

          if (result.expressions) {
            const raw = happinessFromExpressions(result.expressions);
            const ts = performance.now();
            const dtS = Math.min(MAX_HAPPINESS_DT_S, (ts - lastHappinessSampleTsRef.current) / 1000);
            lastHappinessSampleTsRef.current = ts;
            const alpha = 1 - Math.exp(-dtS / HAPPINESS_SMOOTH_TIME_CONSTANT_S);
            smoothedHappinessRef.current += (raw - smoothedHappinessRef.current) * alpha;
            const smoothed = smoothedHappinessRef.current;
            setHappiness(smoothed);

            const nowMs = Date.now();
            const diff = Math.abs(smoothed - lastHappinessRef.current);
            if (diff > HAPPINESS_MUSIC_JUMP_THRESHOLD && nowMs - lastMusicRef.current > HAPPINESS_DEBOUNCE_MS) {
              lastHappinessRef.current = smoothed;
              lastMusicRef.current = nowMs;
              playMusicForHappiness(smoothed);
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    requestAnimationFrame(detectFace);
  }, [modelsLoaded, playMusicForHappiness]);

  useEffect(() => {
    (async () => {
      await faceapi.tf.setBackend('webgl');
      await faceapi.tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setModelsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (cameraOn && modelsLoaded) detectFace();
  }, [cameraOn, modelsLoaded, detectFace]);


  const startSession = async () => {
    if (cameraOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadeddata = () => video.play();
      }
      smoothedHappinessRef.current = 0.5;
      lastHappinessRef.current = 0.5;
      lastHappinessSampleTsRef.current = performance.now();
      lastMusicRef.current = Date.now();
      setHappiness(0.5);
      setCameraOn(true);
      setError(null);
      playMusicForHappiness(0.5);
    } catch {
      setError('Camera access denied.');
    }
  };

  const skipToNextYoutube = useCallback(async () => {
    let nextFromQueue: YouTubeVideo | null = null;
    setYoutubeQueue((queue) => {
      if (queue.length === 0) return queue;
      nextFromQueue = queue[0];
      return queue.slice(1);
    });
    if (nextFromQueue) {
      setCurrentItem(nextFromQueue);
      setSessionItems((prev) => [...prev, nextFromQueue!]);
      return;
    }

    const videos = await fetchYouTubeByHappiness(smoothedHappinessRef.current);
    if (videos.length > 0) {
      const [first, ...rest] = videos;
      setYoutubeQueue(rest);
      setCurrentItem(first);
      setSessionItems((prev) => [...prev, first]);
    } else {
      setCurrentItem(null);
    }
  }, [fetchYouTubeByHappiness]);

  const endSession = async () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setCameraOn(false);
    setSessionEnded(true);

    if (sessionItems.length > 0) {
      setArchiveLoading(true);
      setArchiveError(null);
      try {
        const res = await fetch(`${API_BASE}/api/crystal-archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionVideos: sessionItems.map((v) => ({
              videoId: v.videoId,
              title: v.title,
              channelTitle: v.channelTitle ?? '',
            })),
            spotifyMatches: spotifyMatches ?? undefined,
            playlist: playlistResult?.url
              ? { url: playlistResult.url, name: playlistResult.name ?? null }
              : null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Archive failed');
        setArchiveFilename(json.filename);
      } catch (e: unknown) {
        setArchiveError(e instanceof Error ? e.message : 'Archive failed');
      } finally {
        setArchiveLoading(false);
      }
    }
  };

  const showEndModal = sessionEnded;

  const sessionActive = cameraOn || currentItem;
  const isPlaying = !!currentItem;

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      {/* Page header */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 text-center">
        <h1
          className="retro-title text-lg tracking-widest"
          style={{ color: 'rgba(160,196,240,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
        >
          Crystal Ball
        </h1>
        <p
          className="retro-body text-[11px] mt-1 max-w-[340px]"
          style={{ color: 'rgba(160,196,240,0.45)' }}
        >
          Your webcam reads your mood and plays music to match how you feel.
        </p>
      </div>

      {/* Hidden YouTube player — audio only, no visible embed */}
      <div className="fixed -left-[9999px] top-0 w-px h-px overflow-hidden" aria-hidden>
        <CrystalYouTubeDualStage
          active={currentItem}
          preload={youtubeQueue[0] ?? null}
          onError={skipToNextYoutube}
          onEnded={skipToNextYoutube}
        />
      </div>

      {/* Circular RGB audio waveform around the crystal ball */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <CircularWaveCanvas playing={isPlaying} />
      </div>

      {/* Webcam — IS the crystal ball. Sized to exactly cover the 3D globe. */}
      <div className="absolute inset-0 z-15 flex items-center justify-center pointer-events-none" style={{ marginTop: '-3vh' }}>
        <div
          className={`relative rounded-full overflow-hidden transition-opacity duration-700 ${
            cameraOn ? 'opacity-95' : 'opacity-0'
          }`}
          style={{
            width: '36vh',
            height: '36vh',
            boxShadow: '0 0 60px rgba(0,180,255,0.18), inset 0 0 40px rgba(0,0,0,0.6)',
            border: '1.5px solid rgba(100,180,255,0.25)',
          }}
        >
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 10, transform: 'scaleX(-1)' }}
          />
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(ellipse at 70% 75%, rgba(0,80,180,0.08) 0%, transparent 50%)',
            }}
          />
        </div>
      </div>

      {/* Centered crystal ball HUD — below the ball */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-[16vh] pointer-events-none">
        <div
          className="pointer-events-auto flex flex-col items-center gap-2.5 w-[min(80vw,240px)] p-4"
          style={{
            background: 'radial-gradient(circle, rgba(8,12,40,0.5) 0%, transparent 100%)',
          }}
        >
          {/* Now playing */}
          {currentItem && (
            <p className="retro-body text-[10px] text-white/50 text-center truncate w-full">
              🎵 {currentItem.title}
            </p>
          )}

          {/* Mood indicator */}
          {sessionActive && (() => {
            const mood = moodLabel(happiness);
            const color = happiness > 0.6 ? '#4ade80' : happiness < 0.4 ? '#f87171' : '#94a3b8';
            return (
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="retro-title text-[10px]" style={{ color }}>
                    {mood.emoji} {mood.text}
                  </span>
                  <span className="retro-title text-[8px] tabular-nums" style={{ color }}>
                    {Math.round(happiness * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${happiness * 100}%`,
                      transition: 'width 1.5s ease-out, background 1.5s ease-out',
                      background:
                        happiness > 0.6
                          ? 'linear-gradient(90deg,#22c55e,#4ade80)'
                          : happiness < 0.4
                            ? 'linear-gradient(90deg,#dc2626,#f87171)'
                            : 'linear-gradient(90deg,#64748b,#94a3b8)',
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {error && <p className="retro-body text-[10px] text-red-400 text-center">{error}</p>}

          {/* Play / End & Save */}
          {!cameraOn && !sessionEnded && (
            <button
              onClick={startSession}
              disabled={loading || !modelsLoaded}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-full retro-title text-[10px] transition-all disabled:opacity-40"
              style={{
                background: 'rgba(0,255,245,0.12)',
                border: '1px solid rgba(0,255,245,0.25)',
                color: 'rgba(0,255,245,0.9)',
                boxShadow: '0 0 20px rgba(0,255,245,0.1)',
              }}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Music size={12} />}
              {modelsLoaded ? 'Play' : 'Loading…'}
            </button>
          )}

          {cameraOn && (
            <button
              onClick={endSession}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-full retro-title text-[10px] transition-all"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              <Archive size={12} />
              End & Save
            </button>
          )}
        </div>
      </div>

      {/* End session modal */}
      {showEndModal && (
        <div
          className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div
            className="retro-panel w-full max-w-md p-6 text-center max-h-[85vh] overflow-y-auto"
            style={{ border: '1px solid rgba(0,255,245,0.3)' }}
          >
            <p className="retro-title text-sm mb-2">
              {sessionItems.length > 0 ? 'Session saved' : 'Session ended'}
            </p>

            {archiveLoading && (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
                <span className="retro-body text-xs text-muted-foreground">Archiving…</span>
              </div>
            )}
            {archiveFilename && (
              <div className="mb-3 space-y-2">
                <p className="retro-body text-xs text-green-400/90">
                  Archived as <span className="font-mono text-[10px]">{archiveFilename}</span>
                </p>
                <Link
                  to="/archive"
                  className="retro-body inline-block text-[11px] text-cyan-400/80 hover:text-cyan-300 hover:underline"
                >
                  View in Archive
                </Link>
              </div>
            )}
            {archiveError && (
              <p className="retro-body text-xs text-red-400 mb-3">{archiveError}</p>
            )}

            <p className="retro-body text-xs text-muted-foreground mb-4">
              {sessionItems.length > 0
                ? `${sessionItems.length} video${sessionItems.length === 1 ? '' : 's'} · matching Spotify tracks…`
                : 'No videos played.'}
            </p>

            {sessionItems.length > 0 && resolveLoading && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <div className="retro-body text-xs text-muted-foreground space-y-1">
                  {resolveProgress ? (
                    <p className="text-foreground/90 tabular-nums">
                      Matched {resolveProgress.current} of {resolveProgress.total} · {resolveElapsedSec}s
                    </p>
                  ) : (
                    <p className="tabular-nums opacity-80">{resolveElapsedSec}s — waiting…</p>
                  )}
                </div>
              </div>
            )}

            {resolveError && (
              <p className="retro-body text-xs text-red-400 mb-4 text-left">{resolveError}</p>
            )}

            {sessionItems.length > 0 && spotifyMatches && spotifyMatches.length > 0 && (
              <div className="space-y-2 text-left mb-4 max-h-[min(40vh,260px)] overflow-y-auto pr-1">
                {spotifyMatches.map((row, i) => (
                  <div
                    key={`${row.videoId}-${i}`}
                    className="rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-0.5"
                  >
                    <p className="retro-body text-[11px] text-blue-300/90 line-clamp-1">
                      {i + 1}. {row.youtubeTitle}
                    </p>
                    {row.spotify ? (
                      <a
                        href={row.spotify.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block retro-body text-[11px] text-green-400/90 hover:underline"
                      >
                        {row.spotify.name} — {row.spotify.artist}
                      </a>
                    ) : (
                      <p className="retro-body text-[10px] text-muted-foreground">No Spotify match</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {playlistError && (
              <p className="retro-body text-xs text-red-400 mb-3 text-left">{playlistError}</p>
            )}

            {playlistResult && (
              <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-left">
                <p className="retro-title text-[10px] text-green-400 mb-1">Playlist created</p>
                <a
                  href={playlistResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="retro-body text-xs text-green-300 underline"
                >
                  Open in Spotify
                </a>
              </div>
            )}

            {sessionItems.length > 0 &&
              spotifyMatches &&
              !resolveLoading &&
              !playlistResult &&
              spotifyMatches.some((m) => m.spotify) && (
                <button
                  type="button"
                  onClick={handleCreateSpotifyPlaylist}
                  disabled={playlistLoading}
                  className="retro-title mb-4 w-full rounded-sm py-2.5 text-[11px] transition-opacity disabled:opacity-50"
                  style={{
                    backgroundColor: 'hsla(var(--spotify-green) / 0.2)',
                    color: 'hsl(var(--spotify-green))',
                    border: '1px solid hsla(var(--spotify-green) / 0.35)',
                  }}
                >
                  {playlistLoading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    'Create Spotify playlist'
                  )}
                </button>
              )}

            <button
              type="button"
              onClick={closeSessionModal}
              className="block w-full mt-2 retro-body text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Crystal;
