import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <section className="relative z-10 mx-auto flex h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <h1 className="retro-title glow-text text-4xl md:text-6xl">Pulse Earth Vibes</h1>
        <p className="retro-body mt-8 max-w-3xl text-muted-foreground">
          A live world map of what people are listening to. Jump country to country, hear previews, and generate playlists from local trends.
        </p>
        <button
          onClick={() => navigate('/globe')}
          className="retro-title retro-panel mt-12 rounded-sm px-10 py-5 text-xs text-foreground transition-transform hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(90deg, rgba(0,255,245,0.15), rgba(255,0,153,0.15))',
          }}
        >
          Begin
        </button>
      </section>
    </main>
  );
};

export default Home;
