// Everything on screen: the starfield, bricks, paddle, balls, particles,
// the HUD and the menu screens. Drawing only reads the world state; it never
// changes it, so the same frame can be painted twice for a screenshot.

import { FONT, HUNT, LEVEL_COUNT, PALETTE, SMASH } from './config.js';
import { powerColor } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function roundedPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 10, size / 10);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-5, -2, -8, 2, 0, 9);
  ctx.bezierCurveTo(8, 2, 5, -2, 0, 3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let stars = [];

  function resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    width = w;
    height = h;
    stars = [];
    for (let i = 0; i < 90; i += 1) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: 0.5 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
      });
    }
  }

  function scale() {
    return height / 640;
  }

  function text(str, x, y, size, color, align, weight, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.font = `${weight || 700} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function drawBackground(state) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, PALETTE.backgroundTop);
    gradient.addColorStop(1, PALETTE.backgroundBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const twinkle = 0.25 + 0.75 * Math.abs(Math.sin(state.time * star.speed + star.phase));
      ctx.globalAlpha = twinkle * 0.8;
      ctx.fillStyle = PALETTE.star;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBricks(state) {
    const s = scale();
    // HUNT: with only a few breakable bricks left, the survivors pulse so
    // the player can see exactly what is still standing.
    const hunting =
      !state.cleared && state.breakableLeft > 0 && state.breakableLeft <= HUNT.remaining;
    const pulse = hunting ? 0.35 + 0.3 * Math.sin(state.time * 5) : 0;
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const color = brick.unbreakable ? PALETTE.unbreakable : brickColorOf(brick);
      roundedPath(ctx, brick.x, brick.y, brick.w, brick.h, 5 * s);
      ctx.fillStyle = color;
      ctx.fill();
      if (hunting && !brick.unbreakable) {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 2.5 * s;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(brick.x + 3 * s, brick.y + 2 * s, brick.w - 6 * s, 3 * s);
      if (brick.unbreakable) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(brick.x + 4 * s, brick.y + brick.h - 4 * s);
        ctx.lineTo(brick.x + brick.w - 4 * s, brick.y + 4 * s);
        ctx.moveTo(brick.x + brick.w / 2, brick.y + brick.h - 4 * s);
        ctx.lineTo(brick.x + brick.w - 4 * s, brick.y + brick.h / 2);
        ctx.stroke();
      } else if (brick.hp < brick.maxHp) {
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.w * 0.3, brick.y + 3 * s);
        ctx.lineTo(brick.x + brick.w * 0.45, brick.y + brick.h * 0.6);
        ctx.lineTo(brick.x + brick.w * 0.35, brick.y + brick.h - 3 * s);
        if (brick.hp === 1 && brick.maxHp === 3) {
          ctx.moveTo(brick.x + brick.w * 0.65, brick.y + 3 * s);
          ctx.lineTo(brick.x + brick.w * 0.55, brick.y + brick.h - 3 * s);
        }
        ctx.stroke();
      }
    }
  }

  function brickColorOf(brick) {
    return PALETTE.brickRows[brick.row % PALETTE.brickRows.length];
  }

  function drawPowerUps(state) {
    const s = scale();
    for (const power of state.powerups) {
      const color = powerColor(power.kind);
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 * s;
      roundedPath(ctx, power.x - power.size / 2, power.y - power.size / 2, power.size, power.size * 0.62, 8 * s);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      const letter = power.kind === 'W' ? 'W' : power.kind === 'M' ? 'M' : power.kind === 'S' ? 'S' : '+';
      text(letter, power.x, power.y + 1 * s, 13 * s, '#0b0e24', 'center', 800);
    }
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPaddle(state) {
    const s = scale();
    const paddle = state.paddle;
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    gradient.addColorStop(0, '#1b7fb8');
    gradient.addColorStop(0.5, PALETTE.paddle);
    gradient.addColorStop(1, '#1b7fb8');
    ctx.save();
    ctx.shadowColor = PALETTE.paddle;
    ctx.shadowBlur = 16 * s;
    roundedPath(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 7 * s);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(paddle.x + 6 * s, paddle.y + 2 * s, paddle.w - 12 * s, 2.5 * s);
  }

  function drawBalls(state) {
    const s = scale();
    const smashing = state.smashHits > 0;
    for (const ball of state.balls) {
      if (!ball.stuck && (ball.vx || ball.vy)) {
        const tailX = ball.x - ball.vx * 0.035;
        const tailY = ball.y - ball.vy * 0.035;
        const trail = ctx.createLinearGradient(tailX, tailY, ball.x, ball.y);
        if (smashing) {
          trail.addColorStop(0, 'rgba(255,210,62,0)');
          trail.addColorStop(1, 'rgba(255,210,62,0.8)');
        } else {
          trail.addColorStop(0, 'rgba(127,231,255,0)');
          trail.addColorStop(1, 'rgba(127,231,255,0.7)');
        }
        ctx.strokeStyle = trail;
        ctx.lineWidth = ball.r * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ball.x, ball.y);
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = smashing ? '#ffd23e' : PALETTE.ballGlow;
      ctx.shadowBlur = (smashing ? 24 : 14) * s;
      ctx.fillStyle = smashing ? '#ffd23e' : PALETTE.ball;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      if (smashing) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,210,62,0.7)';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r + 4 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawTexts(state) {
    const s = scale();
    for (const item of state.texts) {
      ctx.globalAlpha = Math.max(0, item.life / item.maxLife);
      text(item.text, item.x, item.y, 15 * s, item.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(state, ui) {
    const s = scale();
    const pad = 18 * s;
    text('SCORE', pad, 16 * s, 11 * s, PALETTE.muted, 'left', 700);
    text(String(state.score).padStart(6, '0'), pad, 36 * s, 24 * s, PALETTE.text, 'left', 800);
    // SMASH meter: fills as bricks break; a full meter flashes PRESS X.
    const meterFull = state.charge >= SMASH.maxCharge;
    const meterX = pad + 48 * s;
    const meterW = 96 * s;
    text('SMASH', pad, 56 * s, 10 * s, meterFull ? PALETTE.gold : PALETTE.muted, 'left', 800);
    roundedPath(ctx, meterX, 52 * s, meterW, 8 * s, 4 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    if (state.charge > 0) {
      roundedPath(ctx, meterX, 52 * s, Math.max(8 * s, (meterW * state.charge) / SMASH.maxCharge), 8 * s, 4 * s);
      ctx.fillStyle = PALETTE.gold;
      ctx.globalAlpha = meterFull ? 0.65 + 0.35 * Math.sin(state.time * 6) : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (meterFull) {
      text('PRESS X!', meterX + meterW + 10 * s, 56 * s, 11 * s, PALETTE.gold, 'left', 800, 0.7 + 0.3 * Math.sin(state.time * 6));
    }
    if (state.streak >= 3) {
      text(`COMBO x${Math.min(state.streak, 10)}`, pad, 76 * s, 13 * s, PALETTE.gold, 'left', 800);
    }
    // The hero title pill (staged shot 1) takes the top centre, so the
    // BEST readout steps aside there; the real title screen never sets
    // heroTitle and is untouched.
    if (!state.heroTitle) {
      text('BEST', width / 2, 16 * s, 11 * s, PALETTE.muted, 'center', 700);
      text(String(Math.max(ui.best, state.score)).padStart(6, '0'), width / 2, 36 * s, 24 * s, PALETTE.text, 'center', 800);
    }
    text(`LEVEL ${state.level}`, width - pad, 16 * s, 11 * s, PALETTE.muted, 'right', 700);
    for (let i = 0; i < state.lives; i += 1) {
      drawHeart(ctx, width - pad - 10 * s - i * 22 * s, 40 * s, 15 * s, PALETTE.danger);
    }
    const hunting =
      !state.cleared && state.breakableLeft > 0 && state.breakableLeft <= HUNT.remaining;
    if (hunting) {
      text(`HUNT — ${state.breakableLeft} LEFT`, width - pad, 80 * s, 12 * s, PALETTE.gold, 'right', 800);
    }
    const timers = [];
    if (state.paddle.wideTimer > 0) timers.push(`WIDE ${Math.ceil(state.paddle.wideTimer)}s`);
    if (state.slowTimer > 0) timers.push(`SLOW ${Math.ceil(state.slowTimer)}s`);
    if (timers.length > 0) {
      text(timers.join('   '), width - pad, 62 * s, 12 * s, PALETTE.paddle, 'right', 700);
    }
    text(ui.muted ? 'M: sound off' : 'M: sound on', width - pad, height - 14 * s, 11 * s, PALETTE.muted, 'right', 600);
  }

  function drawOverlay(lines, widthFraction) {
    const s = scale();
    const panelWidth = Math.min(560 * s, width * (widthFraction || 0.86));
    let panelHeight = 36 * s;
    for (const line of lines) panelHeight += line.size * 1.35 + (line.gap || 6) * s;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;
    roundedPath(ctx, x, y, panelWidth, panelHeight, 16 * s);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    let cursorY = y + 30 * s;
    for (const line of lines) {
      if (line.glow) {
        ctx.save();
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 22 * s;
        text(line.text, width / 2, cursorY + line.size / 2, line.size, line.color, 'center', line.weight || 800, line.alpha);
        ctx.restore();
      } else {
        text(line.text, width / 2, cursorY + line.size / 2, line.size, line.color, 'center', line.weight || 700, line.alpha);
      }
      cursorY += line.size * 1.35 + (line.gap || 6) * s;
    }
  }

  function drawHeroTitle() {
    // The staged hero frame (see shots.js): the title shrinks to a slim
    // pill at the top so the live SMASH moment underneath stays the
    // picture, with the one instruction line the frame needs. Only drawn
    // when staging set state.heroTitle; the real title screen is untouched.
    const s = scale();
    const panelW = Math.min(520 * s, width * 0.8);
    const titleSize = 26 * s;
    const lineSize = 13 * s;
    const panelH = titleSize + lineSize + 30 * s;
    const x = (width - panelW) / 2;
    const y = 6 * s;
    roundedPath(ctx, x, y, panelW, panelH, 12 * s);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = PALETTE.paddle;
    ctx.shadowBlur = 18 * s;
    text('NEON BREAKER', width / 2, y + titleSize * 0.95, titleSize, PALETTE.paddle, 'center', 800);
    ctx.restore();
    text('Break every brick — charge SMASH, press X to shatter steel', width / 2, y + titleSize * 1.35 + lineSize * 0.75, lineSize, PALETTE.gold, 'center', 600);
  }

  function blinkAlpha(state) {
    return 0.7 + 0.3 * Math.sin(state.time * 4);
  }

  function draw(state, screen, ui) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = scale();
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackground(state);
    drawBricks(state);
    drawPowerUps(state);
    drawParticles(state);
    drawPaddle(state);
    drawBalls(state);
    drawTexts(state);
    ctx.restore();
    if (screen === SCREEN_TITLE) {
      if (state.heroTitle) {
        drawHud(state, ui);
        drawHeroTitle();
      } else {
        drawOverlay(
          [
            { text: 'NEON BREAKER', size: 52 * s, color: PALETTE.paddle, glow: true, gap: 10 },
            { text: 'Break every brick. Don\'t drop the ball.', size: 16 * s, color: PALETTE.text, weight: 600, gap: 14 },
            { text: 'Move: mouse or ← → arrow keys', size: 14 * s, color: PALETTE.muted, weight: 600, gap: 2 },
            { text: 'Launch / start: Space or click     Pause: P     Sound: M', size: 14 * s, color: PALETTE.muted, weight: 600, gap: 2 },
            { text: 'Catch W (wide), M (multiball), S (slow), + (extra life)', size: 14 * s, color: PALETTE.muted, weight: 600, gap: 2 },
            { text: 'Break bricks to charge SMASH — press X to blast through bricks & steel', size: 14 * s, color: PALETTE.gold, weight: 600, gap: 2 },
            { text: 'Last bricks left? HUNT guides your ball to them', size: 14 * s, color: PALETTE.muted, weight: 600, gap: 14 },
            { text: `BEST  ${String(ui.best).padStart(6, '0')}`, size: 15 * s, color: PALETTE.gold, gap: 10 },
            { text: 'CLICK OR PRESS SPACE TO START', size: 16 * s, color: PALETTE.text, alpha: blinkAlpha(state), gap: 0 },
          ],
          0.86,
        );
      }
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, ui);
      drawOverlay(
        [
          { text: 'PAUSED', size: 40 * s, color: PALETTE.text, glow: true, gap: 10 },
          { text: 'P or click to resume   •   R to restart', size: 15 * s, color: PALETTE.muted, weight: 600, gap: 0 },
        ],
        0.6,
      );
    } else if (screen === SCREEN_CLEAR) {
      drawHud(state, ui);
      drawOverlay(
        [
          { text: `LEVEL ${state.level} CLEAR!`, size: 38 * s, color: PALETTE.gold, glow: true, gap: 8 },
          { text: `Bonus +${ui.bonus}   •   Score ${state.score}`, size: 16 * s, color: PALETTE.text, weight: 600, gap: 12 },
          { text: `Next: Level ${state.level + 1}`, size: 15 * s, color: PALETTE.muted, weight: 600, gap: 8 },
          { text: 'PRESS SPACE FOR THE NEXT LEVEL', size: 15 * s, color: PALETTE.text, alpha: blinkAlpha(state), gap: 0 },
        ],
        0.7,
      );
    } else if (screen === SCREEN_OVER) {
      drawHud(state, ui);
      drawOverlay(
        [
          { text: 'GAME OVER', size: 44 * s, color: PALETTE.danger, glow: true, gap: 10 },
          { text: `Score ${state.score}   •   Best ${Math.max(ui.best, state.score)}`, size: 16 * s, color: PALETTE.text, weight: 600, gap: 8 },
          ...(ui.newBest
            ? [{ text: 'NEW BEST!', size: 17 * s, color: PALETTE.gold, gap: 8 }]
            : []),
          { text: 'PRESS SPACE TO PLAY AGAIN', size: 15 * s, color: PALETTE.text, alpha: blinkAlpha(state), gap: 0 },
        ],
        0.7,
      );
    } else if (screen === SCREEN_WIN) {
      drawHud(state, ui);
      drawOverlay(
        [
          { text: 'YOU WIN!', size: 46 * s, color: PALETTE.gold, glow: true, gap: 10 },
          { text: `You cleared all ${LEVEL_COUNT} levels.`, size: 16 * s, color: PALETTE.text, weight: 600, gap: 8 },
          { text: `Score ${state.score}   •   Best ${Math.max(ui.best, state.score)}`, size: 16 * s, color: PALETTE.text, weight: 600, gap: 8 },
          ...(ui.newBest
            ? [{ text: 'NEW BEST!', size: 17 * s, color: PALETTE.gold, gap: 8 }]
            : []),
          { text: 'PRESS SPACE TO PLAY AGAIN', size: 15 * s, color: PALETTE.text, alpha: blinkAlpha(state), gap: 0 },
        ],
        0.7,
      );
    } else {
      drawHud(state, ui);
      if (state.serving && state.balls.length > 0) {
        text('SPACE OR CLICK TO LAUNCH', width / 2, state.paddle.y - 46 * s, 14 * s, PALETTE.text, 'center', 700, blinkAlpha(state));
      }
    }
  }

  return { resize, draw };
}
