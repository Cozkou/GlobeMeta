import { X } from 'lucide-react';
import type { CountryMusicData } from '@/data/countryData';

interface CountryPanelProps {
  data: CountryMusicData;
  onClose: () => void;
  isClosing: boolean;
}

const CountryPanel = ({ data, onClose, isClosing }: CountryPanelProps) => {
  return (
    <div
      className={`fixed top-0 right-0 z-40 h-full w-full max-w-[400px] flex ${
        isClosing ? 'slide-out-right' : 'slide-in-right'
      }`}
    >
      {/* Close bar on the left edge */}
      <button
        onClick={onClose}
        className="h-full w-8 flex items-center justify-center shrink-0 bg-white/[0.03] hover:bg-white/[0.08] border-r border-white/[0.06] transition-colors active:scale-[0.97] group cursor-pointer"
        aria-label="Close panel"
      >
        <X size={14} className="text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </button>

      {/* Panel content */}
      <div className="flex-1 h-full panel-blur border-l border-border/30 flex flex-col overflow-hidden">

      <div className="flex flex-col gap-6 p-6 pt-16 overflow-y-auto flex-1">
        {/* Country header */}
        <div className="flex items-center gap-3">
          <span className="text-4xl">{data.flag}</span>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {data.name}
          </h2>
        </div>

        {/* Vibe badge */}
        <div>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: `${data.vibeColor}22`,
              color: data.vibeColor,
              border: `1px solid ${data.vibeColor}44`,
            }}
          >
            {data.vibe}
          </span>
        </div>

        {/* Track list */}
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Top Tracks
          </h3>
          {data.tracks.map((track, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors group"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                style={{ backgroundColor: track.dotColor }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {track.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {track.artist}
                </p>
              </div>
              <span className="text-xs text-muted-foreground/50 tabular-nums">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Mood bars */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mood
          </h3>
          <MoodBar label="Energy" value={data.mood.energy} color="var(--energy)" />
          <MoodBar label="Danceability" value={data.mood.danceability} color="var(--danceability)" />
          <MoodBar label="Valence" value={data.mood.valence} color="var(--valence)" />
        </div>
      </div>

      {/* Spotify button */}
      <div className="p-6 pt-0">
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors"
          style={{
            backgroundColor: 'hsla(var(--spotify-green) / 0.15)',
            color: 'hsl(var(--spotify-green))',
            border: '1px solid hsla(var(--spotify-green) / 0.2)',
            opacity: 0.5,
            cursor: 'not-allowed',
          }}
        >
          Open in Spotify
        </button>
      </div>
      </div>
    </div>
  );
};

function MoodBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
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
