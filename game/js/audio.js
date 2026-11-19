// audio.js — every sound in Coral Bay is synthesized with WebAudio; the game ships no audio files.
// A tiny synth engine: oscillators and filtered noise, a mellow synthwave music loop, positional
// sirens for police cars, and an engine hum whose pitch follows the player's speed.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = 0;
    this.chordStep = 0;
    this.started = false;
    this.muted = false;
  }

  // Browsers only allow audio after a gesture; main calls this from the first click/keypress.
  start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.started = true;
    this.startEngine();
    this.startSiren();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  blip(freq, dur, type = 'square', vol = 0.2, slideTo = null, dest = null) {
    if (!this.started || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(dest || this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.25, filterFreq = 1200, type = 'bandpass') {
    if (!this.started || this.muted) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  }

  // --- one-shot effects -------------------------------------------------
  punch() { this.noise(0.09, 0.3, 500, 'lowpass'); this.blip(120, 0.08, 'sine', 0.25, 60); }
  gunshot() { this.noise(0.14, 0.5, 2600, 'highpass'); this.blip(220, 0.1, 'sawtooth', 0.22, 40); }
  dryFire() { this.blip(900, 0.04, 'square', 0.12); }
  cash() { this.blip(880, 0.09, 'square', 0.16); setTimeout(() => this.blip(1320, 0.14, 'square', 0.16), 70); }
  phone() { this.blip(1046, 0.12, 'sine', 0.18); setTimeout(() => this.blip(1046, 0.12, 'sine', 0.18), 180); }
  objective() { this.blip(660, 0.1, 'triangle', 0.2); setTimeout(() => this.blip(990, 0.16, 'triangle', 0.2), 90); }
  fail() { this.blip(320, 0.22, 'sawtooth', 0.18, 140); }
  crash(intensity = 1) { this.noise(0.25, 0.3 * intensity, 700, 'lowpass'); this.blip(90, 0.2, 'sine', 0.3 * intensity, 45); }
  splash() { this.noise(0.4, 0.2, 900, 'bandpass'); }
  door() { this.blip(180, 0.07, 'square', 0.14, 120); this.noise(0.05, 0.1, 800); }
  pickup() { this.blip(740, 0.08, 'triangle', 0.2, 1180); }
  checkpoint() { this.blip(523, 0.09, 'triangle', 0.2); setTimeout(() => this.blip(784, 0.13, 'triangle', 0.2), 80); }
  horn() { this.blip(370, 0.28, 'square', 0.12); this.blip(466, 0.28, 'square', 0.1); }

  // --- continuous voices: engine and siren ------------------------------
  startEngine() {
    const t = this.now();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    this.engineFilter = filter;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(t);
  }

  // speedRatio 0..1 of the car's top speed; silent when the player is on foot.
  setEngine(speedRatio, inCar) {
    if (!this.started) return;
    const target = inCar && !this.muted ? 0.05 + Math.abs(speedRatio) * 0.075 : 0;
    const t = this.now();
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 128, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + Math.abs(speedRatio) * 900, t, 0.1);
  }

  startSiren() {
    const t = this.now();
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(t);
  }

  // nearest: distance in metres to the nearest police car (Infinity when none is close).
  setSiren(nearest, time) {
    if (!this.started) return;
    const t = this.now();
    if (!isFinite(nearest) || nearest > 90 || this.muted) {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    const vol = 0.028 + 0.1 * (1 - nearest / 90);
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.1);
    const wail = 700 + Math.sin(time * 2.4) * 190;
    this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
  }

  // --- the music loop -----------------------------------------------------
  // A lazy synthwave progression (Am – F – C – G) with a soft bass pulse, advanced by update().
  updateMusic(dt, intensity) {
    if (!this.started || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.46;
    const chords = [
      [110.0, 220.0, 261.6, 329.6],   // Am
      [87.3, 174.6, 220.0, 261.6],    // F
      [98.0, 196.0, 246.9, 293.7],    // G-ish colour
      [130.8, 261.6, 329.6, 392.0],   // C
    ];
    const chord = chords[this.chordStep % chords.length];
    const beat = this.chordStep % 8;
    if (beat === 0) {
      for (let i = 1; i < chord.length; i++) {
        this.blip(chord[i], 1.7, 'triangle', 0.05 + intensity * 0.02, null, this.musicGain);
      }
    }
    this.blip(chord[0], 0.4, 'sine', 0.22, null, this.musicGain);
    if (beat % 2 === 0) this.noise(0.03, 0.03 + intensity * 0.015, 6000, 'highpass');
    this.chordStep++;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }
}
