// src/fx/fx-ui.js
// DOM juice layer: coins that fly into the cash counter, HUD count-up / pulse / shake,
// wave banners, the red "life lost" vignette. Everything animates transform/opacity only
// (Web Animations API), DOM nodes are pooled and layout is read only on resize.

const COIN_POOL = 28;

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function injectStyles() {
  if (document.getElementById('fx-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'fx-ui-styles';
  s.textContent = `
#fx-layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:9000;}
.fx-coin-x{position:fixed;left:0;top:0;will-change:transform;pointer-events:none;display:none;}
.fx-coin-y{will-change:transform;}
.fx-coin{width:22px;height:22px;border-radius:50%;box-sizing:border-box;
  background:radial-gradient(circle at 35% 30%,#fff7c2 0 18%,#ffd23f 19% 62%,#e09b00 63% 100%);
  border:2.5px solid #3d2b00;box-shadow:inset -2px -2px 0 rgba(0,0,0,.18);
  display:flex;align-items:center;justify-content:center;font:900 12px 'Fredoka',sans-serif;color:#8a5a00;}
#fx-vignette{position:fixed;inset:0;pointer-events:none;z-index:8999;opacity:0;
  background:radial-gradient(ellipse at center,rgba(255,40,40,0) 55%,rgba(255,30,30,.55) 100%);}
#fx-vignette.low{background:radial-gradient(ellipse at center,rgba(255,40,40,0) 60%,rgba(200,0,0,.5) 100%);}
.fx-banner{position:absolute;left:0;right:0;top:34%;display:flex;flex-direction:column;align-items:center;
  pointer-events:none;z-index:50;}
.fx-banner-ribbon{position:absolute;left:0;right:0;top:50%;height:86px;transform:translateY(-50%);
  background:rgba(17,17,17,.82);border-top:5px solid var(--fx-c,#ffd23f);border-bottom:5px solid var(--fx-c,#ffd23f);}
.fx-banner-text{position:relative;font:900 64px 'Fredoka','Nunito',sans-serif;letter-spacing:2px;
  color:var(--fx-c,#ffd23f);-webkit-text-stroke:3px #111;paint-order:stroke fill;
  text-shadow:0 5px 0 #111,0 0 18px rgba(0,0,0,.35);white-space:nowrap;}
.fx-banner-sub{position:relative;margin-top:4px;font:900 30px 'Fredoka',sans-serif;color:#fff;
  -webkit-text-stroke:2px #111;paint-order:stroke fill;text-shadow:0 3px 0 #111;}
.fx-hud-pop{display:inline-block;}
.fx-gold-up{color:#7cff6b !important;text-shadow:0 0 10px rgba(124,255,107,.75) !important;}
.fx-gold-down{color:#ff6b6b !important;}
.fx-float{position:fixed;left:0;top:0;pointer-events:none;z-index:9001;font:900 20px 'Fredoka',sans-serif;
  -webkit-text-stroke:2px #111;paint-order:stroke fill;text-shadow:0 2px 0 #111;white-space:nowrap;}
`;
  document.head.appendChild(s);
}

export const FXUI = {
  _ready: false,
  layer: null,
  coins: [],
  _freeCoins: [],
  inFlightValue: 0,
  shownGold: null,
  targetGold: 0,
  _goldEl: null,
  _goldIcon: null,
  _livesBox: null,
  _livesIcon: null,
  _canvasRect: null,
  _goldRect: null,
  _rectAge: 0,
  _lastPulse: 0,
  _chingStep: 0,
  _chingTime: 0,
  audio: null,           // set by fx.js (sound helpers)
  settings: null,        // set by fx.js

  init() {
    if (this._ready) return;
    this._ready = true;
    injectStyles();
    this.layer = el('div', '', document.body);
    this.layer.id = 'fx-layer';
    this.vignette = el('div', '', document.body);
    this.vignette.id = 'fx-vignette';
    for (let i = 0; i < COIN_POOL; i++) {
      const x = el('div', 'fx-coin-x', this.layer);
      const y = el('div', 'fx-coin-y', x);
      const c = el('div', 'fx-coin', y);
      c.textContent = '$';
      const rec = { x, y, c, busy: false, value: 0, anims: [] };
      this.coins.push(rec);
      this._freeCoins.push(rec);
    }
    window.addEventListener('resize', () => { this._canvasRect = null; this._goldRect = null; });
  },

  _els() {
    if (!this._goldEl || !this._goldEl.isConnected) this._goldEl = document.getElementById('hud-gold-val');
    if (!this._goldIcon || !this._goldIcon.isConnected) {
      const box = document.getElementById('hud-gold');
      this._goldIcon = box ? (box.querySelector('.hud-icon') || box) : null;
    }
    if (!this._livesBox || !this._livesBox.isConnected) {
      this._livesBox = document.getElementById('hud-lives');
      this._livesIcon = this._livesBox ? (this._livesBox.querySelector('.hud-icon') || this._livesBox) : null;
    }
  },

  _rects(force) {
    const now = performance.now();
    if (!force && this._canvasRect && this._goldRect && now - this._rectAge < 1500) return true;
    this._els();
    const canvas = document.getElementById('game-canvas');
    if (!canvas || !this._goldIcon) return false;
    this._canvasRect = canvas.getBoundingClientRect();
    const g = this._goldIcon.getBoundingClientRect();
    this._goldRect = { x: g.left + g.width / 2, y: g.top + g.height / 2, w: g.width };
    this._rectAge = now;
    return this._canvasRect.width > 0;
  },

  // Canvas (800x600 logical) -> screen px
  toScreen(x, y) {
    const r = this._canvasRect;
    return { x: r.left + x * r.width / 800, y: r.top + y * r.height / 600 };
  },

  // ─── Money ───
  /** Called by updateHUD instead of writing the text directly. */
  setGoldTarget(gold) {
    this.init();
    this._els();
    this.targetGold = gold;
    if (this.shownGold === null || !this._matchActive) {
      this.shownGold = gold;
      this.inFlightValue = 0;
      this._writeGold(gold);
    }
  },

  setMatchActive(on) {
    this._matchActive = !!on;
    if (!on) {
      this.inFlightValue = 0;
      for (const c of this.coins) this._freeCoin(c);
      if (this.vignette) this.vignette.style.opacity = '0';
    }
    this.shownGold = this.targetGold;
    this._writeGold(this.targetGold);
    this._canvasRect = null;
  },

  _writeGold(v) {
    if (!this._goldEl) return;
    const r = Math.round(v);
    if (this._lastWritten === r) return;
    this._lastWritten = r;
    this._goldEl.textContent = '$' + r;
  },

  /** Fly coins worth `value` from canvas point (x,y) into the cash counter. */
  coinsFrom(x, y, value, count) {
    if (!this._matchActive || value <= 0) return;
    if (!this._rects()) return;
    const n = Math.max(1, Math.min(count || 1, 6));
    const per = value / n;
    const p = this.toScreen(x, y);
    const scale = Math.max(0.7, Math.min(1.5, this._canvasRect.width / 1100));
    for (let i = 0; i < n; i++) {
      let rec = this._freeCoins.pop();
      if (!rec) {
        // Pool exhausted: merge the value into a coin already flying
        const busy = this.coins.find(c => c.busy);
        if (busy) { busy.value += per; this.inFlightValue += per; }
        continue;
      }
      this._launch(rec, p.x + (Math.random() - 0.5) * 18 * scale, p.y + (Math.random() - 0.5) * 10 * scale, per, i * 45, scale);
    }
  },

  _launch(rec, sx, sy, value, delay, scale) {
    rec.busy = true;
    rec.value = value;
    this.inFlightValue += value;
    const tx = this._goldRect.x - 11, ty = this._goldRect.y - 11;
    const x0 = sx - 11, y0 = sy - 11;
    const dur = 560 + Math.random() * 160;
    rec.x.style.display = 'block';
    rec.x.style.transform = `translateX(${x0}px)`;
    rec.y.style.transform = `translateY(${y0}px)`;
    const pop = 34 * scale;
    // X eases in (slow start), Y pops up then dives: together they make a nice arc
    const ax = rec.x.animate(
      [{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x0}px)`, offset: 0.22 }, { transform: `translateX(${tx}px)` }],
      { duration: dur, delay, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
    const ay = rec.y.animate(
      [{ transform: `translateY(${y0}px) scale(${0.4 * scale})` },
       { transform: `translateY(${y0 - pop}px) scale(${1.15 * scale})`, offset: 0.22, easing: 'cubic-bezier(.3,0,.8,.6)' },
       { transform: `translateY(${ty}px) scale(${0.75 * scale})` }],
      { duration: dur, delay, easing: 'linear', fill: 'forwards' });
    rec.anims = [ax, ay];
    ay.onfinish = () => this._land(rec);
  },

  _freeCoin(rec) {
    if (!rec.busy) return;
    rec.busy = false;
    for (const a of rec.anims) { try { a.cancel(); } catch (e) {} }
    rec.anims = [];
    rec.x.style.display = 'none';
    this._freeCoins.push(rec);
  },

  _land(rec) {
    this.inFlightValue = Math.max(0, this.inFlightValue - rec.value);
    this._freeCoin(rec);
    this.pulseGold(true);
    // Rising "ching" pitch when coins land in quick succession
    const now = performance.now();
    this._chingStep = now - this._chingTime < 260 ? Math.min(this._chingStep + 1, 7) : 0;
    this._chingTime = now;
    if (this.audio) this.audio.ching(this._chingStep);
  },

  pulseGold(up) {
    this._els();
    const now = performance.now();
    if (now - this._lastPulse < 90) return;
    this._lastPulse = now;
    if (this._goldIcon && this._goldIcon.animate) {
      this._goldIcon.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'scale(1)' }],
        { duration: 230, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    if (this._goldEl) {
      const cls = up ? 'fx-gold-up' : 'fx-gold-down';
      this._goldEl.classList.add(cls);
      clearTimeout(this._goldClsT);
      this._goldClsT = setTimeout(() => {
        this._goldEl && this._goldEl.classList.remove('fx-gold-up', 'fx-gold-down');
      }, 260);
    }
  },

  shakeGold() {
    this._els();
    const box = document.getElementById('hud-gold');
    if (box && box.animate) {
      box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    }
    this.pulseGold(false);
  },

  /** Per frame (real time): ease the shown number toward gold minus coins still flying. */
  update(realDt) {
    if (!this._ready || !this._matchActive) return;
    const goal = this.targetGold - this.inFlightValue;
    if (this.shownGold === null) this.shownGold = goal;
    const diff = goal - this.shownGold;
    if (Math.abs(diff) < 0.5) this.shownGold = goal;
    else this.shownGold += diff * (1 - Math.exp(-(diff < 0 ? 22 : 12) * realDt));
    this._writeGold(this.shownGold);
  },

  // ─── Lives ───
  lifeLost(amount, lowHp) {
    this._els();
    if (this._livesBox && this._livesBox.animate) {
      this._livesBox.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' },
        { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 320 });
    }
    if (this._livesIcon && this._livesIcon.animate) {
      this._livesIcon.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
        { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    const now = performance.now();
    if (this.vignette && now - (this._lastVig || 0) > 600) {
      this._lastVig = now;
      const reduce = this.settings && this.settings.reduceFlash;
      const peak = Math.min(reduce ? 0.35 : 0.85, 0.45 + amount * 0.08);
      this.vignette.animate([{ opacity: 0 }, { opacity: peak, offset: 0.18 }, { opacity: 0 }],
        { duration: 520, easing: 'ease-out' });
    }
    // floating "-N"
    const box = this._livesBox;
    if (box) {
      const r = box.getBoundingClientRect();
      this.floatText(r.left + r.width * 0.65, r.top + r.height * 0.5, `-${amount}`, '#ff5a5a', 1);
    }
  },

  floatText(x, y, text, color, dir) {
    const n = el('div', 'fx-float', document.body);
    n.textContent = text;
    n.style.color = color;
    n.style.transform = `translate(${x}px,${y}px)`;
    const a = n.animate([
      { transform: `translate(${x}px,${y}px) scale(.6)`, opacity: 1 },
      { transform: `translate(${x}px,${y + 8 * dir}px) scale(1.25)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${x}px,${y + 34 * dir}px) scale(1)`, opacity: 0 }],
      { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    a.onfinish = () => n.remove();
  },

  // ─── Banners (crisp DOM text instead of blurry canvas text) ───
  banner(text, color = '#ffd23f', sub = '') {
    this.init();
    const host = document.getElementById('canvas-container');
    if (!host) return false;
    if (this._banner) { try { this._banner.remove(); } catch (e) {} }
    const b = el('div', 'fx-banner', host);
    b.style.setProperty('--fx-c', color);
    const rib = el('div', 'fx-banner-ribbon', b);
    const t = el('div', 'fx-banner-text', b);
    t.textContent = text;
    if (sub) { const s = el('div', 'fx-banner-sub', b); s.textContent = sub; }
    this._banner = b;
    const reduce = this.settings && this.settings.reduceFlash;
    rib.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    t.animate(reduce
      ? [{ transform: 'scale(1.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
      : [{ transform: 'scale(2.6) rotate(-7deg)', opacity: 0 }, { transform: 'scale(.92) rotate(1deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
      { duration: 260, delay: 90, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'backwards' });
    const out = b.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-40px)' }],
      { duration: 320, delay: 1650, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => { if (b.isConnected) b.remove(); if (this._banner === b) this._banner = null; };
    return true;
  }
};
