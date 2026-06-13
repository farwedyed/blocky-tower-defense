// Procedural Web Audio Sound Manager for Blocky Tactical Defense (BTD 2D)
// All sounds synthesized natively — zero network requests, zero CORS issues.

class SoundManager {
  constructor() {
    this.enabled = true;
    this.masterVolume = 0.5;
    this._ctx = null;
    this._lastPlayed = {};

    const resume = () => {
      if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
      if (!this._ctx) this._initContext();
    };
    document.addEventListener('click',     resume, { once: false });
    document.addEventListener('touchstart', resume, { once: false, passive: true });
    document.addEventListener('keydown',   resume, { once: false });
  }

  _initContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this._ctx = new AudioContext();
    } catch (e) {
      console.info('[SoundManager] AudioContext unavailable:', e.message);
    }
  }

  _getCtx() {
    if (!this._ctx) this._initContext();
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  _canPlay(key, minGapMs = 80) {
    if (!this.enabled) return false;
    const now = performance.now();
    if (this._lastPlayed[key] && now - this._lastPlayed[key] < minGapMs) return false;
    this._lastPlayed[key] = now;
    return true;
  }

  _makeOsc(type, freqStart, freqEnd, duration, gainPeak, gainEnd = 0.0001) {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), now + duration);
    const gain = ctx.createGain();
    const vol = gainPeak * this.masterVolume;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd * this.masterVolume, 0.0001), now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // ── playPlace: solid wood-like thud ─────────────────────────────────────
  playPlace() {
    if (!this._canPlay('place', 120)) return;
    this._makeOsc('triangle', 150, 0.01, 0.15, 0.9);
  }

  // ── playUpgrade: cheerful upward retro chime (C4 E4 G4 C5) ────────────
  playUpgrade() {
    if (!this._canPlay('upgrade', 200)) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.055;
      const dur = 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      const gain = ctx.createGain();
      const vol = 0.55 * this.masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    });
  }

  // ── playShoot: fast physical zap (800→50Hz, 0.08s) ─────────────────────
  playShoot() {
    if (!this._canPlay('shoot', 85)) return;
    this._makeOsc('sine', 800, 50, 0.08, 0.22);
  }

  // ── playCrateDrop: deep bass-heavy triangle sweep 90→0.01Hz, 0.3s ───────
  playCrateDrop() {
    if (!this._canPlay('crateDropAudio', 400)) return;
    this._makeOsc('triangle', 90, 0.01, 0.30, 1.0);
  }

  // ── playCrateReveal: magical sine sweep 440→1200Hz, 0.4s ─────────────────
  playCrateReveal() {
    if (!this._canPlay('crateReveal', 400)) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.40;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(1200, now + dur);
    const gain = ctx.createGain();
    const vol = 0.55 * this.masterVolume;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.setValueAtTime(vol, now + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // ── playTick: rapid high-pitched coin/score tick (1800→1000Hz, 0.02s) ───
  playTick() {
    if (!this._canPlay('tick', 30)) return;
    this._makeOsc('sine', 1800, 1000, 0.02, 0.18);
  }

  // ── playVictory: triumphant major-scale fanfare (C4…C6 arpeggio) ─────────
  playVictory() {
    if (!this._canPlay('victory', 1000)) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.08;
      const dur = 0.30;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.setValueAtTime(freq, now + dur * 0.7);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.01, now + dur);
      const gain = ctx.createGain();
      const vol = 0.5 * this.masterVolume;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    });
  }

  // ── playDefeat: dissonant descending sawtooth rumble (180→45Hz, 0.8s) ────
  playDefeat() {
    if (!this._canPlay('defeat', 1000)) return;
    this._makeOsc('sawtooth', 180, 45, 0.8, 0.45);
  }

  // ── Public toggles ─────────────────────────────────────────────────────
  setEnabled(val) { this.enabled = !!val; }
  setVolume(v)    { this.masterVolume = Math.min(1.0, Math.max(0, v)); }
}

export const soundManager = new SoundManager();
