// Synthesised sound only: every effect is an oscillator or filtered noise made
// in WebAudio, so the game ships no audio files. All calls are safe before
// init (no user gesture yet) and safe when audio is muted.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* audio is cosmetic */ }
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* audio is cosmetic */ }
  }

  return {
    init,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    /** Continuous engine hum: speed01 is 0..1, on is false on foot. */
    engine(speed01, on) {
      if (!ctx || muted) return;
      try {
        engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(45 + speed01 * 140, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    siren(on) {
      if (!ctx) return;
      try {
        sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.2);
        if (on && !sirenTimer) {
          let high = false;
          sirenTimer = window.setInterval(() => {
            high = !high;
            try { sirenOsc.frequency.setTargetAtTime(high ? 950 : 650, ctx.currentTime, 0.05); } catch { /* ignore */ }
          }, 450);
        } else if (!on && sirenTimer) {
          window.clearInterval(sirenTimer);
          sirenTimer = null;
        }
      } catch { /* ignore */ }
    },
    pickup() { tone(880, 0.12, 'sine', 0.25, 1320); },
    coin() { tone(1200, 0.08, 'square', 0.12); tone(1600, 0.1, 'square', 0.1); },
    shot() { noise(0.12, 0.4, 2500); },
    crash() { noise(0.25, 0.5, 500); tone(90, 0.2, 'sine', 0.3, 45); },
    mission() { tone(523, 0.15, 'triangle', 0.25); window.setTimeout(() => tone(784, 0.25, 'triangle', 0.25), 140); },
    busted() { tone(220, 0.5, 'sawtooth', 0.2, 110); },
    click() { tone(600, 0.05, 'square', 0.12); },
  };
}
