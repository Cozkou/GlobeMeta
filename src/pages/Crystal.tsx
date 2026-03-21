import { useRef, useEffect, useLayoutEffect, useState, useCallback, type CSSProperties } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { LayoutContext } from '@/components/AppLayout';
import * as faceapi from '@vladmandic/face-api';
import type { Pose } from '@tensorflow-models/pose-detection';
import { Loader2, Music, Archive, GripVertical } from 'lucide-react';

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
/** Consecutive frames before duo / flex counts as “locked in” (~0.5s at 30fps) */
const SCENE_STABLE_FRAMES = 15;
/** Run MoveNet every N face frames to save CPU */
const POSE_EVERY_N_FRAMES = 3;
/** Smoothed happiness must move this much (0–1) before a new track fetch */
const HAPPINESS_MUSIC_JUMP_THRESHOLD = 0.18;
/** ~seconds to settle toward the live face reading (higher = calmer bar) */
const HAPPINESS_SMOOTH_TIME_CONSTANT_S = 1.85;
const MAX_HAPPINESS_DT_S = 0.12;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

type YouTubeVideo = { source: 'youtube'; videoId: string; title: string; channelTitle?: string };

/**
 * Valence weights for face-api softmax probabilities (sum ≈ 1).
 * Maps to roughly [-1, 1] before normalizing to [0, 1] — matches how strong each read is on camera.
 */
const EMOTION_VALENCE: Record<string, number> = {
  happy: 1,
  surprised: 0.28,
  neutral: 0,
  sad: -0.95,
  angry: -0.9,
  fearful: -0.55,
  disgusted: -0.62,
};

function happinessFromExpressions(expressions: Record<string, number>): number {
  if (!expressions) return 0.5;
  let v = 0;
  for (const [key, weight] of Object.entries(EMOTION_VALENCE)) {
    v += (expressions[key] ?? 0) * weight;
  }
  return Math.max(0, Math.min(1, (v + 1) / 2));
}

/** Mouth width vs height from 68 landmarks — reinforces smile when model under-calls `happy`. */
function mouthSmileHint(landmarks: faceapi.FaceLandmarks68): number {
  const p = landmarks.positions;
  const left = p[48];
  const right = p[54];
  const topLip = p[51];
  const botLip = p[57];
  const w = Math.hypot(right.x - left.x, right.y - left.y);
  const h = Math.max(4, Math.hypot(botLip.x - topLip.x, botLip.y - topLip.y));
  const ratio = w / h;
  const t = (ratio - 2.15) / 2.65;
  return Math.max(0, Math.min(1, t));
}

function happinessFromFace(landmarks: faceapi.FaceLandmarks68 | null, expressions: Record<string, number>): number {
  const fromExpr = happinessFromExpressions(expressions);
  if (!landmarks) return fromExpr;
  const fromMouth = mouthSmileHint(landmarks);
  return Math.max(0, Math.min(1, fromExpr * 0.78 + fromMouth * 0.22));
}

function moodLabel(h: number): { text: string; emoji: string } {
  if (h >= 0.72) return { text: 'Bright', emoji: '😊' };
  if (h >= 0.58) return { text: 'Good', emoji: '🙂' };
  if (h <= 0.28) return { text: 'Heavy', emoji: '😢' };
  if (h <= 0.42) return { text: 'Low', emoji: '😔' };
  return { text: 'Neutral', emoji: '😐' };
}

/** Bar fill color: continuous cool → warm → positive along the 0–1 scale. */
function happinessBarStyle(h: number): string {
  const hue = 12 + h * 118;
  const sat = 72 + h * 12;
  const light = 48 + h * 14;
  const hue2 = 18 + h * 105;
  return `linear-gradient(90deg, hsl(${hue} ${sat}% ${light}%), hsl(${hue2} ${sat + 6}% ${light + 4}%))`;
}

function happinessLabelColor(h: number): string {
  const hue = 8 + h * 125;
  return `hsl(${hue} 78% ${52 + h * 12}%)`;
}

function isSmiling(expressions: Record<string, number>): boolean {
  if (!expressions) return false;
  const happy = expressions.happy ?? 0;
  return happy > 0.5;
}

function angleAtElbowDeg(
  s: { x: number; y: number },
  e: { x: number; y: number },
  w: { x: number; y: number },
): number {
  const v1x = s.x - e.x;
  const v1y = s.y - e.y;
  const v2x = w.x - e.x;
  const v2y = w.y - e.y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (m < 1e-6) return 180;
  const c = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / m));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Double bicep / “flex”: both elbows bent, wrists lifted (MoveNet COCO keypoints). */
function isDoubleFlexPose(pose: Pose | undefined): boolean {
  if (!pose?.keypoints || (pose.score ?? 0) < 0.22) return false;
  const named = (n: string) => pose.keypoints!.find((k) => k.name === n);
  const minKp = 0.26;
  const ls = named('left_shoulder');
  const rs = named('right_shoulder');
  const le = named('left_elbow');
  const re = named('right_elbow');
  const lw = named('left_wrist');
  const rw = named('right_wrist');
  for (const p of [ls, rs, le, re, lw, rw]) {
    if (!p || (p.score ?? 0) < minKp) return false;
  }
  const leftAngle = angleAtElbowDeg(ls!, le!, lw!);
  const rightAngle = angleAtElbowDeg(rs!, re!, rw!);
  const bent = leftAngle >= 30 && leftAngle <= 135 && rightAngle >= 30 && rightAngle <= 135;
  if (!bent) return false;
  const raised = lw!.y < le!.y + 0.14 && rw!.y < re!.y + 0.14;
  return raised;
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

type CrystalPlaylistMode = 'mood' | 'romantic' | 'gym';
type CrystalHudScene = CrystalPlaylistMode;

const CRYSTAL_HUD_POS_KEY = 'globemeta-crystal-hud-pos';
const HUD_MARGIN = 8;
const HUD_PANEL_WIDTH = 304;

function clampHudPosition(left: number, top: number, panelEl: HTMLElement | null): { left: number; top: number } {
  const w = panelEl?.offsetWidth ?? HUD_PANEL_WIDTH;
  const h = panelEl?.offsetHeight ?? 320;
  const maxL = Math.max(HUD_MARGIN, window.innerWidth - w - HUD_MARGIN);
  const maxT = Math.max(HUD_MARGIN, window.innerHeight - h - HUD_MARGIN);
  return {
    left: Math.min(maxL, Math.max(HUD_MARGIN, left)),
    top: Math.min(maxT, Math.max(HUD_MARGIN, top)),
  };
}

const Crystal = () => {
  const { crystalPausePlaybackRef } = useOutletContext<LayoutContext>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastHappinessRef = useRef(0.5);
  const smoothedHappinessRef = useRef(0.5);
  const lastHappinessSampleTsRef = useRef(performance.now());
  const lastMusicRef = useRef(0);
  const playlistModeRef = useRef<CrystalPlaylistMode>('mood');
  const poseDetectorRef = useRef<{ estimatePoses: (input: HTMLVideoElement, cfg?: { flipHorizontal?: boolean }) => Promise<Pose[]>; dispose: () => void } | null>(null);
  const poseFrameCounterRef = useRef(0);
  const flexStreakRef = useRef(0);
  const duoStreakRef = useRef(0);
  const [youtubeQueue, setYoutubeQueue] = useState<YouTubeVideo[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [poseReady, setPoseReady] = useState(false);
  const [crystalHudScene, setCrystalHudScene] = useState<CrystalHudScene>('mood');
  const [happiness, setHappiness] = useState(0.5);
  const [currentItem, setCurrentItem] = useState<YouTubeVideo | null>(null);
  const [sessionItems, setSessionItems] = useState<YouTubeVideo[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<{ url: string; name?: string } | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFilename, setArchiveFilename] = useState<string | null>(null);

  const hudPanelRef = useRef<HTMLDivElement>(null);
  const [hudPos, setHudPos] = useState<{ left: number; top: number }>(() => {
    if (typeof window === 'undefined') return { left: HUD_MARGIN, top: HUD_MARGIN };
    const w = Math.min(window.innerWidth * 0.92, HUD_PANEL_WIDTH);
    return { left: window.innerWidth - w - 16, top: 12 };
  });
  const [hudDragging, setHudDragging] = useState(false);
  const hudDragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);

  useLayoutEffect(() => {
    const el = hudPanelRef.current;
    try {
      const raw = localStorage.getItem(CRYSTAL_HUD_POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { left?: number; top?: number };
        if (typeof p.left === 'number' && typeof p.top === 'number' && Number.isFinite(p.left) && Number.isFinite(p.top)) {
          setHudPos(clampHudPosition(p.left, p.top, el));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setHudPos((prev) => clampHudPosition(prev.left, prev.top, el));
  }, []);

  useEffect(() => {
    const onResize = () => {
      const el = hudPanelRef.current;
      setHudPos((prev) => clampHudPosition(prev.left, prev.top, el));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!hudDragging) return;
    const onMove = (e: PointerEvent) => {
      const d = hudDragRef.current;
      if (!d) return;
      const el = hudPanelRef.current;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setHudPos(clampHudPosition(d.origLeft + dx, d.origTop + dy, el));
    };
    const onUp = () => {
      hudDragRef.current = null;
      setHudDragging(false);
      const el = hudPanelRef.current;
      setHudPos((prev) => {
        const c = clampHudPosition(prev.left, prev.top, el);
        try {
          localStorage.setItem(CRYSTAL_HUD_POS_KEY, JSON.stringify(c));
        } catch {
          /* ignore */
        }
        return c;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [hudDragging]);

  const hudPosRef = useRef(hudPos);
  useEffect(() => {
    hudPosRef.current = hudPos;
  }, [hudPos]);

  const onHudDragHandleDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = hudPosRef.current;
    hudDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: p.left,
      origTop: p.top,
    };
    setHudDragging(true);
  }, []);

  const pauseCrystalYoutubePlayback = useCallback(() => {
    setCurrentItem(null);
    setYoutubeQueue([]);
  }, []);

  useEffect(() => {
    crystalPausePlaybackRef.current = pauseCrystalYoutubePlayback;
    return () => {
      crystalPausePlaybackRef.current = null;
    };
  }, [crystalPausePlaybackRef, pauseCrystalYoutubePlayback]);

  const handleCreateYouTubePlaylist = useCallback(async () => {
    if (sessionItems.length === 0) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    try {
      const res = await fetch(`${API_BASE}/api/create-session-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: sessionItems.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            channelTitle: v.channelTitle ?? '',
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; name?: string; error?: string };
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Playlist failed');
      setPlaylistResult({ url: json.url || '', name: json.name });
    } catch (e: unknown) {
      setPlaylistError(e instanceof Error ? e.message : 'Playlist failed');
    } finally {
      setPlaylistLoading(false);
    }
  }, [sessionItems]);

  const closeSessionModal = useCallback(() => {
    setSessionItems([]);
    setCurrentItem(null);
    setSessionEnded(false);
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

  const fetchYouTubeByScene = useCallback(async (scene: 'romantic' | 'gym'): Promise<YouTubeVideo[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/youtube-crystal-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene }),
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
      playlistModeRef.current = 'mood';
      setCrystalHudScene('mood');
      setLoading(true);
      setError(null);
      try {
        const youtubeVideos = await fetchYouTubeByHappiness(h);
        if (youtubeVideos.length > 0) {
          const [first, ...rest] = youtubeVideos;
          setYoutubeQueue(rest);
          setCurrentItem(first);
          setSessionItems((prev) => [...prev, first]);
          lastMusicRef.current = Date.now();
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

  const playMusicForScene = useCallback(
    async (scene: 'romantic' | 'gym') => {
      playlistModeRef.current = scene;
      setCrystalHudScene(scene);
      setLoading(true);
      setError(null);
      try {
        const youtubeVideos = await fetchYouTubeByScene(scene);
        if (youtubeVideos.length > 0) {
          const [first, ...rest] = youtubeVideos;
          setYoutubeQueue(rest);
          setCurrentItem(first);
          setSessionItems((prev) => [...prev, first]);
          lastMusicRef.current = Date.now();
        } else {
          setError('No music available. Add YOUTUBE_API_KEY to server/.env');
        }
      } catch {
        setError('Could not fetch music.');
      } finally {
        setLoading(false);
      }
    },
    [fetchYouTubeByScene]
  );

  const detectFace = useCallback(async () => {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || !modelsLoaded || video.paused || video.readyState < 2) {
      requestAnimationFrame(detectFace);
      return;
    }

    const detector = poseDetectorRef.current;
    if (poseReady && detector) {
      poseFrameCounterRef.current += 1;
      if (poseFrameCounterRef.current % POSE_EVERY_N_FRAMES === 0) {
        try {
          const poses = await detector.estimatePoses(video, { flipHorizontal: true });
          const flexing = isDoubleFlexPose(poses[0]);
          if (flexing) flexStreakRef.current += 1;
          else flexStreakRef.current = 0;
        } catch {
          flexStreakRef.current = 0;
        }
      }
    }

    try {
      const results = await faceapi
        .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceExpressions();

      if (results.length >= 2) duoStreakRef.current += 1;
      else duoStreakRef.current = 0;

      const desiredScene: CrystalHudScene =
        flexStreakRef.current >= SCENE_STABLE_FRAMES
          ? 'gym'
          : duoStreakRef.current >= SCENE_STABLE_FRAMES
            ? 'romantic'
            : 'mood';
      setCrystalHudScene(desiredScene);

      const nowMs = Date.now();
      if (desiredScene === 'gym' && playlistModeRef.current !== 'gym') {
        lastMusicRef.current = nowMs;
        void playMusicForScene('gym');
      } else if (desiredScene === 'romantic' && playlistModeRef.current !== 'romantic') {
        lastMusicRef.current = nowMs;
        void playMusicForScene('romantic');
      } else if (desiredScene === 'mood' && playlistModeRef.current !== 'mood') {
        playlistModeRef.current = 'mood';
      }

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

        if (results.length === 0) {
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

          if (results.length >= 2) {
            ctx.lineWidth = 2;
            results.forEach((r) => {
              const box = r.detection.box;
              const b = toDisplay({ x: box.x, y: box.y });
              const bw = box.width * scale;
              const bh = box.height * scale;
              ctx.strokeStyle = 'rgba(255,140,190,0.95)';
              ctx.strokeRect(b.x, b.y, bw, bh);
            });
            ctx.font = '11px system-ui';
            ctx.fillStyle = 'rgba(255,200,220,0.9)';
            ctx.textAlign = 'center';
            ctx.fillText('Two faces · romantic playlist', displayWidth / 2, displayHeight - 14);
          } else {
            const result = results[0];
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
              const raw = happinessFromFace(result.landmarks as faceapi.FaceLandmarks68, result.expressions);
              const ts = performance.now();
              const dtS = Math.min(MAX_HAPPINESS_DT_S, (ts - lastHappinessSampleTsRef.current) / 1000);
              lastHappinessSampleTsRef.current = ts;
              const alpha = 1 - Math.exp(-dtS / HAPPINESS_SMOOTH_TIME_CONSTANT_S);
              smoothedHappinessRef.current += (raw - smoothedHappinessRef.current) * alpha;
              const smoothed = smoothedHappinessRef.current;
              setHappiness(smoothed);

              if (desiredScene === 'mood') {
                const diff = Math.abs(smoothed - lastHappinessRef.current);
                if (diff > HAPPINESS_MUSIC_JUMP_THRESHOLD && nowMs - lastMusicRef.current > HAPPINESS_DEBOUNCE_MS) {
                  lastHappinessRef.current = smoothed;
                  lastMusicRef.current = nowMs;
                  playMusicForHappiness(smoothed);
                }
              }
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    requestAnimationFrame(detectFace);
  }, [modelsLoaded, poseReady, playMusicForHappiness, playMusicForScene]);

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
    let cancelled = false;
    (async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        await import('@tensorflow/tfjs-backend-webgl');
        const poseDetection = await import('@tensorflow-models/pose-detection');
        await tf.setBackend('webgl');
        await tf.ready();
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true,
        });
        if (cancelled) {
          detector.dispose();
          return;
        }
        poseDetectorRef.current = detector;
        setPoseReady(true);
      } catch (e) {
        console.warn('Crystal: pose model failed to load (gym flex mode disabled)', e);
      }
    })();
    return () => {
      cancelled = true;
      const d = poseDetectorRef.current;
      poseDetectorRef.current = null;
      setPoseReady(false);
      try {
        d?.dispose();
      } catch {
        /* ignore */
      }
    };
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
      lastMusicRef.current = 0;
      flexStreakRef.current = 0;
      duoStreakRef.current = 0;
      poseFrameCounterRef.current = 0;
      playlistModeRef.current = 'mood';
      setCrystalHudScene('mood');
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

    const mode = playlistModeRef.current;
    const videos =
      mode === 'romantic' || mode === 'gym'
        ? await fetchYouTubeByScene(mode)
        : await fetchYouTubeByHappiness(smoothedHappinessRef.current);
    if (videos.length > 0) {
      const [first, ...rest] = videos;
      setYoutubeQueue(rest);
      setCurrentItem(first);
      setSessionItems((prev) => [...prev, first]);
    } else {
      setCurrentItem(null);
    }
  }, [fetchYouTubeByHappiness, fetchYouTubeByScene]);

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

      {/* Draggable HUD — default top-right; position saved in localStorage */}
      <div
        ref={hudPanelRef}
        className={`pointer-events-auto fixed z-30 flex max-h-[min(92vh,calc(100vh-16px))] min-h-0 w-[min(92vw,304px)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.1] bg-[rgba(5,9,24,0.9)] p-4 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md ${
          hudDragging ? 'ring-1 ring-cyan-400/30' : ''
        }`}
        style={{ left: hudPos.left, top: hudPos.top }}
      >
        <div
          aria-label="Drag to move panel"
          onPointerDown={onHudDragHandleDown}
          className="flex shrink-0 cursor-grab select-none items-center gap-2 rounded-md border border-transparent px-1 py-1 -mx-1 -mt-1 touch-none hover:border-white/[0.08] hover:bg-white/[0.04] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/55" aria-hidden />
          <span className="retro-title text-[7px] uppercase tracking-[0.2em] text-muted-foreground/45">Move</span>
        </div>
        <header className="shrink-0 space-y-1.5 text-left">
            <h1
              className="retro-title text-base tracking-widest sm:text-lg"
              style={{ color: 'rgba(160,196,240,0.9)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
            >
              Crystal Ball
            </h1>
            <p className="retro-body text-[10px] leading-relaxed sm:text-[11px]" style={{ color: 'rgba(160,196,240,0.5)' }}>
              Mood from your face; two people trigger love songs; flex both arms for a gym playlist.
            </p>
        </header>

        <div className="h-px w-full shrink-0 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />

        {/* Now playing */}
        {currentItem && (
            <div
              className="w-full shrink-0 rounded-xl border border-cyan-400/40 bg-[rgba(4,12,28,0.72)] px-3.5 py-3 shadow-[0_0_28px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              role="status"
              aria-live="polite"
            >
              <p className="retro-title mb-1.5 text-left text-[8px] uppercase tracking-[0.22em] text-cyan-200/95">
                Now playing
              </p>
              <p className="retro-body text-left text-[13px] font-semibold leading-snug text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.85)] line-clamp-4">
                {currentItem.title}
              </p>
              {currentItem.channelTitle ? (
                <p className="retro-body mt-1.5 text-left text-[11px] text-cyan-100/75 line-clamp-2">
                  {currentItem.channelTitle}
                </p>
              ) : null}
            </div>
          )}

          {/* Mood / duo / gym */}
          {sessionActive && crystalHudScene === 'gym' && (
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="retro-title text-[10px]" style={{ color: '#f97316' }}>
                  💪 Gym flex
                </span>
                <span className="retro-title text-[8px] tabular-nums text-orange-300/80">Workout</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full w-full"
                  style={{
                    transition: 'background 1s ease-out',
                    background: 'linear-gradient(90deg,#ea580c,#fb923c)',
                  }}
                />
              </div>
            </div>
          )}
          {sessionActive && crystalHudScene === 'romantic' && (
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="retro-title text-[10px]" style={{ color: '#fb7185' }}>
                  💕 Duo mode
                </span>
                <span className="retro-title text-[8px] tabular-nums text-pink-300/80">Romantic</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full w-full"
                  style={{
                    transition: 'background 1s ease-out',
                    background: 'linear-gradient(90deg,#db2777,#f472b6)',
                  }}
                />
              </div>
            </div>
          )}
          {sessionActive && crystalHudScene === 'mood' && (() => {
            const mood = moodLabel(happiness);
            const color = happinessLabelColor(happiness);
            return (
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="retro-title text-[10px]" style={{ color }}>
                    {mood.emoji} {mood.text}
                  </span>
                  <span className="retro-title text-[8px] tabular-nums shrink-0" style={{ color }}>
                    {Math.round(happiness * 100)}%
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/[0.08]">
                  <div
                    className="h-full rounded-full shadow-[0_0_12px_hsla(0,0%,100%,0.12)]"
                    style={{
                      width: `${Math.max(0, Math.min(1, happiness)) * 100}%`,
                      transition: 'width 0.85s ease-out, background 0.85s ease-out',
                      background: happinessBarStyle(happiness),
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {error && <p className="retro-body text-[10px] text-red-400 text-left">{error}</p>}

          {/* Play / End & Save */}
          {!cameraOn && !sessionEnded && (
            <button
              onClick={startSession}
              disabled={loading || !modelsLoaded}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 retro-title text-[10px] transition-all disabled:opacity-40"
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
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 retro-title text-[10px] transition-all"
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
                ? `${sessionItems.length} video${sessionItems.length === 1 ? '' : 's'} in this session. Save a YouTube playlist on your account.`
                : 'No videos played.'}
            </p>

            {sessionItems.length > 0 && (
              <div className="space-y-2 text-left mb-4 max-h-[min(40vh,260px)] overflow-y-auto pr-1">
                {sessionItems.map((row, i) => (
                  <a
                    key={`${row.videoId}-${i}`}
                    href={`https://www.youtube.com/watch?v=${row.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-white/10 bg-white/[0.03] p-2 retro-body text-[11px] text-red-300/90 hover:bg-white/[0.06] line-clamp-2"
                  >
                    {i + 1}. {row.title}
                    {row.channelTitle ? (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{row.channelTitle}</span>
                    ) : null}
                  </a>
                ))}
              </div>
            )}

            {playlistError && (
              <p className="retro-body text-xs text-red-400 mb-3 text-left">{playlistError}</p>
            )}

            {playlistResult && (
              <div className="mb-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-left">
                <p className="retro-title text-[10px] text-red-300 mb-1">YouTube playlist created</p>
                <a
                  href={playlistResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="retro-body text-xs text-red-200 underline"
                >
                  Open in YouTube
                </a>
              </div>
            )}

            {sessionItems.length > 0 && !playlistResult && (
              <button
                type="button"
                onClick={handleCreateYouTubePlaylist}
                disabled={playlistLoading}
                className="retro-title mb-4 w-full rounded-sm py-2.5 text-[11px] transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: 'hsla(var(--youtube-red) / 0.22)',
                  color: 'hsl(var(--youtube-red))',
                  border: '1px solid hsla(var(--youtube-red) / 0.4)',
                }}
              >
                {playlistLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </span>
                ) : (
                  'Create YouTube playlist'
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
