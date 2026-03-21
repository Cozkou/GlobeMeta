import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Loader2, Music } from 'lucide-react';
import { COUNTRY_NAME_TO_CODE, COUNTRY_META, resolveCountryCode } from '@/data/countryData';

const API_BASE = import.meta.env.VITE_API_URL || '';
const COUNTRY_FETCH_TIMEOUT_MS = 45_000;

interface ApiTrack {
  id: string;
  name: string;
  artist: string;
  preview_url: string | null;
  spotify_url: string;
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
  onClose: () => void;
  isClosing: boolean;
}

function withAlpha(color: string, alpha: number): string {
  return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
}

const CountryPanel = ({ countryName, onClose, isClosing }: CountryPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiCountryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<{
    url: string;
    name: string;
    tracks: string[];
    error?: string;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [resolvedCode, setResolvedCode] = useState<string | null>(COUNTRY_NAME_TO_CODE[countryName] || null);
  const code = resolvedCode;
  const meta = code ? COUNTRY_META[code] : undefined;
  const displayName = meta?.displayName || countryName;
  const flag = meta?.flag || '🌍';
  const vibe = meta?.vibe || 'Eclectic';
  const vibeColor = meta?.vibeColor || 'hsl(240, 10%, 50%)';

  useEffect(() => {
    let cancelled = false;
    const initialCode = COUNTRY_NAME_TO_CODE[countryName];
    if (initialCode) {
      setResolvedCode(initialCode);
      return;
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
  }, [countryName]);

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
    setPlaylistResult(null);

    fetch(`${API_BASE}/api/country/${code}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(typeof json.error === 'string' ? json.error : 'not found');
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
    };
  }, []);

  const handlePlay = useCallback(
    (track: ApiTrack) => {
      if (!track.preview_url) return;

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
    [playingId],
  );

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
      className={`fixed z-40 flex max-h-[min(72vh,560px)] w-full max-w-[400px] flex-col overflow-hidden rounded-t-2xl border-t border-x border-white/[0.08] shadow-2xl md:max-h-none md:flex-row md:rounded-none md:border-t-0 md:shadow-none bottom-0 right-0 md:top-0 md:bottom-auto md:h-full md:border-x-0 ${
        isClosing ? 'slide-out-right' : 'slide-in-right'
      }`}
    >
      {/* Mobile: top close row — desktop: slim side rail */}
      <button
        onClick={onClose}
        className="group flex h-11 w-full shrink-0 items-center justify-center gap-2 border-b border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] transition-colors active:scale-[0.99] md:h-full md:w-8 md:flex-col md:border-b-0 md:border-r"
        aria-label="Close panel"
      >
        <X size={14} className="text-muted-foreground/60 group-hover:text-foreground transition-colors" />
        <span className="retro-title text-[10px] text-muted-foreground md:hidden">Close</span>
      </button>

      {/* Panel */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden panel-blur retro-panel md:border-l md:border-border/30">
        {/* Energy bar at top */}
        {data && (
          <div className="h-1 w-full shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div
              className="h-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.round(data.energy * 100)}%`,
                background: `linear-gradient(90deg, ${vibeColor}, ${withAlpha(vibeColor, 0.4)})`,
                boxShadow: `0 0 12px ${withAlpha(vibeColor, 0.6)}`,
              }}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 pt-6 md:pt-12">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{flag}</span>
                <h2 className="retro-title text-lg font-bold text-foreground tracking-tight">{displayName}</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="w-7 h-7 flex items-center justify-center rounded-sm bg-white/[0.06] hover:bg-white/[0.12] transition-colors border border-white/15"
              >
                <X size={12} className="text-muted-foreground" />
              </button>
            </div>
            <span
              className="retro-title inline-flex items-center rounded-sm px-3 py-1 text-[10px] font-semibold"
              style={{
                backgroundColor: withAlpha(vibeColor, 0.13),
                color: vibeColor,
                border: `1px solid ${withAlpha(vibeColor, 0.25)}`,
              }}
            >
              {vibe}
            </span>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Error / no data */}
          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
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
                          const json = await res.json().catch(() => ({})) as { error?: string };
                          throw new Error(typeof json.error === 'string' ? json.error : 'not found');
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

          {/* Data content */}
          {data && !loading && (
            <>
              {/* Track list */}
              <div className="flex flex-col gap-1">
                <h3 className="retro-title text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Top Tracks
                </h3>
                {data.tracks.slice(0, 5).map((track, i) => {
                  const isPlaying = playingId === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group ${
                        isPlaying ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground/50 tabular-nums w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="retro-body text-foreground truncate">{track.name}</p>
                        <p className="retro-body text-muted-foreground truncate">{track.artist}</p>
                      </div>
                      {isPlaying && <SoundWave color={vibeColor} />}
                      {track.preview_url ? (
                        <button
                          onClick={() => handlePlay(track)}
                          className="w-7 h-7 flex items-center justify-center rounded-sm bg-white/[0.06] hover:bg-white/[0.12] transition-colors shrink-0 cursor-pointer border border-white/15"
                        >
                          {isPlaying ? (
                            <Pause size={12} className="text-foreground" />
                          ) : (
                            <Play size={12} className="text-foreground ml-0.5" />
                          )}
                        </button>
                      ) : (
                        <span className="w-7 h-7 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mood */}
              <div className="flex flex-col gap-3">
                <h3 className="retro-title text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mood</h3>
                <MoodBar label="Energy" value={Math.round(data.energy * 100)} color="var(--energy)" />
                <MoodBar label="Danceability" value={Math.round(data.danceability * 100)} color="var(--danceability)" />
                <MoodBar label="Valence" value={Math.round(data.valence * 100)} color="var(--valence)" />
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        {data && !loading && (
          <div className="p-6 pt-0 flex flex-col gap-2">
            <button
              onClick={handleCreatePlaylist}
              disabled={creatingPlaylist}
              className="retro-title w-full flex items-center justify-center gap-2 rounded-sm py-3 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              style={{
                backgroundColor: 'hsla(var(--spotify-green) / 0.15)',
                color: 'hsl(var(--spotify-green))',
                border: '1px solid hsla(var(--spotify-green) / 0.2)',
              }}
            >
              {creatingPlaylist ? <Loader2 size={14} className="animate-spin" /> : '🎵'}
              {creatingPlaylist ? 'Creating…' : 'Create Playlist'}
            </button>

            {playlistResult && (
              <div className="retro-panel mt-1 overflow-hidden border border-white/[0.06] bg-white/[0.03] p-3 flex flex-col gap-2">
                {playlistResult.error ? (
                  <p className="retro-body text-red-400">{playlistResult.error}</p>
                ) : (
                  <>
                    <p className="retro-title text-[10px] text-foreground">
                      🎵 {playlistResult.name}
                    </p>
                    {playlistResult.tracks.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {playlistResult.tracks.map((t, i) => (
                          <p key={i} className="retro-body text-muted-foreground text-sm">{t}</p>
                        ))}
                      </div>
                    )}
                    <a
                      href={playlistResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="retro-title flex items-center justify-center gap-2 rounded-sm py-2.5 text-[10px] font-semibold transition-colors"
                      style={{
                        backgroundColor: 'hsla(var(--spotify-green) / 0.15)',
                        color: 'hsl(var(--spotify-green))',
                        border: '1px solid hsla(var(--spotify-green) / 0.2)',
                      }}
                    >
                      🎧 Open in Spotify
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

function MoodBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="retro-title text-[10px] text-muted-foreground">{label}</span>
        <span className="retro-title text-[10px] tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${value}%`,
            backgroundColor: `hsl(${color})`,
          }}
        />
      </div>
    </div>
  );
}

export default CountryPanel;
