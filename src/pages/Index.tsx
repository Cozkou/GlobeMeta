import { useState, useCallback, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import TopBar from '@/components/TopBar';
import CountryPanel from '@/components/CountryPanel';
import GlobeScene, { type GlobeHandle } from '@/components/GlobeScene';
import { getCountryData, type CountryMusicData } from '@/data/countryData';

const GLOBE_BG = '#0a0a0f';

const ALL_COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Australia', 'Austria',
  'Bangladesh', 'Belgium', 'Bolivia', 'Brazil', 'Bulgaria', 'Myanmar', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Congo', 'Dem. Rep. Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Czech Republic', 'Denmark',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Ethiopia', 'Finland', 'France',
  'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'North Korea',
  'South Korea', 'Kuwait', 'Laos', 'Lebanon', 'Liberia', 'Libya', 'Lithuania', 'Malaysia',
  'Mali', 'Mexico', 'Mongolia', 'Morocco', 'Mozambique', 'Namibia', 'Nepal', 'Netherlands',
  'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Norway', 'Pakistan', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Slovakia',
  'Somalia', 'South Africa', 'South Sudan', 'Spain', 'Sudan', 'Suriname', 'Sweden',
  'Switzerland', 'Syria', 'Thailand', 'Tunisia', 'Turkey', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States of America', 'Uruguay',
  'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

const Index = () => {
  const [selectedCountry, setSelectedCountry] = useState<CountryMusicData | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const globeRef = useRef<GlobeHandle>(null);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return ALL_COUNTRIES.filter(c => c.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery]);

  const handleCountryClick = useCallback((name: string) => {
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

  const handleSearchSelect = useCallback((name: string) => {
    setSearchQuery('');
    setSearchOpen(false);
    globeRef.current?.flyTo(name);
    // Open panel after a short delay to let fly-to start
    setTimeout(() => {
      const data = getCountryData(name);
      setIsClosing(false);
      setSelectedCountry(data);
    }, 400);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: GLOBE_BG }}>
      <TopBar />
      <GlobeScene ref={globeRef} onCountryClick={handleCountryClick} isPanelOpen={!!selectedCountry} />

      {/* Search bar */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-full max-w-xs px-4">
        <div
          className="relative flex items-center rounded-xl transition-all duration-300"
          style={{
            background: searchOpen ? 'rgba(10,14,30,0.9)' : 'rgba(10,14,30,0.6)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(70,130,200,0.2)',
            boxShadow: searchOpen ? '0 4px 24px rgba(50,100,180,0.15)' : 'none',
          }}
        >
          <Search className="w-4 h-4 ml-3 text-blue-400/60 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            placeholder="Search a country…"
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            className="w-full bg-transparent text-sm text-blue-100/90 placeholder-blue-300/30 px-3 py-2.5 outline-none"
            style={{ fontFamily: 'DM Sans, system-ui' }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
              className="mr-2 p-1 rounded-md hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-blue-300/50" />
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && filtered.length > 0 && (
          <div
            className="mt-1 rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,12,28,0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(70,130,200,0.15)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {filtered.map(name => (
              <button
                key={name}
                onClick={() => handleSearchSelect(name)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                style={{ color: '#a0c4f0', fontFamily: 'DM Sans, system-ui' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400/40 shrink-0" />
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCountry && (
        <CountryPanel data={selectedCountry} onClose={handleClose} isClosing={isClosing} />
      )}
    </div>
  );
};

export default Index;
