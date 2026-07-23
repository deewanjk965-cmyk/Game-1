/**
 * Audio.js
 * --------
 * Tiny WebAudio helper. Part 2 only needs a car horn, so rather than pull in
 * audio files we synthesize a short two-tone beep with an oscillator. This is
 * zero-asset, zero-network, and a good stand-in until real SFX arrive.
 *
 * Mobile browsers block audio until the first user gesture, so the context is
 * created lazily on the first `horn()` call (which is always a button tap).
 */

export class Audio {
  constructor() {
    this.ctx = null;
  }

  _ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    // Resume if the browser auto-suspended it.
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Play a short car-horn beep. */
  horn() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Two detuned oscillators give the horn a fuller, less pure tone.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.setValueAtTime(0.25, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    gain.connect(ctx.destination);

    for (const freq of [370, 466]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.33);
    }
  }
}
