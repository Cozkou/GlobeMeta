import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PianoTilesGame from '@/components/PianoTilesGame';

const Home = () => {
  const navigate = useNavigate();
  const [tilesGameOver, setTilesGameOver] = useState(false);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#030810] text-foreground">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -left-[20%] top-[-30%] h-[70vmin] w-[70vmin] rounded-full opacity-[0.35] blur-[100px]"
          style={{
            background: 'radial-gradient(circle, hsl(195 65% 42% / 0.5) 0%, transparent 68%)',
          }}
        />
        <div
          className="absolute -right-[15%] bottom-[-25%] h-[65vmin] w-[65vmin] rounded-full opacity-[0.28] blur-[90px]"
          style={{
            background: 'radial-gradient(circle, hsl(265 45% 38% / 0.45) 0%, transparent 65%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 0%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      </div>

      <PianoTilesGame onGameOverChange={setTilesGameOver} />

      <div
        className={`pointer-events-none absolute inset-0 z-10 flex flex-col transition-opacity duration-500 ${
          tilesGameOver ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex flex-1 items-center justify-center px-5 pt-6">
          <div className="home-hero-float pointer-events-auto relative flex max-w-xl flex-col items-center gap-10 text-center">
            {/* Soft radial behind type — no box */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[min(90vw,28rem)] w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 55% 45% at 50% 50%, hsla(190, 45%, 48%, 0.14) 0%, transparent 70%)',
                filter: 'blur(2px)',
              }}
            />

            <div className="relative flex flex-col items-center gap-6">
              <h1
                className="home-meta-title retro-title text-[clamp(2.35rem,7vw,4.25rem)] normal-case tracking-tight"
                style={{ lineHeight: 1.05 }}
              >
                <span className="text-[hsl(210_25%_96%)]">Globe</span>
                <span className="home-title-shimmer bg-gradient-to-r from-[hsl(172_48%_52%)] via-[hsl(198_55%_72%)] to-[hsl(172_48%_52%)] bg-clip-text text-transparent">
                  Meta
                </span>
              </h1>

              <div className="h-px w-32 bg-gradient-to-r from-transparent via-[hsl(190_50%_48%/0.45)] to-transparent shadow-[0_0_20px_hsla(190,55%,50%,0.25)]" />
            </div>

            <button
              type="button"
              onClick={() => navigate('/globe')}
              className={`group relative flex items-center gap-3 overflow-hidden rounded-full border border-[hsl(185_42%_42%/0.5)] bg-[hsla(215,48%,7%,0.55)] px-12 py-4 text-[hsl(195_30%_96%)] shadow-[0_0_0_1px_hsla(190,45%,55%,0.06),0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_hsla(190,50%,70%,0.08)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(185_50%_52%/0.75)] hover:shadow-[0_0_40px_hsla(185,55%,45%,0.22)] active:translate-y-0 md:px-16 md:py-[1.1rem] ${
                tilesGameOver ? 'pointer-events-none' : 'pointer-events-auto'
              }`}
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', letterSpacing: '0.16em' }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    'linear-gradient(105deg, transparent 0%, hsla(190, 65%, 58%, 0.1) 42%, transparent 72%)',
                }}
              />
              <span className="relative">ENTER</span>
              <ArrowRight
                className="relative h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
                strokeWidth={2}
              />
            </button>
          </div>
        </div>

        <div className="pointer-events-none pb-7 text-center md:pb-9">
          <p
            className="inline-flex items-center gap-2.5 rounded-full border border-[hsl(195_30%_38%/0.2)] bg-[hsla(220,40%,6%,0.45)] px-5 py-2 text-[hsl(210_18%_52%)] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_hsla(195,40%,55%,0.06)] backdrop-blur-md"
            style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
          >
            <span className="text-[hsl(210_22%_38%)]">Keys</span>
            <span className="text-[hsl(185_35%_58%)]">S</span>
            <span className="text-[hsl(210_22%_32%)]">·</span>
            <span className="text-[hsl(185_35%_58%)]">D</span>
            <span className="text-[hsl(210_22%_32%)]">·</span>
            <span className="text-[hsl(185_35%_58%)]">J</span>
            <span className="text-[hsl(210_22%_32%)]">·</span>
            <span className="text-[hsl(185_35%_58%)]">K</span>
            <span className="text-[hsl(210_22%_38%)]">tap</span>
          </p>
        </div>
      </div>
    </main>
  );
};

export default Home;
