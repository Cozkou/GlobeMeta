import { useEffect, useRef, useCallback, useState } from 'react';

export interface PianoTilesGameProps {
  /** When the run ends, parent can hide overlays so canvas game-over UI is visible */
  onGameOverChange?: (gameOver: boolean) => void;
}

const COLS = 4;
const TILE_GAP = 3;
const SPAWN_INTERVAL_BASE = 750;
const SPAWN_INTERVAL_MIN = 280;
const SPEED_BASE = 3.2;
const SPEED_FACTOR = 0.055;
const MAX_LIVES = 3;
const KEYS = ['s', 'd', 'j', 'k'] as const;

/** Where the judgment line sits as a fraction of viewport height (0 = top, 1 = bottom) */
const LINE_Y_FRAC = 0.78;

/** Distance thresholds from tile center to the line (in px) for grading */
const PERFECT_RANGE = 22;
const GOOD_RANGE = 55;

const NOTE_FREQS: Record<number, number> = {
  0: 261.63, // C4
  1: 329.63, // E4
  2: 440.0,  // A4
  3: 523.25, // C5
};

const COL_COLORS = [
  'hsl(280 60% 52%)',
  'hsl(330 65% 50%)',
  'hsl(200 75% 52%)',
  'hsl(165 65% 45%)',
];

const HIT_COLORS = [
  'hsl(280 75% 68%)',
  'hsl(330 80% 65%)',
  'hsl(200 85% 68%)',
  'hsl(165 80% 62%)',
];

const COL_GLOWS = [
  'hsla(280, 70%, 55%, 0.5)',
  'hsla(330, 75%, 55%, 0.5)',
  'hsla(200, 80%, 55%, 0.5)',
  'hsla(165, 75%, 50%, 0.5)',
];

interface Tile {
  id: number;
  col: number;
  y: number;
  hit: boolean;
  hitAge: number;
  grade: '' | 'PERFECT' | 'GOOD' | 'MISS';
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

function playNote(ctx: AudioContext, freq: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.12, ctx.currentTime);

  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(ctx.destination);
  gain2.connect(ctx.destination);
  osc.start();
  osc2.start();
  osc.stop(ctx.currentTime + 1.1);
  osc2.stop(ctx.currentTime + 0.7);
}

interface GameState {
  tiles: Tile[];
  floats: FloatingText[];
  score: number;
  combo: number;
  lives: number;
  nextId: number;
  spawnTimer: number;
  speed: number;
  gameOver: boolean;
}

export default function PianoTilesGame({ onGameOverChange }: PianoTilesGameProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    tiles: [],
    floats: [],
    score: 0,
    combo: 0,
    lives: MAX_LIVES,
    nextId: 0,
    spawnTimer: 0,
    speed: SPEED_BASE,
    gameOver: false,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    onGameOverChange?.(gameOver);
  }, [gameOver, onGameOverChange]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const hitColumn = useCallback((col: number) => {
    const gs = stateRef.current;
    if (gs.gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const h = canvas.clientHeight;
    const colW = canvas.clientWidth / COLS;
    const tileH = Math.min(colW * 1.8, h * 0.16);
    const lineY = h * LINE_Y_FRAC;

    // Find lowest unhit tile in column
    let best: Tile | null = null;
    for (const t of gs.tiles) {
      if (t.col === col && !t.hit) {
        if (!best || t.y > best.y) best = t;
      }
    }
    if (!best) return;

    const tileCenter = best.y + tileH / 2;
    const dist = Math.abs(tileCenter - lineY);

    let grade: 'PERFECT' | 'GOOD' | 'MISS';
    let color: string;
    let pts: number;

    if (dist <= PERFECT_RANGE) {
      grade = 'PERFECT';
      color = '#ffee58';
      pts = 2;
    } else if (dist <= GOOD_RANGE) {
      grade = 'GOOD';
      color = '#66ffcc';
      pts = 1;
    } else {
      grade = 'MISS';
      color = '#ff6666';
      pts = 0;
      gs.combo = 0;
    }

    best.hit = true;
    best.hitAge = 0;
    best.grade = grade;

    if (pts > 0) {
      gs.combo++;
      gs.score += pts + (gs.combo > 5 ? 1 : 0);
      gs.speed = SPEED_BASE + gs.score * SPEED_FACTOR;
      setScore(gs.score);
      try { playNote(getAudioCtx(), NOTE_FREQS[col]); } catch { /* noop */ }
    } else {
      gs.lives--;
      setLives(gs.lives);
      if (gs.lives <= 0) {
        gs.gameOver = true;
        setGameOver(true);
      }
    }

    gs.floats.push({
      text: grade + (gs.combo > 3 && pts > 0 ? ` x${gs.combo}` : ''),
      x: col * colW + colW / 2,
      y: lineY - 20,
      age: 0,
      color,
    });
  }, [getAudioCtx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const idx = KEYS.indexOf(e.key.toLowerCase() as typeof KEYS[number]);
      if (idx !== -1) {
        e.preventDefault();
        hitColumn(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hitColumn]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const colW = rect.width / COLS;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(x / colW)));
    hitColumn(col);
  }, [hitColumn]);

  const restart = useCallback(() => {
    const gs = stateRef.current;
    gs.tiles = [];
    gs.floats = [];
    gs.score = 0;
    gs.combo = 0;
    gs.lives = MAX_LIVES;
    gs.nextId = 0;
    gs.spawnTimer = 0;
    gs.speed = SPEED_BASE;
    gs.gameOver = false;
    setScore(0);
    setLives(MAX_LIVES);
    setGameOver(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastTime = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = lastTime ? Math.min(now - lastTime, 50) : 16;
      lastTime = now;

      const gs = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const colW = w / COLS;
      const tileH = Math.min(colW * 1.8, h * 0.16);
      const lineY = h * LINE_Y_FRAC;

      ctx.clearRect(0, 0, w, h);

      // Column dividers — subtle
      ctx.strokeStyle = 'hsla(240, 20%, 28%, 0.25)';
      ctx.lineWidth = 1;
      for (let i = 1; i < COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * colW, 0);
        ctx.lineTo(i * colW, h);
        ctx.stroke();
      }

      // Judgment line
      ctx.save();
      ctx.strokeStyle = 'hsla(0, 0%, 100%, 0.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(w, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Key labels near bottom
      ctx.font = "bold 13px 'Press Start 2P', monospace";
      ctx.textAlign = 'center';
      for (let i = 0; i < COLS; i++) {
        ctx.fillStyle = 'hsla(0, 0%, 100%, 0.12)';
        ctx.fillText(KEYS[i].toUpperCase(), i * colW + colW / 2, lineY + 28);
      }

      if (!gs.gameOver) {
        // Spawn
        gs.spawnTimer -= dt;
        if (gs.spawnTimer <= 0) {
          const interval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - gs.score * 6);
          gs.spawnTimer = interval;
          const col = Math.floor(Math.random() * COLS);
          gs.tiles.push({ id: gs.nextId++, col, y: -tileH, hit: false, hitAge: 0, grade: '' });
        }

        // Tiles
        const alive: Tile[] = [];
        for (const t of gs.tiles) {
          if (t.hit) {
            t.hitAge += dt;
            if (t.hitAge > 280) continue;
            const alpha = 1 - t.hitAge / 280;
            const x = t.col * colW + TILE_GAP;
            const tw = colW - TILE_GAP * 2;
            const r = 6;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = COL_GLOWS[t.col];
            ctx.shadowBlur = 18;
            ctx.fillStyle = HIT_COLORS[t.col];
            ctx.beginPath();
            ctx.roundRect(x, t.y, tw, tileH, r);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();

            alive.push(t);
          } else {
            t.y += gs.speed * (dt / 16);
            if (t.y > h + tileH) {
              // Fell off screen — lose a life
              gs.lives--;
              gs.combo = 0;
              setLives(gs.lives);
              gs.floats.push({ text: 'MISS', x: t.col * colW + colW / 2, y: lineY - 20, age: 0, color: '#ff6666' });
              if (gs.lives <= 0) {
                gs.gameOver = true;
                setGameOver(true);
              }
              continue;
            }

            const x = t.col * colW + TILE_GAP;
            const tw = colW - TILE_GAP * 2;
            const r = 6;

            ctx.save();
            ctx.shadowColor = COL_GLOWS[t.col];
            ctx.shadowBlur = 10;
            ctx.fillStyle = COL_COLORS[t.col];
            ctx.beginPath();
            ctx.roundRect(x, t.y, tw, tileH, r);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();

            alive.push(t);
          }
        }
        gs.tiles = alive;
      }

      // Floating grade text
      const aliveFloats: FloatingText[] = [];
      for (const f of gs.floats) {
        f.age += dt;
        if (f.age > 700) continue;
        const alpha = 1 - f.age / 700;
        const yOff = f.age * 0.04;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "bold 14px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 12;
        ctx.fillText(f.text, f.x, f.y - yOff);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
        aliveFloats.push(f);
      }
      gs.floats = aliveFloats;

      // Game over — draw within canvas, not as DOM overlay
      if (gs.gameOver) {
        ctx.save();
        ctx.fillStyle = 'hsla(230, 40%, 5%, 0.75)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.fillStyle = 'hsla(0, 0%, 80%, 0.9)';
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillText('GAME OVER', w / 2, h / 2 - 30);

        ctx.fillStyle = '#ffee58';
        ctx.font = "22px 'Press Start 2P', monospace";
        ctx.fillText(String(gs.score), w / 2, h / 2 + 10);

        ctx.fillStyle = 'hsla(0, 0%, 55%, 0.8)';
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillText('CLICK TO RETRY', w / 2, h / 2 + 45);
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (stateRef.current.gameOver) {
      restart();
      return;
    }
    handleClick(e);
  }, [handleClick, restart]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 h-full w-full cursor-pointer"
      />
      {/* Score + lives drawn purely in DOM — top corners, never blocks anything */}
      <div className="pointer-events-none absolute left-4 top-4 z-[5] md:left-6 md:top-6">
        <span
          className="tabular-nums text-white/60"
          style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '12px' }}
        >
          {score}
        </span>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-[5] flex items-center gap-1.5 md:right-6 md:top-6">
        {Array.from({ length: MAX_LIVES }).map((_, i) => (
          <span
            key={i}
            className="text-base transition-opacity"
            style={{ opacity: i < lives ? 0.8 : 0.15, color: i < lives ? '#ff6b9d' : '#555' }}
          >
            ♥
          </span>
        ))}
      </div>
    </div>
  );
}
