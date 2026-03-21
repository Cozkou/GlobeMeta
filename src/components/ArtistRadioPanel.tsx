import { useRef, useEffect, useState, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  SkipForward,
  FastForward,
  Loader2,
  Square,
  ExternalLink,
} from 'lucide-react';
import { loadYoutubeIframeApi } from '@/lib/youtubeIframeApi';

const API_BASE = import.meta.env.VITE_API_URL || '';

type YtVideo = { videoId: string; title: string; channelTitle: string };

type YTPlayerApi = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  loadVideoById: (opts: { videoId: string }) => void;
  unMute: () => void;
  mute: () => void;
  setVolume: (v: number) => void;
};

const YT_PLAYING = 1;
const YT_PAUSED = 2;

function youtubePlayerVars(): Record<string, number | string> {
  if (typeof window === 'undefined') {
    return { autoplay: 1, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 };
  }
  return {
    autoplay: 1,
    controls: 1,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    origin: window.location.origin,
  };
}

export interface ArtistRadioPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ArtistRadioPanel({ open, onClose }: ArtistRadioPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerApi | null>(null);
  const [phase, setPhase] = useState<'pick' | 'playing'>('pick');
  const [artistInput, setArtistInput] = useState('');
  const [artistLocked, setArtistLocked] = useState('');
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<YtVideo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingUi, setPlayingUi] = useState(true);
  const pollUiRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const destroyPlayer = useCallback(() => {
    try {
      playerRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
    if (pollUiRef.current) {
      clearInterval(pollUiRef.current);
      pollUiRef.current = null;
    }
  }, []);

  const fetchRandom = useCallback(async (artist: string, exclude: string[]) => {
    const res = await fetch(`${API_BASE}/api/youtube-random-by-artist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, excludeVideoIds: exclude }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      video?: YtVideo;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : 'Request failed');
    }
    if (!json.video?.videoId) throw new Error('No video returned');
    return json.video;
  }, []);

  const startSession = useCallback(async () => {
    const name = artistInput.trim();
    if (!name) {
      setError('Type an artist name first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const video = await fetchRandom(name, []);
      setArtistLocked(name);
      setPlayedIds([video.videoId]);
      setCurrent(video);
      setPhase('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load a song.');
    } finally {
      setLoading(false);
    }
  }, [artistInput, fetchRandom]);

  const nextRandom = useCallback(async () => {
    if (!artistLocked) return;
    setLoading(true);
    setError(null);
    try {
      const video = await fetchRandom(artistLocked, playedIds);
      setPlayedIds((prev) => [...prev, video.videoId]);
      setCurrent(video);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load another song.');
    } finally {
      setLoading(false);
    }
  }, [artistLocked, playedIds, fetchRandom]);

  const stopSession = useCallback(() => {
    destroyPlayer();
    setPhase('pick');
    setArtistLocked('');
    setPlayedIds([]);
    setCurrent(null);
    setError(null);
    setPlayingUi(false);
  }, [destroyPlayer]);

  const togglePlayPause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const st = p.getPlayerState?.();
      if (st === YT_PLAYING) {
        p.pauseVideo();
        setPlayingUi(false);
      } else {
        p.playVideo();
        p.unMute();
        p.setVolume(100);
        setPlayingUi(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const skipAhead = useCallback(() => {
    const p = playerRef.current;
    if (!p?.getCurrentTime || !p.seekTo) return;
    try {
      const t = p.getCurrentTime() || 0;
      const d = typeof p.getDuration === 'function' ? p.getDuration() : NaN;
      const cap = Number.isFinite(d) && d > 0 ? Math.max(0, d - 1) : t + 15;
      p.seekTo(Math.min(t + 15, cap), true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open || phase !== 'playing') {
      destroyPlayer();
    }
  }, [open, phase, destroyPlayer]);

  useEffect(() => {
    if (!open || phase !== 'playing' || !current?.videoId) return;

    const el = mountRef.current;
    if (!el) return;
    let cancelled = false;

    void loadYoutubeIframeApi().then(() => {
      if (cancelled) return;
      const YT = (window as unknown as {
        YT?: {
          Player: new (
            node: HTMLElement,
            opts: {
              videoId: string;
              width?: string;
              height?: string;
              playerVars?: Record<string, number | string>;
              events?: {
                onReady?: (e: { target: YTPlayerApi }) => void;
                onStateChange?: (e: { data: number }) => void;
              };
            },
          ) => YTPlayerApi;
        };
      }).YT;
      if (!YT?.Player) return;

      const vid = current.videoId;

      if (playerRef.current) {
        if (cancelled) return;
        try {
          playerRef.current.loadVideoById({ videoId: vid });
          playerRef.current.playVideo();
          playerRef.current.unMute();
          playerRef.current.setVolume(100);
          setPlayingUi(true);
        } catch {
          /* ignore */
        }
        return;
      }

      if (cancelled) return;
      el.innerHTML = '';
      const p = new YT.Player(el, {
        videoId: vid,
        width: '100%',
        height: '100%',
        playerVars: youtubePlayerVars(),
        events: {
          onReady: (e) => {
            try {
              e.target.unMute();
              e.target.setVolume(100);
              e.target.playVideo();
              setPlayingUi(true);
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e) => {
            if (e.data === YT_PLAYING) setPlayingUi(true);
            if (e.data === YT_PAUSED) setPlayingUi(false);
          },
        },
      });
      if (cancelled) {
        try {
          p.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      playerRef.current = p;
    });

    return () => {
      cancelled = true;
    };
  }, [open, phase, current?.videoId]);

  useEffect(() => {
    if (!open || phase !== 'playing') {
      if (pollUiRef.current) {
        clearInterval(pollUiRef.current);
        pollUiRef.current = null;
      }
      return;
    }
    pollUiRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getPlayerState) return;
      try {
        const st = p.getPlayerState();
        setPlayingUi(st === YT_PLAYING);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      if (pollUiRef.current) {
        clearInterval(pollUiRef.current);
        pollUiRef.current = null;
      }
    };
  }, [open, phase]);

  useEffect(() => {
    if (!open) {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed left-12 top-0 z-[100] flex h-full w-[min(calc(100vw-3rem),400px)] flex-col border-r border-white/[0.08] bg-[rgba(6,8,20,0.97)] shadow-2xl backdrop-blur-xl"
      role="dialog"
      aria-label="Artist shuffle"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
        <h2 className="retro-title text-[10px] uppercase tracking-widest text-[hsl(var(--accent)/0.9)]">
          Artist shuffle
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {phase === 'pick' && (
          <div className="space-y-3">
            <p className="retro-body text-[11px] leading-relaxed text-muted-foreground">
              Enter any artist. We&apos;ll play a random YouTube pick, then you can skip ahead, pause, or draw another
              random track from the same artist.
            </p>
            <label className="block">
              <span className="retro-title mb-1.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                Artist
              </span>
              <input
                type="text"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && void startSession()}
                placeholder="e.g. Dua Lipa, BTS, The Weeknd"
                className="retro-body w-full rounded-sm border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[hsl(var(--accent)/0.45)]"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void startSession()}
              className="retro-title flex w-full items-center justify-center gap-2 rounded-sm py-2.5 text-[10px] font-semibold transition-opacity disabled:opacity-50"
              style={{
                background: 'hsla(var(--accent) / 0.15)',
                border: '1px solid hsla(var(--accent) / 0.35)',
                color: 'hsl(var(--accent))',
              }}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start listening
            </button>
          </div>
        )}

        {phase === 'playing' && current && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-1">
              <p className="retro-title text-[9px] uppercase tracking-wider text-muted-foreground">Now · {artistLocked}</p>
              <p className="retro-body line-clamp-2 text-[12px] text-foreground">{current.title}</p>
              {current.channelTitle ? (
                <p className="retro-body text-[10px] text-muted-foreground">{current.channelTitle}</p>
              ) : null}
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-white/[0.1] bg-black">
              <div ref={mountRef} className="absolute inset-0 h-full w-full" />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={togglePlayPause}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-sm border border-white/[0.15] bg-white/[0.06] text-foreground transition-colors hover:bg-white/[0.1] disabled:opacity-40"
                aria-label={playingUi ? 'Pause' : 'Play'}
              >
                {playingUi ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={skipAhead}
                className="retro-title flex h-9 items-center gap-1.5 rounded-sm border border-white/[0.12] bg-white/[0.04] px-2.5 text-[9px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
              >
                <FastForward className="h-3.5 w-3.5" />
                +15s
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void nextRandom()}
                className="retro-title flex h-9 items-center gap-1.5 rounded-sm border border-white/[0.12] bg-white/[0.04] px-2.5 text-[9px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />}
                Next random
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${current.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-sm border border-red-500/25 bg-red-950/30 text-red-300 transition-colors hover:bg-red-950/50"
                aria-label="Open on YouTube"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <button
              type="button"
              onClick={stopSession}
              className="retro-title flex w-full items-center justify-center gap-2 rounded-sm border border-white/[0.12] py-2 text-[9px] text-muted-foreground transition-colors hover:border-white/[0.2] hover:text-foreground"
            >
              <Square className="h-3 w-3" />
              Stop session · pick another artist
            </button>
          </div>
        )}

        {error && <p className="retro-body text-[11px] text-red-400/90">{error}</p>}
      </div>
    </div>
  );
}
