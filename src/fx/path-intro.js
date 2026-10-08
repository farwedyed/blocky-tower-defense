// src/fx/path-intro.js
// Pre-match "where do the zombies go?" intro, drawn on the 800x600 playfield canvas:
//  - the road lights up and animated chevron arrows flow from the spawn to your base
//    (the arrows "draw themselves" along the road first, then keep marching)
//  - a pulsing red SPAWN marker with a skull, a pulsing green BASE marker with a shield
//  - a small bobbing "CLICK TO BEGIN" card instead of a full-width black ribbon
// When the player clicks, everything speeds up and fades out over ~0.45s.

const TAU = Math.PI * 2;
const OUT_TIME = 0.45;
const REVEAL_TIME = 1.1;
const SPACING = 36;      // px between chevrons
const SPEED = 55;        // px/s the chevrons march toward the base

let pathRef = null, pathLen = 0, cum = null, pts = null;
let shownAt = 0, hideAt = 0, wasShown = false, chevron = null, chevRed = null, chevGreen = null;

function buildChevron(fill) {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const x = c.getContext('2d');
  const shape = () => {
    x.beginPath();
    x.moveTo(9, 7); x.lineTo(23, 20); x.lineTo(9, 33);
    x.lineTo(17, 33); x.lineTo(31, 20); x.lineTo(17, 7);
    x.closePath();
  };
  x.lineJoin = 'round';
  x.strokeStyle = '#1b1b1b'; x.lineWidth = 6; shape(); x.stroke();
  x.fillStyle = fill; shape(); x.fill();
  return c;
}

function ensurePath(path) {
  if (path === pathRef && cum && cum.length === path.length) return;
  pathRef = path;
  pts = path.map(p => ({ x: p.x, y: p.y }));
  cum = new Float32Array(pts.length);
  pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    cum[i] = pathLen;
  }
}

// Point + direction at arc length s
function at(s, out) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.a = Math.atan2(b.y - a.y, b.x - a.x);
  return out;
}

function clampToView(p, m = 26) {
  return { x: Math.max(m, Math.min(800 - m, p.x)), y: Math.max(m, Math.min(600 - m, p.y)) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Chunky outlined label pill with a little pointer toward (tx, ty)
function label(ctx, cx, cy, text, sub, fill, tx, ty) {
  ctx.font = "900 17px 'Fredoka', 'Nunito', sans-serif";
  const w1 = ctx.measureText(text).width;
  ctx.font = "800 11px 'Fredoka', 'Nunito', sans-serif";
  const w2 = sub ? ctx.measureText(sub).width : 0;
  const w = Math.max(w1, w2) + 26, h = sub ? 44 : 30;
  const x = cx - w / 2, y = cy - h / 2;
  // pointer
  const ang = Math.atan2(ty - cy, tx - cx);
  const px = cx + Math.cos(ang) * (Math.min(w, h) / 2 + 2), py = cy + Math.sin(ang) * (h / 2 + 2);
  ctx.lineJoin = 'round';
  ctx.fillStyle = fill; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(ang + 1.6) * 9, py + Math.sin(ang + 1.6) * 9);
  ctx.lineTo(px + Math.cos(ang) * 12, py + Math.sin(ang) * 12);
  ctx.lineTo(px + Math.cos(ang - 1.6) * 9, py + Math.sin(ang - 1.6) * 9);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // body (drop shadow + pill)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, x, y + 4, w, h, 11); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, x + 4, y + 3, w - 8, 7, 4); ctx.fill();
  // text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = '#1b1b1b'; ctx.fillStyle = '#fff';
  ctx.font = "900 17px 'Fredoka', 'Nunito', sans-serif";
  const ty1 = sub ? y + 16 : cy + 1;
  ctx.strokeText(text, cx, ty1); ctx.fillText(text, cx, ty1);
  if (sub) {
    ctx.font = "800 11px 'Fredoka', 'Nunito', sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeText(sub, cx, y + 32); ctx.fillText(sub, cx, y + 32);
  }
}

function pulseRings(ctx, x, y, color, t) {
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.9 + k * 0.5) % 1;
    ctx.globalAlpha = (1 - ph) * 0.8;
    ctx.strokeStyle = color; ctx.lineWidth = 4 * (1 - ph) + 1;
    ctx.beginPath(); ctx.arc(x, y, 14 + ph * 34, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function badge(ctx, x, y, fill, kind, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 18, 16, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = fill; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 4;
  if (kind === 'skull') {
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.stroke();
    // skull
    ctx.fillStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -2, 10, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.arc(-4, -2, 3, 0, TAU); ctx.arc(4, -2, 3, 0, TAU); ctx.fill();
    ctx.fillRect(-3.5, 5, 2, 3); ctx.fillRect(1.5, 5, 2, 3);
  } else {
    // shield with a heart
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.quadraticCurveTo(12, -14, 18, -15); ctx.quadraticCurveTo(19, 8, 0, 20);
    ctx.quadraticCurveTo(-19, 8, -18, -15); ctx.quadraticCurveTo(-12, -14, 0, -20); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4d4d'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 9); ctx.bezierCurveTo(-13, 0, -9, -11, 0, -5); ctx.bezierCurveTo(9, -11, 13, 0, 0, 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** Called every frame by the renderer (inside the shaken/scaled playfield context). */
export function drawPathIntro(game, ctx) {
  const now = performance.now() / 1000;
  const show = !!game.showMapDirections && game.state === 'playing';
  if (show && !wasShown) { shownAt = now; hideAt = 0; }
  if (!show && wasShown) hideAt = now;
  wasShown = show;
  if (!show && (!hideAt || now - hideAt > OUT_TIME)) return;

  const path = game.grid && game.grid.pixelPath;
  if (!path || path.length < 2) return;
  ensurePath(path);
  if (!chevron) { chevron = buildChevron('#ffffff'); chevRed = buildChevron('#ff6b5e'); chevGreen = buildChevron('#7cff6b'); }

  const t = now - shownAt;
  const out = hideAt ? Math.min(1, (now - hideAt) / OUT_TIME) : 0;      // 0..1 fading out
  const fade = 1 - out;
  const reveal = Math.min(1, t / REVEAL_TIME);
  const revealE = 1 - Math.pow(1 - reveal, 3);
  const cell = (game.grid && game.grid.cellSize) || 40;

  ctx.save();

  // 1. Road glow (soft pulsing light along the whole path)
  ctx.globalAlpha = fade * (0.16 + 0.06 * Math.sin(t * 3));
  ctx.strokeStyle = '#fff6c8';
  ctx.lineWidth = cell + 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // 2. Marching chevrons (revealed from spawn to base, then flowing; speed up when leaving)
  const shown = pathLen * revealE;
  const flow = (t * SPEED + out * 260) % SPACING;
  const p = { x: 0, y: 0, a: 0 };
  for (let s = flow; s < shown; s += SPACING) {
    at(s, p);
    if (p.x < -20 || p.x > 820 || p.y < -20 || p.y > 620) continue;
    const prog = s / pathLen;
    // fade in right behind the reveal head; gentle wave of brightness travelling along the road
    const head = Math.min(1, (shown - s) / 60);
    const wave = 0.75 + 0.25 * Math.sin(s * 0.06 - t * 6);
    ctx.globalAlpha = fade * head * wave;
    const sz = 24 + 4 * Math.sin(s * 0.06 - t * 6);
    const c = Math.cos(p.a), sn = Math.sin(p.a);
    ctx.setTransform(c, sn, -sn, c, p.x, p.y);
    // tint: red near the spawn -> white -> green near the base
    const img = prog < 0.1 ? chevRed : prog > 0.9 ? chevGreen : chevron;
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // reveal head: a bright dot running ahead of the arrows on the first pass
  if (reveal < 1) {
    at(shown, p);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill(); ctx.stroke();
  }

  // 3. Spawn + base markers (pop in, pulse, pop out)
  const first = clampToView(at(Math.min(pathLen, 30), { x: 0, y: 0, a: 0 }), 30);
  const lastRaw = pts[pts.length - 1];
  const last = clampToView(at(Math.max(0, pathLen - 30), { x: 0, y: 0, a: 0 }), 30);
  void lastRaw;
  const popIn = (d) => { const k = Math.max(0, Math.min(1, (t - d) / 0.35)); return k < 1 ? 1 - Math.pow(1 - k, 3) * (1 - k * 0.6) : 1; };
  const sSpawn = popIn(0.05) * (1 - out) + Math.sin(t * 5) * 0.04;
  const sBase = popIn(REVEAL_TIME - 0.15) * (1 - out) + Math.sin(t * 5 + 1) * 0.04;
  const bob = Math.sin(t * 3.2) * 3;

  ctx.globalAlpha = fade;
  if (sSpawn > 0.05) {
    pulseRings(ctx, first.x, first.y, '#ff4d4d', t);
    ctx.globalAlpha = fade;
    badge(ctx, first.x, first.y, '#e53935', 'skull', Math.max(0, sSpawn));
  }
  if (sBase > 0.05) {
    ctx.globalAlpha = fade;
    pulseRings(ctx, last.x, last.y, '#4cd964', t + 0.3);
    ctx.globalAlpha = fade;
    badge(ctx, last.x, last.y, '#2fb52a', 'shield', Math.max(0, sBase));
  }

  // Labels: pushed toward the middle of the map so they never fall off the edge
  const place = (m) => {
    // above the marker (below it if the marker is near the top), nudged inward from the side edges
    const above = m.y > 110;
    const x = Math.max(110, Math.min(690, m.x + (m.x < 400 ? 60 : -60)));
    return { x, y: above ? m.y - 64 : m.y + 64 };
  };
  if (sSpawn > 0.3) {
    const L = place(first);
    ctx.globalAlpha = fade * Math.min(1, sSpawn);
    label(ctx, L.x, L.y + bob, 'ZOMBIES SPAWN', 'they follow the arrows', '#e53935', first.x, first.y);
  }
  if (sBase > 0.3) {
    const L = place(last);
    ctx.globalAlpha = fade * Math.min(1, sBase);
    label(ctx, L.x, L.y - bob, 'YOUR BASE', "don't let them reach it!", '#2fb52a', last.x, last.y);
  }

  // 4. "Click to begin" card (small, bobbing, out of the way of the road where possible)
  if (!hideAt) {
    const k = Math.max(0, Math.min(1, (t - 0.5) / 0.4));
    if (k > 0) {
      const pulse = 1 + Math.sin(t * 4) * 0.035;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(400, 300);
      ctx.scale(pulse * (0.8 + 0.2 * k), pulse * (0.8 + 0.2 * k));
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, -150, -30, 300, 66, 16); ctx.fill();
      ctx.fillStyle = 'rgba(18, 36, 80, 0.92)'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 4;
      roundRect(ctx, -150, -36, 300, 66, 16); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5; roundRect(ctx, -144, -30, 288, 54, 12); ctx.stroke();
      // mouse icon
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2.5;
      roundRect(ctx, -128, -20, 22, 32, 11); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-117, -20); ctx.lineTo(-117, -8); ctx.stroke();
      ctx.fillStyle = (Math.sin(t * 8) > 0) ? '#ffd23f' : '#fff';
      ctx.beginPath(); ctx.moveTo(-126, -10); ctx.quadraticCurveTo(-126, -18, -117, -18); ctx.lineTo(-117, -8); ctx.lineTo(-126, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = "900 22px 'Fredoka', 'Nunito', sans-serif";
      ctx.lineWidth = 5; ctx.strokeStyle = '#1b1b1b'; ctx.fillStyle = '#ffd23f';
      ctx.strokeText('CLICK TO BEGIN', -94, -12); ctx.fillText('CLICK TO BEGIN', -94, -12);
      ctx.font = "800 12px 'Fredoka', 'Nunito', sans-serif";
      ctx.lineWidth = 3; ctx.fillStyle = '#fff';
      ctx.strokeText('then place agents next to the road', -94, 11); ctx.fillText('then place agents next to the road', -94, 11);
      ctx.restore();
    }
  }

  ctx.restore();
}
