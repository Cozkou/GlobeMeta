import { useRef, useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Globe, Sparkles, Archive } from 'lucide-react';
import GlobeScene, { type GlobeHandle } from '@/components/GlobeScene';

const GLOBE_BG = '#0a0a0f';

const NAV_ITEMS = [
  { to: '/globe', label: 'Globe', icon: Globe },
  { to: '/crystal', label: 'Crystal Ball', icon: Sparkles },
  { to: '/archive', label: 'Archive', icon: Archive },
] as const;

export interface LayoutContext {
  globeRef: React.RefObject<GlobeHandle | null>;
  onCountryClick: (name: string) => void;
  selectedCountry: string | null;
  setSelectedCountry: (name: string | null) => void;
}

const AppLayout = () => {
  const location = useLocation();
  const crystalBallMode = location.pathname === '/crystal';
  const globeRef = useRef<GlobeHandle | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const onCountryClick = useCallback((name: string) => {
    if (crystalBallMode) return;
    setSelectedCountry((prev) => (prev === name ? null : name));
  }, [crystalBallMode]);

  const ctx: LayoutContext = { globeRef, onCountryClick, selectedCountry, setSelectedCountry };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <nav className="sidebar-nav relative z-50 flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[hsla(var(--accent)/0.18)] bg-[rgba(6,8,20,0.92)] pt-4 backdrop-blur-md">
        <span className="mb-4 text-lg select-none" aria-hidden>🌍</span>

        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `group relative flex h-10 w-10 items-center justify-center rounded-sm transition-colors ${
                isActive
                  ? 'bg-[hsla(var(--accent)/0.15)] text-[hsl(var(--accent))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsla(var(--accent)/0.08)] hover:text-[hsl(var(--accent)/0.8)]'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-sm bg-[rgba(6,8,20,0.95)] px-2.5 py-1.5 text-[10px] text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity retro-title retro-panel group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <main className="relative flex-1 overflow-hidden" style={{ background: GLOBE_BG }}>
        <GlobeScene
          ref={globeRef}
          onCountryClick={onCountryClick}
          isPanelOpen={!!selectedCountry}
          crystalBallMode={crystalBallMode}
        />
        <div className="absolute inset-0 z-10">
          <Outlet context={ctx} />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
