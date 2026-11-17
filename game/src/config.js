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

/** SMASH: breaking bricks charges a meter; pressing X spends a full meter
 *  to turn the ball into a piercing smash ball. A smash ball destroys every
 *  brick it touches instead of bouncing off it — including steel, which no
 *  normal hit can break — and each destroyed brick spends one smash hit. */
export const SMASH = {
  maxCharge: 100,
  chargePerBreak: 12,
  chargePerCrack: 4,
  hits: 4,
  steelPoints: 100,
};

/** HUNT: with this many breakable bricks left, the endgame assist kicks in:
 *  the ball bends gently toward the lowest remaining brick on its upward
 *  flight, routing around any steel in the way through the nearest gap,
 *  and the survivors pulse so the player can see what is left. Lowest-
 *  first matters: the lowest brick is always reachable from below, while
 *  the nearest brick can sit shielded behind steel. The bend is a nudge,
 *  not a lock: it never steers a falling ball, so saving the ball still
 *  depends on the paddle. Two exceptions keep the last brick reachable
 *  where steel is in the way: once the ball is above a steel row
 *  shielding the target the bend becomes a critically damped spring
 *  toward the brick, and while it is still below a steel row it must
 *  cross, the spring converges it onto the gap instead (a fixed bend
 *  cannot both brake the ball's sideways drift and settle it over its
 *  aim point in the short time it spends up there). An armed smash ball
 *  bends straight at the target through the steel, which it pierces. */
export const HUNT = {
  remaining: 5,
  steer: 120,
  /** Once the ball has threaded a steel gap and is above the steel row
   *  shielding the target, the bend is a critically damped spring toward
   *  the target (omega in rad/s), not a fixed acceleration: a fixed bend
   *  cannot both brake the ball's sideways drift and settle it over the
   *  brick in the ~0.2 s it spends up there — too weak and it never turns,
   *  too strong and it overshoots past the brick. The spring damps the
   *  sideways velocity as it closes in, so it lands on the brick from
   *  either side. Below the steel the gentle bend stays, so the ordinary
   *  endgame does not start overshooting. */
  aboveSteelOmega: 12,
  /** When a steel row lies between the ball and the target, the ball must
   *  thread a gap to get there, and the gentle bend is too weak to line
   *  it up in time — a fixed stronger bend overshoots and starts new
   *  limit cycles, so the spring (same shape as above the steel, gentler)
   *  converges on the gap, or on the target when its column is clear or
   *  the ball smashes through. Only levels with steel ever trigger it. */
  crossSteelOmega: 8,
  /** While a spring is steering, the ball may never go more horizontal
   *  than this fraction of its speed: a near-horizontal ball barely
   *  climbs, so the spring loses its grip on the vertical motion and the
   *  ball drifts past the brick instead of settling over it. Capping the
   *  sideways speed keeps the ball rising and falling on a normal arc
   *  while it homes in. */
  springMaxVx: 0.85,
  /** A smash ball homes on its target harder than a plain ball: the meter
   *  is a spent resource, so an armed ball that threads a corridor and
   *  misses by a brick edge is a wasted smash. */
  steerArmed: 300,
  /** On a steel level, once the ball is on final approach to the target
   *  (within closeDistance brick widths) and the smash has been spent at
   *  least once this game, the gentle nudge cannot correct the paddle
   *  bounce in time — the ball overshoots the brick or stalls under a
   *  steel shadow. A gentle spring takes over for the last stretch only.
   *  Levels without steel never trigger it, so their endgame is
   *  untouched, and it stays out of the way until the ball is close; a
   *  game that never spends the meter never needs it, since the smash is
   *  what clears the channels this recovers from. */
  closeOmega: 5,
  closeDistance: 2.5,
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
