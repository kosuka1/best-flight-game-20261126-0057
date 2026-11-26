// audio.js — Skylane Runner's synthesised sound.
//
// No audio files: the engine is a detuned sawtooth pair through a lowpass
// filter, the wind is filtered noise that follows airspeed, and the events
// (ring chime, touchdown thud, crash) are short oscillator envelopes.
// The context starts on the first user gesture, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;

      // Engine: two saws a few cents apart into a lowpass.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.0;
      filter.connect(this.engineGain).connect(ctx.destination);
      this.engineOsc = [];
      for (const detune of [-6, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 62;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start();
        this.engineOsc.push(osc);
      }
      this.engineFilter = filter;

      // Wind: looping noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.0;
      noise.connect(band).connect(this.windGain).connect(ctx.destination);
      noise.start();
    } catch {
      this.ctx = null; // Sound is garnish; the game flies without it.
    }
  }

  // Per-frame levels from the flight state.
  update(plane, flying) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = plane.engineOut ? 0 : 0.35 + plane.throttle * 0.65;
    const freq = 48 + rpm * 66;
    for (const osc of this.engineOsc) osc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 520, t, 0.1);
    this.engineGain.gain.setTargetAtTime(flying ? 0.05 + rpm * 0.075 : 0.0, t, 0.12);
    const wind = Math.min(0.16, Math.max(0, (plane.speed - 20) / 600));
    this.windGain.gain.setTargetAtTime(flying ? wind : 0.0, t, 0.15);
  }

  blip(freqA, freqB, dur = 0.16, gain = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(freqB, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  ringChime() {
    this.blip(880, 880, 0.1, 0.1);
    setTimeout(() => this.blip(1318, 1318, 0.18, 0.1), 85);
  }

  touchdown() {
    this.blip(120, 45, 0.28, 0.2);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(g).connect(ctx.destination);
    src.start(t);
  }
}
