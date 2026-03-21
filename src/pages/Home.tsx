import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PianoTilesGame from '@/components/PianoTilesGame';

const Home = () => {
  const navigate = useNavigate();
  const [tilesGameOver, setTilesGameOver] = useState(false);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#01060c] text-foreground">
      <PianoTilesGame onGameOverChange={setTilesGameOver} />

      <div
        className={`pointer-events-none absolute inset-0 z-10 flex flex-col transition-opacity duration-300 ${
          tilesGameOver ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-10 px-6">
            <div className="flex flex-col items-center gap-4">
              <h1
                className="home-meta-title retro-title text-[clamp(2rem,5vw,4rem)] normal-case tracking-tight"
                style={{ lineHeight: 1.2 }}
              >
                <span className="text-[hsl(210_20%_95%)]">Globe</span>
                <span className="home-title-shimmer bg-gradient-to-r from-[hsl(175_42%_55%)] via-[hsl(195_48%_68%)] to-[hsl(175_42%_55%)] bg-clip-text text-transparent">
                  Meta
                </span>
              </h1>

              <p className="retro-body max-w-sm text-center text-[13px] text-[hsl(210_18%_62%)] md:max-w-md">
                Explore global music through a 3D globe or a mood-driven crystal ball session.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/globe')}
              className={`group flex items-center gap-3 border border-[hsl(190_30%_35%)] bg-[hsla(220,50%,5%,0.7)] px-10 py-4 text-[hsl(210_18%_92%)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[hsl(190_40%_48%)] hover:shadow-[0_0_28px_hsla(190,50%,40%,0.2)] active:translate-y-0 md:px-12 md:py-5 ${
                tilesGameOver ? 'pointer-events-none' : 'pointer-events-auto'
              }`}
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '11px', letterSpacing: '0.12em' }}
            >
              ENTER
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="pb-5 text-center md:pb-7">
          <p
            className="text-[hsl(210_15%_38%)]"
            style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}
          >
            click tiles or press S D J K
          </p>
        </div>
      </div>
    </main>
  );
};

export default Home;
