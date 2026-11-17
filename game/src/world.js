// The game world: paddle, balls, bricks, power-ups and particles. It owns no
// DOM and no audio; it steps in fixed 1/60 s slices and reports what happened
// as event flags, so the main loop can play sounds and change screens.

import {
  BALL,
  BRICK,
  BRICK_POINTS,
  LIVES_MAX,
  LIVES_START,
  LEVEL_COUNT,
  PADDLE,
  POWERUP,
  REF_H,
  SCORE,
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

  function collideBricks(ball) {
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
      const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;
      // Bounce off the side the ball came from: the smaller penetration wins.
      const overlapLeft = ball.x + ball.r - brick.x;
      const overlapRight = brick.x + brick.w - (ball.x - ball.r);
      const overlapTop = ball.y + ball.r - brick.y;
      const overlapBottom = brick.y + brick.h - (ball.y - ball.r);
      const minX = Math.min(overlapLeft, overlapRight);
      const minY = Math.min(overlapTop, overlapBottom);
      if (minX < minY) ball.vx = overlapLeft < overlapRight ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      else ball.vy = overlapTop < overlapBottom ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      if (brick.unbreakable) {
        spawnBurst(state.particles, ball.x, ball.y, '#8f96b8', 4, 120, 0.35);
        return EVENT_WALL;
      }
      brick.hp -= 1;
      if (brick.hp <= 0) {
        brick.alive = false;
        state.breakableLeft -= 1;
        state.streak += 1;
        const bonus = STREAK_BONUS * Math.min(state.streak, STREAK_CAP);
        const points = BRICK_POINTS[brick.maxHp] + bonus;
        state.score += points;
        spawnBurst(state.particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brickColor(brick), 12, 260, 0.6);
        spawnText(state.texts, brick.x + brick.w / 2, brick.y, `+${points}`, brickColor(brick));
        dropPowerUp(brick.x + brick.w / 2, brick.y + brick.h / 2);
        // A short, sharp shake on every break: the hit lands. (A bigger shake
        // is reserved for losing a ball, so breaks stay snappy, not seasick.)
        state.shake = Math.max(state.shake, 3);
        return EVENT_BRICK;
      }
      spawnBurst(state.particles, ball.x, ball.y, brickColor(brick), 5, 160, 0.4);
      return EVENT_CRACK;
    }
    return 0;
  }

  function stepBall(ball, dt) {
    let events = 0;
    const speed = ballSpeed();
    const magnitude = Math.hypot(ball.vx, ball.vy) || speed;
    ball.vx = (ball.vx / magnitude) * speed;
    ball.vy = (ball.vy / magnitude) * speed;
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
      ball.vy = -Math.abs(Math.cos(angle)) * speed;
      ball.vx = Math.sin(angle) * speed;
      const minVx = speed * 0.30;
      if (Math.abs(ball.vx) < minVx) {
        ball.vx = (random() < 0.5 ? -1 : 1) * minVx;
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
    state.paddle.wideTimer = 0;
    state.paddle.x = (state.width - paddleWidth()) / 2;
    buildBricks();
    placePaddle();
    serveBall();
  }

  return {
    state,
    brickColor,
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
        ball.vy = -Math.abs(Math.cos(angle)) * speed;
        ball.vx = Math.sin(angle) * speed;
        const minVx = speed * 0.30;
        if (Math.abs(ball.vx) < minVx) {
          ball.vx = (random() < 0.5 ? -1 : 1) * minVx;
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
    /** One gameplay step. `control` is { direction, pointerX, confirm }. */
    step(dt, control) {
      let events = 0;
      state.time += dt;
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
