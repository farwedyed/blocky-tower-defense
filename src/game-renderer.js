// src/game-renderer.js
// Handles core drawing routines, preloads image assets, maps levels, and animates breathing & recoil.

import { Network } from './network.js';
import { getTowerRange } from './game-config.js';
import { getVariants, fxState, fxApplyShake, fxDrawDecals, fxDrawParticles, fxSettings } from './fx/fx.js';
import { drawPathIntro } from './fx/path-intro.js';
import { 
  Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, 
  Soldier, Sniper, Medic, Rocketeer, Demoman, Freezer, Shotgunner, 
  CrookBoss, MilitaryBase, Ranger, Turret 
} from './tower.js';

const TOWER_SPRITE_MAP = {
  // Folder: combat1 (4 rows, 5 columns)
  scout: { sheet: 'combat1', row: 0 },
  soldier: { sheet: 'combat1', row: 1 },
  sniper: { sheet: 'combat1', row: 2 },
  minigunner: { sheet: 'combat1', row: 3 },

  // Folder: combat2 (4 rows, 5 columns)
  pyromancer: { sheet: 'combat2', row: 0 },
  rocketeer: { sheet: 'combat2', row: 1 },
  freezer: { sheet: 'combat2', row: 2 },
  shotgunner: { sheet: 'combat2', row: 3 },

  // Folder: combat3 (4 rows, 5 columns)
  ranger: { sheet: 'combat3', row: 0 },
  turret: { sheet: 'combat3', row: 1 },
  demoman: { sheet: 'combat3', row: 2 },
  gladiator: { sheet: 'combat3', row: 3 },

  // Folder: support (4 rows, 5 columns)
  commander: { sheet: 'support', row: 0 },
  medic: { sheet: 'support', row: 1 },
  crook_boss: { sheet: 'support', row: 2 },
  dj: { sheet: 'support', row: 3 },

  // Folder: static (2 rows, 5 columns)
  farm: { sheet: 'static', row: 0 },
  military_base: { sheet: 'static', row: 1 }
};

const spriteCache = new Map();

/**
 * Dynamically loads and retrieves a specific sprite file on demand.
 */
function getAgentSprite(sheetName, rowIndex, colIndex) {
  const rowNum = rowIndex + 1; // 1-based in filenames
  const colNum = colIndex + 1; // 1-based in filenames
  const key = `${sheetName}_r${rowNum}_c${colNum}`;

  if (spriteCache.has(key)) {
    return spriteCache.get(key);
  }

  const img = new Image();
  img.src = `assets/sprites/${sheetName}/${sheetName}_r${rowNum}_c${colNum}.png`;
  spriteCache.set(key, img);
  return img;
}

// ─── 2. ENEMY ASSET MAP & PRELOADER ───
const ENEMY_SPRITE_MAP = {
  // Folder: zombies (4 rows, 2 columns)
  runner: { sheet: 'zombies', row: 0, col: 0 },
  quick: { sheet: 'zombies', row: 0, col: 1 },
  slow: { sheet: 'zombies', row: 1, col: 0 },
  hidden: { sheet: 'zombies', row: 1, col: 1 },
  lead: { sheet: 'zombies', row: 2, col: 0 },
  shadow: { sheet: 'zombies', row: 2, col: 1 },
  goliath: { sheet: 'zombies', row: 3, col: 0 },
  templar: { sheet: 'zombies', row: 3, col: 1 },

  // Folder: bosses (4 rows, 2 columns)
  brute: { sheet: 'bosses', row: 0, col: 0 },
  grave_digger: { sheet: 'bosses', row: 0, col: 1 },
  hazard_giant: { sheet: 'bosses', row: 1, col: 0 },
  molten_titan: { sheet: 'bosses', row: 1, col: 1 },
  fallen_guardian: { sheet: 'bosses', row: 2, col: 0 },
  fallen_king: { sheet: 'bosses', row: 2, col: 1 },
  frost_spirit: { sheet: 'bosses', row: 3, col: 1 }, // Map matched layout index
  void_reaver: { sheet: 'bosses', row: 3, col: 1 }
};

const enemyCache = new Map();

// ─── MULTIPLAYER MOUSE CURSOR SPRITES & SHINY THEMES ───
const MOUSE_SPRITE_MAP = {
  p1: 'assets/ui/mouses/sprite_04.png', // Cyan
  p2: 'assets/ui/mouses/sprite_09.png', // Orange
  p3: 'assets/ui/mouses/sprite_05.png', // Lime Green
  p4: 'assets/ui/mouses/sprite_01.png', // Purple
  p5: 'assets/ui/mouses/sprite_03.png', // Gold / Yellow
  p6: 'assets/ui/mouses/sprite_02.png', // Red
  p7: 'assets/ui/mouses/sprite_07.png', // Hot Pink
  p8: 'assets/ui/mouses/sprite_08.png'  // Silver / White
};

const PLAYER_THEMES = {
  p1: { color: '#00d2ff', light: '#70eaff', glow: 'rgba(0, 210, 255, 0.7)' },
  p2: { color: '#ff7b00', light: '#ffaa40', glow: 'rgba(255, 123, 0, 0.7)' },
  p3: { color: '#2ecc71', light: '#6bf0a3', glow: 'rgba(46, 204, 113, 0.7)' },
  p4: { color: '#bd00ff', light: '#df70ff', glow: 'rgba(189, 0, 255, 0.7)' },
  p5: { color: '#ffd700', light: '#ffe866', glow: 'rgba(255, 215, 0, 0.7)' },
  p6: { color: '#ff3b30', light: '#ff7d75', glow: 'rgba(255, 59, 48, 0.7)' },
  p7: { color: '#ff2d78', light: '#ff7aa9', glow: 'rgba(255, 45, 120, 0.7)' },
  p8: { color: '#e0e7ff', light: '#ffffff', glow: 'rgba(224, 231, 255, 0.7)' }
};

const mouseImageCache = new Map();
function getMouseSprite(pId) {
  const src = MOUSE_SPRITE_MAP[pId] || MOUSE_SPRITE_MAP.p1;
  if (mouseImageCache.has(src)) return mouseImageCache.get(src);
  const img = new Image();
  img.src = src;
  mouseImageCache.set(src, img);
  return img;
}

/**
 * Dynamically loads and retrieves a specific enemy sprite file on demand.
 */
function getEnemySprite(sheetName, rowIndex, colIndex) {
  const rowNum = rowIndex + 1; // 1-based in filenames
  const colNum = colIndex + 1; // 1-based in filenames
  const key = `${sheetName}_r${rowNum}_c${colNum}`;

  if (enemyCache.has(key)) {
    return enemyCache.get(key);
  }

  const img = new Image();
  img.src = `assets/sprites/${sheetName}/${sheetName}_r${rowNum}_c${colNum}.png`;
  enemyCache.set(key, img);
  return img;
}

// ─── 3. PRELOADING SYSTEM ───
export function preloadUIAssets(onComplete) {
  const uiImages = [
    'assets/ui/background.png',
    'assets/ui/btd2dlogo.png',
    'assets/ui/loadingnotfull.png',
    'assets/ui/loadingfull.png',
    'assets/ui/mouses/sprite_01.png',
    'assets/ui/mouses/sprite_02.png',
    'assets/ui/mouses/sprite_03.png',
    'assets/ui/mouses/sprite_04.png',
    'assets/ui/mouses/sprite_05.png',
    'assets/ui/mouses/sprite_06.png',
    'assets/ui/mouses/sprite_07.png',
    'assets/ui/mouses/sprite_08.png',
    'assets/ui/mouses/sprite_09.png',
    'assets/ui/mouses/sprite_10.png'
  ];

  let loaded = 0;
  const total = uiImages.length;

  uiImages.forEach(src => {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded >= total && onComplete) onComplete();
    };
    img.onerror = () => {
      loaded++;
      if (loaded >= total && onComplete) onComplete();
    };
    img.src = src;
  });
}

export function preloadAllAssets(onProgress, onComplete) {
  const queue = [];

  // Preload Map Backgrounds
  const mapUrls = [
    'assets/maps/grassmap/grassmap.png',
    'assets/maps/sandmap/sandmap.png',
    'assets/maps/snowmap/snowmap.png'
  ];
  mapUrls.forEach(url => {
    const img = new Image();
    queue.push({ type: 'map', key: url, url, img });
  });

  // Add all individual Agent Sprites (5 columns per agent row)
  Object.keys(TOWER_SPRITE_MAP).forEach(type => {
    const meta = TOWER_SPRITE_MAP[type];
    for (let col = 1; col <= 5; col++) {
      const key = `${meta.sheet}_r${meta.row + 1}_c${col}`;
      const url = `assets/sprites/${meta.sheet}/${meta.sheet}_r${meta.row + 1}_c${col}.png`;
      const img = new Image();
      spriteCache.set(key, img);
      queue.push({ type: 'agent', key, url, img });
    }
  });

  // Add all individual Enemy/Boss Sprites
  Object.keys(ENEMY_SPRITE_MAP).forEach(type => {
    const meta = ENEMY_SPRITE_MAP[type];
    const key = `${meta.sheet}_r${meta.row + 1}_c${meta.col + 1}`;
    const url = `assets/sprites/${meta.sheet}/${meta.sheet}_r${meta.row + 1}_c${meta.col + 1}.png`;
    const img = new Image();
    enemyCache.set(key, img);
    queue.push({ type: 'enemy', key, url, img });
  });

  let loadedCount = 0;
  const totalCount = queue.length;

  if (totalCount === 0) {
    if (onComplete) onComplete();
    return;
  }

  function registerItem() {
    loadedCount++;
    const percent = Math.min(100, Math.round((loadedCount / totalCount) * 100));
    if (onProgress) {
      onProgress(percent, loadedCount, totalCount);
    }
    if (loadedCount >= totalCount) {
      if (onComplete) onComplete();
    }
  }

  queue.forEach(item => {
    item.img.onload = () => {
      registerItem();
    };
    item.img.onerror = () => {
      console.warn(`[Preloader] Failed to load resource gracefully: ${item.url}`);
      registerItem(); // Still register to prevent loading screens from locking
    };
    item.img.src = item.url;
  });
}

// ─── 4. CRISP PREVIEW DRAWING UTILITIES ───
// ─── Crisp, tightly framed agent portraits for the HUD ───
// The sprite PNGs are large (250-1250px) with wide transparent margins. We find the visible
// bounding box once per sprite and draw just that area, smoothly downscaled, so portraits are
// sharp and nothing (like the Scout's gun) gets cut off.
const portraitBoxCache = new Map();
function spriteBox(img) {
  let box = portraitBoxCache.get(img.src);
  if (box) return box;
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, S, S);
  let minX = S, minY = S, maxX = -1, maxY = -1;
  try {
    const d = x.getImageData(0, 0, S, S).data;
    for (let yy = 0; yy < S; yy++) {
      for (let xx = 0; xx < S; xx++) {
        if (d[(yy * S + xx) * 4 + 3] > 20) {
          if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
        }
      }
    }
  } catch (e) {}
  if (maxX < 0) { minX = 0; minY = 0; maxX = S - 1; maxY = S - 1; }
  box = { x: minX / S, y: minY / S, w: (maxX - minX + 1) / S, h: (maxY - minY + 1) / S };
  portraitBoxCache.set(img.src, box);
  return box;
}

export function drawAgentPortrait(canvas, agentType, level = 1, pad = 0.08) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const meta = TOWER_SPRITE_MAP[agentType];
  if (!meta) return;
  const img = getAgentSprite(meta.sheet, meta.row, Math.max(0, Math.min(4, level - 1)));
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener('load', () => drawAgentPortrait(canvas, agentType, level, pad), { once: true });
    return;
  }
  const b = spriteBox(img);
  const W = canvas.width, H = canvas.height;
  const sx = b.x * img.naturalWidth, sy = b.y * img.naturalHeight;
  const sw = b.w * img.naturalWidth, sh = b.h * img.naturalHeight;
  const avail = Math.min(W, H) * (1 - pad * 2);
  const k = avail / Math.max(sw, sh);
  const dw = sw * k, dh = sh * k;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
  ctx.drawImage(img, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export function drawAgentPreviewOnCanvas(canvas, agentType, level = 1) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const meta = TOWER_SPRITE_MAP[agentType];
  if (!meta) return;

  const key = `${meta.sheet}_r${meta.row + 1}_c${level}`;
  const img = spriteCache.get(key);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false; // Keeps blocky graphics pixelated
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    // Vector blocky fallback in case resource is missing
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

export function drawBossPreviewOnCanvas(canvas, bossType) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const meta = ENEMY_SPRITE_MAP[bossType];
  if (!meta) return;

  const key = `${meta.sheet}_r${meta.row + 1}_c${meta.col + 1}`;
  const img = enemyCache.get(key);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    // Dark procedural blocky representation fallback
    ctx.save();
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ─── 5. RENDERING IMPLEMENTATIONS ───

/**
 * Renders an active tower sprite on the canvas, handling dynamic column level indexing.
 */
export function drawAgent(game, agent) {
  const meta = TOWER_SPRITE_MAP[agent.type];
  if (!meta) {
    agent.draw(game.ctx); // Fallback to procedural shape if mapping is missing
    return;
  }

  const img = getAgentSprite(meta.sheet, meta.row, agent.level - 1);
  
  if (!img.complete || img.naturalWidth === 0) {
    agent.draw(game.ctx);
    return;
  }

  const ctx = game.ctx;
  ctx.save();

  // Draw flat ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.ellipse(agent.x, agent.y + 4, agent.cellSize * 0.40, agent.cellSize * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  if (agent.djRangeBuffed) {
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(agent.x - agent.cellSize * 0.43, agent.y - agent.cellSize * 0.43, agent.cellSize * 0.86, agent.cellSize * 0.86);
  }
  if (agent.commanderSpeedBuffed) {
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(agent.x - agent.cellSize * 0.46, agent.y - agent.cellSize * 0.46, agent.cellSize * 0.92, agent.cellSize * 0.92);
  }

  const time = agent.timeAccumulator || 0;
  const fx = fxState(agent);
  // Juice: slow breathing instead of a fast bob, drop-in on placement, squash spring on land/upgrade
  const phase = (agent.gridX || 0) * 1.7 + (agent.gridY || 0) * 0.9;
  const breathe = 1 + Math.sin(time * 3.4 + phase) * 0.025;
  const dropZ = fx.drop > 0 ? fx.drop * fx.drop * 30 : 0;
  const sx = breathe * (1 + fx.p) * (fx.drop > 0 ? 1 + fx.drop * 0.15 : 1);
  const sy = breathe * (1 - fx.p * 0.7) * (fx.drop > 0 ? 1 + fx.drop * 0.15 : 1);

  ctx.translate(agent.x, agent.y - dropZ);

  if (agent.type !== 'farm' && agent.type !== 'military_base') {
    ctx.rotate(agent.angle);
  }
  ctx.scale(sx, sy);

  const recoilX = -agent.recoilOffset;

  // Offset by +5px along local X to center the character's body (accounting for the gun barrel)
  const bodyOffsetX = (agent.type === 'farm' || agent.type === 'military_base') ? 0 : 5;

  const drawSize = agent.cellSize * 1.15;
  const v = getVariants(img, drawSize);
  const dx = recoilX - drawSize / 2 + bodyOffsetX, dy = -drawSize / 2;
  ctx.drawImage(v ? v.base : img, dx, dy, drawSize, drawSize);
  if (v && fx.flash > 0) {
    ctx.globalAlpha = fx.flash * (fxSettings.reduceFlash ? 0.45 : 0.9);
    ctx.drawImage(v.white, dx, dy, drawSize, drawSize);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Draws health and shield bars above the enemy character.
 */
function drawEnemyBars(ctx, zombie, renderY, drawSize) {
  const barW = Math.min(drawSize * 0.75, 45); // Proportional width with a clean 45px cap on bosses
  const barH = 5;
  const barX = zombie.x - barW / 2;
  const barY = renderY - drawSize / 2 - 10; // Float exactly above the top of the upscaled sprite

  ctx.save();
  
  // Health Background
  ctx.fillStyle = '#222';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

  const healthPercent = Math.max(0, zombie.health / zombie.maxHealth);
  ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.2 ? '#f1c40f' : '#e74c3c';
  ctx.fillRect(barX, barY, barW * healthPercent, barH);

  // Shield Bar
  if (zombie.maxShield > 0 && zombie.shield > 0) {
    const shieldY = barY - 6;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX - 1, shieldY - 1, barW + 2, barH + 2);

    const shieldPercent = Math.max(0, zombie.shield / zombie.maxShield);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(barX, shieldY, barW * shieldPercent, barH);
  }

  ctx.restore();
}

/**
 * Renders an active enemy sprite on the canvas, handling dynamic walk bobbing.
 */
export function drawEnemy(game, zombie) {
  // Normalize zombie name to map key
  const normalizedName = zombie.name.toLowerCase().replace(/ /g, '_')
    .replace('quick_zombie', 'quick')
    .replace('slow_zombie', 'slow')
    .replace('zombie', 'runner')
    .replace('toxic_giant', 'goliath');

  const meta = ENEMY_SPRITE_MAP[normalizedName];
  if (!meta) {
    zombie.draw(game.ctx); // Fallback to vector
    return;
  }

  const img = getEnemySprite(meta.sheet, meta.row, meta.col);
  if (!img.complete || img.naturalWidth === 0) {
    zombie.draw(game.ctx); // Fallback to vector while loading
    return;
  }

  const ctx = game.ctx;
  ctx.save();

  // Apply camo transparency
  if (zombie.isCamo) {
    ctx.globalAlpha = 0.55;
  }

  const fx = fxState(zombie);
  const frozen = zombie.slowDuration > 0;
  const deepFreeze = frozen && (zombie.slowFactor === undefined || zombie.slowFactor <= 0.4);

  // Walk cycle: step hop + side wobble, frequency follows walk speed (frozen = shiver instead)
  const time = zombie.timeAccumulator || 0;
  const stepHz = Math.max(1.2, (zombie.speed || 30) / 18);
  const stepPhase = Math.sin(Math.PI * stepHz * time + (zombie.id || 0));
  let hop = deepFreeze ? 0 : Math.abs(stepPhase) * (zombie.isBoss ? 3.5 : 2.5);
  let wobble = deepFreeze ? 0 : stepPhase * (zombie.isBoss ? 0.05 : 0.09);
  if (zombie.burnDuration > 0 && !deepFreeze) wobble += Math.sin(time * 15 + (zombie.id || 0)) * 0.1;   // panic
  const shiverX = deepFreeze ? Math.sin(time * 110) * 0.6 : 0;

  // Draw flat ground shadow (shrinks a little at the top of each hop)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(zombie.x, zombie.y + 10, zombie.radius * 0.9 * (1 - hop * 0.03), zombie.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  let renderY = zombie.y - hop + fx.ky;
  if (zombie.isFlying) {
    renderY = zombie.y - 18 + Math.sin(time * 7.5) * 2 + fx.ky;
  }

  ctx.translate(zombie.x + fx.kx + shiverX, renderY);

  // Smoothly turn toward the path direction (no more instant 90 degree snaps at corners)
  let angle = fx.ra !== null ? fx.ra : 0;
  if (game.grid && game.grid.pixelPath.length > 0) {
    const path = game.grid.pixelPath;
    if (zombie.targetNodeIndex >= 0 && zombie.targetNodeIndex < path.length) {
      const target = path[zombie.targetNodeIndex];
      const want = Math.atan2(target.y - zombie.y, target.x - zombie.x);
      if (fx.ra === null) angle = want;
      else {
        let d = want - angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        angle += d * Math.min(1, (game._fxRealDt || 0.016) * 12);
      }
    }
  }
  fx.ra = angle;
  ctx.rotate(angle + wobble);

  // Enraged fire aura (pulses smoothly)
  if (zombie.enraged) {
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.1 * Math.sin(time * 6);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * (1.45 + 0.1 * Math.sin(time * 6)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Calculate drawSize with a min-size floor so standard zombies fill the path
  let drawSize = zombie.radius * 5.0;
  if (!zombie.isBoss) {
    drawSize = Math.max(38, drawSize); // Minimum 38px wide so they fill the 40px path cleanly
  } else {
    drawSize = Math.max(85, drawSize); // Bosses are always imposing and massive
  }

  // Squash & stretch from the hit spring
  const sq = fx.p;
  ctx.scale(1 + sq, 1 - sq * 0.7);

  const v = getVariants(img, drawSize);
  fx.v = v; fx.size = drawSize;
  const h = drawSize / 2;
  ctx.drawImage(v ? v.base : img, -h, -h, drawSize, drawSize);
  if (v) {
    const baseAlpha = ctx.globalAlpha;
    // Status tints
    if (frozen) {
      ctx.globalAlpha = baseAlpha * (deepFreeze ? 0.5 : 0.32);
      ctx.drawImage(v.ice, -h, -h, drawSize, drawSize);
    } else if (zombie.burnDuration > 0) {
      ctx.globalAlpha = baseAlpha * (0.25 + 0.12 * Math.sin(time * 9 + (zombie.id || 0)));
      ctx.drawImage(v.fire, -h, -h, drawSize, drawSize);
    } else if (zombie.enraged) {
      ctx.globalAlpha = baseAlpha * (0.22 + 0.12 * Math.sin(time * 4));
      ctx.drawImage(v.red, -h, -h, drawSize, drawSize);
    }
    // Hit flash
    if (fx.flash > 0) {
      ctx.globalAlpha = baseAlpha * fx.flash * (fxSettings.reduceFlash ? 0.45 : 0.95);
      ctx.drawImage(v.white, -h, -h, drawSize, drawSize);
    }
    ctx.globalAlpha = baseAlpha;
  }

  // Ice block encasement on deep freeze
  if (deepFreeze) {
    const pop = fx.iceIn > 0 ? 1 + fx.iceIn * 0.35 : 1;
    const b = drawSize * 0.4 * pop;
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#bfefff';
    ctx.fillRect(-b, -b, b * 2, b * 2);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-b + 3, -b + 3, b * 0.9, 3);
    ctx.fillRect(-b + 3, -b + 3, 3, b * 0.7);
    ctx.fillRect(b * 0.35, b * 0.2, 3, b * 0.45);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1e5a8c';
    ctx.strokeRect(-b, -b, b * 2, b * 2);
  }

  ctx.restore();

  // Render health and shield overlays proportional to the new drawSize
  drawEnemyBars(ctx, zombie, renderY, drawSize);
}

/**
 * Main draw loop coordinating all on-screen visuals.
 * @param {object} game 
 */
export function draw(game) {
  game.ctx.save();
  game.ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);

  if (game.state === 'playing' || game.state === 'victory' || game.state === 'gameover') {
    fxApplyShake(game.ctx);
    game.grid.draw(game.ctx);
    fxDrawDecals(game.ctx);

    // Draw active towers using sprites
    for (const agent of game.grid.towers.values()) {
      drawAgent(game, agent);
    }

    // Draw active enemies using sprites
    for (const zombie of game.enemies) {
      drawEnemy(game, zombie);
    }

    for (const bullet of game.bullets) {
      bullet.draw(game.ctx);
    }

    // Render Shiny Cash Case Airdrop
    if (game.activeCashCase) {
      const c = game.activeCashCase;
      const ctx = game.ctx;
      const pulse = Math.sin(Date.now() / 150) * 4;

      ctx.save();
      ctx.translate(c.x, c.y + pulse);

      // Glowing Aura
      const glowGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, 32);
      glowGrad.addColorStop(0, 'rgba(241, 196, 15, 0.6)');
      glowGrad.addColorStop(1, 'rgba(241, 196, 15, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();

      // Draw CashCase Sprite
      if (game.cashCaseImg && game.cashCaseImg.complete && game.cashCaseImg.naturalWidth > 0) {
        ctx.drawImage(game.cashCaseImg, -20, -16, 40, 32);
      } else {
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(-16, -12, 32, 24);
        ctx.strokeRect(-16, -12, 32, 24);
      }

      // Sparkles & Tag
      ctx.fillStyle = '#f1c40f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = "900 11px 'Fredoka', sans-serif";
      ctx.textAlign = 'center';
      ctx.strokeText(`+$${c.reward}`, 0, -22);
      ctx.fillText(`+$${c.reward}`, 0, -22);

      // Remaining Lifespan Ring
      const progress = Math.max(0, c.life / c.maxLife);
      ctx.strokeStyle = progress > 0.3 ? '#2ecc71' : '#e74c3c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();

      ctx.restore();
    }

    drawHoverVisuals(game);
    drawPlayerCursors(game); 
    
    if (game.tutorialActive && game.tutorialStep === 1.5 && game.selectedShopTower === 'scout') {
      drawTutorialCanvasHighlight(game, game.ctx);
    }

    game.effectManager.draw(game.ctx);
    fxDrawParticles(game.ctx);

    // Pre-match intro: glowing road, marching arrows, spawn/base markers, click-to-begin card
    drawPathIntro(game, game.ctx);

    if (game.isHardcore) {
      game.ctx.save();
      const grad = game.ctx.createRadialGradient(
        game.canvas.width / 2, game.canvas.height / 2, game.canvas.height * 0.35,
        game.canvas.width / 2, game.canvas.height / 2, game.canvas.width * 0.55
      );
      grad.addColorStop(0, 'rgba(231, 76, 60, 0)');
      grad.addColorStop(1, 'rgba(231, 76, 60, 0.35)');
      game.ctx.fillStyle = grad;
      game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

      game.ctx.strokeStyle = '#e74c3c';
      game.ctx.lineWidth = 5;
      game.ctx.strokeRect(0, 0, game.canvas.width, game.canvas.height);
      game.ctx.restore();
    }
  } else {
    game.ctx.fillStyle = '#2a3b5c';
    game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
    game.ctx.fillStyle = '#fff';
    game.ctx.font = "900 36px 'Fredoka', sans-serif";
    game.ctx.textAlign = 'center';
    game.ctx.fillText("LOBBY ACTIVE", 400, 300);
    game.ctx.font = "400 18px 'Nunito', sans-serif";
    game.ctx.fillText("Prepare loadout and choose maps inside the console sidebar wizard", 400, 335);
  }

  if (game.state === 'victory') {
    drawConfetti(game);
  }

  game.ctx.restore();
}

/**
 * Draws ranges, tile indicators, and semi-transparent ghost placement previews.
 */
export function drawHoverVisuals(game) {
  if (game.state !== 'playing') return;

  const ctx = game.ctx;

  // Selected Placed Tower: Display its attack range ring
  if (game.selectedPlacedTower) {
    ctx.save();
    const t = game.selectedPlacedTower;
    const currentRange = t.range * (t.djRangeBuffed ? (t.level >= 5 ? 1.20 : 1.15) : 1.0);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, currentRange, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Selection ring at base
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Placing a Troop: Pixel feedback and collision outlines
  if (game.selectedShopTower && game.isMouseOnCanvas) {
    const mx = game.mousePos.x;
    const my = game.mousePos.y;
    const radius = 18;
    const check = game.grid.isPositionValidForPlacement(mx, my, radius);
    const isValid = check.valid;
    const statusColor = isValid ? '#2ecc71' : '#e74c3c';

    ctx.save();

    // 1. Show collision warning ONLY when actively placing, and only on nearby/colliding troops
    for (const tower of game.grid.towers.values()) {
      const dist = Math.hypot(mx - tower.x, my - tower.y);
      const isColliding = check.reason === 'troop' && check.collidingTroop === tower;

      if (isColliding) {
        // Red collision warning outline ONLY on the troop being collided with
        const pulse = Math.sin(Date.now() / 100) * 3;
        ctx.save();
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.collisionRadius || 18, 0, Math.PI * 2);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(231, 76, 60, 0.35)';
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e74c3c';
        ctx.font = "bold 10px 'Fredoka', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("COLLISION", tower.x, tower.y - 24 + pulse);
        ctx.restore();
      } else if (dist < 55) {
        // Only show a subtle footprint ring if your cursor is directly next to this troop
        ctx.save();
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.collisionRadius || 18, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // (Obstacle red outline circle removed per request - obstacles quietly block placement without visual rings)

    // 2. Draw Range Ring around cursor
    const range = getTowerRange(game.selectedShopTower);
    if (range > 0) {
      ctx.globalAlpha = isValid ? 0.10 : 0.15;
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(mx, my, range, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = isValid ? 0.45 : 0.70;
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, range, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Draw Circular Troop Footprint around cursor
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = isValid ? 'rgba(46, 204, 113, 0.18)' : 'rgba(231, 76, 60, 0.25)';
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5. Draw ghost sprite preview (Reuses cached dummy object to prevent GC stutter)
    if (!game._ghostAgentCache) {
      game._ghostAgentCache = {};
    }
    let tempAgent = game._ghostAgentCache[game.selectedShopTower];
    if (!tempAgent) {
      tempAgent = {
        type: game.selectedShopTower,
        level: 1,
        angle: 0,
        cellSize: game.grid.cellSize,
        recoilOffset: 0,
        timeAccumulator: 0,
        djRangeBuffed: false,
        commanderSpeedBuffed: false,
        draw: (c) => {}
      };
      game._ghostAgentCache[game.selectedShopTower] = tempAgent;
    }

    tempAgent.x = mx;
    tempAgent.y = my;
    ctx.globalAlpha = isValid ? 0.65 : 0.35;
    drawAgent(game, tempAgent);

    // 6. Red X indicator if hovering over road or an invalid spot
    if (!isValid) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my - 8); ctx.lineTo(mx + 8, my + 8);
      ctx.moveTo(mx + 8, my - 8); ctx.lineTo(mx - 8, my + 8);
      ctx.stroke();
    }

    ctx.restore();
  }
}


export function drawPlayerCursors(game) {
  if (Network.mode === 'OFFLINE' || !window.playerCursors) return;

  const ctx = game.ctx;
  const now = performance.now();

  for (const [pId, cursor] of Object.entries(window.playerCursors)) {
    if (pId === window.myPlayerId) continue; 
    if (!cursor) continue;

    // Initialize position coordinates
    if (cursor.x === undefined) {
      cursor.x = cursor.targetX !== undefined ? cursor.targetX : (cursor.mouseX || 0);
      cursor.y = cursor.targetY !== undefined ? cursor.targetY : (cursor.mouseY || 0);
      cursor.lastTime = now;
    }

    const tx = cursor.targetX !== undefined ? cursor.targetX : cursor.x;
    const ty = cursor.targetY !== undefined ? cursor.targetY : cursor.y;

    // Delta time calculation
    const dt = Math.min(0.05, (now - (cursor.lastTime || now)) / 1000.0);
    cursor.lastTime = now;

    // Silky smooth exponential lerp (tracks target instantly at 60Hz - 144Hz)
    const factor = 1.0 - Math.exp(-30 * dt);
    cursor.x += (tx - cursor.x) * factor;
    cursor.y += (ty - cursor.y) * factor;

    // Snap if distance is huge (e.g. initial spawn or tab switch)
    if (Math.hypot(tx - cursor.x, ty - cursor.y) > 300) {
      cursor.x = tx;
      cursor.y = ty;
    }

    const cx = Math.round(cursor.x);
    const cy = Math.round(cursor.y);
    const theme = PLAYER_THEMES[pId] || PLAYER_THEMES.p1;
    const name = (window.lobbyPlayers[pId] || "Player").split(" [")[0];
    const isPlacing = cursor.selectedShopTower && cursor.selectedShopTower !== 'null';

    ctx.save();

    // 1. Draw Teammate Placement Range Preview on the Ground
    if (isPlacing) {
      const range = getTowerRange(cursor.selectedShopTower);
      if (range > 0) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = theme.color;
        ctx.beginPath();
        ctx.arc(cx, cy, range, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.50;
        ctx.strokeStyle = theme.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Render Custom Cursor Sprite (Anchor tip at cx, cy)
    const cursorImg = getMouseSprite(pId);
    const size = 30;

    ctx.save();
    if (cursorImg.complete && cursorImg.naturalWidth > 0) {
      ctx.drawImage(cursorImg, cx - 2, cy - 2, size, size);
    } else {
      // Fallback vector arrow
      ctx.fillStyle = theme.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 6, cy + 18);
      ctx.lineTo(cx + 12, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // 3. Render Crisp Blocky Name Badge (Shadow blur removed for massive FPS boost)
    ctx.save();
    ctx.font = "900 11px 'Fredoka', 'Nunito', sans-serif";
    const textWidth = ctx.measureText(name).width;
    const subText = isPlacing ? cursor.selectedShopTower.replace('_', ' ').toUpperCase() : null;
    const subWidth = subText ? ctx.measureText(subText).width * 0.75 : 0;
    const badgeWidth = Math.max(textWidth + 24, subWidth + 24);
    const badgeHeight = subText ? 28 : 18;
    const badgeX = cx + 18;
    const badgeY = cy + 10;

    // Crisp high-performance blocky border & background
    ctx.fillStyle = '#0a0f1a';
    ctx.strokeStyle = theme.color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
    ctx.fill();
    ctx.stroke();

    // Glowing Theme Gem/Dot indicator
    ctx.fillStyle = theme.color;
    ctx.beginPath();
    ctx.arc(badgeX + 9, badgeY + (subText ? 10 : 9), 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Polished Two-Tone Gradient Name Text
    const grad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + 14);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, theme.light);

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(name, badgeX + 17, badgeY + (subText ? 13 : 13));
    ctx.fillText(name, badgeX + 17, badgeY + (subText ? 13 : 13));

    // Secondary Sub-Tag if teammate is aiming/placing a tower
    if (subText) {
      ctx.font = "800 8.5px 'Fredoka', sans-serif";
      ctx.fillStyle = theme.color;
      ctx.fillText(`PLACING: ${subText}`, badgeX + 17, badgeY + 23);
    }

    ctx.restore();

    ctx.restore();
  }
}

/**
 * Draws a highlighted golden guide tile for early tutorial placement.
 */
export function drawTutorialCanvasHighlight(game, ctx) {
  const cellSize = game.grid.cellSize;
  const targetX = 2 * cellSize + cellSize / 2;
  const targetY = 2 * cellSize + cellSize / 2; 

  // Only draw placement guide tile & arrow (NO second ghost - only the mouse ghost will render)
  const bounce = Math.sin(Date.now() / 150) * 8;
  
  ctx.save();
  ctx.translate(targetX, targetY);
  
  const pulse = Math.abs(Math.sin(Date.now() / 200)) * 6;
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 3.5 + pulse;
  ctx.strokeRect(-cellSize / 2 + 2, -cellSize / 2 + 2, cellSize - 4, cellSize - 4);
  
  ctx.fillStyle = '#f1c40f';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.font = "bold 13px 'Fredoka', 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.strokeText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
  ctx.fillText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
  
  ctx.fillStyle = '#f1c40f';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-8, -cellSize / 2 - 15);
  ctx.lineTo(8, -cellSize / 2 - 8 + bounce);
  ctx.lineTo(14, -cellSize / 2 - 8 + bounce);
  ctx.lineTo(0, -cellSize / 2 + 2 + bounce);
  ctx.lineTo(-14, -cellSize / 2 - 8 + bounce);
  ctx.lineTo(-8, -cellSize / 2 - 8 + bounce);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draws colorful victory confetti falling from the top.
 */
export function drawConfetti(game) {
  if (!game._confettiParticles) {
    game._confettiParticles = [];
    const colors = ['#f1c40f', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6', '#e67e22'];
    for (let i = 0; i < 120; i++) {
      game._confettiParticles.push({
        x: Math.random() * game.canvas.width,
        y: Math.random() * game.canvas.height - game.canvas.height,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 80 + 50,
        speedX: Math.random() * 40 - 20,
        rot: Math.random() * Math.PI,
        rotSpeed: Math.random() * 4 - 2
      });
    }
  }

  game.ctx.save();
  const dt = Math.min(0.05, game._fxRealDt || 0.016);   // real frame time: same speed at 60/144 Hz
  for (const p of game._confettiParticles) {
    p.y += p.speedY * dt;
    p.x += p.speedX * dt;
    p.rot += p.rotSpeed * dt;
    if (p.y > game.canvas.height) {
      p.y = -20;
      p.x = Math.random() * game.canvas.width;
    }
    game.ctx.fillStyle = p.color;
    game.ctx.translate(p.x, p.y);
    game.ctx.rotate(p.rot);
    game.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    game.ctx.rotate(-p.rot);
    game.ctx.translate(-p.x, -p.y);
  }
  game.ctx.restore();
}