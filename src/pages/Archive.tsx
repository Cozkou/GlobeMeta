import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { CrystalBallIcon } from '@/components/CrystalBallIcon';

const API_BASE = import.meta.env.VITE_API_URL || '';

export type ArchiveEntry = {
  id: string;
  filename: string;
  source: string;
  archivedAt: string | null;
  title: string;
  playlistUrl: string | null;
  playlistName: string | null;
  countryCode: string | null;
  countryName: string | null;
  sessionVideosCount: number;
  spotifyMatchesCount: number;
  trackPreview: string[] | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function ArchiveCard({ entry }: { entry: ArchiveEntry }) {
  const isGlobe = entry.source === 'globe';
  const variant = isGlobe ? 'globe' : 'crystal';
  const href = entry.playlistUrl
    ? entry.playlistUrl
    : isGlobe
      ? '/globe'
      : '/crystal';
  const external = Boolean(entry.playlistUrl);

  const cardInner = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <CrystalBallIcon variant={variant} className="h-10 w-10 shrink-0 drop-shadow-[0_0_12px_rgba(100,180,255,0.25)]" />
        {entry.playlistUrl && (
          <span className="retro-title rounded-full border border-[hsl(var(--youtube-red)/0.35)] bg-[hsl(var(--youtube-red)/0.12)] px-2 py-0.5 text-[8px] uppercase tracking-wide text-[hsl(var(--youtube-red))]">
            YouTube
          </span>
        )}
      </div>
      <span className="retro-title text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
        {isGlobe ? 'Globe mix' : 'Crystal Ball'}
      </span>
      <h2 className="retro-title mt-1 line-clamp-2 min-h-[2.5rem] text-left text-sm leading-snug text-foreground/95">
        {entry.title}
      </h2>
      {isGlobe && entry.countryName && (
        <p className="retro-body mt-2 line-clamp-1 text-left text-[11px] text-muted-foreground">
          {entry.countryName}
          {entry.countryCode ? ` · ${entry.countryCode}` : ''}
        </p>
      )}
      {!isGlobe && (
        <p className="retro-body mt-2 line-clamp-2 text-left text-[11px] text-muted-foreground">
          {entry.sessionVideosCount} videos
          {entry.spotifyMatchesCount > 0 ? ` · ${entry.spotifyMatchesCount} Spotify matches (legacy)` : ''}
        </p>
      )}
      <p className="retro-body mt-3 text-left text-[10px] text-muted-foreground/65">{formatWhen(entry.archivedAt)}</p>
      {entry.trackPreview && entry.trackPreview.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-left">
          {entry.trackPreview.slice(0, 3).map((line, i) => (
            <li key={i} className="retro-body line-clamp-1 font-mono text-[9px] text-muted-foreground/85">
              {line}
            </li>
          ))}
          {entry.trackPreview.length > 3 && (
            <li className="retro-body text-[9px] text-muted-foreground/50">+{entry.trackPreview.length - 3} more</li>
          )}
        </ul>
      )}
      {!entry.playlistUrl && entry.source === 'crystal' && entry.sessionVideosCount > 0 && (
        <p className="retro-body mt-3 border-t border-white/[0.06] pt-3 text-left text-[9px] text-muted-foreground/80">
          Tap to open Crystal Ball and build a YouTube playlist from your session.
        </p>
      )}
      <p className="retro-title mt-4 text-center text-[9px] text-cyan-400/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {external ? 'Open in YouTube' : 'Open in app'}
      </p>
    </>
  );

  const shellClass =
    'group relative flex h-full min-h-[220px] flex-col rounded-xl border border-white/[0.08] bg-gradient-to-b from-[rgba(14,18,40,0.92)] to-[rgba(6,8,20,0.75)] p-4 text-left shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-200 hover:border-cyan-400/25 hover:shadow-[0_12px_40px_rgba(34,211,238,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]';

  if (external) {
    return (
      <li className="h-full">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={shellClass}
        >
          {cardInner}
        </a>
      </li>
    );
  }

  return (
    <li className="h-full">
      <Link to={href} className={shellClass}>
        {cardInner}
      </Link>
    </li>
  );
}

const Archive = () => {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/archive`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not load archive');
        if (!cancelled) setEntries(Array.isArray(json.entries) ? json.entries : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load archive');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-8 pb-5 text-center md:px-10">
        <div className="mx-auto mb-3 flex justify-center">
          <CrystalBallIcon className="h-12 w-12" />
        </div>
        <h1 className="retro-title glow-text text-xl tracking-wide text-[rgba(160,196,240,0.9)]">Archive</h1>
        <p className="retro-body mx-auto mt-2 max-w-lg text-[12px] text-muted-foreground">
          Saved Globe mixes and Crystal Ball sessions. Click a card to open YouTube or jump back into the app.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 md:px-10">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin opacity-60" />
            <p className="retro-body text-xs">Loading saved items…</p>
          </div>
        )}

        {!loading && error && (
          <div className="mx-auto max-w-md rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-center">
            <p className="retro-body text-xs text-red-300">{error}</p>
            <p className="retro-body mt-2 text-[10px] text-muted-foreground">
              Make sure the API server is running (<span className="font-mono">cd server && node index.js</span>) and{' '}
              <span className="font-mono">VITE_API_URL</span> points at it.
            </p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
            <CrystalBallIcon className="h-14 w-14 opacity-50" />
            <p className="retro-body text-sm text-muted-foreground">
              Nothing saved yet. Create a playlist from the Globe, or end a Crystal Ball session with &quot;End &amp;
              Save&quot;.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/globe"
                className="retro-title inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[10px] text-foreground/90 transition-colors hover:bg-white/[0.1]"
              >
                <CrystalBallIcon variant="globe" className="h-5 w-5" />
                Globe
              </Link>
              <Link
                to="/crystal"
                className="retro-title inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[10px] text-foreground/90 transition-colors hover:bg-white/[0.1]"
              >
                <CrystalBallIcon variant="crystal" className="h-5 w-5" />
                Crystal Ball
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <ArchiveCard key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Archive;
