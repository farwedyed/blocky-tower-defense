// Grid and Map Terrain Module for Blocky Tactical Defense (BTD 2D)

export class Grid {
  constructor(width = 800, height = 600, cellSize = 40) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.floor(width / cellSize);
    this.rows = Math.floor(height / cellSize);

    // Current active map ID ('grassland', 'desert', 'tundra')
    this.mapId = 'grassland';

    // Grid checkpoints definitions for five maps
    this.paths = {
      grassland: [
        { col: -1, row: 3 },
        { col: 5, row: 3 },
        { col: 5, row: 9 },
        { col: 10, row: 9 },
        { col: 10, row: 2 },
        { col: 15, row: 2 },
        { col: 15, row: 12 },
        { col: 3, row: 12 },
        { col: 3, row: 14 },
        { col: 20, row: 14 }
      ],
      desert: [
        { col: -1, row: 5 },
        { col: 8, row: 5 },
        { col: 8, row: 11 },
        { col: 3, row: 11 },
        { col: 3, row: 2 },
        { col: 16, row: 2 },
        { col: 16, row: 8 },
        { col: 12, row: 8 },
        { col: 12, row: 14 },
        { col: 20, row: 14 }
      ],
      tundra: [
        { col: -1, row: 7 },
        { col: 12, row: 7 },
        { col: 12, row: 3 },
        { col: 4, row: 3 },
        { col: 4, row: 11 },
        { col: 16, row: 11 },
        { col: 16, row: 14 },
        { col: 20, row: 14 }
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
    
    // Adjust checkpoints if needed. Let's make sure checkpoints on paths match boundary limits.
    // grassland/desert/tundra/fallen_outpost end col is 20 (fits cols=20 and 25).
    // Cyber city path ends on col 20. If cols=25, end point should adjust or map is drawn centered/correctly.
    // Standard path checkpoints use cols coordinate relative to cell size.
    // Let's force any coordinate matching col: 20 or row: 14 to adapt, but paths are already col/row based.
    this.pathCheckpoints = this.paths[mapId] || this.paths.grassland;

    // Adjust any path coordinate that goes outside bounds
    this.pathCheckpoints = this.pathCheckpoints.map(cp => {
      let c = cp.col;
      let r = cp.row;
      if (c === 20 && (mapId === 'cyber_city' || mapId === 'fallen_outpost')) {
        c = 25; // extend path to edge of cols=25
      }
      return { col: c, row: r };
    });

    this.pixelPath = this.generatePixelPath();
    this.pathTiles = this.calculatePathTiles();

    // Reset and populate decorative background obstacles (trees, cacti, rocks)
    this.generateDecorations();
  }

  // Generate continuous pixel points along center of path
  generatePixelPath() {
    const points = [];
    for (const checkpoint of this.pathCheckpoints) {
      points.push({
        x: checkpoint.col * this.cellSize + this.cellSize / 2,
        y: checkpoint.row * this.cellSize + this.cellSize / 2
      });
    }
    return points;
  }

  // Calculate grid coordinates of the path
  calculatePathTiles() {
    const tiles = new Set();
    for (let i = 0; i < this.pathCheckpoints.length - 1; i++) {
      const start = this.pathCheckpoints[i];
      const end = this.pathCheckpoints[i + 1];

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

  // Generate background decor items outside of paths
  generateDecorations() {
    this.obstacles = [];
    const count = 18;

    for (let i = 0; i < count; i++) {
      let col, row, key;
      let attempts = 0;
      do {
        col = Math.floor(Math.random() * this.cols);
        row = Math.floor(Math.random() * this.rows);
        key = `${col},${row}`;
        attempts++;
      } while (
        (this.pathTiles.has(key) || 
         this.hasObstacleNear(col, row) || 
         (col === 2 && row === 2)) && // Explicitly exclude tutorial placement tile (2, 2)
        attempts < 100
      );

      if (attempts < 100) {
        const x = col * this.cellSize + this.cellSize / 2;
        const y = row * this.cellSize + this.cellSize / 2;

        let type = 'rock';
        if (this.mapId === 'grassland') {
          type = Math.random() < 0.7 ? 'tree' : 'rock';
        } else if (this.mapId === 'desert') {
          type = Math.random() < 0.6 ? 'cactus' : 'rock';
        } else if (this.mapId === 'tundra') {
          type = Math.random() < 0.75 ? 'snowtree' : 'icecrystal';
        } else if (this.mapId === 'cyber_city') {
          type = Math.random() < 0.6 ? 'circuit_post' : 'data_cube';
        } else if (this.mapId === 'fallen_outpost') {
          type = Math.random() < 0.5 ? 'sandbag' : 'barrel';
        }

        this.obstacles.push({ col, row, x, y, type });
      }
    }
  }

  hasObstacleNear(col, row) {
    return this.obstacles.some(obs => Math.abs(obs.col - col) <= 1 && Math.abs(obs.row - row) <= 1);
  }

  pixelToGrid(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return { col, row };
  }

  isCellValidForPlacement(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return false;
    }
    // Check if cell is path
    if (this.pathTiles.has(`${col},${row}`)) {
      return false;
    }
    // Check if tower occupies it
    if (this.towers.has(`${col},${row}`)) {
      return false;
    }
    // Check if background obstacles occupy it
    const hasObstacle = this.obstacles.some(o => o.col === col && o.row === row);
    if (hasObstacle) {
      return false;
    }
    return true;
  }

  placeTower(col, row, tower) {
    if (this.isCellValidForPlacement(col, row)) {
      this.towers.set(`${col},${row}`, tower);
      return true;
    }
    return false;
  }

  removeTower(col, row) {
    return this.towers.delete(`${col},${row}`);
  }

  clear() {
    this.towers.clear();
  }

  draw(ctx) {
    // 1. Draw Map Base Background
    let terrainColor = '#7dcd40'; // Grassland default
    let pathColor = '#dfc39e';
    let borderOutlineColor = '#222222';

    if (this.mapId === 'desert') {
      terrainColor = '#f9e79f';
      pathColor = '#e5c494';
    } else if (this.mapId === 'tundra') {
      terrainColor = '#ebf5fb';
      pathColor = '#d4e6f1';
    } else if (this.mapId === 'cyber_city') {
      terrainColor = '#0a1628'; // Dark navy circuit board floor
      pathColor = '#1e3a4a';   // Carbon grey path
      borderOutlineColor = '#00ffe0';
    } else if (this.mapId === 'fallen_outpost') {
      terrainColor = '#c8a96e'; // Sandy desert floor
      pathColor = '#8b6914';   // Dark sand path
    }

    ctx.fillStyle = terrainColor;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle flat checkerboard details for toy feel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        if ((c + r) % 2 === 0) {
          ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
        }
      }
    }

    // 2. Draw Dirt Path with Blocky outlines
    ctx.save();
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    // Black path border outline
    ctx.strokeStyle = borderOutlineColor;
    ctx.lineWidth = this.cellSize + 6;
    ctx.beginPath();
    ctx.moveTo(this.pixelPath[0].x, this.pixelPath[0].y);
    for (let i = 1; i < this.pixelPath.length; i++) {
      ctx.lineTo(this.pixelPath[i].x, this.pixelPath[i].y);
    }
    ctx.stroke();

    // Actual path fill
    ctx.strokeStyle = pathColor;
    ctx.lineWidth = this.cellSize;
    ctx.beginPath();
    ctx.moveTo(this.pixelPath[0].x, this.pixelPath[0].y);
    for (let i = 1; i < this.pixelPath.length; i++) {
      ctx.lineTo(this.pixelPath[i].x, this.pixelPath[i].y);
    }
    ctx.stroke();

    ctx.restore();

    // 3. Draw Decorative Obstacles (Blocky/Flat Vector Style)
    for (const obs of this.obstacles) {
      this.drawObstacle(ctx, obs);
    }
  }

  drawObstacle(ctx, obs) {
    ctx.save();
    ctx.translate(obs.x, obs.y);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;

    switch (obs.type) {
      case 'tree': // Grassland pine tree
        // Draw trunk
        ctx.fillStyle = '#784212';
        ctx.fillRect(-4, 6, 8, 10);
        ctx.strokeRect(-4, 6, 8, 10);

        // Draw blocky foliage triangles
        ctx.fillStyle = '#1e8449';
        
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(14, 0);
        ctx.lineTo(-14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(16, 10);
        ctx.lineTo(-16, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'rock': // Flat blocky rock
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath();
        ctx.rect(-10, -6, 20, 16);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath();
        ctx.rect(-4, -10, 10, 8);
        ctx.fill();
        ctx.stroke();
        break;

      case 'cactus': // Desert Cactus
        ctx.fillStyle = '#27ae60';
        // Main stem
        ctx.fillRect(-5, -12, 10, 26);
        ctx.strokeRect(-5, -12, 10, 26);
        // Left arm
        ctx.fillRect(-12, -4, 7, 5);
        ctx.strokeRect(-12, -4, 7, 5);
        ctx.fillRect(-12, -10, 5, 8);
        ctx.strokeRect(-12, -10, 5, 8);
        // Right arm
        ctx.fillRect(5, 2, 7, 5);
        ctx.strokeRect(5, 2, 7, 5);
        ctx.fillRect(8, -4, 5, 8);
        ctx.strokeRect(8, -4, 5, 8);
        break;

      case 'snowtree': // Tundra tree with snowy details
        // Trunk
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(-4, 6, 8, 10);
        ctx.strokeRect(-4, 6, 8, 10);

        // Lower foliage
        ctx.fillStyle = '#227093';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(16, 10);
        ctx.lineTo(-16, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Upper foliage (white snow caps)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(12, -2);
        ctx.lineTo(-12, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'icecrystal': // Cold crystals
        ctx.fillStyle = '#5dade2';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(8, -2);
        ctx.lineTo(4, 10);
        ctx.lineTo(-4, 10);
        ctx.lineTo(-8, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Inner highlights
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(3, -2);
        ctx.lineTo(1, 6);
        ctx.lineTo(-1, 6);
        ctx.lineTo(-3, -2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'circuit_post': // Cyber City — glowing circuit post
        ctx.fillStyle = '#0d2137';
        ctx.fillRect(-5, -14, 10, 28);
        ctx.strokeStyle = '#00ffe0';
        ctx.lineWidth = 2;
        ctx.strokeRect(-5, -14, 10, 28);
        // Glow ring
        ctx.fillStyle = '#00ffe0';
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillRect(-3, -8, 6, 6);
        break;

      case 'data_cube': // Cyber City — glowing data cube
        ctx.fillStyle = '#112240';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.strokeStyle = '#00ffe0';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -9, 18, 18);
        // Inner circuit lines
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
        ctx.moveTo(0, -9); ctx.lineTo(0, 9);
        ctx.strokeStyle = 'rgba(0,255,224,0.4)';
        ctx.stroke();
        break;

      case 'sandbag': // Fallen Outpost — stacked sandbags
        ctx.fillStyle = '#c8a96e';
        ctx.fillRect(-12, 0, 24, 8);
        ctx.strokeRect(-12, 0, 24, 8);
        ctx.fillRect(-9, -8, 18, 8);
        ctx.strokeRect(-9, -8, 18, 8);
        ctx.fillStyle = '#a07040';
        ctx.fillRect(-12, 1, 24, 2);
        ctx.fillRect(-9, -7, 18, 2);
        break;

      case 'barrel': // Fallen Outpost — rusted barrel
        ctx.fillStyle = '#7b3f00';
        ctx.beginPath();
        ctx.ellipse(0, 4, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(-8, -8, 16, 14);
        ctx.strokeRect(-8, -8, 16, 14);
        ctx.fillStyle = '#5c2e00';
        ctx.fillRect(-8, -4, 16, 3);
        ctx.fillRect(-8, 2, 16, 3);
        break;
    }

    ctx.restore();
  }
}