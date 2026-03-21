import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Loader2, Music, ExternalLink } from 'lucide-react';
import { COUNTRY_NAME_TO_CODE, COUNTRY_META, resolveCountryCode } from '@/data/countryData';
import { loadYoutubeIframeApi } from '@/lib/youtubeIframeApi';

const YT_STATE_PLAYING = 1;

type YTPlayerInstance = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (id: string | { videoId: string }) => void;
  destroy: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getDuration?: () => number;
  setSize?: (width: number, height: number) => void;
};

/** Start around 50% so the hook plays immediately (polls until duration is known). */
function applyHalfwayStart(player: YTPlayerInstance) {
  const trySeek = (): boolean => {
    try {
      const d = player.getDuration?.();
      if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return false;
      if (d < 8) {
        player.playVideo();
        return true;
      }
      const target = Math.min(d * 0.5, Math.max(0, d - 3));
      player.seekTo?.(target, true);
      player.playVideo();
      return true;
    } catch {
      return false;
    }
  };
  if (trySeek()) return;
  let n = 0;
  const tid = window.setInterval(() => {
    n += 1;
    if (trySeek()) {
      window.clearInterval(tid);
      return;
    }
    if (n > 55) {
      window.clearInterval(tid);
      try {
        player.playVideo();
      } catch {
        /* ignore */
      }
    }
  }, 90);
}

const API_BASE = import.meta.env.VITE_API_URL || '';
const COUNTRY_FETCH_TIMEOUT_MS = 45_000;

async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof j.error === 'string') return j.error;
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* not JSON */
  }
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (snippet) return `Request failed (${res.status}): ${snippet}`;
  return `Request failed (${res.status} ${res.statusText || 'Error'}). Check VITE_API_URL and that the API server is running.`;
}

interface ApiTrack {
  id: string;
  name: string;
  artist: string;
  preview_url: string | null;
  /** Present for globe picks (YouTube). */
  youtube_url?: string;
  spotify_url?: string;
}

interface ApiCountryData {
  country: string;
  code: string;
  tracks: ApiTrack[];
  energy: number;
  danceability: number;
  valence: number;
  updatedAt: string;
}

interface CountryPanelProps {
  countryName: string;
  /** From globe topojson ISO numeric id → alpha-2; skips fragile name→code lookup when set. */
  countryCodeHint?: string | null;
  onClose: () => void;
  isClosing: boolean;
}

const CountryPanel = ({ countryName, countryCodeHint = null, onClose, isClosing }: CountryPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiCountryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  /** Inline YouTube embed is actively playing (vs paused). */
  const [youtubeIsPlaying, setYoutubeIsPlaying] = useState(false);
  /** YouTube player row visible (first play expands it; list slides down). */
  const [youtubeStageOpen, setYoutubeStageOpen] = useState(false);
  const [youtubeLoadError, setYoutubeLoadError] = useState<string | null>(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<{
    url: string;
    name: string;
    tracks: string[];
    error?: string;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null);
  const ytWrapperRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytEffectGenRef = useRef(0);

  const [resolvedCode, setResolvedCode] = useState<string | null>(COUNTRY_NAME_TO_CODE[countryName] || null);
  const code = resolvedCode;
  const meta = code ? COUNTRY_META[code] : undefined;
  const displayName = meta?.displayName || countryName;
  const flag = meta?.flag || '🌍';

  useEffect(() => {
    let cancelled = false;
    const hint = countryCodeHint?.trim().toUpperCase() || null;
    if (hint && /^[A-Z]{2}$/.test(hint)) {
      setResolvedCode(hint);
      return () => {
        cancelled = true;
      };
    }

    const initialCode = COUNTRY_NAME_TO_CODE[countryName];
    if (initialCode) {
      setResolvedCode(initialCode);
      return () => {
        cancelled = true;
      };
    }

    setResolvedCode(null);
    setLoading(true);
    setError(null);

    resolveCountryCode(countryName).then(codeFromApi => {
      if (!cancelled) setResolvedCode(codeFromApi);
    });

    return () => {
      cancelled = true;
    };
  }, [countryName, countryCodeHint]);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError('No music data available for this country yet.');
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), COUNTRY_FETCH_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    setData(null);
    setPlayingId(null);
    setYoutubeIsPlaying(false);
    setYoutubeStageOpen(false);
    setYoutubeLoadError(null);
    try {
      ytPlayerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    ytPlayerRef.current = null;
    setPlaylistResult(null);

    fetch(`${API_BASE}/api/country/${code}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await errorMessageFromResponse(res));
        }
        return res.json();
      })
      .then(d => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (aborted) {
          setError('Request timed out — check that the API server is running and try again.');
        } else {
          const msg = err instanceof Error ? err.message : '';
          setError(msg || 'No music data available for this country yet.');
        }
      })
      .finally(() => {
        clearTimeout(t);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(t);
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      ytPlayerRef.current = null;
    };
  }, []);

  const pauseYoutube = useCallback(() => {
    try {
      ytPlayerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
    setYoutubeIsPlaying(false);
  }, []);

  const handlePlay = useCallback(
    (track: ApiTrack) => {
      if (!track.preview_url) return;

      pauseYoutube();

      if (playingId === track.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }

      if (audioRef.current) audioRef.current.pause();

      const audio = new Audio(track.preview_url);
      audio.play();
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(track.id);
    },
    [playingId, pauseYoutube],
  );

  const handleYoutubeToggle = useCallback(
    (track: ApiTrack) => {
      if (!track.youtube_url) return;
      setYoutubeLoadError(null);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (playingId === track.id) {
        if (youtubeIsPlaying) {
          pauseYoutube();
        } else {
          setYoutubeStageOpen(true);
          try {
            ytPlayerRef.current?.playVideo();
          } catch {
            setYoutubeLoadError('Could not play video.');
          }
        }
        return;
      }

      setYoutubeStageOpen(true);
      setPlayingId(track.id);
      setYoutubeIsPlaying(false);
    },
    [playingId, youtubeIsPlaying, pauseYoutube],
  );

  useEffect(() => {
    if (!playingId || !data) return;
    const track = data.tracks.find((t) => t.id === playingId && t.youtube_url);
    if (!track || !ytMountRef.current) return;

    const gen = ++ytEffectGenRef.current;

    const run = async () => {
      try {
        await loadYoutubeIframeApi();
      } catch {
        if (gen === ytEffectGenRef.current) setYoutubeLoadError('Could not load YouTube player.');
        return;
      }
      if (gen !== ytEffectGenRef.current || !ytMountRef.current) return;

      const YT = (window as unknown as {
        YT: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayerInstance };
      }).YT;

      const onStateChange = (e: { data: number }) => {
        setYoutubeIsPlaying(e.data === YT_STATE_PLAYING);
      };

      try {
        const wrap = ytWrapperRef.current;
        const pw = Math.max(200, Math.floor(wrap?.clientWidth || ytMountRef.current?.clientWidth || 320));
        const fallbackH = Math.min(Math.floor(window.innerHeight * 0.4), 300);
        const ph = Math.max(160, Math.floor(wrap?.clientHeight || fallbackH));

        if (ytPlayerRef.current) {
          ytPlayerRef.current.loadVideoById(track.id);
          try {
            ytPlayerRef.current.setSize?.(pw, ph);
          } catch {
            /* ignore */
          }
          applyHalfwayStart(ytPlayerRef.current);
        } else {
          const el = ytMountRef.current;
          ytPlayerRef.current = new YT.Player(el, {
            height: ph,
            width: pw,
            videoId: track.id,
            playerVars: {
              autoplay: 1,
              playsinline: 1,
              modestbranding: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: (ev: { target: YTPlayerInstance }) => {
                try {
                  ev.target.setSize?.(pw, ph);
                } catch {
                  /* ignore */
                }
                applyHalfwayStart(ev.target);
              },
              onStateChange,
            },
          });
        }
      } catch {
        if (gen === ytEffectGenRef.current) setYoutubeLoadError('Playback failed.');
      }
    };

    void run();
  }, [playingId, data]);

  useEffect(() => {
    const wrap = ytWrapperRef.current;
    if (!wrap || !data?.tracks.some((t) => t.youtube_url)) return;
    const sync = () => {
      const w = Math.max(160, Math.floor(wrap.clientWidth));
      const h = Math.max(120, Math.floor(wrap.clientHeight));
      try {
        ytPlayerRef.current?.setSize?.(w, h);
      } catch {
        /* ignore */
      }
    };
    sync();
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(sync);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, code, youtubeStageOpen]);

  const handleCreatePlaylist = async () => {
    if (!code) return;
    setCreatingPlaylist(true);
    setPlaylistResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/create-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: code }),
      });
      const json = await res.json();
      if (json.url) {
        setPlaylistResult({ url: json.url, name: json.name, tracks: json.tracks || [] });
      } else {
        setPlaylistResult({ url: '', name: '', tracks: [], error: json.error || 'Failed to create playlist' });
      }
    } catch (_e) {
      setPlaylistResult({ url: '', name: '', tracks: [], error: 'Network error — is the server running?' });
    } finally {
      setCreatingPlaylist(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`fixed z-40 flex flex-col h-[min(88vh,760px)] w-full max-w-[min(100vw,480px)] overflow-hidden border-l border-white/[0.06] shadow-2xl bottom-0 right-0 md:top-0 md:bottom-auto md:h-full md:max-h-none min-h-0 ${
        isClosing ? 'slide-out-right' : 'slide-in-right'
      }`}
      style={{ background: 'rgba(6,8,20,0.94)', backdropFilter: 'blur(20px)' }}
    >
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{flag}</span>
              <h2 className="retro-title text-base text-foreground tracking-tight">{displayName}</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="w-7 h-7 flex items-center justify-center rounded-sm bg-white/[0.05] hover:bg-white/[0.12] transition-colors"
            >
              <X size={13} className="text-muted-foreground" />
            </button>
          </div>
        </div>

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center py-12 px-5">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Error / no data */}
          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3 px-5">
              <Music className="w-8 h-8 text-muted-foreground/40" />
              <p className="retro-body text-muted-foreground text-center">{error}</p>
              {code && (
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    setData(null);
                    const ac = new AbortController();
                    const t = window.setTimeout(() => ac.abort(), COUNTRY_FETCH_TIMEOUT_MS);
                    fetch(`${API_BASE}/api/country/${code}`, { signal: ac.signal })
                      .then(async (res) => {
                        if (!res.ok) {
                          throw new Error(await errorMessageFromResponse(res));
                        }
                        return res.json();
                      })
                      .then((d) => setData(d))
                      .catch((err: unknown) => {
                        const aborted = err instanceof DOMException && err.name === 'AbortError';
                        if (aborted) {
                          setError('Request timed out — check that the API server is running and try again.');
                        } else {
                          const msg = err instanceof Error ? err.message : '';
                          setError(msg || 'No music data available for this country yet.');
                        }
                      })
                      .finally(() => {
                        clearTimeout(t);
                        setLoading(false);
                      });
                  }}
                  className="retro-title text-[10px] text-accent/80 hover:text-accent underline underline-offset-2"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {/* Video on top, track list below */}
          {data && !loading && (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              {data.tracks.some((t) => t.youtube_url) && (
                <div
                  className={`grid shrink-0 w-full bg-black border-white/[0.08] motion-reduce:transition-none transition-[grid-template-rows] duration-500 ease-out ${
                    youtubeStageOpen ? 'grid-rows-[1fr] border-b' : 'grid-rows-[0fr] border-b-0'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      ref={ytWrapperRef}
                      className="relative w-full min-h-[min(40vh,300px)] h-[min(40vh,300px)]"
                    >
                      <div ref={ytMountRef} className="absolute inset-0 w-full h-full" />
                      {youtubeStageOpen && !playingId && (
                        <span className="absolute inset-0 flex items-center justify-center retro-body text-[9px] text-muted-foreground/50 pointer-events-none text-center px-4">
                          Tap a track below — playback starts mid-song
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1 min-h-0 flex-1 overflow-y-auto px-5 py-3">
                <h3 className="retro-title text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 shrink-0">
                  Trending on YouTube
                </h3>
                {!youtubeStageOpen && data.tracks.some((t) => t.youtube_url) && (
                  <p className="retro-body text-[9px] text-muted-foreground/60 mb-1 shrink-0">
                    Tap play on a track — the video opens above and the list moves down.
                  </p>
                )}
                {youtubeLoadError && (
                  <p className="retro-body text-[10px] text-red-400/90 mb-2 shrink-0">{youtubeLoadError}</p>
                )}
                {data.tracks.slice(0, 5).map((track, i) => {
                  const isYoutube = Boolean(track.youtube_url);
                  const isRowActive = playingId === track.id;
                  const showPause = isYoutube ? isRowActive && youtubeIsPlaying : isRowActive;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors group ${
                        isRowActive ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground/50 tabular-nums w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="retro-body text-foreground truncate">{track.name}</p>
                        <p className="retro-body text-muted-foreground truncate">{track.artist}</p>
                      </div>
                      {isRowActive && (!isYoutube || youtubeIsPlaying) && (
                        <SoundWave color="hsl(var(--accent))" />
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isYoutube ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleYoutubeToggle(track)}
                              aria-label={showPause ? 'Pause' : 'Play in panel'}
                              className="w-8 h-8 flex items-center justify-center rounded-sm bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer border border-white/15"
                            >
                              {showPause ? (
                                <Pause size={13} className="text-foreground" />
                              ) : (
                                <Play size={13} className="text-foreground ml-0.5" />
                              )}
                            </button>
                            <a
                              href={track.youtube_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open on YouTube"
                              aria-label="Open on YouTube"
                              className="w-8 h-8 flex items-center justify-center rounded-sm bg-white/[0.06] hover:bg-red-950/45 transition-colors border border-red-500/30 text-red-300"
                            >
                              <ExternalLink size={13} />
                            </a>
                          </>
                        ) : track.preview_url ? (
                          <button
                            type="button"
                            onClick={() => handlePlay(track)}
                            aria-label={isRowActive ? 'Pause preview' : 'Play preview'}
                            className="w-8 h-8 flex items-center justify-center rounded-sm bg-white/[0.06] hover:bg-white/[0.12] transition-colors shrink-0 cursor-pointer border border-white/15"
                          >
                            {isRowActive ? (
                              <Pause size={13} className="text-foreground" />
                            ) : (
                              <Play size={13} className="text-foreground ml-0.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-8 h-8 shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Action buttons */}
        {data && !loading && (
          <div className="shrink-0 px-5 py-4 border-t border-white/[0.06] bg-[rgba(6,8,20,0.98)]">
            <button
              onClick={handleCreatePlaylist}
              disabled={creatingPlaylist}
              className="retro-title w-full flex items-center justify-center gap-2 rounded-sm py-3 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              style={{
                backgroundColor: 'hsla(var(--youtube-red) / 0.15)',
                color: 'hsl(var(--youtube-red))',
                border: '1px solid hsla(var(--youtube-red) / 0.25)',
              }}
            >
              {creatingPlaylist ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
              {creatingPlaylist ? 'Creating…' : 'Create YouTube playlist'}
            </button>

            {playlistResult && (
              <div className="retro-panel mt-2 overflow-hidden border border-white/[0.06] bg-white/[0.03] p-3 flex flex-col gap-2">
                {playlistResult.error ? (
                  <p className="retro-body text-red-400">{playlistResult.error}</p>
                ) : (
                  <>
                    <p className="retro-title text-[10px] text-foreground">{playlistResult.name}</p>
                    <a
                      href={playlistResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="retro-title flex items-center justify-center gap-2 rounded-sm py-2.5 text-[10px] font-semibold transition-colors"
                      style={{
                        backgroundColor: 'hsla(var(--youtube-red) / 0.15)',
                        color: 'hsl(var(--youtube-red))',
                        border: '1px solid hsla(var(--youtube-red) / 0.25)',
                      }}
                    >
                      Open in YouTube
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function SoundWave({ color }: { color: string }) {
  return (
    <div className="soundwave" style={{ color }}>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export default CountryPanel;
