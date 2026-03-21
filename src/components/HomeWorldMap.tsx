import { useEffect, useId, useMemo, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { MockListener } from '@/data/homeMockListeners';

/** Equirectangular canvas — high enough for 10m coastlines at full viewport */
const MAP_W = 3600;
const MAP_H = 1800;

const COUNTRIES_URL = 'https://unpkg.com/world-atlas@2/countries-10m.json';
const LAND_URL = 'https://unpkg.com/world-atlas@2/land-50m.json';

function ringToPath(ring: number[][], w: number, h: number): string {
  if (ring.length < 2) return '';
  const cmds: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const x = ((lng + 180) / 360) * w;
    const y = ((90 - lat) / 180) * h;
    cmds.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

function polygonToPath(poly: number[][][], w: number, h: number): string {
  return poly.map((ring) => ringToPath(ring, w, h)).join(' ');
}

function geometryToPath(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  w: number,
  h: number,
): string | null {
  if (geom.type === 'Polygon') {
    return polygonToPath(geom.coordinates as number[][][], w, h);
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .map((poly) => polygonToPath(poly, w, h))
      .join(' ');
  }
  return null;
}

function lineStringCoordsToPath(coords: number[][], w: number, h: number): string {
  if (coords.length < 2) return '';
  let d = '';
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    const x = ((lng + 180) / 360) * w;
    const y = ((90 - lat) / 180) * h;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}

function lineGeometryToPath(geom: GeoJSON.Geometry | null, w: number, h: number): string {
  if (!geom) return '';
  if (geom.type === 'LineString') {
    return lineStringCoordsToPath(geom.coordinates as number[][], w, h);
  }
  if (geom.type === 'MultiLineString') {
    return (geom.coordinates as number[][][])
      .map((line) => lineStringCoordsToPath(line, w, h))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function projectLatLng(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * MAP_W,
    y: ((90 - lat) / 180) * MAP_H,
  };
}

function buildLandPaths(topoData: TopoJSON.Topology): string[] {
  const geo = feature(topoData, topoData.objects.countries) as GeoJSON.FeatureCollection;
  const paths: string[] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const d = geometryToPath(g, MAP_W, MAP_H);
    if (d) paths.push(d);
  }
  return paths;
}

/** Deterministic “stars” for night-sky depth (stable across renders) */
function buildStarField(count: number): { x: number; y: number; r: number; o: number }[] {
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  let s = 12345;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rnd() * MAP_W,
      y: rnd() * MAP_H,
      r: 0.6 + rnd() * 1.4,
      o: 0.08 + rnd() * 0.22,
    });
  }
  return stars;
}

interface MapBuildResult {
  landPaths: string[];
  borderPath: string;
  coastPath: string;
}

function buildMapFromTopology(countriesTopo: TopoJSON.Topology, landTopo: TopoJSON.Topology): MapBuildResult {
  const landPaths = buildLandPaths(countriesTopo);
  const borderGeom = mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b);
  const borderPath = lineGeometryToPath(borderGeom as GeoJSON.Geometry | null, MAP_W, MAP_H);
  const coastGeom = mesh(landTopo, landTopo.objects.land);
  const coastPath = lineGeometryToPath(coastGeom as GeoJSON.Geometry | null, MAP_W, MAP_H);
  return { landPaths, borderPath, coastPath };
}

interface HomeWorldMapProps {
  listeners: MockListener[];
  selectedId: string | null;
  onSelect: (listener: MockListener | null) => void;
}

const HomeWorldMap = ({ listeners, selectedId, onSelect }: HomeWorldMapProps) => {
  const uid = useId().replace(/:/g, '');
  const [landPaths, setLandPaths] = useState<string[]>([]);
  const [borderPath, setBorderPath] = useState('');
  const [coastPath, setCoastPath] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const stars = useMemo(() => buildStarField(140), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(COUNTRIES_URL).then((r) => r.json()), fetch(LAND_URL).then((r) => r.json())])
      .then(([countriesTopo, landTopo]: [TopoJSON.Topology, TopoJSON.Topology]) => {
        if (cancelled) return;
        const run = () => {
          if (cancelled) return;
          try {
            const built = buildMapFromTopology(countriesTopo, landTopo);
            setLandPaths(built.landPaths);
            setBorderPath(built.borderPath);
            setCoastPath(built.coastPath);
          } catch {
            setLoadError(true);
          } finally {
            setMapReady(true);
          }
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(run, { timeout: 3000 });
        } else {
          setTimeout(run, 0);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dotPositions = useMemo(() => {
    return listeners.map((l) => {
      const { x, y } = projectLatLng(l.lat, l.lng);
      return { listener: l, leftPct: (x / MAP_W) * 100, topPct: (y / MAP_H) * 100 };
    });
  }, [listeners]);

  const graticuleLines = useMemo(() => {
    const lines: { y: number; lat: number }[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      lines.push({ y: ((90 - lat) / 180) * MAP_H, lat });
    }
    return lines;
  }, []);

  const verticalMeridians = useMemo(() => {
    const xs: number[] = [];
    for (let lng = -165; lng <= 165; lng += 30) {
      xs.push(((lng + 180) / 360) * MAP_W);
    }
    return xs;
  }, []);

  const svgVisible = loadError || (mapReady && landPaths.length > 0);

  return (
    <div
      className="fixed inset-0 z-0 min-h-[100dvh] w-full cursor-default bg-[#01060d] md:min-h-screen"
      onClick={() => onSelect(null)}
      onKeyDown={(e) => e.key === 'Escape' && onSelect(null)}
      role="presentation"
    >
      {/* Base — deep space blue */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 110% 85% at 50% 38%, hsl(212 50% 9%) 0%, hsl(218 55% 5%) 45%, hsl(225 60% 2.5%) 100%)',
        }}
      />

      {/* Slow ocean shimmer (CSS) */}
      <div className="home-map-ocean-shimmer pointer-events-none absolute inset-0 opacity-[0.26] mix-blend-soft-light" />

      <div className="absolute inset-0 flex h-full w-full items-stretch justify-stretch">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className={`h-full w-full transition-opacity duration-[900ms] ease-out ${svgVisible ? 'opacity-100' : 'opacity-0'}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            {/* Layered ocean — depth + faux “bathymetry” */}
            <radialGradient id={`${uid}-ocean-deep`} cx="50%" cy="46%" r="72%">
              <stop offset="0%" stopColor="hsl(208 58% 7%)" />
              <stop offset="55%" stopColor="hsl(215 55% 5.5%)" />
              <stop offset="100%" stopColor="hsl(222 60% 3.5%)" />
            </radialGradient>
            <linearGradient id={`${uid}-ocean-tint`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(195 48% 10% / 0.42)" />
              <stop offset="35%" stopColor="hsl(210 42% 7% / 0.12)" />
              <stop offset="100%" stopColor="hsl(225 52% 5% / 0.5)" />
            </linearGradient>
            <linearGradient id={`${uid}-polar`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="hsl(210 38% 12% / 0.28)" />
              <stop offset="12%" stopColor="transparent" />
              <stop offset="88%" stopColor="transparent" />
              <stop offset="100%" stopColor="hsl(218 42% 8% / 0.26)" />
            </linearGradient>

            {/* Land — slightly darker so hero text pops */}
            <linearGradient id={`${uid}-land`} x1="18%" y1="5%" x2="82%" y2="95%">
              <stop offset="0%" stopColor="hsl(188 28% 26%)" />
              <stop offset="35%" stopColor="hsl(198 30% 21%)" />
              <stop offset="70%" stopColor="hsl(205 32% 17%)" />
              <stop offset="100%" stopColor="hsl(212 34% 12%)" />
            </linearGradient>

            <filter id={`${uid}-coast-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={MAP_W} height={MAP_H} fill={`url(#${uid}-ocean-deep)`} />
          <rect width={MAP_W} height={MAP_H} fill={`url(#${uid}-ocean-tint)`} />
          <rect width={MAP_W} height={MAP_H} fill={`url(#${uid}-polar)`} />

          {/* Star field — mostly over ocean visually */}
          <g opacity={0.65}>
            {stars.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="hsl(200 35% 88%)" opacity={s.o * 0.85} />
            ))}
          </g>

          {/* Graticule */}
          <g opacity={0.09} stroke="hsl(198 38% 48%)" strokeWidth={0.7} vectorEffect="non-scaling-stroke">
            {graticuleLines.map(({ y, lat }, i) => (
              <line
                key={`h-${i}`}
                x1={0}
                y1={y}
                x2={MAP_W}
                y2={y}
                opacity={lat === 0 ? 0.55 : 1}
                strokeWidth={lat === 0 ? 1.1 : 0.7}
              />
            ))}
            {verticalMeridians.map((x, i) => (
              <line key={`v-${i}`} x1={x} y1={0} x2={x} y2={MAP_H} />
            ))}
          </g>

          {loadError && (
            <text
              x={MAP_W / 2}
              y={MAP_H / 2}
              textAnchor="middle"
              fill="hsl(200 25% 45%)"
              fontSize="24"
              fontFamily="system-ui, sans-serif"
            >
              Map unavailable
            </text>
          )}

          {/* Land masses first — then coastlines & borders on top so shore reads clearly */}
          <g opacity={0.95}>
            {landPaths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={`url(#${uid}-land)`}
                stroke="hsl(198 32% 36% / 0.32)"
                strokeWidth={0.48}
              />
            ))}
          </g>

          {/* Shore glow + crisp coast (from land mesh) */}
          {coastPath ? (
            <path
              d={coastPath}
              fill="none"
              stroke="hsl(185 55% 52% / 0.28)"
              strokeWidth={2.4}
              filter={`url(#${uid}-coast-glow)`}
              opacity={0.9}
            />
          ) : null}

          {/* International borders */}
          {borderPath ? (
            <path
              d={borderPath}
              fill="none"
              stroke="hsl(200 38% 52% / 0.45)"
              strokeWidth={0.55}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.78}
            />
          ) : null}

          {coastPath ? (
            <path
              d={coastPath}
              fill="none"
              stroke="hsl(188 48% 62% / 0.4)"
              strokeWidth={0.42}
              opacity={0.72}
            />
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-0">
          {dotPositions.map(({ listener, leftPct, topPct }) => {
            const active = selectedId === listener.id;
            return (
              <button
                key={listener.id}
                type="button"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className="home-listener-dot pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/95 bg-white shadow-[0_0_14px_rgba(255,255,255,0.95)] transition-transform hover:scale-[1.35] focus:outline-none focus:ring-2 focus:ring-cyan-400/70 md:h-3 md:w-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(active ? null : listener);
                }}
                aria-label={`Listener in ${listener.label}`}
                aria-pressed={active}
              />
            );
          })}
        </div>
      </div>

      {/* Blend into page */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'linear-gradient(180deg, hsl(220 55% 3% / 0.55) 0%, transparent 24%, transparent 76%, hsl(228 52% 2% / 0.72) 100%)',
            'linear-gradient(90deg, hsl(218 48% 4% / 0.55) 0%, transparent 12%, transparent 88%, hsl(218 48% 4% / 0.55) 100%)',
            'radial-gradient(ellipse 58% 52% at 50% 44%, transparent 0%, hsl(225 58% 3% / 0.48) 100%)',
          ].join(', '),
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '280px 280px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 88% 72% at 50% 50%, transparent 18%, hsl(232 42% 1.5% / 0.72) 100%)',
        }}
      />
    </div>
  );
};

export default HomeWorldMap;
