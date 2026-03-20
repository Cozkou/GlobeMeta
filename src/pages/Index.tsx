import { useRef, useEffect, useState, useCallback } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import TopBar from '@/components/TopBar';
import CountryPanel from '@/components/CountryPanel';
import { getCountryData, type CountryMusicData } from '@/data/countryData';

const GLOBE_BG = '#0a0a0f';
const COUNTRY_COLOR = 'rgba(26, 26, 62, 0.9)';
const COUNTRY_HOVER = 'rgba(50, 50, 120, 0.9)';
const COUNTRY_SIDE = 'rgba(20, 20, 50, 0.6)';
const COUNTRY_STROKE = 'rgba(80, 80, 160, 0.3)';
const ATMOSPHERE_COLOR = 'rgba(60, 60, 140, 0.25)';

const Index = () => {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<any>({ features: [] });
  const [hoverD, setHoverD] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryMusicData | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Load GeoJSON
  useEffect(() => {
    fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then((res) => res.json())
      .then((worldData) => {
        import('topojson-client').then(({ feature }) => {
          const geoFeatures = feature(worldData, worldData.objects.countries);
          setCountries(geoFeatures);
        });
      });
  }, []);

  // Globe settings
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.4;
    globe.controls().enableDamping = true;
    globe.controls().dampingFactor = 0.1;
    globe.pointOfView({ lat: 20, lng: 0, altitude: 2.2 });
  }, []);

  // Stop rotation when panel open
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.controls().autoRotate = !selectedCountry;
  }, [selectedCountry]);

  // Resize
  useEffect(() => {
    const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePolygonClick = useCallback((polygon: any) => {
    const name = polygon?.properties?.name;
    if (!name) return;
    const data = getCountryData(name);
    setIsClosing(false);
    setSelectedCountry(data);
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedCountry(null);
      setIsClosing(false);
    }, 300);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: GLOBE_BG }}>
      <TopBar />

      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={GLOBE_BG}
        globeImageUrl=""
        showAtmosphere={true}
        atmosphereColor={ATMOSPHERE_COLOR}
        atmosphereAltitude={0.2}
        polygonsData={countries.features}
        polygonAltitude={0.01}
        polygonCapColor={(d: any) => (d === hoverD ? COUNTRY_HOVER : COUNTRY_COLOR)}
        polygonSideColor={() => COUNTRY_SIDE}
        polygonStrokeColor={() => COUNTRY_STROKE}
        polygonLabel={(d: any) => {
          const name = d?.properties?.name ?? '';
          return `<div style="background:rgba(10,10,20,0.85);backdrop-filter:blur(8px);padding:6px 12px;border-radius:8px;font-family:DM Sans,system-ui;font-size:13px;color:#e0e0e0;border:1px solid rgba(100,100,180,0.2)">${name}</div>`;
        }}
        onPolygonHover={setHoverD}
        onPolygonClick={handlePolygonClick}
        polygonsTransitionDuration={200}
      />

      {selectedCountry && (
        <CountryPanel
          data={selectedCountry}
          onClose={handleClose}
          isClosing={isClosing}
        />
      )}
    </div>
  );
};

export default Index;
