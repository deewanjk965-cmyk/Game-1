/**
 * AudioManager.js
 * ---------------
 * A zero-asset sound engine built entirely on the Web Audio API — every effect
 * is synthesized at runtime, so there are no audio files to download and it
 * stays 100% CSP-safe inside the Artifact/Pages sandbox.
 *
 * Sounds:
 *   - engine   : a continuous oscillator whose pitch tracks the car's speed
 *   - gunshot  : a short filtered noise burst
 *   - siren    : an alternating two-tone loop while police are engaged
 *   - footstep : a soft low thump
 *   - crash    : a noisy low-end thud
 *   - uiClick  : a tiny blip for buttons
 *
 * Mobile browsers block audio until the first user gesture, so the context is
 * created/resumed on `unlock()` (called from the menu Play button).
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;

    // Persistent voices (created lazily).
    this.engine = null; // { osc, gain }
    this.siren = null; // { oscA, oscB, gain, timer, high }
    this._noiseBuffer = null;
  }

  /** Create/resume the AudioContext (must be called from a user gesture). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this._noiseBuffer = this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // ---- One-shot effects -----------------------------------------------------

  gunshot() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  crash() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter).connect(g).connect(this.master);
    // A low thud under the noise.
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(og).connect(this.master);
    src.start(t);
    src.stop(t + 0.42);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  footstep() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  horn() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.setValueAtTime(0.25, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    g.connect(this.master);
    for (const f of [370, 466]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.33);
    }
  }

  uiClick() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 660;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // ---- Continuous voices ----------------------------------------------------

  /**
   * Start/stop the looping engine and set its pitch from 0..1 speed. Built from
   * two detuned oscillators + an octave for a fuller, more "mechanical" note,
   * shaped by a lowpass filter that opens up as revs climb.
   */
  setEngine(active, speedNorm = 0) {
    if (!this._ready()) return;
    if (active && !this.engine) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      gain.connect(filter).connect(this.master);

      const osc = this.ctx.createOscillator(); // low body
      osc.type = 'sawtooth';
      const osc2 = this.ctx.createOscillator(); // detuned growl
      osc2.type = 'sawtooth';
      osc2.detune.value = 12;
      const osc3 = this.ctx.createOscillator(); // octave whine
      osc3.type = 'square';
      osc.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      osc.start();
      osc2.start();
      osc3.start();
      this.engine = { osc, osc2, osc3, gain, filter };
    }
    if (this.engine) {
      const now = this.ctx.currentTime;
      if (active) {
        const base = 48 + speedNorm * 150; // idle → high rev
        this.engine.osc.frequency.setTargetAtTime(base, now, 0.06);
        this.engine.osc2.frequency.setTargetAtTime(base, now, 0.06);
        this.engine.osc3.frequency.setTargetAtTime(base * 2, now, 0.06);
        this.engine.filter.frequency.setTargetAtTime(500 + speedNorm * 2600, now, 0.1);
        this.engine.gain.gain.setTargetAtTime(0.09 + speedNorm * 0.07, now, 0.1);
      } else {
        this.engine.gain.gain.setTargetAtTime(0, now, 0.1);
      }
    }
  }

  /** Start/stop the police siren loop. */
  setSiren(active) {
    if (!this._ready()) return;
    if (active && !this.siren) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.12;
      gain.connect(this.master);
      const oscA = this.ctx.createOscillator();
      oscA.type = 'square';
      oscA.frequency.value = 640;
      oscA.connect(gain);
      oscA.start();
      this.siren = { osc: oscA, gain, timer: 0, high: true };
    } else if (!active && this.siren) {
      this.siren.osc.stop();
      this.siren.gain.disconnect();
      this.siren = null;
    }
  }

  /** Per-frame updates (siren warble). */
  update(delta) {
    if (this.siren) {
      this.siren.timer += delta;
      if (this.siren.timer > 0.5) {
        this.siren.timer = 0;
        this.siren.high = !this.siren.high;
        this.siren.osc.frequency.setValueAtTime(
          this.siren.high ? 640 : 880,
          this.ctx.currentTime
        );
      }
    }
  }

  // ---- Internals ------------------------------------------------------------

  _ready() {
    return this.ctx && !this.muted && this.master;
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
