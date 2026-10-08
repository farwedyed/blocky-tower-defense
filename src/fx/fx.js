// src/fx/fx.js
// World-space game juice for the 800x600 playfield canvas:
//  - pooled particle system (structure of arrays, zero allocations per frame)
//  - pre-rendered blocky sprites (outlined cubes, puffs, stars, ice shards)
//  - sprite variant cache (pre-scaled base + white / ice / fire / red silhouettes)
//  - trauma screen shake, ground decal layer (goo, scorch)
//  - an observer that derives effects from state changes, so host, solo AND co-op clients
//    all see the same juice without extra network events
//  - synthesized sounds (Web Audio) for booms, pops, coins, ice
// Nothing here changes gameplay: it only reads game state and draws.

import { soundManager } from '../sound.js';
import { FXUI } from './fx-ui.js';

// ─── Settings & quality ───
const QUALITY = {
  high:   { cap: 700, chunks: 3, cubes: 8, puffs: 6, sparks: 3, decals: true, motes: true },
  medium: { cap: 380, chunks: 2, cubes: 5, puffs: 4, sparks: 2, decals: true, motes: true },
  low:    { cap: 160, chunks: 0, cubes: 3, puffs: 2, sparks: 1, decals: false, motes: false }
};
const SETTINGS_KEY = 'btd2d_fx_v1';

function loadSettings() {
  let reduced = false;
  try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  const def = {
    quality: (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium',
    shake: reduced ? 0 : 0.8,
    reduceFlash: reduced
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && QUALITY[s.quality]) def.quality = s.quality;
      if (s && typeof s.shake === 'number') def.shake = Math.max(0, Math.min(1, s.shake));
      if (s && typeof s.reduceFlash === 'boolean') def.reduceFlash = s.reduceFlash;
    }
  } catch (e) {}
  return def;
}

export const fxSettings = loadSettings();
let userQuality = fxSettings.quality;   // what the player chose
let Q = QUALITY[fxSettings.quality];    // what we run (adaptive may step down)

export function saveFxSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(fxSettings)); } catch (e) {}
  userQuality = fxSettings.quality;
  Q = QUALITY[fxSettings.quality];
}

// ─── Small helpers ───
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ─── Pre-rendered sprites ───
const PALETTE = [
  '#ffffff', '#ffd23f', '#ff8a1e', '#e8451e', '#5a5a5a', '#8a8a8a',   // 0-5 white, gold, orange, red, smoke, stone
  '#7bc043', '#4e7f2a', '#6a3d8f', '#9fe7ff', '#4fc3f7', '#e8fbff',   // 6-11 goo green/dark/purple, ice
  '#6b4f2a', '#c9a46c', '#8bc34a', '#2a2018', '#fff3b0', '#ff4d4d',   // 12-17 dirt, sand, grass, char, pale gold, danger
  '#7cff6b', '#b86bff', '#3498db', '#e0b23a'                          // 18-21 heal, dj purple, shield blue, brass
];
const C = { WHITE: 0, GOLD: 1, ORANGE: 2, RED: 3, SMOKE: 4, STONE: 5, GOO: 6, GOO_D: 7, GOO_P: 8, ICE: 9, ICE_D: 10, ICE_L: 11,
  DIRT: 12, SAND: 13, GRASS: 14, CHAR: 15, PALE: 16, DANGER: 17, HEAL: 18, DJ: 19, SHIELD: 20, BRASS: 21 };

const SPR = { cubes: [], puff: null, puffGrey: null, puffDark: null, star: null, shard: null, splats: [], scorch: null, ready: false };

function buildSprites() {
  if (SPR.ready) return;
  SPR.ready = true;
  // Outlined bevelled cube, 20px canvas (16px cube + outline room)
  for (const col of PALETTE) {
    const c = mkCanvas(20, 20), x = c.getContext('2d');
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 20, 20);
    x.fillStyle = col; x.fillRect(2, 2, 16, 16);
    x.fillStyle = shade(col, 0.28); x.fillRect(2, 2, 16, 4); x.fillRect(2, 2, 4, 16);
    x.fillStyle = shade(col, -0.25); x.fillRect(2, 14, 16, 4); x.fillRect(14, 2, 4, 16);
    SPR.cubes.push(c);
  }
  const puff = (fill, edge) => {
    const c = mkCanvas(48, 48), x = c.getContext('2d');
    const blobs = [[24, 26, 13], [14, 22, 9], [34, 22, 9], [20, 33, 8], [30, 33, 8]];
    x.fillStyle = '#1b1b1b';
    for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx, by, r + 2.5, 0, TAU); x.fill(); }
    x.fillStyle = edge;
    for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill(); }
    x.fillStyle = fill;
    for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx - 1.5, by - 2, r * 0.78, 0, TAU); x.fill(); }
    return c;
  };
  SPR.puff = puff('#f4f4f4', '#cfd3d8');
  SPR.puffGrey = puff('#9aa0a6', '#6f757b');
  SPR.puffDark = puff('#5a5a5a', '#3d3d3d');
  // 4-point hit star
  {
    const c = mkCanvas(40, 40), x = c.getContext('2d');
    const star = (r1, r2) => {
      x.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? r2 : r1;
        i ? x.lineTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r) : x.moveTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r);
      }
      x.closePath();
    };
    x.fillStyle = '#1b1b1b'; star(19, 7); x.fill();
    x.fillStyle = '#fff7c2'; star(15, 5); x.fill();
    x.fillStyle = '#ffffff'; star(9, 3); x.fill();
    SPR.star = c;
  }
  // Ice shard
  {
    const c = mkCanvas(20, 20), x = c.getContext('2d');
    x.beginPath(); x.moveTo(10, 1); x.lineTo(18, 13); x.lineTo(8, 19); x.lineTo(2, 9); x.closePath();
    x.fillStyle = '#1e5a8c'; x.fill();
    x.beginPath(); x.moveTo(10, 4); x.lineTo(15.5, 12.5); x.lineTo(8.5, 16.5); x.lineTo(4.5, 9); x.closePath();
    x.fillStyle = '#bfefff'; x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(8, 6, 2, 5);
    SPR.shard = c;
  }
  // Goo splats (zombie goo, not blood)
  for (let k = 0; k < 4; k++) {
    const c = mkCanvas(64, 64), x = c.getContext('2d');
    x.fillStyle = k === 3 ? '#5b3a7a' : '#4e7f2a';
    const blobs = 6 + (k * 2);
    x.beginPath(); x.arc(32, 32, 13, 0, TAU); x.fill();
    for (let i = 0; i < blobs; i++) {
      const a = rand(0, TAU), d = rand(10, 24), r = rand(3, 7);
      x.beginPath(); x.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, TAU); x.fill();
    }
    x.fillStyle = k === 3 ? '#6a3d8f' : '#7bc043';
    x.beginPath(); x.arc(30, 30, 9, 0, TAU); x.fill();
    SPR.splats.push(c);
  }
  {
    const c = mkCanvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(30,22,16,0.85)'); g.addColorStop(0.55, 'rgba(42,32,24,0.55)'); g.addColorStop(1, 'rgba(60,45,30,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31, 0, TAU); x.fill();
    SPR.scorch = c;
  }
}

// ─── Sprite variant cache (pre-scaled base + tinted silhouettes) ───
const variantCache = new Map();
export function getVariants(img, drawSize) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  const px = Math.min(256, Math.max(24, Math.round(drawSize * 2 / 8) * 8));
  // Fast path: cache on the image itself (no string building per enemy per frame)
  const own = img._fxv || (img._fxv = {});
  if (own[px]) return own[px];
  const key = img.src + '|' + px;
  let v = variantCache.get(key);
  if (v) { own[px] = v; return v; }
  const base = mkCanvas(px, px), bx = base.getContext('2d');
  bx.imageSmoothingEnabled = true;
  try { bx.imageSmoothingQuality = 'high'; } catch (e) {}
  bx.drawImage(img, 0, 0, px, px);
  const tint = (color) => {
    const c = mkCanvas(px, px), x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color; x.fillRect(0, 0, px, px);
    return c;
  };
  v = { base, px, white: tint('#ffffff'), ice: tint('#7fdcff'), fire: tint('#ff7a1a'), red: tint('#ff3b3b'), dark: tint('#2a2018') };
  variantCache.set(key, v);
  own[px] = v;
  return v;
}

// ─── Particle pool (SoA) ───
const CAP = 720;
const P = {
  x: new Float32Array(CAP), y: new Float32Array(CAP), z: new Float32Array(CAP),
  vx: new Float32Array(CAP), vy: new Float32Array(CAP), vz: new Float32Array(CAP),
  life: new Float32Array(CAP), max: new Float32Array(CAP), size: new Float32Array(CAP), size2: new Float32Array(CAP),
  rot: new Float32Array(CAP), vr: new Float32Array(CAP), drag: new Float32Array(CAP), grav: new Float32Array(CAP),
  sx: new Float32Array(CAP), sy: new Float32Array(CAP), sw: new Float32Array(CAP),
  kind: new Uint8Array(CAP), col: new Uint8Array(CAP), bounce: new Uint8Array(CAP),
  src: new Array(CAP).fill(null)
};
let n = 0;
const K = { CUBE: 1, PUFF: 2, RING: 3, FLASH: 4, CHUNK: 5, SHARD: 6, STAR: 7, FLAME: 8 };
const LOW_PRI = { 1: 1, 2: 1, 7: 1, 8: 1 };   // dropped first when the pool is full

function spawn(kind, x, y, vx, vy, life, size) {
  const cap = Q.cap;
  if (n >= cap) {
    if (LOW_PRI[kind]) return -1;
    // Recycle the oldest low-priority particle
    let j = -1;
    for (let i = 0; i < n; i++) if (LOW_PRI[P.kind[i]]) { j = i; break; }
    if (j < 0) return -1;
    removeAt(j);
  }
  const i = n++;
  P.kind[i] = kind; P.x[i] = x; P.y[i] = y; P.z[i] = 0; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = 0;
  P.life[i] = life; P.max[i] = life; P.size[i] = size; P.size2[i] = size; P.rot[i] = 0; P.vr[i] = 0;
  P.drag[i] = 0; P.grav[i] = 0; P.col[i] = 0; P.bounce[i] = 0; P.src[i] = null;
  return i;
}
function removeAt(i) {
  const last = --n;
  if (i !== last) {
    P.kind[i] = P.kind[last]; P.x[i] = P.x[last]; P.y[i] = P.y[last]; P.z[i] = P.z[last];
    P.vx[i] = P.vx[last]; P.vy[i] = P.vy[last]; P.vz[i] = P.vz[last]; P.life[i] = P.life[last]; P.max[i] = P.max[last];
    P.size[i] = P.size[last]; P.size2[i] = P.size2[last]; P.rot[i] = P.rot[last]; P.vr[i] = P.vr[last];
    P.drag[i] = P.drag[last]; P.grav[i] = P.grav[last]; P.sx[i] = P.sx[last]; P.sy[i] = P.sy[last]; P.sw[i] = P.sw[last];
    P.col[i] = P.col[last]; P.bounce[i] = P.bounce[last]; P.src[i] = P.src[last];
  }
  P.src[last] = null;
}

function updateParticles(dt) {
  for (let i = 0; i < n; i++) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) { removeAt(i); i--; continue; }
    const d = P.drag[i];
    if (d > 0) { const k = Math.exp(-d * dt); P.vx[i] *= k; P.vy[i] *= k; }
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt;
    if (P.bounce[i]) {
      P.vz[i] -= P.grav[i] * dt; P.z[i] += P.vz[i] * dt;
      if (P.z[i] < 0) {
        P.z[i] = 0; P.vz[i] *= -0.38; P.vx[i] *= 0.55; P.vy[i] *= 0.55; P.vr[i] *= 0.5;
        if (Math.abs(P.vz[i]) < 30) { P.vz[i] = 0; P.grav[i] = 0; }
      }
    } else if (P.grav[i]) {
      P.vy[i] += P.grav[i] * dt;
    }
  }
}

function drawParticles(ctx, ox, oy) {
  const FIRE = [C.WHITE, C.GOLD, C.ORANGE, C.RED, C.SMOKE];
  for (let i = 0; i < n; i++) {
    const k = P.kind[i];
    const t = 1 - P.life[i] / P.max[i];     // 0 -> 1 over life
    const x = P.x[i] + ox, y = P.y[i] + oy - P.z[i];
    switch (k) {
      case K.CUBE: case K.SHARD: {
        const s = P.size[i] * (t > 0.75 ? 1 - (t - 0.75) * 4 : 1);
        if (s <= 0.3) break;
        if (P.bounce[i]) {   // fake 3D: shadow on the ground
          ctx.globalAlpha = 0.22;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(SPR.cubes[C.CHAR], P.x[i] + ox - s * 0.45, P.y[i] + oy - s * 0.2, s * 0.9, s * 0.4);
        }
        ctx.globalAlpha = 1;
        const c = Math.cos(P.rot[i]), sn = Math.sin(P.rot[i]);
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(k === K.SHARD ? SPR.shard : SPR.cubes[P.col[i]], -s / 2, -s / 2, s, s);
        break;
      }
      case K.FLAME: {
        const ci = FIRE[Math.min(4, (t * 4.6) | 0)];
        const s = P.size[i] * (t < 0.3 ? 0.6 + t * 2.4 : 1.32 - (t - 0.3) * 1.5);
        if (s <= 0.3) break;
        ctx.globalAlpha = t > 0.8 ? (1 - t) * 5 : 1;
        const c = Math.cos(P.rot[i]), sn = Math.sin(P.rot[i]);
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(SPR.cubes[ci], -s / 2, -s / 2, s, s);
        break;
      }
      case K.PUFF: {
        const s = P.size[i] + (P.size2[i] - P.size[i]) * (1 - (1 - t) * (1 - t));
        ctx.globalAlpha = (1 - t) * 0.95;
        ctx.setTransform(1, 0, 0, 1, x, y);
        const img = P.col[i] === 1 ? SPR.puffGrey : P.col[i] === 2 ? SPR.puffDark : SPR.puff;
        ctx.drawImage(img, -s / 2, -s / 2, s, s);
        break;
      }
      case K.STAR: {
        const s = P.size[i] * (t < 0.35 ? 0.5 + t * 2.4 : 1.34 - (t - 0.35) * 1.2);
        ctx.globalAlpha = t > 0.6 ? (1 - t) * 2.5 : 1;
        const c = Math.cos(P.rot[i]), sn = Math.sin(P.rot[i]);
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(SPR.star, -s / 2, -s / 2, s, s);
        break;
      }
      case K.CHUNK: {
        const src = P.src[i];
        if (!src) break;
        const s = P.size[i] * (t > 0.78 ? 1 - (t - 0.78) * 4.5 : 1);
        if (s <= 0.3) break;
        ctx.globalAlpha = 1;
        const c = Math.cos(P.rot[i]), sn = Math.sin(P.rot[i]);
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(src, P.sx[i], P.sy[i], P.sw[i], P.sw[i], -s / 2, -s / 2, s, s);
        break;
      }
      default: break;
    }
  }
  // Shape pass (rings, flashes): paths, kept separate to avoid state thrash
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < n; i++) {
    const k = P.kind[i];
    if (k !== K.RING && k !== K.FLASH) continue;
    const t = 1 - P.life[i] / P.max[i];
    const x = P.x[i] + ox, y = P.y[i] + oy;
    if (k === K.RING) {
      const e = 1 - Math.pow(1 - t, 3);   // outCubic
      const r = P.size[i] + (P.size2[i] - P.size[i]) * e;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = Math.max(1, P.sw[i] * (1 - t * 0.85));
      ctx.strokeStyle = PALETTE[P.col[i]];
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = (1 - t) * (fxSettings.reduceFlash ? 0.45 : 0.9);
      ctx.fillStyle = PALETTE[P.col[i]];
      ctx.beginPath(); ctx.arc(x, y, P.size[i] * (1 - t * 0.3), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ─── Emitters ───
function cube(x, y, color, size, speed, ang, upMin, upMax, life) {
  const i = spawn(K.CUBE, x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, life, size);
  if (i < 0) return;
  P.col[i] = color; P.bounce[i] = 1; P.grav[i] = 900; P.vz[i] = rand(upMin, upMax); P.z[i] = rand(2, 10);
  P.rot[i] = rand(0, TAU); P.vr[i] = rand(-12, 12); P.drag[i] = 1.2;
}
function puff(x, y, kind, s0, s1, vx, vy, life) {
  const i = spawn(K.PUFF, x, y, vx, vy, life, s0);
  if (i < 0) return;
  P.size2[i] = s1; P.col[i] = kind; P.drag[i] = 3;
}
function ring(x, y, r0, r1, width, color, life) {
  const i = spawn(K.RING, x, y, 0, 0, life, r0);
  if (i < 0) return;
  P.size2[i] = r1; P.sw[i] = width; P.col[i] = color;
}
function flash(x, y, r, color, life) {
  const i = spawn(K.FLASH, x, y, 0, 0, life, r);
  if (i >= 0) P.col[i] = color;
}
function star(x, y, size, life = 0.13) {
  const i = spawn(K.STAR, x, y, 0, 0, life, size);
  if (i >= 0) P.rot[i] = rand(0, TAU);
}
function flame(x, y, size, vy, life) {
  const i = spawn(K.FLAME, x, y, rand(-12, 12), vy, life, size);
  if (i >= 0) { P.rot[i] = rand(0, TAU); P.vr[i] = rand(-4, 4); P.drag[i] = 2; }
}
function shard(x, y, speed, ang, life) {
  const i = spawn(K.SHARD, x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, life, rand(7, 12));
  if (i < 0) return;
  P.bounce[i] = 1; P.grav[i] = 800; P.vz[i] = rand(90, 190); P.z[i] = rand(4, 14);
  P.rot[i] = rand(0, TAU); P.vr[i] = rand(-14, 14); P.drag[i] = 1.5;
}

// ─── Decal layer (permanence: goo, scorch) ───
let decal = null, decalCtx = null, decalFade = 0, decalDirty = false;
function decalStamp(img, x, y, size, rot, alpha) {
  if (!Q.decals) return;
  if (!decal) { decal = mkCanvas(800, 600); decalCtx = decal.getContext('2d'); }
  decalCtx.save();
  decalCtx.globalAlpha = alpha;
  decalCtx.translate(x, y); decalCtx.rotate(rot);
  decalCtx.drawImage(img, -size / 2, -size / 2, size, size);
  decalCtx.restore();
  decalDirty = true;
}

// ─── Trauma screen shake (smooth, capped, budgeted) ───
const shakeState = { t: 0, budget: 0.6, time: 0, kx: 0, ky: 0, ox: 0, oy: 0 };
export function addTrauma(a, isBoss) {
  if (!fxSettings.shake) return;
  if (!isBoss) { a = Math.min(a, shakeState.budget); shakeState.budget -= a; }
  shakeState.t = Math.min(1, shakeState.t + a);
}
export function kick(dx, dy) { shakeState.kx += dx; shakeState.ky += dy; }
function updateShake(realDt) {
  const s = shakeState;
  s.t = Math.max(0, s.t - 1.6 * realDt);
  s.budget = Math.min(0.6, s.budget + 0.6 * realDt);
  s.time += realDt;
  const k = Math.exp(-20 * realDt); s.kx *= k; s.ky *= k;
  const sq = s.t * s.t, T = s.time * 28, amp = 7 * sq * fxSettings.shake;
  const nx = (Math.sin(T) + 0.5 * Math.sin(T * 2.31 + 1.7) + 0.25 * Math.sin(T * 5.13 + 4.2)) / 1.75;
  const ny = (Math.sin(T * 1.13 + 3.1) + 0.5 * Math.sin(T * 2.71 + 0.4) + 0.25 * Math.sin(T * 4.87 + 2.2)) / 1.75;
  s.ox = amp * nx + s.kx * fxSettings.shake;
  s.oy = amp * ny + s.ky * fxSettings.shake;
}

// ─── Sounds (synthesized, throttled) ───
let noiseBuf = null;
function actx() {
  if (!soundManager.enabled) return null;
  const c = soundManager._getCtx ? soundManager._getCtx() : null;
  if (!c || c.state !== 'running') return null;
  return c;
}
let busNode = null;
function bus(c) {
  if (busNode && busNode.context === c) return busNode;
  try {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    comp.connect(c.destination);
    busNode = comp;
  } catch (e) { busNode = c.destination; }
  return busNode;
}
function noise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
const lastSnd = {};
let voices = 0;
function canSnd(key, gap) {
  const now = performance.now();
  if (lastSnd[key] && now - lastSnd[key] < gap) return false;
  if (voices > 14) return false;
  lastSnd[key] = now;
  return true;
}
function tone(c, type, f0, f1, dur, vol, delay = 0) {
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * soundManager.masterVolume), t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus(c));
  voices++;
  o.onended = () => { voices--; try { o.disconnect(); g.disconnect(); } catch (e) {} };
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseHit(c, dur, vol, type, f0, f1, delay = 0) {
  const t0 = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol * soundManager.masterVolume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(bus(c));
  voices++;
  s.onended = () => { voices--; try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
}
export const fxAudio = {
  boom(big) {
    const c = actx(); if (!c || !canSnd('boom', 70)) return;
    const p = rand(0.9, 1.1);
    noiseHit(c, big ? 0.45 : 0.3, big ? 0.9 : 0.65, 'lowpass', 2200 * p, 180);
    tone(c, 'sine', 85 * p, 36, big ? 0.35 : 0.24, big ? 0.9 : 0.7);
  },
  pop() {
    const c = actx(); if (!c || !canSnd('pop', 55)) return;
    const p = rand(0.85, 1.15);
    tone(c, 'sine', 340 * p, 90, 0.09, 0.32);
    noiseHit(c, 0.04, 0.18, 'bandpass', 1400 * p);
  },
  ching(step) {
    const c = actx(); if (!c || !canSnd('ching', 55)) return;
    const m = Math.pow(2, (step || 0) / 12);
    tone(c, 'sine', 1900 * m, 1850 * m, 0.09, 0.12);
    tone(c, 'sine', 2900 * m, 2850 * m, 0.07, 0.07, 0.012);
  },
  freeze() {
    const c = actx(); if (!c || !canSnd('freeze', 90)) return;
    noiseHit(c, 0.09, 0.3, 'bandpass', 3200);
    tone(c, 'sine', 1250, 1150, 0.08, 0.12);
  },
  shatter() {
    const c = actx(); if (!c || !canSnd('shatter', 80)) return;
    const p = rand(0.9, 1.1);
    tone(c, 'sine', 2100 * p, 2000 * p, 0.12, 0.1);
    tone(c, 'sine', 3300 * p, 3200 * p, 0.09, 0.08, 0.01);
    tone(c, 'sine', 4600 * p, 4500 * p, 0.07, 0.06, 0.02);
    noiseHit(c, 0.06, 0.22, 'highpass', 3000);
  },
  thud() {
    const c = actx(); if (!c || !canSnd('thud', 90)) return;
    noiseHit(c, 0.03, 0.25, 'highpass', 3000, 0, 0.01);
  },
  leak() {
    const c = actx(); if (!c || !canSnd('leak', 200)) return;
    tone(c, 'sine', 120, 55, 0.14, 0.55);
    tone(c, 'square', 880, 860, 0.06, 0.06, 0.02);
  },
  levelUp() {
    const c = actx(); if (!c || !canSnd('lvl', 200)) return;
    tone(c, 'sine', 1600, 3200, 0.25, 0.06, 0.18);
  },
  horn() {
    const c = actx(); if (!c || !canSnd('horn', 800)) return;
    tone(c, 'sawtooth', 196, 190, 0.5, 0.08);
    tone(c, 'sawtooth', 147, 145, 0.5, 0.06);
    tone(c, 'sine', 70, 45, 0.18, 0.5, 0.05);
  },
  hit() {
    const c = actx(); if (!c || !canSnd('hit', 70)) return;
    noiseHit(c, 0.03, 0.09, 'bandpass', 1200 * rand(0.9, 1.1));
  },
  coinBig() {
    const c = actx(); if (!c || !canSnd('jackpot', 400)) return;
    [0, 4, 7, 12].forEach((s, i) => tone(c, 'sine', 1300 * Math.pow(2, s / 12), 1280 * Math.pow(2, s / 12), 0.1, 0.1, i * 0.05));
  }
};
FXUI.audio = fxAudio;
FXUI.settings = fxSettings;

// ─── Effect recipes ───
const ENEMY_COLORS = {};   // sampled palette per sprite (filled lazily)
function enemyColors(v) {
  if (!v) return [C.GOO, C.GOO_D, C.GOO_P];
  return v._cols || (v._cols = sampleColors(v.base));
}
function sampleColors(cv) {
  try {
    const x = cv.getContext('2d');
    const w = cv.width, d = x.getImageData(0, 0, w, w).data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4 * 7) {
      if (d[i + 3] < 200) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r + g + b < 90) continue;   // skip outlines
      // nearest palette entry
      let best = 0, bd = 1e9;
      for (let p = 0; p < PALETTE.length; p++) {
        const n2 = parseInt(PALETTE[p].slice(1), 16);
        const dr = r - ((n2 >> 16) & 255), dg = g - ((n2 >> 8) & 255), db = b - (n2 & 255);
        const dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = p; }
      }
      counts.set(best, (counts.get(best) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    return top.length ? top : [C.GOO, C.GOO_D, C.GOO_P];
  } catch (e) {
    return [C.GOO, C.GOO_D, C.GOO_P];
  }
}

export const FX = {
  settings: fxSettings,
  get shakeX() { return shakeState.ox; },
  get shakeY() { return shakeState.oy; },

  init() { buildSprites(); FXUI.init(); },
  horn() { fxAudio.horn(); },

  // Called from EffectManager.spawnExplosion (host + replicated to clients)
  explosion(x, y, radius) {
    buildSprites();
    const R = Math.max(30, radius || 60);
    flash(x, y, R * 0.45, C.PALE, 0.07);
    ring(x, y, R * 0.2, R * 1.1, 7, C.PALE, 0.28);
    ring(x, y, R * 0.25, R * 1.18, 3, C.SMOKE, 0.3);
    const fire = Q.cubes + 2;
    for (let i = 0; i < fire; i++) {
      const a = rand(0, TAU), sp = rand(40, 120);
      const j = spawn(K.FLAME, x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.32, 0.46), rand(12, 22));
      if (j >= 0) { P.drag[j] = 4; P.rot[j] = rand(0, TAU); P.vr[j] = rand(-5, 5); }
    }
    for (let i = 0; i < Q.cubes; i++) {
      const cols = [C.DIRT, C.GRASS, C.STONE];
      cube(x, y, cols[i % 3], rand(5, 9), rand(120, 260), rand(0, TAU), 180, 300, rand(0.7, 1.0));
    }
    for (let i = 0; i < Math.ceil(Q.puffs * 0.8); i++) {
      const a = rand(0, TAU);
      puff(x + Math.cos(a) * R * 0.3, y + Math.sin(a) * R * 0.3, 1, 18, rand(34, 48), Math.cos(a) * 20, -20, rand(0.6, 0.9));
    }
    decalStamp(SPR.scorch, x, y, R * 1.3, rand(0, TAU), 0.5);
    addTrauma(Math.max(0.1, Math.min(0.3, R / 330)));
    fxAudio.boom(R > 100);
  },

  dust(x, y, size = 40) {
    buildSprites();
    const cnt = Q.puffs + 2;
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * TAU;
      puff(x, y, 0, 10, rand(18, 26), Math.cos(a) * rand(55, 90), Math.sin(a) * rand(40, 70), 0.42);
    }
    ring(x, y, size * 0.3, size * 0.9, 4, C.WHITE, 0.24);
  },

  impact(x, y, color) {
    buildSprites();
    const col = color === '#e74c3c' ? C.RED : color && color.toLowerCase && color.toLowerCase().includes('3498') ? C.ICE : C.GOLD;
    for (let i = 0; i < Q.sparks; i++) {
      const a = rand(0, TAU);
      const j = spawn(K.CUBE, x, y, Math.cos(a) * rand(110, 210), Math.sin(a) * rand(110, 210), rand(0.16, 0.26), rand(3, 5));
      if (j >= 0) { P.col[j] = col; P.drag[j] = 6; P.rot[j] = rand(0, TAU); }
    }
  },

  // Enemy took damage (derived from health diff)
  onHit(e, dmg, r) {
    const f = fxState(e);
    f.flash = 1;
    f.pv += Math.min(5, 1.8 + 30 * dmg / Math.max(1, e.maxHealth || 100));
    const a = rand(0, TAU), push = Math.min(5, 1.5 + 25 * dmg / Math.max(1, e.maxHealth || 100));
    f.kx += Math.cos(a) * push; f.ky += Math.sin(a) * push;
    const now = performance.now();
    if (now - f.lastSpark > 70) {
      f.lastSpark = now;
      const burning = e.burnDuration > 0;
      for (let i = 0; i < Q.sparks; i++) {
        const b = rand(0, TAU);
        const j = spawn(K.CUBE, e.x, e.y, Math.cos(b) * rand(120, 220), Math.sin(b) * rand(120, 220), rand(0.18, 0.26), rand(3, 5));
        if (j >= 0) { P.col[j] = burning ? C.ORANGE : (i ? C.WHITE : C.GOLD); P.drag[j] = 6; P.rot[j] = rand(0, TAU); }
      }
      star(e.x + rand(-5, 5), e.y + rand(-5, 5), dmg > (e.maxHealth || 100) * 0.25 ? 26 : 16);
      fxAudio.hit();
    }
  },

  onDeath(r) {
    buildSprites();
    const x = r.x, y = r.y;
    const v = r.v;
    const frozen = r.slow > 0, burning = r.burn > 0;
    const size = r.size || 40;
    // Sprite shatter: cut the cached sprite into a grid of chunks
    const g = r.boss ? Q.chunks + 1 : Q.chunks;
    if (v && g > 0) {
      const srcCv = frozen ? v.ice : burning ? v.dark : v.base;
      const cell = v.px / g, cs = size / g;
      const ca = Math.cos(r.angle), sa = Math.sin(r.angle);
      for (let gy = 0; gy < g; gy++) {
        for (let gx = 0; gx < g; gx++) {
          const lx = (gx + 0.5) * cs - size / 2, ly = (gy + 0.5) * cs - size / 2;
          const px = x + lx * ca - ly * sa, py = y + lx * sa + ly * ca;
          const out = Math.atan2(py - y, px - x) + rand(-0.4, 0.4);
          const sp = rand(70, 170) * (r.boss ? 1.4 : 1);
          const j = spawn(K.CHUNK, px, py, Math.cos(out) * sp, Math.sin(out) * sp, rand(0.55, 0.8), cs * 1.05);
          if (j < 0) continue;
          P.src[j] = srcCv; P.sx[j] = gx * cell; P.sy[j] = gy * cell; P.sw[j] = cell;
          P.rot[j] = r.angle; P.vr[j] = rand(-10, 10); P.bounce[j] = 1; P.grav[j] = 900; P.vz[j] = rand(140, 250); P.z[j] = 6; P.drag[j] = 1.4;
        }
      }
    }
    // Voxel debris in the zombie's own colors
    const cols = frozen ? [C.ICE, C.ICE_L, C.ICE_D] : burning ? [C.CHAR, C.SMOKE, C.ORANGE] : enemyColors(v);
    const cnt = Q.cubes * (r.boss ? 3 : 1);
    for (let i = 0; i < cnt; i++) cube(x, y, cols[i % cols.length], rand(4, 8) * (r.boss ? 1.4 : 1), rand(80, 200), rand(0, TAU), 150, 270, rand(0.6, 0.9));
    // Poof ring
    for (let i = 0; i < Q.puffs; i++) {
      const a = (i / Q.puffs) * TAU + rand(-0.3, 0.3);
      puff(x, y, burning ? 2 : 0, 10, rand(20, 28) * (r.boss ? 1.6 : 1), Math.cos(a) * rand(60, 95), Math.sin(a) * rand(60, 95), rand(0.32, 0.45));
    }
    if (frozen) {
      for (let i = 0; i < Q.cubes + 2; i++) shard(x, y, rand(120, 240), rand(0, TAU), rand(0.4, 0.6));
      fxAudio.shatter();
    } else {
      decalStamp(SPR.splats[(Math.random() * SPR.splats.length) | 0], x, y, size * 0.8, rand(0, TAU), 0.5);
      fxAudio.pop();
    }
    if (r.boss) {
      ring(x, y, 10, 150, 8, C.PALE, 0.35);
      ring(x, y, 10, 230, 4, C.WHITE, 0.45);
      flash(x, y, 70, C.WHITE, 0.12);
      addTrauma(0.6, true);
      fxAudio.boom(true);
    }
  },

  onLeak(r, amount) {
    buildSprites();
    for (let i = 0; i < Q.cubes + 2; i++) cube(r.x, r.y, i % 2 ? C.DANGER : C.ORANGE, rand(4, 8), rand(90, 200), rand(0, TAU), 150, 260, 0.7);
    ring(r.x, r.y, 6, 60, 6, C.DANGER, 0.3);
    addTrauma(r.boss ? 0.5 : 0.14, r.boss);
    fxAudio.leak();
  },

  onPlace(t) {
    const f = fxState(t);
    f.drop = 1;
    fxAudio.thud();
  },

  _land(t) {
    buildSprites();
    const f = fxState(t);
    f.pv -= 7;   // squash spring kick
    const cs = t.cellSize || 40;
    ring(t.x, t.y + 4, cs * 0.35, cs * 1.1, 5, C.WHITE, 0.24);
    for (let i = 0; i < Q.cubes + 2; i++) {
      const a = (i / (Q.cubes + 2)) * TAU;
      cube(t.x + Math.cos(a) * cs * 0.3, t.y + Math.sin(a) * cs * 0.3, i % 2 ? C.SAND : C.DIRT, rand(4, 6), rand(90, 150), a, 50, 110, 0.4);
    }
    addTrauma(0.06);
  },

  onUpgrade(t, newLevel) {
    buildSprites();
    const f = fxState(t);
    f.pv += 9; f.flash = 1;
    const cs = t.cellSize || 40;
    ring(t.x, t.y, 4, cs * 1.25, 6, C.GOLD, 0.32);
    if (newLevel >= 5) ring(t.x, t.y, 4, cs * 1.8, 4, C.PALE, 0.42);
    const cnt = Q.cubes + (newLevel >= 5 ? 10 : 4);
    for (let i = 0; i < cnt; i++) cube(t.x, t.y, i % 3 ? C.GOLD : C.PALE, rand(4, 7), rand(130, 220), rand(0, TAU), 150, 240, 0.6);
    for (let i = 0; i < 2; i++) star(t.x + rand(-12, 12), t.y + rand(-12, 12), 22, 0.2);
    if (newLevel >= 5) addTrauma(0.08);
    fxAudio.levelUp();
  },

  onSell(r) {
    buildSprites();
    for (let i = 0; i < Q.puffs + 2; i++) {
      const a = (i / (Q.puffs + 2)) * TAU;
      puff(r.x, r.y, 0, 12, 26, Math.cos(a) * 80, Math.sin(a) * 80, 0.4);
    }
    for (let i = 0; i < Q.cubes; i++) cube(r.x, r.y, i % 2 ? C.GOLD : C.STONE, rand(4, 7), rand(90, 170), rand(0, TAU), 140, 220, 0.6);
  },

  onFreezeStart(e) {
    const f = fxState(e);
    f.iceIn = 1;
    for (let i = 0; i < Q.sparks + 2; i++) shard(e.x, e.y, rand(70, 150), rand(0, TAU), 0.35);
    fxAudio.freeze();
  },

  onThaw(e) {
    for (let i = 0; i < Q.cubes; i++) shard(e.x, e.y, rand(120, 230), rand(0, TAU), rand(0.35, 0.5));
    for (let i = 0; i < 3; i++) puff(e.x, e.y, 0, 8, 18, rand(-40, 40), rand(-40, 40), 0.35);
    fxState(e).pv += 3;
    fxAudio.shatter();
  },

  // Coins for gold gained this frame. sources: [{x,y,w}]
  money(delta, sources) {
    if (delta <= 0) return;
    if (sources.length) {
      let wsum = 0;
      for (const s of sources) wsum += s.w;
      for (const s of sources) {
        const share = delta * s.w / wsum;
        FXUI.coinsFrom(s.x, s.y, share, Math.min(4, 1 + Math.floor(share / 40)));
      }
    } else {
      // Wave bonus / farms / case: shower from the top-center of the playfield
      FXUI.coinsFrom(400, 260, delta, Math.min(6, 2 + Math.floor(delta / 80)));
    }
  }
};

// Per-entity juice state (visual only)
export function fxState(o) {
  let f = o._fx;
  if (!f) {
    f = o._fx = { flash: 0, p: 0, pv: 0, kx: 0, ky: 0, ra: null, drop: 0, iceIn: 0, lastSpark: 0, lastFlame: 0, mote: 0 };
  }
  return f;
}

function stepEntity(f, dt) {
  // Underdamped spring for squash/punch: p'' = -w^2 p - 2 z w p'
  const w = 34, z = 0.32;
  f.pv += (-w * w * f.p - 2 * z * w * f.pv) * dt;
  f.p += f.pv * dt;
  if (f.p > 0.45) f.p = 0.45; else if (f.p < -0.4) f.p = -0.4;
  f.flash = Math.max(0, f.flash - dt / 0.075);
  const k = Math.exp(-18 * dt);
  f.kx *= k; f.ky *= k;
  if (f.iceIn > 0) f.iceIn = Math.max(0, f.iceIn - dt / 0.14);
}

// ─── Observer: derive effects from state changes (same code on host, solo and client) ───
const enemyRecs = new Map();
const towerRecs = new Map();
let gen = 0, primed = false, lastGold = null, lastLives = null, lastState = null, lastWaveInProgress = false;
const removed = [];
const deathSources = [];
let frameMs = 16.7, slowTime = 0, fastTime = 0;

function stepQuality(realDt) {
  frameMs += (realDt * 1000 - frameMs) * 0.05;
  if (frameMs > 19) { slowTime += realDt; fastTime = 0; } else if (frameMs < 14) { fastTime += realDt; slowTime = 0; } else { slowTime = 0; fastTime = 0; }
  const order = ['low', 'medium', 'high'];
  const cur = order.indexOf(Q === QUALITY.high ? 'high' : Q === QUALITY.medium ? 'medium' : 'low');
  if (slowTime > 2.5 && cur > 0) { Q = QUALITY[order[cur - 1]]; slowTime = 0; console.warn('[FX] Effects quality lowered for performance.'); }
  if (fastTime > 12 && cur < order.indexOf(userQuality)) { Q = QUALITY[order[cur + 1]]; fastTime = 0; }
}

export function fxReset() {
  enemyRecs.clear(); towerRecs.clear();
  primed = false; lastGold = null; lastLives = null;
  n = 0;
  for (let i = 0; i < CAP; i++) P.src[i] = null;
  if (decalCtx) decalCtx.clearRect(0, 0, 800, 600);
  shakeState.t = 0; shakeState.kx = 0; shakeState.ky = 0;
}

// ─── Top bar wave progress ("18 ENEMIES LEFT") ───
let waveTotal = 0, waveNum = -1, waveHudT = 0, wFill = null, wText = null, wLastText = '', wLastFrac = -1;
function updateWaveHud(game, realDt) {
  waveHudT += realDt;
  if (waveHudT < 0.1) return;
  waveHudT = 0;
  if (!wFill || !wFill.isConnected) { wFill = document.getElementById('hud-wave-fill'); wText = document.getElementById('hud-enemies-left'); }
  if (!wFill || !wText) return;
  let queued = 0;
  const sp = game.activeSpawners || [];
  for (let i = 0; i < sp.length; i++) queued += (sp[i] && sp[i].queue) ? sp[i].queue.length : 0;
  const remaining = queued + (game.enemies ? game.enemies.length : 0);
  let frac, text;
  if (game.waveInProgress) {
    if (game.wave !== waveNum) { waveNum = game.wave; waveTotal = 0; }
    waveTotal = Math.max(waveTotal, remaining);
    frac = waveTotal ? remaining / waveTotal : 0;
    text = remaining === 1 ? '1 ENEMY LEFT' : `${remaining} ENEMIES LEFT`;
  } else {
    frac = 1;
    text = game.wave >= game.maxWaves && game.wave > 0 ? 'ALL WAVES CLEARED' : 'GET READY';
  }
  if (Math.abs(frac - wLastFrac) > 0.004) { wLastFrac = frac; wFill.style.transform = `scaleX(${frac.toFixed(3)})`; }
  if (text !== wLastText) { wLastText = text; wText.textContent = text; wFill.classList.toggle('is-ready', !game.waveInProgress); }
}

/** Per frame from Game.loop. gameDt is speed-scaled (0 while an ad freezes solo play). */
export function fxUpdate(game, gameDt, realDt) {
  if (!SPR.ready) FX.init();
  const inMatch = game.state === 'playing' || game.state === 'victory' || game.state === 'gameover';
  if (inMatch && lastState !== 'playing' && lastState !== 'victory' && lastState !== 'gameover') {
    fxReset();
    game._confettiParticles = null;   // fresh confetti for each victory
    FXUI.setMatchActive(true);
  } else if (!inMatch && lastState && lastState !== game.state && (lastState === 'playing' || lastState === 'victory' || lastState === 'gameover')) {
    FXUI.setMatchActive(false);
  }
  lastState = game.state;
  realDt = Math.min(0.05, Math.max(0, realDt));
  updateShake(realDt);
  FXUI.update(realDt);
  if (!inMatch) return;
  try { updateWaveHud(game, realDt); } catch (e) {}
  stepQuality(realDt);

  // Decal fade (permanence that slowly melts away)
  if (decalCtx && decalDirty) {
    decalFade += realDt;
    if (decalFade > 0.5) {
      decalFade = 0;
      decalCtx.globalCompositeOperation = 'destination-out';
      decalCtx.fillStyle = 'rgba(0,0,0,0.05)';
      decalCtx.fillRect(0, 0, 800, 600);
      decalCtx.globalCompositeOperation = 'source-over';
    }
  }

  updateParticles(gameDt);
  observe(game, gameDt);
}

function observe(game, dt) {
  gen++;
  const pathLen = game.grid && game.grid.pixelPath ? game.grid.pixelPath.length : 0;
  const end = pathLen ? game.grid.pixelPath[pathLen - 1] : null;
  removed.length = 0;
  deathSources.length = 0;

  for (const e of game.enemies) {
    const id = e.id;
    let r = enemyRecs.get(id);
    const f = fxState(e);
    stepEntity(f, dt);
    if (!r) {
      r = { hp: e.health, slow: e.slowDuration || 0, burn: e.burnDuration || 0, x: e.x, y: e.y, tni: e.targetNodeIndex || 0,
        angle: 0, v: null, size: 40, boss: !!e.isBoss, gen, reward: e.goldReward || 0 };
      enemyRecs.set(id, r);
    } else if (primed) {
      if (e.health < r.hp - 0.01) FX.onHit(e, r.hp - e.health, r);
      const slowNow = e.slowDuration > 0;
      const deep = slowNow && (e.slowFactor !== undefined ? e.slowFactor <= 0.4 : true);
      if (deep && !(r.slow > 0)) FX.onFreezeStart(e);
      else if (!slowNow && r.slow > 0 && e.health > 0) FX.onThaw(e);
    }
    // Continuous status effects
    if (e.burnDuration > 0 && dt > 0) {
      f.lastFlame += dt;
      if (f.lastFlame > 0.07) { f.lastFlame = 0; flame(e.x + rand(-8, 8), e.y + rand(-10, 4), rand(6, 10), rand(-55, -35), rand(0.28, 0.38)); }
    }
    if (Q.motes && e.slowDuration > 0 && dt > 0) {
      f.mote += dt;
      if (f.mote > 0.22) {
        f.mote = 0;
        const j = spawn(K.CUBE, e.x + rand(-10, 10), e.y + rand(-8, 8), 0, -15, 0.6, rand(2.5, 3.5));
        if (j >= 0) P.col[j] = C.ICE_L;
      }
    }
    r.hp = e.health; r.slow = (e.slowDuration > 0 && (e.slowFactor === undefined || e.slowFactor <= 0.4)) ? e.slowDuration : 0;
    r.burn = e.burnDuration || 0; r.x = e.x; r.y = e.y;
    r.tni = e.targetNodeIndex || 0; r.boss = !!e.isBoss; r.gen = gen;
    if (f.ra !== null) r.angle = f.ra;
    if (f.v) { r.v = f.v; r.size = f.size; }
  }
  for (const [id, r] of enemyRecs) {
    if (r.gen !== gen) { removed.push(r); enemyRecs.delete(id); }
  }

  // Lives & leaks
  const lives = game.lives;
  let livesLost = lastLives !== null && primed ? Math.max(0, lastLives - lives) : 0;
  if (removed.length && primed) {
    for (const r of removed) {
      const nearEnd = end && (r.tni >= pathLen - 1) && Math.hypot(r.x - end.x, r.y - end.y) < 60;
      if (livesLost > 0 && (nearEnd || r.tni >= pathLen)) {
        FX.onLeak(r);
      } else {
        FX.onDeath(r);
        deathSources.push({ x: r.x, y: r.y, w: r.boss ? 5 : 1 });
      }
    }
  }
  if (livesLost > 0) {
    FXUI.lifeLost(livesLost);
  }
  lastLives = lives;

  // Towers: placed / upgraded / sold
  for (const [key, t] of game.grid.towers) {
    const f = fxState(t);
    stepEntity(f, dt);
    if (f.drop > 0) {
      f.drop = Math.max(0, f.drop - dt / 0.12);
      if (f.drop === 0) FX._land(t);
    }
    let r = towerRecs.get(key);
    if (!r) {
      r = { level: t.level, x: t.x, y: t.y, gen };
      towerRecs.set(key, r);
      if (primed) FX.onPlace(t);
    } else if (primed && t.level > r.level) {
      FX.onUpgrade(t, t.level);
    }
    r.level = t.level; r.x = t.x; r.y = t.y; r.gen = gen;
  }
  for (const [key, r] of towerRecs) {
    if (r.gen !== gen) { if (primed) FX.onSell(r); towerRecs.delete(key); }
  }

  // Money: coins fly from what earned it
  const gold = game.gold;
  const d = (lastGold !== null && primed) ? gold - lastGold : 0;
  // Wave cleared: banner + coin shower for the end-of-wave bonus
  if (primed && lastWaveInProgress && !game.waveInProgress && game.state === 'playing' && game.wave < game.maxWaves) {
    FXUI.banner('WAVE CLEARED!', '#7cff6b', d > 0 ? `+$${d}` : '');
    fxAudio.coinBig();
  }
  lastWaveInProgress = !!game.waveInProgress;
  if (d > 0) FX.money(d, deathSources);
  lastGold = gold;
  primed = true;
}

// ─── Drawing hooks used by game-renderer.js ───
export function fxDrawDecals(ctx) {
  if (decal && decalDirty) ctx.drawImage(decal, 0, 0);
}
export function fxDrawParticles(ctx) {
  if (!SPR.ready || n === 0) return;
  ctx.save();
  drawParticles(ctx, shakeState.ox, shakeState.oy);
  ctx.restore();
}
export function fxApplyShake(ctx) {
  if (shakeState.ox || shakeState.oy) ctx.translate(shakeState.ox, shakeState.oy);
}
