// Original synthwave background loop for Neon Breaker, synthesised with
// WebAudio: no audio file is loaded, so the game stays silent on the
// network and works fully offline. A lookahead scheduler queues one 4-bar
// loop (Am – F – C – G at 112 BPM) in 16th-note steps; layers join as the
// level rises, so later levels sound busier without changing the tune:
// level 1 is pad + bass, 2 adds the arpeggio, 3 the kick, 4 the hats,
// 5 a quiet octave shimmer on the arpeggio. The loop is seamless by
// construction: every step is scheduled on the same absolute time grid.
// The music bus sits under the sound effects, and muting silences both.

const BPM = 112;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const STEPS_PER_BAR = 16;
const BARS = 4;
const LOOP_STEPS = STEPS_PER_BAR * BARS;
const BUS_GAIN = 0.22;
const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of playback
const TICK_MS = 25;

// Chord tones in Hz. One chord per bar: Am, F, C, G.
const CHORDS = [
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // Am: A3 C4 E4
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F:  F3 A3 C4
  { root: 130.81, tones: [261.63, 329.63, 392.0] }, // C:  C4 E4 G4
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G:  G3 B3 D4
];
// Bass walks the root in 8ths: 0 = root, 1 = root an octave up.
const BASS_PATTERN = [0, 0, 1, 0, 0, 1, 0, 1];
// Arpeggio cycles the chord tones up and back down; index 3 is the
// root an octave up.
const ARP_PATTERN = [0, 1, 2, 3, 2, 1];

export function createMusic(context, destination) {
  const bus = context.createGain();
  bus.gain.value = BUS_GAIN;
  bus.connect(destination);

  let timer = null;
  let playing = false;
  let muted = false;
  let level = 1;
  let step = 0;
  let nextTime = 0;
  let notesScheduled = 0;
  let noiseCache = null;
  const active = new Set();

  function track(source) {
    active.add(source);
    source.onended = () => active.delete(source);
  }

  /** One oscillator note through the music bus. */
  function note({ frequency, endFrequency, time, duration, type, volume, filter, detune, attack }) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (detune) oscillator.detune.setValueAtTime(detune, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + (attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    let head = oscillator;
    if (filter) {
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = filter;
      oscillator.connect(lowpass);
      head = lowpass;
    }
    head.connect(gain);
    gain.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
    track(oscillator);
    notesScheduled += 1;
  }

  function padNote(frequency, time, duration) {
    // Two detuned saws per chord tone, slow swell, so the chord breathes in.
    [-6, 6].forEach((cents) => {
      note({ frequency, time, duration, type: 'sawtooth', volume: 0.05, filter: 1100, detune: cents, attack: 0.4 });
    });
  }

  function bassNote(frequency, time, duration) {
    note({ frequency, time, duration, type: 'sawtooth', volume: 0.16, filter: 480 });
  }

  function arpNote(frequency, time, duration, volume) {
    note({ frequency, time, duration, type: 'triangle', volume: volume || 0.06 });
  }

  function kick(time) {
    note({ frequency: 130, endFrequency: 45, time, duration: 0.14, type: 'sine', volume: 0.28 });
  }

  function noiseBuffer() {
    if (noiseCache) return noiseCache;
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache = buffer;
    return buffer;
  }

  function hat(time) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer();
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 6000;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    source.connect(highpass);
    highpass.connect(gain);
    gain.connect(bus);
    source.start(time);
    source.stop(time + 0.08);
    track(source);
    notesScheduled += 1;
  }

  function scheduleStep(currentStep, time) {
    const bar = Math.floor(currentStep / STEPS_PER_BAR) % BARS;
    const inBar = currentStep % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    if (inBar === 0) {
      chord.tones.forEach((frequency) => padNote(frequency, time, STEPS_PER_BAR * STEP));
    }
    if (inBar % 2 === 0) {
      const up = BASS_PATTERN[inBar / 2];
      bassNote(chord.root * (up ? 2 : 1), time, STEP * 1.8);
    }
    if (level >= 2) {
      const arpIndex = ARP_PATTERN[currentStep % ARP_PATTERN.length];
      const frequency = arpIndex === 3 ? chord.tones[0] * 2 : chord.tones[arpIndex];
      arpNote(frequency, time, STEP * 0.9);
      if (level >= 5) arpNote(frequency * 2, time, STEP * 0.9, 0.035);
    }
    if (level >= 3 && inBar % 4 === 0) kick(time);
    if (level >= 4 && inBar % 4 === 2) hat(time);
  }

  function tick() {
    if (!context || context.state !== 'running' || muted) {
      // Idle without scheduling: keep the clock fresh so resuming never
      // fires a catch-up burst of queued steps.
      if (context) nextTime = Math.max(nextTime, context.currentTime + 0.1);
      return;
    }
    while (nextTime < context.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % LOOP_STEPS;
    }
  }

  return {
    get playing() {
      return playing;
    },
    get level() {
      return level;
    },
    /** Notes scheduled since creation: the test hook that proves the loop runs. */
    get notesScheduled() {
      return notesScheduled;
    },
    /** Current bus gain: 0 while muted, BUS_GAIN otherwise. */
    get busGain() {
      return bus.gain.value;
    },
    setLevel(nextLevel) {
      level = Math.max(1, Math.min(5, Math.floor(nextLevel) || 1));
    },
    setMuted(nextMuted) {
      muted = nextMuted;
      bus.gain.setTargetAtTime(muted ? 0 : BUS_GAIN, context.currentTime, 0.03);
    },
    start(nextLevel) {
      if (nextLevel) this.setLevel(nextLevel);
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (playing) return;
      playing = true;
      step = 0;
      nextTime = context.currentTime + 0.08;
      timer = setInterval(tick, TICK_MS);
      tick();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      playing = false;
      active.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped: nothing to silence.
        }
      });
      active.clear();
    },
  };
}
