// A small seeded random number generator: the same seed always gives the
// same sequence, which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mix = state;
    mix = Math.imul(mix ^ (mix >>> 15), mix | 1);
    mix ^= mix + Math.imul(mix ^ (mix >>> 7), mix | 61);
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry from `items`, weighted by `weights` (same length), using `random`. */
export function pickWeighted(random, items, weights) {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
