const TopBar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎵</span>
        <span className="text-xl font-semibold tracking-tight text-foreground glow-text">
          Pulse
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-3 py-1.5 backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">Live</span>
      </div>
    </header>
  );
};

export default TopBar;
