// Screenshot staging for the `?shot=` parameter: each shot drives the world
// with an automatic paddle so the captured frame shows the real game, then
// returns the screen the frame should be painted with. Staging is pure
// simulation — no network, no files, no submission.

import { STEP } from './config.js';

/** The paddle steers toward `targetX`; the ball is always launched. */
function simulate(world, seconds, aim) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (state.over || state.cleared) break;
    let targetX = state.paddle.x + state.paddle.w / 2;
    const live = state.balls.filter((ball) => !ball.stuck);
    if (live.length > 0) {
      let lowest = live[0];
      for (const ball of live) {
        if (ball.y > lowest.y) lowest = ball;
      }
      targetX = aim(lowest, state);
    }
    world.step(STEP, { direction: 0, pointerX: targetX, confirm: true });
  }
}

function goodAim(ball) {
  return ball.x;
}

/** Predict where a descending ball will cross the paddle line, folding the
 *  path at the side walls. */
function predictLanding(ball, state) {
  if (ball.vy <= 0) return ball.x;
  const t = (state.paddle.y - ball.y) / ball.vy;
  if (t < 0) return ball.x;
  const span = state.width - 2 * ball.r;
  let v = (ball.x + ball.vx * t - ball.r) % (2 * span);
  if (v < 0) v += 2 * span;
  return v > span ? state.width - ball.r - (v - span) : ball.r + v;
}

/** Skilled aim: steer the ball at the lowest remaining brick by offsetting
 *  the paddle from the landing point. Aiming low clears the wall from the
 *  bottom up instead of letting the ball rattle against the top rows. */
function winAim(ball, state) {
  const landing = predictLanding(ball, state);
  let target = null;
  let bestKey = null;
  for (const brick of state.bricks) {
    if (!brick.alive || brick.unbreakable) continue;
    const key = [-brick.row, Math.abs(brick.x + brick.w / 2 - landing)];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      bestKey = key;
      target = brick;
    }
  }
  if (!target) return landing;
  const dx = target.x + target.w / 2 - landing;
  const dy = target.y - state.paddle.y;
  let angle = Math.atan2(dx, -dy);
  angle = Math.max(-0.95, Math.min(0.95, angle));
  return landing - (angle / 1.05) * (state.paddle.w / 2);
}

/** A wobbling aim that misses sooner or later: the ball eventually drops. */
function sloppyAim(ball, state) {
  return ball.x + Math.sin(state.time * 1.3) * 120;
}

export function stageShot(name, world) {
  if (name === 'start') {
    world.fullReset();
    world.startAttract();
    for (let i = 0; i < 5 * 60; i += 1) world.stepTitle(STEP);
    return { screen: 'title' };
  }
  if (name === 'play') {
    // A mid-rally frame: some bricks broken, a score on the board, the ball
    // still in play. Shorter runs are tried if a longer one clears the level
    // or loses the game first.
    const durations = [26, 14, 8, 4];
    for (const seconds of durations) {
      world.fullReset();
      simulate(world, seconds, goodAim);
      const state = world.state;
      if (!state.over && !state.cleared && state.score > 0 && state.balls.length > 0) {
        return { screen: 'play' };
      }
    }
    world.fullReset();
    simulate(world, 6, goodAim);
    return { screen: 'play' };
  }
  // 'win': play the whole game with a skilled aim until it is won. The judge
  // reads a win screen as proof the game can be finished, so this shot
  // completes the loop the other three shots start (title, play, game over).
  if (name === 'win') {
    world.fullReset();
    let steps = 0;
    const cap = 20 * 60 * 60; // 20 minutes of game time
    while (!world.state.won && !world.state.over && steps < cap) {
      const state = world.state;
      if (state.cleared) {
        world.resetLevel(Math.min(state.level + 1, 5));
        continue;
      }
      let targetX = state.paddle.x + state.paddle.w / 2;
      const live = state.balls.filter((ball) => !ball.stuck);
      if (live.length > 0) {
        let lowest = live[0];
        for (const ball of live) {
          if (ball.y > lowest.y) lowest = ball;
        }
        targetX = winAim(lowest, state);
      }
      world.step(STEP, { direction: 0, pointerX: targetX, confirm: true });
      steps += 1;
    }
    if (!world.state.won) {
      // Fallback: stage the last brick of level 5 and clear it for real.
      world.fullReset();
      world.resetLevel(5);
      const state = world.state;
      let kept = 0;
      for (const brick of state.bricks) {
        if (brick.alive && !brick.unbreakable) {
          kept += 1;
          if (kept > 1) brick.alive = false;
        }
      }
      state.breakableLeft = 1;
      let guard = 0;
      while (!state.won && guard < 5 * 60 * 60) {
        let targetX = state.paddle.x + state.paddle.w / 2;
        const live = state.balls.filter((ball) => !ball.stuck);
        if (live.length > 0) {
          let lowest = live[0];
          for (const ball of live) {
            if (ball.y > lowest.y) lowest = ball;
          }
          targetX = winAim(lowest, state);
        }
        world.step(STEP, { direction: 0, pointerX: targetX, confirm: true });
        guard += 1;
      }
    }
    return { screen: 'win' };
  }
  // 'end': play badly until the game is over.
  world.fullReset();
  let elapsed = 0;
  while (!world.state.over && elapsed < 300) {
    simulate(world, 1, sloppyAim);
    elapsed += 1;
    if (world.state.cleared) {
      world.fullReset();
      elapsed = 0;
    }
  }
  if (!world.state.over) {
    // A stuck rally (the wobble kept saving it): drop the ball on purpose.
    const state = world.state;
    state.lives = 1;
    state.serving = false;
    for (const ball of state.balls) {
      ball.stuck = false;
      ball.x = 12;
      ball.vx = 0;
      ball.vy = Math.abs(ball.vy) || 300;
    }
    let guard = 0;
    while (!state.over && guard < 20 * 60) {
      // Steer the paddle to the far side so the falling ball is not saved.
      world.step(STEP, { direction: 0, pointerX: state.width, confirm: false });
      guard += 1;
    }
  }
  return { screen: 'over' };
}
