# Neon Breaker

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Ken159487/neon-breaker/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Ken159487/neon-breaker/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A complete offline browser game for the make.fun best-game-01 bounty: a neon
breakout arcade game. Move the paddle, bounce the ball, break every brick —
and don't drop the ball.

## Play

Serve `game/` with any static file server and open `index.html` in a desktop
browser (Chrome, Firefox, Safari, Edge). No build step, no network request,
no library: plain HTML, CSS and ES modules.

```sh
cd game
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

Or with Node:

```sh
npx --yes serve game
```

## Controls

- **Move the paddle:** mouse, or `←` / `→` (also `A` / `D`)
- **Launch the ball / start / confirm:** `Space`, `Enter`, or click
- **Pause:** `P` or `Esc` (auto-pauses when the tab is hidden)
- **Sound on/off:** `M`
- **Restart from the pause / game-over screen:** `R`

## The game

- **5 levels**, each a different brick layout (steel bricks that never break
  appear from level 3). Clear every breakable brick to finish a level.
- **3 lives** (up to 5 with extra-life drops). Lose a ball, lose a life.
- **Power-ups** fall from broken bricks: `W` wide paddle, `M` multiball,
  `S` slow ball, `+` extra life.
- **Score:** bricks are worth 50–200 points by toughness, plus a streak bonus
  for breaking bricks without dropping a ball. A level-clear bonus rewards
  finishing fast with lives to spare. The best score is kept in the browser.
- **Feel:** particles on every break, screen shake on losing a ball, a ball
  trail, floating score texts, and synthesised WebAudio sound effects (no
  audio files) — all generated in code.
- **Screens:** animated title (the paddle plays itself behind it), pause,
  level-clear, game-over and win screens, all with keyboard/click restart.

## Screenshots

`?shot=start|play|end` stages a fixed-seed scene for screenshots (see
`shots.json`); the page sets `window.__shotReady` when the frame is painted:

- `1-start.jpg` — title screen over the animated demo game
- `2-play.jpg` — mid-rally play with a score on the board
- `3-end.jpg` — game-over screen after a lost game

## Layout

```
main.ts            the build program: copies game/ + screenshots/ to the
                   output directory and writes dossier.json
shots.json         the three screenshot scenes
game/
  index.html       the page (canvas + status line, no network references)
  src/
    config.js      tuning numbers, palette, storage keys
    random.js      seeded random numbers
    input.js       keyboard + pointer input
    audio.js       synthesised WebAudio sound effects
    particles.js   bursts and floating score texts
    levels.js      the five brick layouts
    world.js       the simulation: paddle, balls, bricks, power-ups
    render.js      canvas drawing, HUD and screens
    shots.js       ?shot= staging (pure simulation)
    main.js        the fixed-step loop, screens and sound triggers
vendor/
  makefun-game.ts  the make.fun dossier library (vendored, unchanged)
LICENSE            MIT
```

## Build the entry

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
# out/game/ out/screenshots/ out/dossier.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qd4rkca6&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
