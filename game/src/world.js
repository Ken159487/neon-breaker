// The game world: paddle, balls, bricks, power-ups and particles. It owns no
// DOM and no audio; it steps in fixed 1/60 s slices and reports what happened
// as event flags, so the main loop can play sounds and change screens.

import {
  BALL,
  BRICK,
  BRICK_POINTS,
  HUNT,
  LIVES_MAX,
  LIVES_START,
  LEVEL_COUNT,
  PADDLE,
  POWERUP,
  REF_H,
  SCORE,
  SMASH,
  STREAK_BONUS,
  STREAK_CAP,
} from './config.js';
import { LEVELS } from './levels.js';
import { spawnBurst, spawnText, stepEffects } from './particles.js';
import { pickWeighted } from './random.js';

export const EVENT_BRICK = 1;
export const EVENT_CRACK = 2;
export const EVENT_PADDLE = 4;
export const EVENT_WALL = 8;
export const EVENT_POWER = 16;
export const EVENT_LOSE = 32;
export const EVENT_CLEAR = 64;
export const EVENT_WIN = 128;
export const EVENT_OVER = 256;
export const EVENT_LAUNCH = 512;
export const EVENT_SMASH = 1024;
export const EVENT_CHARGE_FULL = 2048;

const POWER_KINDS = ['W', 'M', 'S', 'L'];
const POWER_WEIGHTS = [30, 30, 25, 15];

/** Create the world. Geometry follows resize(); call reset() before stepping. */
export function createWorld(random) {
  const state = {
    width: 960,
    height: 640,
    level: 1,
    score: 0,
    lives: LIVES_START,
    streak: 0,
    time: 0,
    paddle: { x: 0, y: 0, w: 0, h: 0, wideTimer: 0 },
    balls: [],
    bricks: [],
    powerups: [],
    particles: [],
    texts: [],
    shake: 0,
    slowTimer: 0,
    serving: true,
    serveTimer: 0,
    breakableLeft: 0,
    breakableInitial: 1,
    cleared: false,
    over: false,
    won: false,
    // SMASH meter: 0..SMASH.maxCharge; smashHits is how many bricks the
    // current smash ball still destroys on contact (0 = not smashing).
    // smashUsed records that the meter has been spent at least once this
    // game: the smash clears channels the ball can stall in, so the
    // close-range HUNT spring (which recovers from those) only runs
    // once the smash has actually been used.
    charge: 0,
    smashHits: 0,
    smashUsed: false,
    smashTaught: false,
  };

  function scale() {
    return state.height / REF_H;
  }

  function brickGeometry() {
    const s = scale();
    const marginX = 24 * s;
    const gap = BRICK.gap * s;
    const width = (state.width - marginX * 2 - gap * (BRICK.cols - 1)) / BRICK.cols;
    return {
      width,
      height: BRICK.height * s,
      top: BRICK.top * s,
      marginX,
      gap,
    };
  }

  function paddleWidth() {
    const base = PADDLE.width * scale();
    return state.paddle.wideTimer > 0 ? base * PADDLE.wideMultiplier : base;
  }

  function ballSpeed() {
    const level = LEVELS[state.level - 1];
    let speed = BALL.baseSpeed * level.ballSpeed * scale();
    // The ball quickens as the level empties: the last bricks are the
    // hardest to reach, so the endgame stays snappy instead of dragging.
    const initial = state.breakableInitial || 1;
    const clearedFraction = 1 - state.breakableLeft / initial;
    speed *= 1 + 0.35 * clearedFraction;
    if (state.slowTimer > 0) speed *= BALL.slowMultiplier;
    return Math.min(speed, BALL.maxSpeed * scale());
  }

  /** Add charge to the SMASH meter; crossing to full fires EVENT_CHARGE_FULL once. */
  function addCharge(amount) {
    if (state.charge >= SMASH.maxCharge) return 0;
    state.charge = Math.min(SMASH.maxCharge, state.charge + amount);
    return state.charge >= SMASH.maxCharge ? EVENT_CHARGE_FULL : 0;
  }

  /** Spend a full meter to arm the smash ball. Only in active play, and
   *  only when not already smashing; the ball must be live to aim it. */
  function trySmash() {
    if (state.serving || state.smashHits > 0 || state.charge < SMASH.maxCharge) return 0;
    state.charge = 0;
    state.smashHits = SMASH.hits;
    state.smashUsed = true;
    state.shake = Math.max(state.shake, 6);
    let events = EVENT_SMASH;
    if (!state.smashTaught) {
      state.smashTaught = true;
      spawnText(state.texts, state.width / 2, state.height / 2, 'SMASH! PIERCES BRICKS AND STEEL', '#ffe14d');
    }
    spawnBurst(state.particles, state.paddle.x + state.paddle.w / 2, state.paddle.y, '#ffe14d', 18, 320, 0.7);
    return events;
  }

  /** The endgame assist is live while a few breakable bricks remain. */
  function huntActive() {
    return !state.cleared && state.breakableLeft > 0 && state.breakableLeft <= HUNT.remaining;
  }

  /** The lowest surviving breakable brick — the HUNT target. Largest row
   *  first, then nearest to the ball: the lowest brick is always reachable
   *  from below, which a merely-nearest brick is not. */
  function huntTarget(ball) {
    let target = null;
    let bestRow = -1;
    let bestDx = Infinity;
    for (const brick of state.bricks) {
      if (!brick.alive || brick.unbreakable) continue;
      const dx = Math.abs(brick.x + brick.w / 2 - ball.x);
      if (brick.row > bestRow || (brick.row === bestRow && dx < bestDx)) {
        bestRow = brick.row;
        bestDx = dx;
        target = brick;
      }
    }
    return target;
  }

  /** Where the ball should bend while hunting, and how: the lowest
   *  survivor's centre — unless a steel brick sits between the ball and
   *  it, in which case the nearest gap in that steel row. The bend is a
   *  gentle nudge, except where the ball must cross steel: once it has
   *  threaded a gap and risen above the steel, the bend becomes a
   *  critically damped spring onto the brick, and while it is still
   *  below a steel row it must cross, the spring converges it onto the
   *  gap. On a steel level the spring also takes over on final approach
   *  to the target, gently — the nudge cannot correct the paddle bounce
   *  in time under a steel shadow. A spring brakes the ball's sideways
   *  drift and settles it over its aim point, which a fixed stronger bend
   *  cannot do. An armed smash ball ignores the gap entirely and bends
   *  straight at the target: it pierces steel, so the gap is irrelevant,
   *  and it homes harder so a spent meter does not thread a corridor and
   *  miss. Levels without steel keep the gentle nudge, so their endgame
   *  is untouched. Returns null when nothing is left to hunt. */
  function huntSteer(ball) {
    const target = huntTarget(ball);
    if (!target) return null;
    const targetX = target.x + target.w / 2;
    // Steel in the target's column that shields it: the nearest live steel
    // below the target (`shield`), and the lowest such steel the ball has
    // still to pass (`blocking`). They differ once the ball has threaded a
    // gap and risen above the steel: then no shielding steel is below the
    // ball any more, and the bend switches to the brick itself.
    let shield = null;
    let blocking = null;
    for (const brick of state.bricks) {
      if (!brick.alive || !brick.unbreakable || brick.col !== target.col) continue;
      if (brick.y < target.y + target.h) continue;
      if (!shield || brick.y < shield.y) shield = brick;
      if (brick.y < ball.y && (!blocking || brick.y > blocking.y)) blocking = brick;
    }
    if (shield !== null && blocking === null) return { x: targetX, omega: HUNT.aboveSteelOmega };
    // An armed ball bends straight at the target through the steel.
    if (state.smashHits > 0) return { x: targetX, steer: HUNT.steerArmed };
    // A steel row between the ball and the target means the ball must
    // thread a gap to get there.
    let steelBetween = false;
    for (const brick of state.bricks) {
      if (!brick.alive || !brick.unbreakable) continue;
      if (brick.y > target.y && brick.y < ball.y) steelBetween = true;
    }
    if (steelBetween) {
      if (!blocking) return { x: targetX, omega: HUNT.crossSteelOmega };
      let gapCol = null;
      let bestDistance = Infinity;
      for (let col = 0; col < BRICK.cols; col += 1) {
        let steelHere = false;
        for (const brick of state.bricks) {
          if (brick.alive && brick.unbreakable && brick.row === blocking.row && brick.col === col) {
            steelHere = true;
            break;
          }
        }
        if (steelHere) continue;
        const distance = Math.abs(col - target.col);
        if (distance < bestDistance) {
          bestDistance = distance;
          gapCol = col;
        }
      }
      if (gapCol === null) return { x: targetX, omega: HUNT.crossSteelOmega };
      const geometry = brickGeometry();
      return {
        x: geometry.marginX + gapCol * (geometry.width + geometry.gap) + geometry.width / 2,
        omega: HUNT.crossSteelOmega,
      };
    }
    // Final approach on a steel level, once the smash has been used this
    // game: the ball is close to the target and below it, and live steel
    // is still standing, so the gentle nudge cannot correct the paddle
    // bounce in time — the ball overshoots the brick or stalls under a
    // steel shadow. A gentle spring takes over for the last stretch only.
    // Levels without steel never reach this, and a game that never spends
    // the meter never needs it (the smash is what clears the channels
    // this recovers from).
    if (state.smashUsed && ball.y > target.y) {
      const geometry = brickGeometry();
      const close = HUNT.closeDistance * (geometry.width + geometry.gap);
      if (Math.abs(ball.x - targetX) <= close) {
        for (const brick of state.bricks) {
          if (brick.alive && brick.unbreakable) return { x: targetX, omega: HUNT.closeOmega };
        }
      }
    }
    return { x: targetX, steer: HUNT.steer };
  }

  function buildBricks(preserve) {
    const level = LEVELS[state.level - 1];
    const geometry = brickGeometry();
    const previous = new Map();
    if (preserve) {
      for (const brick of state.bricks) {
        previous.set(`${brick.row},${brick.col}`, brick);
      }
    }
    state.bricks = [];
    state.breakableLeft = 0;
    level.rows.forEach((row, rowIndex) => {
      for (let col = 0; col < BRICK.cols; col += 1) {
        const mark = row[col] || '.';
        if (mark === '.') continue;
        const unbreakable = mark === 'X';
        const hp = unbreakable ? Infinity : Number.parseInt(mark, 10);
        const old = previous.get(`${rowIndex},${col}`);
        const alive = old ? old.alive : true;
        const remainingHp = old && !unbreakable ? old.hp : hp;
        state.bricks.push({
          col,
          row: rowIndex,
          x: geometry.marginX + col * (geometry.width + geometry.gap),
          y: geometry.top + rowIndex * (geometry.height + geometry.gap),
          w: geometry.width,
          h: geometry.height,
          hp: remainingHp,
          maxHp: hp,
          unbreakable,
          alive,
        });
        if (!unbreakable && alive) state.breakableLeft += 1;
      }
    });
    if (!preserve) state.breakableInitial = state.breakableLeft;
  }

  function placePaddle() {
    state.paddle.w = paddleWidth();
    state.paddle.h = PADDLE.height * scale();
    state.paddle.y = state.height - 52 * scale();
    state.paddle.x = Math.min(
      Math.max(state.paddle.x, 0),
      state.width - state.paddle.w,
    );
  }

  function serveBall() {
    state.balls = [
      {
        x: state.paddle.x + state.paddle.w / 2,
        y: state.paddle.y - BALL.radius * scale() - 1,
        vx: 0,
        vy: 0,
        r: BALL.radius * scale(),
        stuck: true,
      },
    ];
    state.serving = true;
    state.serveTimer = 0;
  }

  function launchBall(ball) {
    const speed = ballSpeed();
    const angle = (random() - 0.5) * 1.1;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.stuck = false;
    state.serving = false;
    return EVENT_LAUNCH;
  }

  function dropPowerUp(x, y) {
    if (random() > POWERUP.dropChance) return;
    let kind = pickWeighted(random, POWER_KINDS, POWER_WEIGHTS);
    if (kind === 'L' && state.lives >= LIVES_MAX) kind = 'W';
    state.powerups.push({
      x,
      y,
      vy: POWERUP.fallSpeed * scale(),
      kind,
      size: POWERUP.size * scale(),
      alive: true,
    });
  }

  function applyPowerUp(kind) {
    if (kind === 'W') {
      state.paddle.wideTimer = PADDLE.wideSeconds;
      placePaddle();
    } else if (kind === 'M') {
      const copies = [];
      for (const ball of state.balls) {
        if (state.balls.length + copies.length >= BALL.maxBalls) break;
        if (ball.stuck) continue;
        copies.push({
          x: ball.x,
          y: ball.y,
          vx: -ball.vx,
          vy: ball.vy,
          r: ball.r,
          stuck: false,
        });
      }
      state.balls.push(...copies);
    } else if (kind === 'S') {
      state.slowTimer = BALL.slowSeconds;
    } else if (kind === 'L') {
      state.lives = Math.min(state.lives + 1, LIVES_MAX);
    }
  }

  function stepPowerups(dt) {
    let events = 0;
    const paddle = state.paddle;
    for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
      const power = state.powerups[i];
      power.y += power.vy * dt;
      if (
        power.y + power.size / 2 >= paddle.y &&
        power.y - power.size / 2 <= paddle.y + paddle.h &&
        power.x >= paddle.x - power.size / 2 &&
        power.x <= paddle.x + paddle.w + power.size / 2
      ) {
        applyPowerUp(power.kind);
        spawnText(state.texts, power.x, paddle.y - 10, powerLabel(power.kind), powerColor(power.kind));
        spawnBurst(state.particles, power.x, paddle.y, powerColor(power.kind), 8, 180, 0.5);
        state.powerups.splice(i, 1);
        events |= EVENT_POWER;
      } else if (power.y - power.size / 2 > state.height) {
        state.powerups.splice(i, 1);
      }
    }
    return events;
  }

  function brickColor(brick) {
    const rowColors = ['#ff5d8f', '#ff9f43', '#ffe14d', '#4ade80', '#38bdf8', '#a78bfa'];
    if (brick.unbreakable) return '#3a4266';
    return rowColors[brick.row % rowColors.length];
  }

  /** One smash hit destroys a brick outright, whatever its hp — including
   *  steel, which no normal hit can break. Steel pays a flat bonus and does
   *  not feed the streak; a breakable brick scores exactly like a normal
   *  break and still drops power-ups. */
  function smashBrick(brick) {
    state.smashHits -= 1;
    if (brick.unbreakable) {
      brick.alive = false;
      state.score += SMASH.steelPoints;
      spawnBurst(state.particles, brick.x + brick.w / 2, brick.y + brick.h / 2, '#ffe14d', 14, 300, 0.6);
      spawnText(state.texts, brick.x + brick.w / 2, brick.y, `STEEL +${SMASH.steelPoints}`, '#ffe14d');
      state.shake = Math.max(state.shake, 5);
      return EVENT_SMASH;
    }
    brick.hp = 0;
    brick.alive = false;
    state.breakableLeft -= 1;
    state.streak += 1;
    const bonus = STREAK_BONUS * Math.min(state.streak, STREAK_CAP);
    const points = BRICK_POINTS[brick.maxHp] + bonus;
    state.score += points;
    spawnBurst(state.particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brickColor(brick), 14, 300, 0.6);
    spawnText(state.texts, brick.x + brick.w / 2, brick.y, `+${points}`, brickColor(brick));
    dropPowerUp(brick.x + brick.w / 2, brick.y + brick.h / 2);
    state.shake = Math.max(state.shake, 4);
    return EVENT_BRICK | EVENT_SMASH | addCharge(SMASH.chargePerBreak);
  }

  function collideBricks(ball) {
    let events = 0;
    // A smash ball pierces: it can destroy several bricks in one step, so
    // re-scan while it still overlaps a brick and still has hits left. A
    // normal ball bounces off the first brick it touches and stops here.
    for (let guard = 0; guard < 6; guard += 1) {
      let hit = null;
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
        const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
        const dx = ball.x - nearestX;
        const dy = ball.y - nearestY;
        if (dx * dx + dy * dy <= ball.r * ball.r) {
          hit = brick;
          break;
        }
      }
      if (!hit) break;
      if (state.smashHits > 0) {
        events |= smashBrick(hit);
        continue;
      }
      // Bounce off the side the ball came from: the smaller penetration wins.
      const overlapLeft = ball.x + ball.r - hit.x;
      const overlapRight = hit.x + hit.w - (ball.x - ball.r);
      const overlapTop = ball.y + ball.r - hit.y;
      const overlapBottom = hit.y + hit.h - (ball.y - ball.r);
      const minX = Math.min(overlapLeft, overlapRight);
      const minY = Math.min(overlapTop, overlapBottom);
      if (minX < minY) ball.vx = overlapLeft < overlapRight ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      else ball.vy = overlapTop < overlapBottom ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      if (hit.unbreakable) {
        spawnBurst(state.particles, ball.x, ball.y, '#8f96b8', 4, 120, 0.35);
        return events | EVENT_WALL;
      }
      hit.hp -= 1;
      if (hit.hp <= 0) {
        hit.alive = false;
        state.breakableLeft -= 1;
        state.streak += 1;
        const bonus = STREAK_BONUS * Math.min(state.streak, STREAK_CAP);
        const points = BRICK_POINTS[hit.maxHp] + bonus;
        state.score += points;
        spawnBurst(state.particles, hit.x + hit.w / 2, hit.y + hit.h / 2, brickColor(hit), 12, 260, 0.6);
        spawnText(state.texts, hit.x + hit.w / 2, hit.y, `+${points}`, brickColor(hit));
        dropPowerUp(hit.x + hit.w / 2, hit.y + hit.h / 2);
        // A short, sharp shake on every break: the hit lands. (A bigger shake
        // is reserved for losing a ball, so breaks stay snappy, not seasick.)
        state.shake = Math.max(state.shake, 3);
        return events | EVENT_BRICK | addCharge(SMASH.chargePerBreak);
      }
      spawnBurst(state.particles, ball.x, ball.y, brickColor(hit), 5, 160, 0.4);
      return events | EVENT_CRACK | addCharge(SMASH.chargePerCrack);
    }
    return events;
  }

  function stepBall(ball, dt) {
    let events = 0;
    const speed = ballSpeed();
    const magnitude = Math.hypot(ball.vx, ball.vy) || speed;
    ball.vx = (ball.vx / magnitude) * speed;
    ball.vy = (ball.vy / magnitude) * speed;
    if (huntActive() && ball.vy < 0) {
      // HUNT: with only a few bricks left, the ball bends toward the
      // lowest survivor on its way up — routing around any steel in the
      // way through the nearest gap. Enough to end the last-brick random
      // walk, not enough to play the game for you. It never steers a
      // falling ball, so paddle saves are untouched. Above a steel row
      // the bend is a critically damped spring (see huntSteer): a fixed
      // acceleration cannot both brake the ball's sideways drift and
      // settle it over the brick in the short time it spends up there.
      const hunt = huntSteer(ball);
      if (hunt !== null) {
        let accel;
        if (hunt.omega) {
          accel = hunt.omega * hunt.omega * (hunt.x - ball.x) - 2 * hunt.omega * ball.vx;
        } else {
          accel = Math.max(-1, Math.min(1, hunt.x - ball.x)) * hunt.steer;
        }
        ball.vx += accel * dt;
        const after = Math.hypot(ball.vx, ball.vy) || speed;
        ball.vx = (ball.vx / after) * speed;
        ball.vy = (ball.vy / after) * speed;
        if (hunt.omega) {
          // Cap how horizontal the ball can get while a spring steers
          // it: a near-horizontal ball barely climbs, so the spring loses
          // its grip and the ball drifts past its aim point instead of
          // settling over it. The cap keeps the ball on a normal rising
          // arc while it homes in.
          const maxVx = HUNT.springMaxVx * speed;
          if (Math.abs(ball.vx) > maxVx) {
            ball.vx = Math.sign(ball.vx) * maxVx;
            ball.vy = -Math.sqrt(Math.max(0, speed * speed - ball.vx * ball.vx));
          }
        }
      }
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
      events |= EVENT_WALL;
    } else if (ball.x + ball.r > state.width) {
      ball.x = state.width - ball.r;
      ball.vx = -Math.abs(ball.vx);
      events |= EVENT_WALL;
    }
    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      events |= EVENT_WALL;
    }
    const paddle = state.paddle;
    if (
      ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x >= paddle.x - ball.r &&
      ball.x <= paddle.x + paddle.w + ball.r
    ) {
      const offset = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
      // A touch of jitter keeps the rally alive; a dead-straight bounce would
      // loop up and down one cleared column forever with nothing to hit.
      const angle = offset * 1.05 + (random() - 0.5) * 0.1;
      const incomingVx = ball.vx;
      ball.vy = -Math.abs(Math.cos(angle)) * speed;
      ball.vx = Math.sin(angle) * speed;
      const minVx = speed * 0.30;
      if (Math.abs(ball.vx) < minVx) {
        // The minimum-horizontal kick keeps the ball's incoming direction
        // instead of flipping a coin: a coin flip can reverse the ball at
        // the paddle rally after rally and trap it in a limit cycle over
        // cleared space, bouncing forever without reaching the bricks.
        // Hunting, it points where the ball is bending — at the lowest
        // survivor, or through the gap when steel is in the way (or
        // straight at the survivor when the ball is armed to smash
        // through that steel).
        const hunt = huntActive() ? huntSteer(ball) : null;
        const sign = hunt !== null
          ? Math.sign(hunt.x - ball.x) || 1
          : Math.sign(incomingVx) || (random() < 0.5 ? -1 : 1);
        ball.vx = sign * minVx;
        ball.vy = -Math.sqrt(Math.max(0, speed * speed - ball.vx * ball.vx));
      }
      ball.y = paddle.y - ball.r - 0.5;
      spawnBurst(state.particles, ball.x, paddle.y, '#39d0ff', 5, 140, 0.35);
      events |= EVENT_PADDLE;
    }
    events |= collideBricks(ball);
    return events;
  }

  function resetLevel(level) {
    state.level = level;
    state.streak = 0;
    state.cleared = false;
    state.over = false;
    state.won = false;
    state.powerups = [];
    state.particles = [];
    state.texts = [];
    state.slowTimer = 0;
    state.smashHits = 0;
    state.paddle.wideTimer = 0;
    state.paddle.x = (state.width - paddleWidth()) / 2;
    buildBricks();
    placePaddle();
    serveBall();
  }

  return {
    state,
    brickColor,
    trySmash,
    resize(width, height) {
      state.width = width;
      state.height = height;
      buildBricks(true);
      placePaddle();
      for (const ball of state.balls) {
        ball.r = BALL.radius * scale();
        if (ball.stuck) {
          ball.x = state.paddle.x + state.paddle.w / 2;
          ball.y = state.paddle.y - ball.r - 1;
        }
      }
    },
    fullReset() {
      state.level = 1;
      state.score = 0;
      state.lives = LIVES_START;
      state.streak = 0;
      state.time = 0;
      state.charge = 0;
      state.smashHits = 0;
      state.smashUsed = false;
      state.smashTaught = false;
      resetLevel(1);
    },
    resetLevel,
    /** One attract step for the title screen: the paddle plays itself and the ball never dies. */
    stepTitle(dt) {
      state.time += dt;
      const ball = state.balls[0];
      if (!ball) return;
      const target = ball.x - state.paddle.w / 2;
      const maxMove = PADDLE.speed * scale() * dt;
      state.paddle.x += Math.max(-maxMove, Math.min(maxMove, target - state.paddle.x));
      state.paddle.x = Math.max(0, Math.min(state.width - state.paddle.w, state.paddle.x));
      const speed = ballSpeed();
      const magnitude = Math.hypot(ball.vx, ball.vy) || speed;
      ball.vx = (ball.vx / magnitude) * speed;
      ball.vy = (ball.vy / magnitude) * speed;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x + ball.r > state.width) {
        ball.x = state.width - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - ball.r < 0) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
      }
      // An invisible ceiling just under the bricks keeps the demo ball in
      // view instead of flying up through the brick wall.
      let bricksBottom = 0;
      for (const brick of state.bricks) {
        bricksBottom = Math.max(bricksBottom, brick.y + brick.h);
      }
      const ceiling = bricksBottom + 30 * scale();
      if (ball.y - ball.r < ceiling && ball.vy < 0) {
        ball.y = ceiling + ball.r;
        ball.vy = Math.abs(ball.vy);
      }
      const paddle = state.paddle;
      if (
        ball.vy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - ball.r &&
        ball.x <= paddle.x + paddle.w + ball.r
      ) {
        const offset = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
        const angle = offset * 1.05 + (random() - 0.5) * 0.1;
        const incomingVx = ball.vx;
        ball.vy = -Math.abs(Math.cos(angle)) * speed;
        ball.vx = Math.sin(angle) * speed;
        const minVx = speed * 0.30;
        if (Math.abs(ball.vx) < minVx) {
          // As in stepBall: keep the incoming direction instead of a coin
          // flip, so the demo ball cannot settle into a limit cycle.
          ball.vx = (Math.sign(incomingVx) || (random() < 0.5 ? -1 : 1)) * minVx;
          ball.vy = -Math.sqrt(Math.max(0, speed * speed - ball.vx * ball.vx));
        }
        ball.y = paddle.y - ball.r - 0.5;
      }
      stepEffects(state, dt);
    },
    /** Start the attract ball moving (title screen). */
    startAttract() {
      const ball = state.balls[0];
      if (!ball) return;
      const speed = ballSpeed();
      ball.vx = speed * 0.45;
      ball.vy = speed * 0.89;
      ball.stuck = false;
      state.serving = false;
    },
    /** One gameplay step. `control` is { direction, pointerX, confirm, smash }. */
    step(dt, control) {
      let events = 0;
      state.time += dt;
      if (control.smash) events |= trySmash();
      if (state.paddle.wideTimer > 0) {
        state.paddle.wideTimer -= dt;
        if (state.paddle.wideTimer <= 0) placePaddle();
      }
      if (state.slowTimer > 0) state.slowTimer -= dt;
      const paddle = state.paddle;
      const s = scale();
      if (control.pointerX !== null && control.pointerX !== undefined) {
        const target = control.pointerX - paddle.w / 2;
        const maxMove = PADDLE.speed * 1.6 * s * dt;
        paddle.x += Math.max(-maxMove, Math.min(maxMove, target - paddle.x));
      } else if (control.direction) {
        paddle.x += control.direction * PADDLE.speed * s * dt;
      }
      paddle.x = Math.max(0, Math.min(state.width - paddle.w, paddle.x));
      if (state.serving) {
        const ball = state.balls[0];
        if (ball) {
          ball.x = paddle.x + paddle.w / 2;
          ball.y = paddle.y - ball.r - 1;
        }
        state.serveTimer += dt;
        if (control.confirm || state.serveTimer >= BALL.serveSeconds) {
          if (ball) events |= launchBall(ball);
        }
        events |= stepPowerups(dt);
        stepEffects(state, dt);
        return events;
      }
      for (let i = state.balls.length - 1; i >= 0; i -= 1) {
        events |= stepBall(state.balls[i], dt);
      }
      // A ball that fell past the paddle is gone; losing the last one costs a life.
      let lost = false;
      for (let i = state.balls.length - 1; i >= 0; i -= 1) {
        if (state.balls[i].y - state.balls[i].r > state.height) {
          state.balls.splice(i, 1);
          lost = true;
        }
      }
      if (lost && state.balls.length === 0) {
        state.lives -= 1;
        state.streak = 0;
        state.smashHits = 0;
        state.shake = 14;
        spawnBurst(state.particles, paddle.x + paddle.w / 2, paddle.y, '#ff5d5d', 16, 300, 0.7);
        events |= EVENT_LOSE;
        if (state.lives <= 0) {
          state.over = true;
          events |= EVENT_OVER;
        } else {
          serveBall();
        }
      }
      events |= stepPowerups(dt);
      if (!state.cleared && state.breakableLeft === 0) {
        state.cleared = true;
        const bonus = SCORE.levelClearBase * state.level + SCORE.lifeBonus * state.lives;
        state.score += bonus;
        events |= EVENT_CLEAR;
        if (state.level >= LEVEL_COUNT) {
          state.won = true;
          events |= EVENT_WIN;
        }
      }
      stepEffects(state, dt);
      return events;
    },
  };
}

export function powerLabel(kind) {
  if (kind === 'W') return 'WIDE';
  if (kind === 'M') return 'MULTI';
  if (kind === 'S') return 'SLOW';
  return 'EXTRA LIFE';
}

export function powerColor(kind) {
  if (kind === 'W') return '#39d0ff';
  if (kind === 'M') return '#ff5d8f';
  if (kind === 'S') return '#4ade80';
  return '#ffe14d';
}
