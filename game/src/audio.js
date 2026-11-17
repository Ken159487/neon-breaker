// Synthesised sound effects through WebAudio: no audio file is loaded, so
// the game stays silent on the network and works fully offline. The context
// is created on the first user gesture (browsers block audio before that) and
// every play call is a no-op while it is suspended or muted.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  try {
    muted = window.localStorage.getItem('neon-breaker.muted') === '1';
  } catch {
    muted = false;
  }

  function ensureContext() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    return context;
  }

  /** One short tone: an oscillator with a fast attack and an exponential decay. */
  function tone({ frequency, endFrequency, duration, type, volume, delay }) {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    const startAt = ctx.currentTime + (delay || 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type || 'square';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume || 0.5, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.05);
  }

  return {
    /** Call from any user gesture so the context is allowed to start. */
    unlock() {
      ensureContext();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem('neon-breaker.muted', muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      return muted;
    },
    click() {
      tone({ frequency: 660, duration: 0.05, type: 'sine', volume: 0.25 });
    },
    launch() {
      tone({ frequency: 330, endFrequency: 660, duration: 0.12, type: 'sine', volume: 0.35 });
    },
    paddle() {
      tone({ frequency: 210, duration: 0.06, type: 'square', volume: 0.3 });
    },
    wall() {
      tone({ frequency: 160, duration: 0.05, type: 'square', volume: 0.18 });
    },
    brick(hardness, streak) {
      const base = hardness >= 3 ? 520 : hardness === 2 ? 440 : 370;
      // The pitch climbs with the combo, so a hot streak sounds hotter:
      // +4% per streak step, capped at +40% (streak 10).
      const pitch = 1 + Math.min(streak || 0, 10) * 0.04;
      tone({ frequency: base * pitch, duration: 0.07, type: 'triangle', volume: 0.45 });
      tone({ frequency: base * 2 * pitch, duration: 0.05, type: 'sine', volume: 0.2, delay: 0.01 });
    },
    powerUp() {
      tone({ frequency: 523, duration: 0.09, type: 'sine', volume: 0.4 });
      tone({ frequency: 784, duration: 0.12, type: 'sine', volume: 0.4, delay: 0.08 });
    },
    chargeFull() {
      tone({ frequency: 660, duration: 0.08, type: 'sine', volume: 0.35 });
      tone({ frequency: 990, duration: 0.12, type: 'sine', volume: 0.35, delay: 0.07 });
    },
    smash() {
      tone({ frequency: 880, endFrequency: 110, duration: 0.22, type: 'sawtooth', volume: 0.4 });
      tone({ frequency: 1760, duration: 0.06, type: 'square', volume: 0.2 });
    },
    loseLife() {
      tone({ frequency: 320, endFrequency: 90, duration: 0.4, type: 'sawtooth', volume: 0.35 });
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((frequency, i) => {
        tone({ frequency, duration: 0.14, type: 'triangle', volume: 0.4, delay: i * 0.11 });
      });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((frequency, i) => {
        tone({ frequency, duration: 0.22, type: 'triangle', volume: 0.35, delay: i * 0.16 });
      });
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((frequency, i) => {
        tone({ frequency, duration: 0.18, type: 'triangle', volume: 0.4, delay: i * 0.12 });
      });
    },
  };
}
