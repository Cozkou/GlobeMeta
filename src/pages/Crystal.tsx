import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import * as faceapi from '@vladmandic/face-api';
import { useNavigate } from 'react-router-dom';
import { Video, VideoOff, Loader2, Music, Archive } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const GLOBE_BG = '#0a0a0f';
const TRANSITION_DURATION_MS = 4000;
/** Min time between auto–music changes from mood shifts */
const HAPPINESS_DEBOUNCE_MS = 14_000;
/** Smoothed happiness must move this much (0–1) before a new track fetch */
const HAPPINESS_MUSIC_JUMP_THRESHOLD = 0.24;
/** ~seconds to settle toward the live face reading (higher = calmer bar) */
const HAPPINESS_SMOOTH_TIME_CONSTANT_S = 4;
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
  const sad = expressions.sad ?? 0;
  return Math.max(0, Math.min(1, happy - sad * 0.5 + 0.5));
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
    return { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 };
  }
  return {
    autoplay: 0,
    controls: 1,
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
      // Muted load + play first avoids many browsers blocking unmuted autoplay; unmute shortly after.
      pA.mute();
      pA.loadVideoById({ videoId: activeId, startSeconds: YT_START_SECONDS });
      slotVideoIdRef.current[a] = activeId;
      timeouts.push(
        window.setTimeout(() => {
          try {
            pA.playVideo();
          } catch {
            /* */
          }
        }, 100),
      );
      timeouts.push(
        window.setTimeout(() => {
          try {
            pA.unMute();
            pA.setVolume(100);
          } catch {
            /* */
          }
        }, 350),
      );
      timeouts.push(
        window.setTimeout(() => {
          try {
            pA.playVideo();
            pA.unMute();
            pA.setVolume(100);
          } catch {
            /* */
          }
        }, 900),
      );
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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{ frameId: number } | null>(null);
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
    if (!containerRef.current) return;
    const container = containerRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(new THREE.Color(GLOBE_BG), 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 2.8);

    scene.add(new THREE.AmbientLight(0x6688bb, 1.2));
    const dir = new THREE.DirectionalLight(0x88aadd, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    const loader = new THREE.TextureLoader();
    const globeMat = new THREE.MeshPhongMaterial({
      map: null,
      color: 0x4488cc,
      emissive: 0x112244,
      shininess: 20,
      specular: 0x334466,
    });
    loader.load(
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
      (tex) => {
        globeMat.map = tex;
        globeMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), globeMat);
    scene.add(globe);

    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff,
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.95,
      thickness: 0.5,
      transparent: true,
      opacity: 0,
    });
    const crystal = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 64), crystalMat);
    crystal.visible = false;
    scene.add(crystal);

    const state = { frameId: 0, transitionStart: performance.now() };
    sceneRef.current = state;

    const animate = () => {
      state.frameId = requestAnimationFrame(animate);
      const elapsed = performance.now() - state.transitionStart;
      const t = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
      const ease = t * t * (3 - 2 * t);
      globe.scale.setScalar(1 - ease * 0.15);
      globeMat.opacity = 1 - ease;
      globeMat.transparent = ease > 0.01;
      if (ease > 0.02) {
        crystal.visible = true;
        crystalMat.opacity = ease * 0.85;
      }
      globe.rotation.y += 0.002;
      crystal.rotation.y += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(state.frameId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (cameraOn && modelsLoaded) detectFace();
  }, [cameraOn, modelsLoaded, detectFace]);

  const toggleCamera = async () => {
    if (cameraOn) {
      const video = videoRef.current;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
      setCameraOn(false);
      return;
    }
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
      setHappiness(0.5);
      setCameraOn(true);
      setError(null);
    } catch (e) {
      setError('Camera access denied.');
    }
  };

  const playSample = () => {
    setError(null);
    smoothedHappinessRef.current = 0.6;
    lastHappinessRef.current = 0.6;
    lastMusicRef.current = Date.now();
    setHappiness(0.6);
    playMusicForHappiness(0.6);
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
  };

  const showEndModal = sessionEnded;
  const navigate = useNavigate();

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ background: GLOBE_BG }}>
      <div
        className={`fixed top-16 right-4 z-[100] w-48 h-48 rounded-lg border-2 border-white/20 shadow-xl overflow-hidden transition-opacity ${
          cameraOn ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover rounded-lg" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full rounded-lg pointer-events-none"
          style={{ zIndex: 10 }}
        />
      </div>

      {currentItem?.source === 'youtube' && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-40 w-[min(90vw,320px)] rounded-lg overflow-hidden border border-white/10 transition-opacity duration-300">
          <CrystalYouTubeDualStage
            active={currentItem}
            preload={youtubeQueue[0] ?? null}
            onError={skipToNextYoutube}
            onEnded={skipToNextYoutube}
          />
        </div>
      )}

      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate('/')}
          className="retro-title text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <h1 className="retro-title text-sm font-semibold glow-text">Crystal Ball</h1>
        <div className="w-[60px]" />
      </header>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 pb-10">
        <div
          className="retro-panel mx-auto max-w-md p-4 rounded-lg"
          style={{
            background: 'rgba(8,12,28,0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0,255,245,0.2)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="retro-title text-[10px] text-muted-foreground">Happiness</span>
            <span className="retro-title text-[10px] tabular-nums" style={{ color: happiness > 0.6 ? '#4ade80' : happiness < 0.4 ? '#f87171' : '#94a3b8' }}>
              {Math.round(happiness * 100)}%
            </span>
          </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-3">
            <div
              className="h-full rounded-full ease-out"
              style={{
                width: `${happiness * 100}%`,
                transition: 'width 2.8s ease-out, background 2.8s ease-out',
                background: happiness > 0.6 ? 'linear-gradient(90deg,#22c55e,#4ade80)' : happiness < 0.4 ? 'linear-gradient(90deg,#dc2626,#f87171)' : 'linear-gradient(90deg,#64748b,#94a3b8)',
              }}
            />
          </div>

          {error && <p className="retro-body text-xs text-red-400 mb-2">{error}</p>}
          {currentItem && (
            <p className="retro-body text-xs text-foreground mb-2 truncate">
              🎵 {currentItem.title}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleCamera}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-sm retro-title text-xs transition-all ${
                  cameraOn ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-accent/20 text-accent border border-accent/40'
                }`}
              >
                {cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
                {cameraOn ? 'Stop camera' : 'Start camera'}
              </button>
              <button
                onClick={playSample}
                disabled={loading || !modelsLoaded}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm retro-title text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
                Play sample
              </button>
            </div>
            <button
              onClick={endSession}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-sm retro-title text-xs bg-white/10 hover:bg-white/15 border border-white/20"
            >
              <Music size={14} />
              End & save
            </button>
          </div>
        </div>
      </div>

      <p className="fixed bottom-24 left-0 right-0 text-center retro-body text-[10px] text-muted-foreground/70 px-4">
        YouTube · Music matches your face
      </p>

      {showEndModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div
            className="retro-panel w-full max-w-md p-6 text-center max-h-[85vh] overflow-y-auto"
            style={{ border: '1px solid rgba(0,255,245,0.3)' }}
          >
            <p className="retro-title text-sm mb-2">{sessionItems.length > 0 ? 'Session saved' : 'Session ended'}</p>
            <p className="retro-body text-xs text-muted-foreground mb-4">
              {sessionItems.length > 0
                ? `${sessionItems.length} video${sessionItems.length === 1 ? '' : 's'} — matching Spotify tracks…`
                : 'No videos to save'}
            </p>

            {sessionItems.length > 0 && (
              <div className="mb-4 space-y-2 text-left">
                <button
                  type="button"
                  onClick={handleArchiveSession}
                  disabled={archiveLoading}
                  className="retro-title flex w-full items-center justify-center gap-2 rounded-sm border border-accent/35 bg-accent/10 py-2.5 text-[11px] text-accent transition-opacity hover:bg-accent/15 disabled:opacity-50"
                >
                  {archiveLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Archiving…
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" />
                      Archive session
                    </>
                  )}
                </button>
                <p className="retro-body text-[10px] text-muted-foreground">
                  Saves this session to the server&apos;s <code className="text-foreground/80">archive/</code> folder as JSON (for a future archive browser).
                </p>
                {archiveError && <p className="retro-body text-xs text-red-400">{archiveError}</p>}
                {archiveFilename && (
                  <p className="retro-body text-xs text-green-400/90">
                    Saved as <span className="font-mono text-[10px]">{archiveFilename}</span>
                  </p>
                )}
              </div>
            )}

            {sessionItems.length > 0 && resolveLoading && (
              <div className="flex flex-col items-center gap-3 py-5">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <div className="retro-body text-xs text-muted-foreground space-y-1 max-w-full">
                  <p>Contacting Spotify and searching each title (can take ~10–40s for a few videos).</p>
                  {resolveProgress ? (
                    <>
                      <p className="text-foreground/90 font-medium tabular-nums">
                        Matched {resolveProgress.current} of {resolveProgress.total} · {resolveElapsedSec}s elapsed
                      </p>
                      {resolveProgress.workingOn ? (
                        <p className="text-[10px] opacity-80 line-clamp-2" title={resolveProgress.workingOn}>
                          Last finished: {resolveProgress.workingOn}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="tabular-nums opacity-80">
                      {resolveElapsedSec}s elapsed — waiting for first result…
                    </p>
                  )}
                </div>
              </div>
            )}

            {resolveError && (
              <p className="retro-body text-xs text-red-400 mb-4 text-left">{resolveError}</p>
            )}

            {sessionItems.length > 0 && spotifyMatches && spotifyMatches.length > 0 && (
              <div className="space-y-3 text-left mb-4 max-h-[min(40vh,280px)] overflow-y-auto pr-1">
                {resolveLoading && (
                  <p className="retro-body text-[10px] text-accent/90 mb-1">
                    Showing matches as they arrive…
                  </p>
                )}
                {spotifyMatches.map((row, i) => (
                  <div
                    key={`${row.videoId}-${i}`}
                    className="rounded-md border border-white/10 bg-white/[0.03] p-2.5 space-y-1"
                  >
                    <a
                      href={`https://www.youtube.com/watch?v=${row.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block retro-body text-[11px] text-blue-300/90 hover:underline line-clamp-2"
                    >
                      {i + 1}. {row.youtubeTitle}
                    </a>
                    {row.spotify ? (
                      <a
                        href={row.spotify.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block retro-body text-[11px] text-green-400/90 hover:underline"
                      >
                        Spotify: {row.spotify.name} — {row.spotify.artist}
                      </a>
                    ) : (
                      <p className="retro-body text-[10px] text-muted-foreground">
                        {row.searchQuery?.includes('timed out')
                          ? 'Skipped — Spotify lookup took too long (not added to playlist)'
                          : 'No close Spotify match'}
                      </p>
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
                <p className="retro-title text-[10px] text-green-400 mb-2">Playlist created</p>
                {playlistResult.name && (
                  <p className="retro-body text-xs text-foreground mb-2">{playlistResult.name}</p>
                )}
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
                  className="retro-title mb-4 w-full rounded-sm py-3 text-[11px] font-semibold transition-opacity disabled:opacity-50"
                  style={{
                    backgroundColor: 'hsla(var(--spotify-green) / 0.2)',
                    color: 'hsl(var(--spotify-green))',
                    border: '1px solid hsla(var(--spotify-green) / 0.35)',
                  }}
                >
                  {playlistLoading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating playlist…
                    </span>
                  ) : (
                    'Create Spotify playlist'
                  )}
                </button>
              )}

            {sessionItems.length > 0 &&
              spotifyMatches &&
              !resolveLoading &&
              !spotifyMatches.some((m) => m.spotify) &&
              !playlistResult && (
                <p className="retro-body text-xs text-muted-foreground mb-4">
                  No Spotify matches — try a session with clearer song titles, or add tracks manually in Spotify.
                </p>
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
