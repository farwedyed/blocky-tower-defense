// Grid and Map Terrain Module for Blocky Tactical Defense (BTD 2D)

// ─── MAP IMAGE CACHE & SPRITE DATA ───
const mapBackgroundImages = {
  grassland: new Image(),
  desert: new Image(),
  tundra: new Image()
};
mapBackgroundImages.grassland.src = 'assets/maps/grassmap/grassmap.png';
mapBackgroundImages.desert.src = 'assets/maps/sandmap/sandmap.png';
mapBackgroundImages.tundra.src = 'assets/maps/snowmap/snowmap.png';

const propImageCache = new Map();
function getPropImage(src) {
  if (propImageCache.has(src)) return propImageCache.get(src);
  const img = new Image();
  img.src = src;
  propImageCache.set(src, img);
  return img;
}

// Prop definitions: tall items have hTiles: 2 (take 2 vertical tiles)
const MAP_PROP_DEFS = {
  grassland: {
    folder: 'assets/maps/grassmap/grassprops/',
    tall: ['sprite_01.png', 'sprite_02.png', 'sprite_04.png', 'sprite_05.png'], // 2-tile pine trees
    small: [
      'sprite_09.png', 'sprite_10.png', 'sprite_11.png', 'sprite_12.png',
      'sprite_13.png', 'sprite_14.png', 'sprite_16.png', 'sprite_18.png',
      'sprite_19.png', 'sprite_20.png', 'sprite_21.png', 'sprite_22.png',
      'sprite_25.png', 'sprite_26.png', 'sprite_28.png', 'sprite_80.png', 'sprite_89.png'
    ]
  },
  desert: {
    folder: 'assets/maps/sandmap/desertprops/',
    tall: ['sprite_33.png', 'sprite_45.png', 'sprite_52.png'], // 2-tile tall cacti
    small: [
      'sprite_24.png', 'sprite_30.png', 'sprite_31.png', 'sprite_34.png',
      'sprite_35.png', 'sprite_36.png', 'sprite_37.png', 'sprite_38.png',
      'sprite_41.png', 'sprite_42.png', 'sprite_43.png', 'sprite_46.png',
      'sprite_47.png', 'sprite_48.png', 'sprite_49.png', 'sprite_50.png',
      'sprite_51.png', 'sprite_78.png', 'sprite_86.png', 'sprite_87.png'
    ]
  },
  tundra: {
    folder: 'assets/maps/snowmap/iceprops/',
    tall: ['sprite_56.png', 'sprite_58.png', 'sprite_59.png', 'sprite_64.png', 'sprite_71.png'], // 2-tile snow trees & crystals
    small: [
      'sprite_60.png', 'sprite_61.png', 'sprite_62.png', 'sprite_65.png',
      'sprite_66.png', 'sprite_68.png', 'sprite_69.png', 'sprite_70.png',
      'sprite_72.png', 'sprite_73.png', 'sprite_74.png', 'sprite_75.png', 'sprite_88.png'
    ]
  }
};

// ─── EXACT ROAD DISTANCE & SEGMENT MATH ───
function distToSegmentSquared(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  return Math.sqrt(distToSegmentSquared(px, py, x1, y1, x2, y2));
}

export class Grid {
  constructor(width = 800, height = 600, cellSize = 40) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.floor(width / cellSize);
    this.rows = Math.floor(height / cellSize);

    // Current active map ID ('grassland', 'desert', 'tundra')
    this.mapId = 'grassland';
    this.roadWidth = 20;   // Calibrated road width
    this.roadPadding = -4; // Calibrated road buffer for pixel-tight placement

    // Exact calibrated road paths matching artwork pixel-for-pixel
    this.paths = {
      grassland: [
        { x: -20, y: 140 },
        { x: 219, y: 134 },
        { x: 216, y: 371 },
        { x: 413, y: 371 },
        { x: 412, y: 89 },
        { x: 609, y: 87 },
        { x: 613, y: 488 },
        { x: 138, y: 484 },
        { x: 140, y: 580 },
        { x: 820, y: 580 }
      ],
      desert: [
        { x: -20, y: 220 },
        { x: 340, y: 220 },
        { x: 341, y: 447 },
        { x: 140, y: 446 },
        { x: 140, y: 100 },
        { x: 639, y: 103 },
        { x: 644, y: 347 },
        { x: 498, y: 350 },
        { x: 500, y: 557 },
        { x: 820, y: 557 } // Clean horizontal exit aligned with Point 8
      ],
      tundra: [
        { x: -20, y: 300 },
        { x: 518, y: 304 },
        { x: 521, y: 146 },
        { x: 226, y: 149 },
        { x: 226, y: 463 },
        { x: 653, y: 461 },
        { x: 653, y: 576 },
        { x: 820, y: 576 } // Clean horizontal exit aligned with Point 6
      ],
      cyber_city: [
        { col: -1, row: 4 },
        { col: 6, row: 4 },
        { col: 6, row: 10 },
        { col: 2, row: 10 },
        { col: 2, row: 2 },
        { col: 14, row: 2 },
        { col: 14, row: 6 },
        { col: 10, row: 6 },
        { col: 10, row: 13 },
        { col: 18, row: 13 },
        { col: 18, row: 8 },
        { col: 20, row: 8 }
      ],
      fallen_outpost: [
        { col: -1, row: 2 },
        { col: 7, row: 2 },
        { col: 7, row: 6 },
        { col: 2, row: 6 },
        { col: 2, row: 12 },
        { col: 9, row: 12 },
        { col: 9, row: 8 },
        { col: 14, row: 8 },
        { col: 14, row: 14 },
        { col: 20, row: 14 }
      ]
    };

    // Obstacle lists populated during setup
    this.obstacles = [];

    // Setup map state
    this.selectMap('grassland');

    // Map of placed towers (key: "col,row", value: Agent object)
    this.towers = new Map();
  }

  selectMap(mapId) {
    this.mapId = mapId;
    if (mapId === 'cyber_city' || mapId === 'fallen_outpost') {
      this.cellSize = 32;
      this.cols = 25;
      this.rows = 18;
    } else {
      this.cellSize = 40;
      this.cols = 20;
      this.rows = 15;
    }
    
    this.pathCheckpoints = this.paths[mapId] || this.paths.grassland;
    this.pixelPath = this.generatePixelPath();
    this.pathTiles = this.calculatePathTiles();

    // Reset and populate decorative background obstacles (trees, cacti, rocks)
    this.generateDecorations();
  }

  // Generate continuous pixel points along center of path (supports exact pixel coordinates or tile cols/rows)
  generatePixelPath() {
    const points = [];
    const checkpoints = this.pathCheckpoints || [];
    for (const cp of checkpoints) {
      points.push({
        x: cp.x !== undefined ? cp.x : (cp.col * this.cellSize + this.cellSize / 2),
        y: cp.y !== undefined ? cp.y : (cp.row * this.cellSize + this.cellSize / 2)
      });
    }
    return points;
  }

  // Calculate grid coordinates of the path
  calculatePathTiles() {
    const tiles = new Set();
    const checkpoints = this.pathCheckpoints || [];
    for (let i = 0; i < checkpoints.length - 1; i++) {
      const start = checkpoints[i];
      const end = checkpoints[i + 1];

      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);

      for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
          if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
            tiles.add(`${c},${r}`);
          }
        }
      }
    }
    return tiles;
  }

  getDistanceToRoad(px, py) {
    if (!this.pixelPath || this.pixelPath.length < 2) return Infinity;
    let minDist = Infinity;
    for (let i = 0; i < this.pixelPath.length - 1; i++) {
      const p1 = this.pixelPath[i];
      const p2 = this.pixelPath[i + 1];
      const d = distToSegment(px, py, p1.x, p1.y, p2.x, p2.y);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  // Generate decor props guaranteeing they NEVER touch or overlap the road
  generateDecorations() {
    this.obstacles = [];
    const count = 24;
    const def = MAP_PROP_DEFS[this.mapId];

    for (let i = 0; i < count; i++) {
      let isTall = def && Math.random() < 0.45;
      let hTiles = isTall ? 2 : 1;
      let propRadius = isTall ? 24 : 18;
      let attempts = 0;
      let valid = false;
      let x = 0, y = 0, baseY = 0;

      while (!valid && attempts < 150) {
        attempts++;
        x = Math.floor(Math.random() * (this.width - 80)) + 40;
        baseY = Math.floor(Math.random() * (this.height - 80)) + 50;
        y = isTall ? baseY - 35 : baseY - 18;

        // Strict road clearance: Road half-width is 22px + prop radius + safety margin
        const clearance = isTall ? 54 : 44;
        if (this.getDistanceToRoad(x, baseY) < clearance || this.getDistanceToRoad(x, y) < clearance) {
          continue;
        }

        // Avoid tutorial deployment area near (100, 100)
        if (Math.hypot(x - 100, baseY - 100) < 65) {
          continue;
        }

        // Avoid colliding with other placed obstacles
        const collidesWithOther = this.obstacles.some(o => Math.hypot(x - o.x, baseY - o.baseY) < (propRadius + o.radius + 14));
        if (collidesWithOther) {
          continue;
        }

        valid = true;
      }

      if (valid) {
        let spriteFile = null;
        if (def) {
          const list = isTall ? def.tall : def.small;
          spriteFile = def.folder + list[Math.floor(Math.random() * list.length)];
          getPropImage(spriteFile);
        }

        const col = Math.floor(x / this.cellSize);
        const row = Math.floor((baseY - (hTiles * this.cellSize)) / this.cellSize);

        let type = isTall ? 'tree' : 'rock';
        if (this.mapId === 'cyber_city') type = Math.random() < 0.6 ? 'circuit_post' : 'data_cube';
        else if (this.mapId === 'fallen_outpost') type = Math.random() < 0.5 ? 'sandbag' : 'barrel';

        this.obstacles.push({
          id: 'obs_' + i,
          col,
          row,
          hTiles,
          radius: propRadius,
          x,
          y,
          baseY,
          spriteFile,
          type
        });
      }
    }
  }

  pixelToGrid(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return { col, row };
  }

  // ─── FREEFORM PIXEL-BASED PLACEMENT VALIDATION ───
  isPositionValidForPlacement(x, y, radius = 18) {
    // 1. Check canvas bounds
    if (x - radius < 8 || x + radius > this.width - 8 || y - radius < 8 || y + radius > this.height - 8) {
      return { valid: false, reason: 'bounds' };
    }

    // 2. Check distance to road using live adjustable width and buffer
    const roadHalf = (this.roadWidth !== undefined ? this.roadWidth : 36) / 2;
    const padding = this.roadPadding !== undefined ? this.roadPadding : 0;
    if (this.getDistanceToRoad(x, y) < (roadHalf + radius + padding)) {
      return { valid: false, reason: 'road' };
    }

    // 3. Check distance to other placed troops
    if (this.towers) {
      for (const tower of this.towers.values()) {
        const otherRadius = tower.collisionRadius || 18;
        if (Math.hypot(x - tower.x, y - tower.y) < (radius + otherRadius)) {
          return { valid: false, reason: 'troop', collidingTroop: tower };
        }
      }
    }

    // 4. Check distance to scenery props/obstacles
    if (this.obstacles) {
      for (const obs of this.obstacles) {
        const obsRadius = obs.radius || 18;
        // Test collision against prop base and center
        const distBase = Math.hypot(x - obs.x, y - (obs.baseY - 10));
        const distCenter = Math.hypot(x - obs.x, y - obs.y);
        if (distBase < (radius + obsRadius) || distCenter < (radius + obsRadius)) {
          return { valid: false, reason: 'obstacle', collidingObstacle: obs };
        }
      }
    }

    return { valid: true };
  }

  // Legacy tile fallback
  isCellValidForPlacement(col, row) {
    const x = col * this.cellSize + this.cellSize / 2;
    const y = row * this.cellSize + this.cellSize / 2;
    return this.isPositionValidForPlacement(x, y).valid;
  }

  getTowerAt(x, y, clickRadius = 22) {
    if (!this.towers) return null;
    for (const tower of this.towers.values()) {
      if (Math.hypot(x - tower.x, y - tower.y) <= (tower.collisionRadius || 18) + clickRadius - 18) {
        return tower;
      }
    }
    return null;
  }

  placeTowerAt(x, y, tower) {
    tower.x = x;
    tower.y = y;
    tower.gridX = Math.floor(x / this.cellSize);
    tower.gridY = Math.floor(y / this.cellSize);
    tower.collisionRadius = 18;
    const key = `t_${Math.round(x)}_${Math.round(y)}`;
    tower.id = key;
    this.towers.set(key, tower);
    return true;
  }

  removeTower(keyOrTower) {
    if (!this.towers) return false;
    if (typeof keyOrTower === 'string') {
      return this.towers.delete(keyOrTower);
    }
    if (keyOrTower && keyOrTower.id) {
      return this.towers.delete(keyOrTower.id);
    }
    for (const [k, t] of this.towers.entries()) {
      if (t === keyOrTower) {
        return this.towers.delete(k);
      }
    }
    return false;
  }

  clear() {
    if (this.towers) {
      this.towers.clear();
    }
  }

  draw(ctx) {
    const bgImg = mapBackgroundImages[this.mapId];
    const hasBgImage = bgImg && bgImg.complete && bgImg.naturalWidth > 0;

    if (hasBgImage) {
      // 1. Draw High-Resolution Map Background (Ground & Path rendered directly)
      ctx.drawImage(bgImg, 0, 0, this.width, this.height);
    } else {
      // Procedural fallback
      let terrainColor = '#7dcd40';
      let pathColor = '#dfc39e';
      let borderOutlineColor = '#222222';

      if (this.mapId === 'desert') {
        terrainColor = '#f9e79f';
        pathColor = '#e5c494';
      } else if (this.mapId === 'tundra') {
        terrainColor = '#ebf5fb';
        pathColor = '#d4e6f1';
      } else if (this.mapId === 'cyber_city') {
        terrainColor = '#0a1628';
        pathColor = '#1e3a4a';
        borderOutlineColor = '#00ffe0';
      } else if (this.mapId === 'fallen_outpost') {
        terrainColor = '#c8a96e';
        pathColor = '#8b6914';
      }

      ctx.fillStyle = terrainColor;
      ctx.fillRect(0, 0, this.width, this.height);

      if (this.pixelPath && this.pixelPath.length > 1) {
        ctx.save();
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = borderOutlineColor;
        ctx.lineWidth = this.cellSize + 6;
        ctx.beginPath();
        ctx.moveTo(this.pixelPath[0].x, this.pixelPath[0].y);
        for (let i = 1; i < this.pixelPath.length; i++) ctx.lineTo(this.pixelPath[i].x, this.pixelPath[i].y);
        ctx.stroke();

        ctx.strokeStyle = pathColor;
        ctx.lineWidth = this.cellSize;
        ctx.beginPath();
        ctx.moveTo(this.pixelPath[0].x, this.pixelPath[0].y);
        for (let i = 1; i < this.pixelPath.length; i++) ctx.lineTo(this.pixelPath[i].x, this.pixelPath[i].y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Draw Decorative Obstacles sorted by Y (so tall trees overlap realistically)
    if (this.obstacles && this.obstacles.length > 0) {
      const sorted = [...this.obstacles].sort((a, b) => (a.baseY || a.y) - (b.baseY || b.y));
      for (const obs of sorted) {
        this.drawObstacle(ctx, obs);
      }
    }
  }

  drawObstacle(ctx, obs) {
    ctx.save();

    // If an image sprite is assigned, render the PNG with a soft shadow
    if (obs.spriteFile) {
      const img = getPropImage(obs.spriteFile);
      if (img.complete && img.naturalWidth > 0) {
        const isTall = obs.hTiles === 2;
        const w = isTall ? 48 : 38;
        const h = isTall ? 78 : 38;
        const drawX = obs.x - w / 2;
        const drawY = obs.baseY - h + 2;

        // Ground shadow under tree base / rock
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.beginPath();
        ctx.ellipse(obs.x, obs.baseY - 4, w * 0.45, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.drawImage(img, drawX, drawY, w, h);
        ctx.restore();
        return;
      }
    }

    // Procedural Fallback if image isn't loaded yet
    ctx.translate(obs.x, obs.y);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;

    switch (obs.type) {
      case 'tree':
        ctx.fillStyle = '#784212';
        ctx.fillRect(-4, 6, 8, 10);
        ctx.strokeRect(-4, 6, 8, 10);
        ctx.fillStyle = '#1e8449';
        ctx.beginPath();
        ctx.moveTo(0, -16); ctx.lineTo(14, 0); ctx.lineTo(-14, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(16, 10); ctx.lineTo(-16, 10);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;

      case 'rock':
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath();
        ctx.rect(-10, -6, 20, 16);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath();
        ctx.rect(-4, -10, 10, 8);
        ctx.fill(); ctx.stroke();
        break;

      case 'circuit_post':
        ctx.fillStyle = '#0d2137';
        ctx.fillRect(-5, -14, 10, 28);
        ctx.strokeStyle = '#00ffe0';
        ctx.lineWidth = 2;
        ctx.strokeRect(-5, -14, 10, 28);
        break;

      case 'data_cube':
        ctx.fillStyle = '#112240';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.strokeStyle = '#00ffe0';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -9, 18, 18);
        break;

      case 'sandbag':
        ctx.fillStyle = '#c8a96e';
        ctx.fillRect(-12, 0, 24, 8);
        ctx.strokeRect(-12, 0, 24, 8);
        break;

      case 'barrel':
        ctx.fillStyle = '#7b3f00';
        ctx.fillRect(-8, -8, 16, 14);
        ctx.strokeRect(-8, -8, 16, 14);
        break;
    }

    ctx.restore();
  }

  // (Debug calibrator methods removed for production)
}