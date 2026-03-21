const TopBar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
      <div className="w-[110px] flex items-center gap-2">
        <span className="text-lg">🌍</span>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <h1 className="retro-title text-sm md:text-base font-semibold text-foreground glow-text">
          GlobeMeta
        </h1>
      </div>

      <div className="retro-panel flex items-center gap-2 bg-card/70 px-3 py-1.5 backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="retro-title text-[10px] font-medium text-muted-foreground">Live</span>
      </div>
    </header>
  );
};

export default TopBar;
