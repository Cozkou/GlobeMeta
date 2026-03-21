import { useState, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import CountryPanel from '@/components/CountryPanel';
import type { LayoutContext } from '@/components/AppLayout';

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
  const { globeRef, selectedCountry, setSelectedCountry } = useOutletContext<LayoutContext>();
  const [isClosing, setIsClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return ALL_COUNTRIES.filter(c => c.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedCountry(null);
      setIsClosing(false);
    }, 300);
  }, [setSelectedCountry]);

  const handleSearchSelect = useCallback((name: string) => {
    setSearchQuery('');
    setSearchOpen(false);
    globeRef.current?.flyTo(name);
    setTimeout(() => {
      setIsClosing(false);
      setSelectedCountry({ name, code: null });
    }, 400);
  }, [globeRef, setSelectedCountry]);

  return (
    <div className="relative w-full h-full pointer-events-none">
      {/* Page header */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 text-center">
        <h1
          className="retro-title text-lg tracking-widest"
          style={{ color: 'rgba(160,196,240,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
        >
          Globe Mixer
        </h1>
        <p
          className="retro-body text-[11px] mt-1 max-w-[340px]"
          style={{ color: 'rgba(160,196,240,0.45)' }}
        >
          Spin the globe, click any country, and explore trending music on YouTube.
        </p>
      </div>

      <div className="absolute top-4 right-4 z-40 w-[min(88vw,320px)] pointer-events-auto">
        {!searchOpen ? (
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="retro-panel ml-auto h-10 w-10 flex items-center justify-center bg-[rgba(9,12,28,0.82)] hover:bg-[rgba(12,16,34,0.95)] transition-colors"
          >
            <Search className="w-4 h-4 text-blue-300/80" />
          </button>
        ) : (
          <>
            <div
              className="retro-panel relative flex items-center transition-all duration-300"
              style={{
                background: 'rgba(12,16,34,0.95)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 0 0 1px rgba(0, 255, 245, 0.25), 0 0 18px rgba(255, 0, 153, 0.25)',
              }}
            >
              <Search className="w-4 h-4 ml-3 text-blue-400/60 shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                placeholder="Search a country..."
                onChange={e => setSearchQuery(e.target.value)}
                className="retro-body w-full bg-transparent text-blue-100/90 placeholder-blue-300/30 px-3 py-2.5 outline-none"
              />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                aria-label="Close search"
                className="mr-2 p-1 rounded-md hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-blue-300/60" />
              </button>
            </div>

            {filtered.length > 0 && (
              <div
                className="retro-panel mt-1 overflow-hidden"
                style={{
                  background: 'rgba(8,12,28,0.97)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 0 0 1px rgba(0, 255, 245, 0.18), 0 10px 26px rgba(0,0,0,0.45)',
                }}
              >
                {filtered.map(name => (
                  <button
                    key={name}
                    onClick={() => handleSearchSelect(name)}
                    className="retro-body w-full text-left px-4 py-2.5 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                    style={{ color: '#a0c4f0' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/40 shrink-0" />
                    {name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedCountry && (
        <div className="pointer-events-auto">
          <CountryPanel
            countryName={selectedCountry.name}
            countryCodeHint={selectedCountry.code}
            onClose={handleClose}
            isClosing={isClosing}
          />
        </div>
      )}
    </div>
  );
};

export default Index;
