// Procedural Web Audio Sound Manager with Tactical Environmental Ambience for BTD 2D
// All sounds and ambient environmental soundscapes synthesized natively.

class SoundManager {
  constructor() {
    this.enabled = true;
    this.masterVolume = 0.5;
    this._ctx = null;
    this._lastPlayed = {};

    // Ambient state trackers
    this._ambienceStarted = false;
    this._windSource = null;
    this._windModulator = null;
    this._windGain = null;
    this._radarInterval = null;
    this._musicMuted = false;

    const resume = (e) => {
      // ONLY allow genuine user gestures to initialize AudioContext
      if (e && !e.isTrusted) return; 

      try {
        if (!this._ctx) {
          this._initContext();
        }
        if (this._ctx && this._ctx.state === 'suspended') {
          this._ctx.resume().catch(err => {
            console.warn("[SoundManager] Context resume attempt failed:", err);
          });
        }
      } catch (err) {
        console.warn("[SoundManager] Unhandled exception during interaction:", err);
      }
    };
    
    // Bind to physical interactions to unlock Web Audio on mobile engines (especially iOS WebKit)
    document.addEventListener('click', resume, { once: false, passive: true });
    document.addEventListener('touchend', resume, { once: false, passive: true });
    document.addEventListener('keydown', resume, { once: false, passive: true });
  }

  _initContext() {
    if (this._ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this._ctx = new AudioContext();
        console.log("[SoundManager] AudioContext successfully initialized.");
      }
    } catch (e) {
      console.info('[SoundManager] AudioContext unavailable on this environment:', e.message);
    }
  }

  _getCtx() {
    if (!this._ctx) this._initContext();
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(err => {
        console.warn("[SoundManager] AudioContext resume failed inside _getCtx():", err);
      });
    }
    return this._ctx;
  }

  /**
   * Starts the tactical background ambience (called when a match begins)
   */
  startAmbience() {
    if (this._ambienceStarted || !this.enabled || this._musicMuted) return;
    this._ambienceStarted = true;

    const ctx = this._getCtx();
    if (!ctx) return;

    try {
      // 1. Generate Procedural Wind Gust Noise
      const bufferSize = ctx.sampleRate * 2; // 2 seconds of random noise
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter to low frequencies to sound like wind blowing
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180; 
      filter.Q.value = 1.0;

      const gain = ctx.createGain();
      gain.gain.value = 0.04 * this.masterVolume; // Very soft background noise

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start();

      // Oscillate filter frequency slowly to simulate rising and falling wind gusts
      const modulator = ctx.createOscillator();
      modulator.type = 'sine';
      modulator.frequency.value = 0.12; // Modulates once every ~8.3 seconds
      
      const modGain = ctx.createGain();
      modGain.gain.value = 60; // Modulate frequency by +/- 60Hz

      modulator.connect(modGain);
      modGain.connect(filter.frequency);
      modulator.start();

      this._windSource = whiteNoise;
      this._windModulator = modulator;
      this._windGain = gain;

      // 2. Start Subtle Radar Sonar Beeps (Triggers a gentle blip every 6.5 seconds)
      this._startRadarSweeper();

      console.log("[SoundManager] Tactical environmental soundscape successfully deployed.");
    } catch(e) {
      console.warn("[SoundManager] Could not initialize procedural wind: ", e);
    }
  }

  /**
   * Stops the tactical background ambience (called when returning to lobby)
   */
  stopAmbience() {
    this._ambienceStarted = false;
    
    if (this._windSource) {
      try { this._windSource.stop(); } catch(e) {}
      this._windSource = null;
    }
    if (this._windModulator) {
      try { this._windModulator.stop(); } catch(e) {}
      this._windModulator = null;
    }
    if (this._windGain) {
      try { this._windGain.disconnect(); } catch(e) {}
      this._windGain = null;
    }
    if (this._radarInterval) {
      clearInterval(this._radarInterval);
      this._radarInterval = null;
    }
    console.log("[SoundManager] Tactical environmental soundscape stopped.");
  }

  _startRadarSweeper() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const playPing = () => {
      if (!this.enabled || this._musicMuted) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(250, now + 1.5);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.007 * this.masterVolume, now); // Extremely low-volume element
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 1.55);
      } catch(e) {}
    };

    if (this._radarInterval) clearInterval(this._radarInterval);
    this._radarInterval = setInterval(playPing, 6500);
  }

  /**
   * Mute the ambient soundscape during Ads
   */
  muteMusic() {
    this._musicMuted = true;
    if (this._windGain) {
      try {
        this._windGain.gain.setValueAtTime(0, this._ctx.currentTime);
      } catch(e) {}
    }
  }

  /**
   * Unmute the ambient soundscape after Ads
   */
  unmuteMusic() {
    this._musicMuted = false;
    if (this._windGain && this.enabled) {
      try {
        this._windGain.gain.setValueAtTime(0.04 * this.masterVolume, this._ctx.currentTime);
      } catch(e) {}
    }
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
    try {
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
    } catch (e) {
      console.warn("[SoundManager] Failed to synthesize sound effect:", e);
    }
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
    try {
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
    } catch (e) {
      console.warn("[SoundManager] Upgrade audio playback error:", e);
    }
  }

  // ── playShoot: fast physical zap (800→50Hz, 0.08s) ─────────────────────
  playShoot() {
    if (!this._canPlay('shoot', 85)) return;
    this._makeOsc('sine', 800, 50, 0.08, 0.22);
  }

  // ── playCrateDrop: deep triangle sweep ──────────────────────────────────
  playCrateDrop() {
    if (!this._canPlay('crateDropAudio', 400)) return;
    this._makeOsc('triangle', 90, 0.01, 0.30, 1.0);
  }

  // ── playCrateReveal: magical sine sweep 440→1200Hz, 0.4s ─────────────────
  playCrateReveal() {
    if (!this._canPlay('crateReveal', 400)) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
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
    } catch (e) {
      console.warn("[SoundManager] Crate unboxing audio playback error:", e);
    }
  }

  // ── playTick: rapid high-pitched score tick (1800→1000Hz, 0.02s) ───────
  playTick() {
    if (!this._canPlay('tick', 30)) return;
    this._makeOsc('sine', 1800, 1000, 0.02, 0.18);
  }

  // ── playVictory: triumphant major-scale fanfare (C4…C6 arpeggio) ─────────
  playVictory() {
    if (!this._canPlay('victory', 1000)) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
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
    } catch (e) {
      console.warn("[SoundManager] Victory audio playback error:", e);
    }
  }

  // ── playDefeat: descending sawtooth rumble (180→45Hz, 0.8s) ──────────────
  playDefeat() {
    if (!this._canPlay('defeat', 1000)) return;
    this._makeOsc('sawtooth', 180, 45, 0.8, 0.45);
  }

  setEnabled(val) { 
    this.enabled = !!val; 
    if (!this.enabled) {
      this.muteMusic();
    } else {
      this.unmuteMusic();
    }
  }
  
  setVolume(v)    { this.masterVolume = Math.min(1.0, Math.max(0, v)); }
}

export const soundManager = new SoundManager();