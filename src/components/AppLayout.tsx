import { useRef, useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { Home, Globe, Eye, FolderOpen, Disc3 } from 'lucide-react';
import GlobeScene, { type GlobeHandle, type GlobeCountryPick } from '@/components/GlobeScene';
import { ArtistRadioPanel } from '@/components/ArtistRadioPanel';

const GLOBE_BG = '#0a0a0f';

const NAV_MAIN = [
  { to: '/globe', label: 'Globe', icon: Globe },
  { to: '/crystal', label: 'Crystal Ball', icon: Eye },
] as const;

const NAV_TAIL = [{ to: '/archive', label: 'Archive', icon: FolderOpen }] as const;

export interface LayoutContext {
  globeRef: React.RefObject<GlobeHandle | null>;
  onCountryClick: (pick: GlobeCountryPick) => void;
  selectedCountry: GlobeCountryPick | null;
  setSelectedCountry: (pick: GlobeCountryPick | null) => void;
  /** Crystal Ball registers this to pause hidden YouTube audio when e.g. Artist shuffle opens. */
  crystalPausePlaybackRef: React.MutableRefObject<(() => void) | null>;
}

const AppLayout = () => {
  const location = useLocation();
  const crystalBallMode = location.pathname === '/crystal';
  const globeRef = useRef<GlobeHandle | null>(null);
  const crystalPausePlaybackRef = useRef<(() => void) | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<GlobeCountryPick | null>(null);
  const [artistRadioOpen, setArtistRadioOpen] = useState(false);

  const onCountryClick = useCallback((pick: GlobeCountryPick) => {
    if (crystalBallMode) return;
    setSelectedCountry((prev) => (prev?.name === pick.name ? null : pick));
  }, [crystalBallMode]);

  const ctx: LayoutContext = {
    globeRef,
    onCountryClick,
    selectedCountry,
    setSelectedCountry,
    crystalPausePlaybackRef,
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <nav className="sidebar-nav relative z-50 flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-white/[0.06] bg-[rgba(6,8,18,0.95)] pt-3 backdrop-blur-md">
        <Link
          to="/"
          title="Home"
          className="group relative mb-3 flex h-8 w-8 items-center justify-center rounded-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--accent)/0.8)]"
        >
          <Home className="h-4 w-4" />
          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-sm bg-[rgba(6,8,20,0.95)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity retro-title retro-panel group-hover:opacity-100">
            Home
          </span>
        </Link>

        <div className="mb-1.5 h-px w-5 bg-white/[0.06]" />

        {NAV_MAIN.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `group relative flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
                isActive
                  ? 'bg-white/[0.08] text-[hsl(var(--accent))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-white/[0.04] hover:text-[hsl(var(--accent)/0.7)]'
              }`
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-sm bg-[rgba(6,8,20,0.95)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity retro-title retro-panel group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}

        <button
          type="button"
          title="Artist shuffle"
          aria-expanded={artistRadioOpen}
          aria-controls="artist-radio-panel"
          onClick={() =>
            setArtistRadioOpen((prev) => {
              if (!prev && crystalBallMode) {
                crystalPausePlaybackRef.current?.();
              }
              return !prev;
            })
          }
          className={`group relative flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
            artistRadioOpen
              ? 'bg-white/[0.08] text-[hsl(var(--accent))]'
              : 'text-[hsl(var(--muted-foreground))] hover:bg-white/[0.04] hover:text-[hsl(var(--accent)/0.7)]'
          }`}
        >
          <Disc3 className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-sm bg-[rgba(6,8,20,0.95)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity retro-title retro-panel group-hover:opacity-100">
            Artist shuffle
          </span>
        </button>

        {NAV_TAIL.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `group relative flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
                isActive
                  ? 'bg-white/[0.08] text-[hsl(var(--accent))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-white/[0.04] hover:text-[hsl(var(--accent)/0.7)]'
              }`
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-sm bg-[rgba(6,8,20,0.95)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity retro-title retro-panel group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div id="artist-radio-panel">
        <ArtistRadioPanel open={artistRadioOpen} onClose={() => setArtistRadioOpen(false)} />
      </div>

      <main className="relative flex-1 overflow-hidden" style={{ background: GLOBE_BG }}>
        <GlobeScene
          ref={globeRef}
          onCountryClick={onCountryClick}
          isPanelOpen={!!selectedCountry}
          crystalBallMode={crystalBallMode}
        />
        <div className="pointer-events-none absolute inset-0 z-10">
          <Outlet context={ctx} />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
