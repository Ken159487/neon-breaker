// Neon Breaker: every tuning number and colour in one place. Sizes are in
// reference pixels for a 640px-tall field and scale with the window height,
// so the game feels the same on any desktop window.

/** Fixed simulation step, in seconds: 60 updates a second, whatever the display rate. */
export const STEP = 1 / 60;

/** Reference field height that all speeds and sizes scale from. */
export const REF_H = 640;

export const LIVES_START = 3;
export const LIVES_MAX = 5;
export const LEVEL_COUNT = 5;

export const PADDLE = {
  width: 112,
  height: 14,
  speed: 660,
  wideMultiplier: 1.5,
  wideSeconds: 12,
  corner: 7,
};

export const BALL = {
  radius: 7,
  baseSpeed: 430,
  speedPerLevel: 0.05,
  maxSpeed: 680,
  slowMultiplier: 0.7,
  slowSeconds: 10,
  maxBalls: 3,
  serveSeconds: 2.0,
};

export const BRICK = {
  cols: 10,
  gap: 6,
  height: 26,
  top: 92,
  corner: 5,
};

/** Points for destroying a brick of a given hit-point value, before the streak bonus. */
export const BRICK_POINTS = { 1: 50, 2: 120, 3: 200 };
export const STREAK_BONUS = 10;
export const STREAK_CAP = 10;

export const POWERUP = {
  size: 26,
  fallSpeed: 175,
  dropChance: 0.2,
};

export const SCORE = {
  levelClearBase: 250,
  lifeBonus: 50,
};

export const PALETTE = {
  backgroundTop: '#0b0e24',
  backgroundBottom: '#070812',
  star: '#cdd6ff',
  grid: '#141a38',
  text: '#eef1ff',
  muted: '#8f96b8',
  panel: 'rgba(10, 14, 36, 0.82)',
  panelEdge: '#2a3565',
  paddle: '#39d0ff',
  paddleEdge: '#b8f1ff',
  ball: '#ffffff',
  ballGlow: '#7fe7ff',
  brickRows: ['#ff5d8f', '#ff9f43', '#ffe14d', '#4ade80', '#38bdf8', '#a78bfa'],
  tough: '#e8ecff',
  unbreakable: '#3a4266',
  powerWide: '#39d0ff',
  powerMulti: '#ff5d8f',
  powerSlow: '#4ade80',
  powerLife: '#ffe14d',
  particle: '#ffffff',
  danger: '#ff5d5d',
  gold: '#ffe14d',
};

/** System fonts only: the game loads no font file and makes no network request. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-breaker.best';
export const MUTE_KEY = 'neon-breaker.muted';
