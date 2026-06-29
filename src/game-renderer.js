// src/game-renderer.js
// Handles core drawing routines, preloads image assets, maps levels, and animates breathing & recoil.

import { Network } from './network.js';
import { getTowerRange } from './game-config.js';
import { 
  Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, 
  Soldier, Sniper, Medic, Rocketeer, Demoman, Freezer, Shotgunner, 
  CrookBoss, MilitaryBase, Ranger, Turret 
} from './tower.js';

// ─── 1. TOWER ASSET MAP & PRELOADER ───
const SPRITE_SHEETS = {
  combat1: new Image(),
  combat2: new Image(),
  combat3: new Image(),
  support: new Image(),
  static: new Image()
};

// Paths to your generated assets
SPRITE_SHEETS.combat1.src = 'assets/sprites/combat1.png';
SPRITE_SHEETS.combat2.src = 'assets/sprites/combat2.png';
SPRITE_SHEETS.combat3.src = 'assets/sprites/combat3.png';
SPRITE_SHEETS.support.src = 'assets/sprites/support.png';
SPRITE_SHEETS.static.src = 'assets/sprites/static.png';

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
  frost_spirit: { sheet: 'bosses', row: 3, col: 0 },
  void_reaver: { sheet: 'bosses', row: 3, col: 1 }
};

const enemyCache = new Map();

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
export function preloadAllAssets(onProgress, onComplete) {
  const queue = [];

  // Add Sheets
  Object.keys(SPRITE_SHEETS).forEach(key => {
    queue.push({
      type: 'sheet',
      key: key,
      url: SPRITE_SHEETS[key].src,
      img: SPRITE_SHEETS[key]
    });
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
  const bob = Math.sin(time * 8.0) * 1.2;

  ctx.translate(agent.x, agent.y + bob);

  if (agent.type !== 'farm' && agent.type !== 'military_base') {
    ctx.rotate(agent.angle);
  }

  const recoilX = -agent.recoilOffset;

  const drawSize = agent.cellSize * 1.15;
  ctx.drawImage(
    img,
    recoilX - drawSize / 2, -drawSize / 2,
    drawSize, drawSize
  );

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

  // Draw flat ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(zombie.x, zombie.y + 10, zombie.radius * 0.9, zombie.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Walk bobbing frequency scales with walk speed
  const speedFactor = zombie.speed > 0 ? zombie.speed * 0.12 : 5.0;
  const time = zombie.timeAccumulator || 0;
  const bob = Math.sin(time * speedFactor) * 1.1;

  let renderY = zombie.y + bob;
  if (zombie.isFlying) {
    renderY = zombie.y - 18 + bob;
  }

  ctx.translate(zombie.x, renderY);

  // Rotate to match moving angle along path nodes
  let angle = 0;
  if (game.grid && game.grid.pixelPath.length > 0) {
    const path = game.grid.pixelPath;
    if (zombie.targetNodeIndex >= 0 && zombie.targetNodeIndex < path.length) {
      const target = path[zombie.targetNodeIndex];
      angle = Math.atan2(target.y - zombie.y, target.x - zombie.x);
    }
  }
  ctx.rotate(angle);

  // Enraged fire aura
  if (zombie.enraged) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 1.5, 0, Math.PI * 2);
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

  // Draw cropped sprite centered
  ctx.drawImage(
    img,
    -drawSize / 2, -drawSize / 2,
    drawSize, drawSize
  );

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
    game.effectManager.screenShake.apply(game.ctx);
    game.grid.draw(game.ctx);

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

    drawHoverVisuals(game);
    drawPlayerCursors(game); 
    
    if (game.tutorialActive && game.tutorialStep === 1.5 && game.selectedShopTower === 'scout') {
      drawTutorialCanvasHighlight(game, game.ctx);
    }

    game.effectManager.draw(game.ctx);

    if (game.showMapDirections) {
      game.ctx.save();
      const arrowBounce = Math.sin(Date.now() / 150) * 8;
      
      let startPt = game.grid.pixelPath[0];
      let startX = startPt.x < 0 ? 10 : startPt.x;
      let startY = startPt.y;
      
      let endPt = game.grid.pixelPath[game.grid.pixelPath.length - 1];
      let endX = endPt.x > game.canvas.width ? game.canvas.width - 25 : endPt.x;
      let endY = endPt.y;

      game.ctx.fillStyle = '#ff3333';
      game.ctx.strokeStyle = '#000';
      game.ctx.lineWidth = 4;
      game.ctx.font = "bold 14px 'Fredoka', 'Nunito', sans-serif";
      game.ctx.textAlign = 'left';
      
      game.ctx.strokeText("ENTRANCE - ZOMBIES SPAWN HERE!", startX + 25, startY - 45 + arrowBounce);
      game.ctx.fillText("ENTRANCE - ZOMBIES SPAWN HERE!", startX + 25, startY - 45 + arrowBounce);

      game.ctx.fillStyle = '#ff3333';
      game.ctx.beginPath();
      game.ctx.moveTo(startX, startY - 35 + arrowBounce);
      game.ctx.lineTo(startX - 10, startY - 55 + arrowBounce);
      game.ctx.lineTo(startX - 4, startY - 55 + arrowBounce);
      game.ctx.lineTo(startX - 4, startY - 70 + arrowBounce);
      game.ctx.lineTo(startX + 4, startY - 70 + arrowBounce);
      game.ctx.lineTo(startX + 4, startY - 55 + arrowBounce);
      game.ctx.lineTo(startX + 10, startY - 55 + arrowBounce);
      game.ctx.closePath();
      game.ctx.fill();
      game.ctx.stroke();

      game.ctx.fillStyle = '#2ecc71';
      game.ctx.strokeStyle = '#000';
      game.ctx.lineWidth = 4;
      game.ctx.font = "bold 14px 'Fredoka', 'Nunito', sans-serif";
      game.ctx.textAlign = 'right';
      
      game.ctx.strokeText("BASE - KEEP THE ZOMBIES OUT!", endX - 25, endY - 45 + arrowBounce);
      game.ctx.fillText("BASE - KEEP THE ZOMBIES OUT!", endX - 25, endY - 45 + arrowBounce);

      game.ctx.fillStyle = '#2ecc71';
      game.ctx.beginPath();
      game.ctx.moveTo(endX, endY - 35 + arrowBounce);
      game.ctx.lineTo(endX - 10, endY - 55 + arrowBounce);
      game.ctx.lineTo(endX - 4, endY - 55 + arrowBounce);
      game.ctx.lineTo(endX - 4, endY - 70 + arrowBounce);
      game.ctx.lineTo(endX + 4, endY - 70 + arrowBounce);
      game.ctx.lineTo(endX + 4, endY - 55 + arrowBounce);
      game.ctx.lineTo(endX + 10, endY - 55 + arrowBounce);
      game.ctx.closePath();
      game.ctx.fill();
      game.ctx.stroke();

      game.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      game.ctx.fillRect(0, 260, game.canvas.width, 80);
      game.ctx.strokeStyle = '#f1c40f';
      game.ctx.lineWidth = 3;
      game.ctx.beginPath();
      game.ctx.moveTo(0, 260);
      game.ctx.lineTo(game.canvas.width, 260);
      game.ctx.moveTo(0, 340);
      game.ctx.lineTo(game.canvas.width, 340);
      game.ctx.stroke();

      game.ctx.fillStyle = '#fff';
      game.ctx.font = "bold 20px 'Fredoka', 'Nunito', sans-serif";
      game.ctx.textAlign = 'center';
      game.ctx.strokeText("CLICK ANYWHERE ON THE MAP TO BEGIN MATCH", 400, 308);
      game.ctx.fillText("CLICK ANYWHERE ON THE MAP TO BEGIN MATCH", 400, 308);

      game.ctx.restore();
    }

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
  if (game.state !== 'playing' || !game.isMouseOnCanvas) return;

  if (game.selectedPlacedTower) {
    game.ctx.save();
    game.ctx.globalAlpha = 0.12;
    game.ctx.fillStyle = game.selectedPlacedTower.color;
    game.ctx.beginPath();
    const currentRange = game.selectedPlacedTower.range * (game.selectedPlacedTower.djRangeBuffed ? (game.selectedPlacedTower.level >= 5 ? 1.20 : 1.15) : 1.0);
    game.ctx.arc(game.selectedPlacedTower.x, game.selectedPlacedTower.y, currentRange, 0, Math.PI * 2);
    game.ctx.fill();
    
    game.ctx.globalAlpha = 0.45;
    game.ctx.strokeStyle = game.selectedPlacedTower.color;
    game.ctx.lineWidth = 2;
    game.ctx.stroke();
    game.ctx.restore();
  }

  if (game.selectedShopTower) {
    const col = game.mouseGrid.col;
    const row = game.mouseGrid.row;
    if (col < 0 || col >= game.grid.cols || row < 0 || row >= game.grid.rows) return;

    const size = game.grid.cellSize;
    const isValid = game.grid.isCellValidForPlacement(col, row);
    const color = isValid ? '#2ecc71' : '#e74c3c';

    game.ctx.save();
    game.ctx.strokeStyle = color;
    game.ctx.lineWidth = 3;
    game.ctx.strokeRect(col * size + 2, row * size + 2, size - 4, size - 4);
    game.ctx.fillStyle = isValid ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)';
    game.ctx.fillRect(col * size + 2, row * size + 2, size - 4, size - 4);
    game.ctx.restore();

    const cx = game.mousePos.x;
    const cy = game.mousePos.y;

    game.ctx.save();
    const range = getTowerRange(game.selectedShopTower);
    if (range > 0) {
      game.ctx.globalAlpha = 0.08;
      game.ctx.fillStyle = color;
      game.ctx.beginPath();
      game.ctx.arc(cx, cy, range, 0, Math.PI * 2);
      game.ctx.fill();

      game.ctx.globalAlpha = 0.35;
      game.ctx.strokeStyle = color;
      game.ctx.lineWidth = 1.5;
      game.ctx.beginPath();
      game.ctx.arc(cx, cy, range, 0, Math.PI * 2);
      game.ctx.stroke();
    }

    let tempAgent;
    switch (game.selectedShopTower) {
      case 'scout': tempAgent = new Scout(0, 0, size); break;
      case 'minigunner': tempAgent = new Minigunner(0, 0, size); break;
      case 'commander': tempAgent = new Commander(0, 0, size); break;
      case 'dj': tempAgent = new DJUnit(0, 0, size); break;
      case 'pyromancer': tempAgent = new Pyromancer(0, 0, size); break;
      case 'farm': tempAgent = new Farm(0, 0, size); break;
      case 'gladiator': tempAgent = new Gladiator(0, 0, size); break;
      case 'soldier': tempAgent = new Soldier(0, 0, size); break;
      case 'sniper': tempAgent = new Sniper(0, 0, size); break;
      case 'medic': tempAgent = new Medic(0, 0, size); break;
      case 'rocketeer': tempAgent = new Rocketeer(0, 0, size); break;
      case 'demoman': tempAgent = new Demoman(0, 0, size); break;
      case 'freezer': tempAgent = new Freezer(0, 0, size); break;
      case 'shotgunner': tempAgent = new Shotgunner(0, 0, size); break;
      case 'crook_boss': tempAgent = new CrookBoss(0, 0, size); break;
      case 'military_base': tempAgent = new MilitaryBase(0, 0, size); break;
      case 'ranger': tempAgent = new Ranger(0, 0, size); break;
      case 'turret': tempAgent = new Turret(0, 0, size); break;
    }
    if (tempAgent) {
      tempAgent.x = cx;
      tempAgent.y = cy;
      tempAgent.angle = Math.atan2(game.mousePos.y - cy, game.mousePos.x - cx);
      game.ctx.globalAlpha = 0.55;
      drawAgent(game, tempAgent); // Draw the semi-transparent ghost sprite under the mouse!
    }

    game.ctx.restore();
  }
}

/**
 * Draws replicated player cursor arrows and name tags on co-op maps.
 */
export function drawPlayerCursors(game) {
  if (Network.mode === 'OFFLINE' || !window.playerCursors) return;

  for (const [pId, cursor] of Object.entries(window.playerCursors)) {
    if (pId === window.myPlayerId) continue; 
    if (!cursor || cursor.mouseX === undefined) continue;

    const cx = cursor.mouseX;
    const cy = cursor.mouseY;

    game.ctx.save();
    game.ctx.fillStyle = game.getPlayerColor(pId);
    game.ctx.strokeStyle = '#222';
    game.ctx.lineWidth = 2;

    game.ctx.beginPath();
    game.ctx.moveTo(cx, cy);
    game.ctx.lineTo(cx + 5, cy + 15);
    game.ctx.lineTo(cx + 10, cy + 10);
    game.ctx.closePath();
    game.ctx.fill();
    game.ctx.stroke();

    const name = (window.lobbyPlayers[pId] || "Player").split(" [")[0];
    game.ctx.fillStyle = '#fff';
    game.ctx.font = "900 11px 'Fredoka', sans-serif";
    game.ctx.strokeStyle = '#222';
    game.ctx.lineWidth = 3;
    game.ctx.strokeText(name, cx + 12, cy + 12);
    game.ctx.fillText(name, cx + 12, cy + 12);

    if (cursor.selectedShopTower && cursor.selectedShopTower !== 'null') {
      game.ctx.globalAlpha = 0.22;
      game.ctx.strokeStyle = game.getPlayerColor(pId);
      game.ctx.lineWidth = 1.5;
      const range = getTowerRange(cursor.selectedShopTower);
      if (range > 0) {
        game.ctx.beginPath();
        game.ctx.arc(cx, cy, range, 0, Math.PI * 2);
        game.ctx.stroke();
      }
    }

    game.ctx.restore();
  }
}

/**
 * Draws a highlighted golden guide tile for early tutorial placement.
 */
export function drawTutorialCanvasHighlight(game, ctx) {
  const cellSize = game.grid.cellSize;
  const targetX = 2 * cellSize + cellSize / 2;
  const targetY = 2 * cellSize + cellSize / 2; 
  
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
  const dt = 0.016;
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