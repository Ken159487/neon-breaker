// Neon Breaker: the loop that ties input, world, renderer and sound together.
// Fixed-step simulation (60/s) decoupled from the display rate; screens are
// title → play ⇄ paused, and play → clear / over / win.

import { BEST_KEY, LEVEL_COUNT, SCORE, STEP } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SMASH, createInput } from './input.js';
import { createRandom } from './random.js';
import { createRenderer, SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import {
  EVENT_BRICK,
  EVENT_CHARGE_FULL,
  EVENT_CLEAR,
  EVENT_CRACK,
  EVENT_LAUNCH,
  EVENT_LOSE,
  EVENT_OVER,
  EVENT_PADDLE,
  EVENT_POWER,
  EVENT_SMASH,
  EVENT_WALL,
  EVENT_WIN,
  createWorld,
} from './world.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') || '7', 10);
const random = createRandom(Number.isFinite(seedParam) ? seedParam : 7);

const world = createWorld(random);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let screen = SCREEN_TITLE;
let best = readBest();
let newBest = false;
let clearBonus = 0;
// Hit-stop: the world freezes for a few frames on every brick break, so the
// hit lands. 50 ms is short enough to read as impact, not lag.
let hitStop = 0;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function announce(text) {
  statusEl.textContent = text;
}

function updateBest() {
  if (world.state.score > best) {
    best = world.state.score;
    newBest = true;
    saveBest(best);
  }
}

function setScreen(next, announcement) {
  screen = next;
  canvas.style.cursor = next === SCREEN_PLAY ? 'none' : 'default';
  if (announcement) announce(announcement);
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
  world.resize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
resize();
world.fullReset();
world.startAttract();

function ui() {
  return { best, muted: audio.muted, bonus: clearBonus, newBest };
}

function startGame() {
  newBest = false;
  world.fullReset();
  setScreen(SCREEN_PLAY, 'Level 1. Press Space or click to launch the ball.');
}

function handleEvents(events) {
  if (events & EVENT_LAUNCH) audio.launch();
  if (events & EVENT_PADDLE) audio.paddle();
  if (events & EVENT_WALL) audio.wall();
  if (events & EVENT_BRICK) {
    audio.brick(1, world.state.streak);
    hitStop = Math.max(hitStop, 0.05);
  }
  if (events & EVENT_SMASH) {
    audio.smash();
    hitStop = Math.max(hitStop, 0.08);
  }
  if (events & EVENT_CHARGE_FULL) {
    audio.chargeFull();
    announce('Smash ready. Press X to smash through bricks and steel.');
  }
  if (events & EVENT_CRACK) audio.brick(2, world.state.streak);
  if (events & EVENT_POWER) audio.powerUp();
  if (events & EVENT_LOSE) {
    audio.loseLife();
    const lives = world.state.lives;
    announce(lives > 0 ? `Ball lost. ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : 'Ball lost.');
  }
  if (events & EVENT_WIN) {
    audio.win();
    updateBest();
    setScreen(SCREEN_WIN, `You win! Final score ${world.state.score}.`);
  } else if (events & EVENT_CLEAR) {
    clearBonus = SCORE.levelClearBase * world.state.level + SCORE.lifeBonus * world.state.lives;
    audio.levelClear();
    setScreen(SCREEN_CLEAR, `Level ${world.state.level} clear! Bonus ${clearBonus}.`);
  } else if (events & EVENT_OVER) {
    audio.gameOver();
    updateBest();
    setScreen(SCREEN_OVER, `Game over. Score ${world.state.score}.`);
  }
}

if (shotName) {
  // Screenshot mode: stage the world, paint twice, signal readiness.
  const staged = stageShot(shotName, world);
  screen = staged.screen;
  renderer.draw(world.state, screen, ui());
  renderer.draw(world.state, screen, ui());
  window.__shotReady = true;
} else {
  let last = performance.now();
  let accumulator = 0;
  let lastPointerX = null;
  let lastPointerTime = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED, 'Paused. Press P or click to resume.');
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    const actionsTaken = input.takeActions();
    let actions = actionsTaken;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    // X arms the smash ball; so does a click mid-rally with a full meter
    // (a click while serving still just launches the ball).
    const smashQueued =
      Boolean(actions & ACTION_SMASH) ||
      (Boolean(actions & ACTION_CONFIRM) &&
        screen === SCREEN_PLAY &&
        !world.state.serving &&
        world.state.charge >= 100);
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        startGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        setScreen(SCREEN_PAUSED, 'Paused. Press P or click to resume.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) {
        audio.click();
        setScreen(SCREEN_PLAY, 'Resumed.');
      } else if (actions & ACTION_RESTART) {
        audio.click();
        startGame();
      }
    } else if (screen === SCREEN_CLEAR) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        const nextLevel = Math.min(world.state.level + 1, LEVEL_COUNT);
        world.resetLevel(nextLevel);
        setScreen(SCREEN_PLAY, `Level ${nextLevel}. Press Space or click to launch the ball.`);
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
        audio.click();
        startGame();
      }
    }
    // The pointer steers only while it is actually being moved; otherwise
    // the keyboard steers. This keeps both controls usable in one session.
    const pointerNow = input.pointerTarget();
    if (pointerNow !== null && pointerNow !== lastPointerX) {
      lastPointerX = pointerNow;
      lastPointerTime = now;
    }
    const pointerX = pointerNow !== null && now - lastPointerTime < 1500 ? pointerNow : null;
    if (hitStop > 0) {
      // Frozen: eat this frame's time instead of stepping, so the world
      // visibly holds still for the length of the hit-stop.
      hitStop -= dt;
      accumulator = 0;
    } else {
      accumulator += dt;
    }
    while (accumulator >= STEP) {
      accumulator -= STEP;
      if (screen === SCREEN_TITLE) {
        world.stepTitle(STEP);
      } else if (screen === SCREEN_PLAY) {
        if (hitStop > 0) break;
        const events = world.step(STEP, {
          direction: input.direction(),
          pointerX,
          confirm: Boolean(actions & ACTION_CONFIRM),
          smash: smashQueued,
        });
        actions = 0;
        handleEvents(events);
      }
    }
    renderer.draw(world.state, screen, ui());
  }

  requestAnimationFrame(frame);
}
