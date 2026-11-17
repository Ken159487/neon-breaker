// Particles and floating score texts: the feedback that makes every hit
// feel answered. Both live in plain arrays on the world state so the
// screenshot staging can play them forward like the rest of the game.

export function spawnBurst(particles, x, y, color, count, speed, life) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - speed * 0.25,
      life: life * (0.6 + Math.random() * 0.4),
      maxLife: life,
      size: 2 + Math.random() * 3.5,
      color,
    });
  }
}

export function spawnText(texts, x, y, text, color) {
  texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
}

/** Advance particles and texts by dt seconds, dropping the dead ones. */
export function stepEffects(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 340 * dt;
    particle.life -= dt;
    if (particle.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.texts.length - 1; i >= 0; i -= 1) {
    const text = state.texts[i];
    text.y -= 42 * dt;
    text.life -= dt;
    if (text.life <= 0) state.texts.splice(i, 1);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
}
