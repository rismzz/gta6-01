// Synthesized sound, no audio files: engine hum, sirens, shots, punches, pickups.
// Everything is guarded — a headless browser or a denied AudioContext must never
// break the game. Audio starts only after the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 780;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!started || muted) return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Silence is fine; the game never depends on sound.
    }
  }

  function noise(dur, vol, freq = 1200) {
    if (!started || muted) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    } catch {
      // Silence is fine.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.22;
      return muted;
    },
    engine(speed01, on) {
      if (!started || muted) return;
      try {
        engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
      } catch {
        // Ignore.
      }
    },
    siren(on) {
      if (!started || muted) return;
      try {
        sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.2);
      } catch {
        // Ignore.
      }
    },
    shoot() {
      noise(0.14, 0.5, 900);
    },
    punch() {
      noise(0.08, 0.35, 500);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.4);
      blip(990, 0.14, 'sine', 0.35, 0.08);
    },
    mission() {
      blip(523, 0.12, 'triangle', 0.4);
      blip(659, 0.12, 'triangle', 0.4, 0.1);
      blip(784, 0.22, 'triangle', 0.45, 0.2);
    },
    busted() {
      blip(392, 0.18, 'square', 0.3);
      blip(311, 0.3, 'square', 0.3, 0.16);
    },
    crash() {
      noise(0.25, 0.45, 300);
    },
  };
}
