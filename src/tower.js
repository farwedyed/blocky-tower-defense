// Agent (Tower) Characters Module for Blocky Tactical Defense (BTD 2D)

import { Bullet, MinigunnerBullet, FlameProjectile, DJMusicWave, Rocket, FreezeBullet, ShotgunPellet, VehicleProjectile, RangerBullet, TurretBullet } from './bullet.js';
import { soundManager } from './sound.js';

export class Agent {
  constructor(gridX, gridY, cellSize, stats) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.cellSize = cellSize;

    // Pixel coordinates at cell center
    this.x = gridX * cellSize + cellSize / 2;
    this.y = gridY * cellSize + cellSize / 2;

    this.range = stats.range || 120;
    this.damage = stats.damage || 10;
    this.fireRate = stats.fireRate || 1.0;
    this.cost = stats.cost || 100;
    this.level = 1;
    this.type = stats.type || 'scout';
    this.color = stats.color || '#3498db';
    this.name = stats.name || 'Agent';

    // Camo, Armor-piercing, and targeting restrictions
    this.camoDetection = stats.camoDetection || false;
    this.armorPenetration = stats.armorPenetration || false;
    this.isMeleeOnly = stats.isMeleeOnly || false;

    this.fireCooldown = 0;
    this.angle = 0;
    this._equippedSkin = 'default';

    // Support Buff variables
    this.djRangeBuffed = false;
    this.djCamoDetectionBuffed = false;
    this.commanderSpeedBuffed = false;
    this.commanderAbilityActive = false;
    this.stunResistance = false;

    // Targeting strategies
    this.targetingStrategy = 'first';

    // Recoil and animations
    this.recoilOffset = 0;
    this.muzzleFlashActive = false;
    this.timeAccumulator = 0;
  }

  get equippedSkin() {
    return this._equippedSkin;
  }

  set equippedSkin(value) {
    this._equippedSkin = value;
    this.applySkinBuffs();
  }

  applySkinBuffs() {
    if (!this._equippedSkin || this._equippedSkin === 'default') return;

    if (this._equippedSkin.endsWith('_Golden')) {
      this.damage = Math.floor(this.damage * 1.25);
      this.fireRate = Number((this.fireRate * 1.15).toFixed(2));
    } else if (this._equippedSkin.endsWith('_Cyber')) {
      this.range = Math.floor(this.range * 1.15);
    } else if (this._equippedSkin.endsWith('_Hazmat')) {
      this.stunResistance = true;
    }
  }

  acquireTarget(enemies) {
    const hasCamoDetection = this.camoDetection || this.djCamoDetectionBuffed;

    const inRange = enemies.filter(enemy => {
      if (enemy.health <= 0) return false;
      if (this.isMeleeOnly && enemy.isFlying) return false;
      if (enemy.isCamo && !hasCamoDetection) return false;

      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      const djMultiplier = this.djRangeBuffed ? (this.type !== 'dj' && this.level >= 5 ? 1.20 : 1.15) : 1.0;
      return dist <= (this.range * djMultiplier);
    });

    if (inRange.length === 0) return null;

    if (this.targetingStrategy === 'first') {
      return inRange.reduce((best, curr) => {
        const bestVal = best.targetNodeIndex * 1000 - Math.hypot(best.x - this.x, best.y - this.y);
        const currVal = curr.targetNodeIndex * 1000 - Math.hypot(curr.x - this.x, curr.y - this.y);
        return currVal > bestVal ? curr : best;
      });
    }

    if (this.targetingStrategy === 'last') {
      return inRange.reduce((best, curr) => {
        const bestVal = best.targetNodeIndex * 1000 - Math.hypot(best.x - this.x, best.y - this.y);
        const currVal = curr.targetNodeIndex * 1000 - Math.hypot(curr.x - this.x, curr.y - this.y);
        return currVal < bestVal ? curr : best;
      });
    }

    if (this.targetingStrategy === 'strongest') {
      return inRange.reduce((best, curr) => curr.health > best.health ? curr : best);
    }

    if (this.targetingStrategy === 'weakest') {
      return inRange.reduce((best, curr) => curr.health < best.health ? curr : best);
    }

    return inRange[0];
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;

    if (this.fireCooldown > 0) {
      const cooldownDeduction = this.stunResistance ? dt * 1.4 : dt;
      this.fireCooldown -= cooldownDeduction;
    } else {
      this.muzzleFlashActive = false;
    }

    if (this.recoilOffset > 0) {
      this.recoilOffset -= dt * 30;
      if (this.recoilOffset < 0) this.recoilOffset = 0;
    }

    let speedMultiplier = this.commanderSpeedBuffed ? 1.35 : 1.0;
    if (this.commanderAbilityActive) {
      speedMultiplier *= 1.40;
    }
    const currentFireRate = this.fireRate * speedMultiplier;
    
    const djMultiplier = this.djRangeBuffed ? (this.level >= 5 ? 1.20 : 1.15) : 1.0;
    const currentRange = this.range * djMultiplier;

    if (this.target) {
      const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (this.target.health <= 0 || dist > currentRange) {
        this.target = null;
      }
    }

    if (!this.target && this.fireRate > 0) {
      this.target = this.acquireTarget(enemies);
    }

    if (this.target) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let diff = targetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * Math.min(1.0, dt * 10);

      if (this.fireCooldown <= 0 && this.fireRate > 0) {
        this.fire(effectManager, bullets);
        soundManager.playShoot();
        this.fireCooldown = 1.0 / currentFireRate;
      }
    }
  }

  fire(effectManager, bullets) {
    // Overwritten by subclasses
  }

  upgrade(effectManager) {
    this.level++;
    effectManager.spawnText(this.x, this.y - 25, `LEVEL ${this.level}`, '#2ecc71');
    effectManager.spawnPlacementSparks(this.x, this.y, this.cellSize);
  }

  getUpgradeCost() {
    if (this.level >= 5) return 0;
    
    // Dedicated lookup arrays matching actual Roblox TDS pricing exactly
    const costsMap = {
      scout: [50, 550, 1350, 1400, 2500],
      soldier: [150, 450, 1200, 2200, 4500],
      sniper: [100, 350, 950, 2500, 5500],
      demoman: [150, 400, 1100, 2400, 5000],
      farm: [250, 650, 1500, 3500, 7500],
      medic: [200, 600, 1400, 3000, 6500],
      pyromancer: [150, 500, 1200, 2600, 5500],
      rocketeer: [250, 700, 1800, 3800, 8000],
      freezer: [100, 400, 1000, 2200, 4800],
      shotgunner: [150, 500, 1300, 2700, 5800],
      crook_boss: [250, 800, 2000, 4200, 9000],
      military_base: [300, 900, 2400, 4800, 10000],
      minigunner: [500, 1000, 2500, 5000, 9500],
      commander: [200, 650, 1600, 3200, 7000],
      dj: [300, 900, 2200, 4500, 9500],
      ranger: [600, 1500, 3500, 7000, 14000],
      turret: [500, 1200, 3000, 6500, 13000],
      gladiator: [200, 500, 1200, 2800, 6000]
    };

    const costs = costsMap[this.type] || [100, 300, 800, 1800, 4000];
    const baseCost = costs[this.level - 1] || 500;
    const discount = this.djRangeBuffed ? (this.level >= 5 ? 0.85 : 0.90) : 1.0;
    return Math.floor(baseCost * discount);
  }

  getSellValue() {
    let invested = this.cost;
    for (let l = 1; l < this.level; l++) {
      invested += this.getUpgradeCostForLevel(l);
    }
    return Math.floor(invested * 0.65);
  }

  getUpgradeCostForLevel(lvl) {
    const costsMap = {
      scout: [50, 550, 1350, 1400, 2500],
      soldier: [150, 450, 1200, 2200, 4500],
      sniper: [100, 350, 950, 2500, 5500],
      demoman: [150, 400, 1100, 2400, 5000],
      farm: [250, 650, 1500, 3500, 7500],
      medic: [200, 600, 1400, 3000, 6500],
      pyromancer: [150, 500, 1200, 2600, 5500],
      rocketeer: [250, 700, 1800, 3800, 8000],
      freezer: [100, 400, 1000, 2200, 4800],
      shotgunner: [150, 500, 1300, 2700, 5800],
      crook_boss: [250, 800, 2000, 4200, 9000],
      military_base: [300, 900, 2400, 4800, 10000],
      minigunner: [500, 1000, 2500, 5000, 9500],
      commander: [200, 650, 1600, 3200, 7000],
      dj: [300, 900, 2200, 4500, 9500],
      ranger: [600, 1500, 3500, 7000, 14000],
      turret: [500, 1200, 3000, 6500, 13000],
      gladiator: [200, 500, 1200, 2800, 6000]
    };
    const costs = costsMap[this.type] || [100, 300, 800, 1800, 4000];
    const baseCost = costs[lvl - 1] || 500;
    const discount = this.djRangeBuffed ? 0.90 : 1.0;
    return Math.floor(baseCost * discount);
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3.5;
    
    // Bottom shadow
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.rect(this.x - this.cellSize * 0.4, this.y - this.cellSize * 0.4 + 4, this.cellSize * 0.8, this.cellSize * 0.8);
    ctx.fill();
    ctx.stroke();

    // Top face
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.rect(this.x - this.cellSize * 0.4, this.y - this.cellSize * 0.4, this.cellSize * 0.8, this.cellSize * 0.8);
    ctx.fill();
    ctx.stroke();

    // Support highlights
    if (this.djRangeBuffed) {
      ctx.strokeStyle = '#9b59b6';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(this.x - this.cellSize * 0.43, this.y - this.cellSize * 0.43, this.cellSize * 0.86, this.cellSize * 0.86);
    }
    if (this.commanderSpeedBuffed) {
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(this.x - this.cellSize * 0.46, this.y - this.cellSize * 0.46, this.cellSize * 0.92, this.cellSize * 0.92);
    }

    ctx.restore();
  }

  drawBlockyAgent(ctx, hairColor, accessoryCallback) {
    const bob = Math.sin(this.timeAccumulator * 8.0) * 1.2;

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(this.angle);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    let currentTorsoColor = this.color;
    if (this._equippedSkin && this._equippedSkin !== 'default') {
      if (this._equippedSkin.endsWith('_Golden')) {
        currentTorsoColor = '#f1c40f';
      } else if (this._equippedSkin.endsWith('_Cyber')) {
        currentTorsoColor = '#00ffe0';
      } else if (this._equippedSkin.endsWith('_Hazmat')) {
        currentTorsoColor = '#2ecc71';
      }
    }

    ctx.fillStyle = currentTorsoColor;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeRect(-8, -8, 16, 16);

    ctx.fillStyle = '#222';
    ctx.fillRect(-8, 5, 16, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(-6, -8, 3, 13);
    ctx.fillRect(3, -8, 3, 13);

    ctx.fillStyle = currentTorsoColor;
    ctx.fillRect(4, -11, 5, 4);
    ctx.strokeRect(4, -11, 5, 4);
    ctx.fillRect(4, 7, 5, 4);
    ctx.strokeRect(4, 7, 5, 4);

    ctx.fillStyle = '#cca080';
    ctx.fillRect(-5.5, -5.5, 11, 11);

    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-5, -5, 10, 10);

    ctx.fillStyle = '#111';
    ctx.fillRect(2, -3, 2, 2);
    ctx.fillRect(2, 1, 2, 2);
    ctx.fillRect(3, -1, 1, 2);

    if (hairColor) {
      ctx.fillStyle = hairColor;
      ctx.fillRect(-6, -5, 2, 10);
    }

    if (accessoryCallback) {
      accessoryCallback(ctx);
    }

    ctx.restore();
  }
}

// ─── 1. SCOUT (OFFICIAL ROBST TDS RETUNED METRICS) ───
export class Scout extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 90,      
      damage: 1, // Rebalanced down from 3       
      fireRate: 1.0,   
      cost: 100,
      type: 'scout',
      color: '#3498db',
      name: 'Scout'
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 4;
    this.muzzleFlashActive = true;
    
    const muzzleX = this.x + Math.cos(this.angle) * 18;
    const muzzleY = this.y + Math.sin(this.angle) * 18;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 10);

    if (this.level >= 4) {
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 650, damage: this.damage, color: '#f1c40f', radius: 3 }));
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 650, damage: this.damage, color: '#f1c40f', radius: 3 }));
    } else {
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 600, damage: this.damage, color: '#f1c40f', radius: 3.5 }));
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Exact Roblox TDS stat progression mechanics
    if (this.level === 2) {
      this.fireRate = 1.33; 
    } else if (this.level === 3) {
      this.damage = 3;
      this.range = 105;
    } else if (this.level === 4) {
      this.fireRate = 1.66;
      this.camoDetection = true;
    } else if (this.level === 5) {
      this.damage = 6;
      this.fireRate = 2.0;
      this.range = 120;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#8d6e63'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#222'; 
        c.fillRect(7 - this.recoilOffset, 1, 7, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#2c3e50'; 
        c.fillRect(-5, -6, 3, 12);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(-8, -2, 2, 4);
        c.fillStyle = '#111'; 
        c.fillRect(7 - this.recoilOffset, 1, 9, 3.5);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -8, 10, 4);
        c.fillRect(6 - this.recoilOffset, 4, 10, 4);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#2ecc71'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -8, 12, 4);
        c.fillRect(6 - this.recoilOffset, 4, 12, 4);
        c.fillStyle = '#ff0055'; 
        c.fillRect(15 - this.recoilOffset, -7, 2, 1);
        c.fillRect(15 - this.recoilOffset, 5, 2, 1);
      } 
      else {
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#e67e22'; 
        c.fillRect(7 - this.recoilOffset, -8, 13, 4);
        c.fillRect(7 - this.recoilOffset, 4, 13, 4);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(16 - this.recoilOffset, -7, 2, 1);
        c.fillRect(16 - this.recoilOffset, 5, 2, 1);
      }
    });
  }
}

// ─── 2. SOLDIER ───
export class Soldier extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 90,      
      damage: 2, // Rebalanced down from 4       
      fireRate: 2.0,   
      cost: 350, // Rebalanced from 300
      type: 'soldier',
      color: '#27ae60',
      name: 'Soldier'
    });
    this.burstCount = 0;
  }

  fire(effectManager, bullets) {
    this.muzzleFlashActive = true;
    this.recoilOffset = 3;

    const muzzleX = this.x + Math.cos(this.angle) * 18;
    const muzzleY = this.y + Math.sin(this.angle) * 18;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 9);

    bullets.push(new Bullet(this.x, this.y, this.target, {
      speed: 620,
      damage: this.damage,
      color: '#f39c12',
      radius: 3
    }));

    this.burstCount++;
    const maxBurst = this.level >= 5 ? 5 : 3;
    if (this.burstCount >= maxBurst) {
      this.burstCount = 0;
      this.fireCooldown = 0.8; 
    } else {
      this.fireCooldown = 0.12; 
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Soldier stats matching TDS progression
    if (this.level === 2) {
      this.fireRate = 2.22;
    } else if (this.level === 3) {
      this.damage = 3;
      this.range = 100;
    } else if (this.level === 4) {
      this.fireRate = 2.50;
    } else if (this.level === 5) {
      this.damage = 4;
      this.fireRate = 3.33;
      this.range = 110;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    if (this.level >= 3 && this.target && this.target.health > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 49, 49, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
      ctx.restore();
    }

    this.drawBlockyAgent(ctx, '#27ae60', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 1, 12, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#1e3d2f'; 
        c.fillRect(-6, -6, 3, 12);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 1, 14, 4);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#00ff55'; 
        c.fillRect(-8, -2, 2, 4);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 1, 15, 4.5);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(9 - this.recoilOffset, -1, 3, 2);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -4, 15, 4);
        c.fillRect(6 - this.recoilOffset, 4, 15, 4);
      } 
      else {
        c.fillStyle = '#c0392b'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#ff0055'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 0, 18, 5.5);
        c.fillStyle = '#ff0055'; 
        c.fillRect(12 - this.recoilOffset, 1, 4, 2);
      }
    });
  }
}

// ─── 3. SNIPER ───
export class Sniper extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 180,      
      damage: 4, // Rebalanced down from 15      
      fireRate: 0.25,  
      cost: 250,
      type: 'sniper',
      color: '#e67e22',
      name: 'Sniper'
    });
  }

  fire(effectManager, bullets) {
    this.muzzleFlashActive = true;
    this.recoilOffset = 6;

    const muzzleX = this.x + Math.cos(this.angle) * 22;
    const muzzleY = this.y + Math.sin(this.angle) * 22;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 12);

    bullets.push(new Bullet(this.x, this.y, this.target, {
      speed: 1000,
      damage: this.damage,
      color: '#e67e22',
      radius: 2.5,
      damageType: this.level >= 5 ? 'explosive' : 'physical'
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Sniper stats matching TDS progression
    if (this.level === 2) {
      this.damage = 6;
    } else if (this.level === 3) {
      this.damage = 10;
      this.range = 200;
      this.camoDetection = true; 
    } else if (this.level === 4) {
      this.damage = 20;
    } else if (this.level === 5) {
      this.damage = 35;
      this.range = 220;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    if (this.target && this.target.health > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(230, 126, 34, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
      ctx.restore();
    }

    this.drawBlockyAgent(ctx, '#d35400', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#8d6e63'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 0, 16, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-10, -5, 3, 10);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 0, 18, 3);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(10 - this.recoilOffset, -2, 4, 2);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#27ae60'; 
        c.fillRect(-11, -7, 4, 14);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 18, 4);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(18 - this.recoilOffset, 1, 2, 1);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#2c3e50'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 22, 5);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(12 - this.recoilOffset, -3, 6, 2);
      } 
      else {
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#e67e22'; 
        c.fillRect(6 - this.recoilOffset, -1, 24, 6);
        c.fillStyle = '#f1c40f'; 
        c.fillRect(14 - this.recoilOffset, -3, 6, 2);
      }
    });
  }
}

// ─── 4. DEMOMAN ───
export class Demoman extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,
      damage: 6, // Rebalanced down from 10
      fireRate: 0.45,
      cost: 300,
      type: 'demoman',
      color: '#34495e',
      name: 'Demoman'
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 5;
    this.muzzleFlashActive = true;
    bullets.push(new Rocket(this.x, this.y, this.target, {
      speed: 280,
      damage: this.damage,
      color: '#34495e',
      radius: 5,
      splashRadius: 60 + this.level * 8
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Demoman stats matching TDS progression
    if (this.level === 2) {
      this.damage = 8;
    } else if (this.level === 3) {
      this.damage = 11;
      this.range = 115;
    } else if (this.level === 4) {
      this.damage = 15;
    } else if (this.level === 5) {
      this.damage = 22;
      this.range = 120;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 0, 10, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#2c3e50'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 12, 5);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#111'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#d35400'; 
        c.fillRect(-4, -8, 2, 16);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -1, 14, 5);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#2c3e50';
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#ff6700'; 
        c.fillRect(-11, -7, 4, 14);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 16, 6);
      } 
      else {
        c.fillStyle = '#111';
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#ff6700'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillRect(8, -7, 4, 14);
        c.fillStyle = '#e67e22'; 
        c.fillRect(6 - this.recoilOffset, -4, 15, 4);
        c.fillRect(6 - this.recoilOffset, 4, 15, 4);
      }
    });
  }
}

// ─── 5. FARM ───
export class Farm extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 0,
      damage: 0,
      fireRate: 0, 
      cost: 250,
      type: 'farm',
      color: '#8d6e63',
      name: 'Farm'
    });
  }

  getHarvestIncome() {
    switch (this.level) {
      case 1: return 80;
      case 2: return 160;
      case 3: return 360;
      case 4: return 800;
      case 5: return 1500; // Balanced payouts matching TDS economy scale
      default: return 80;
    }
  }

  // Custom step-by-step upgrade costs for Farm to mimic TDS design
  getUpgradeCost() {
    if (this.level >= 5) return 0;
    const costs = [250, 650, 1500, 3500, 7500];
    const baseCost = costs[this.level - 1] || 500;
    const discount = this.djRangeBuffed ? 0.90 : 1.0;
    return Math.floor(baseCost * discount);
  }

  draw(ctx) {
    super.draw(ctx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    if (this.level === 1) {
      ctx.fillStyle = '#8d6e63'; 
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = '#4caf50'; 
      ctx.fillRect(-6, -6, 3, 3);
      ctx.fillRect(4, 3, 3, 3);
    } 
    else if (this.level === 2) {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = '#f1c40f'; 
      ctx.fillRect(-6, -6, 3, 8);
      ctx.fillRect(4, 2, 3, 8);
    } 
    else if (this.level === 3) {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = '#e74c3c'; 
      ctx.fillRect(-10, -10, 8, 12);
      ctx.strokeRect(-10, -10, 8, 12);
      ctx.fillStyle = '#f1c40f'; 
      ctx.fillRect(3, -5, 6, 12);
    } 
    else if (this.level === 4) {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.fillStyle = '#3498db'; 
      ctx.fillRect(-10, -12, 8, 20);
      ctx.strokeRect(-10, -12, 8, 20);
      ctx.fillStyle = '#f1c40f'; 
      ctx.fillRect(3, -6, 8, 16);
    } 
    else {
      ctx.fillStyle = '#d4ac0d'; 
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);

      ctx.fillStyle = '#c0392b'; 
      ctx.fillRect(-11, -11, 10, 22);
      ctx.strokeRect(-11, -11, 10, 22);

      ctx.fillStyle = '#7f8c8d'; 
      ctx.fillRect(4, -8, 8, 20);
      ctx.strokeRect(4, -8, 8, 20);

      const rotateSpeed = this.timeAccumulator * 5.0;
      ctx.save();
      ctx.translate(8, -8);
      ctx.rotate(rotateSpeed);
      ctx.strokeStyle = '#ebf5fb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
      ctx.moveTo(0, -10); ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ─── 6. MEDIC ───
export class Medic extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 100,      
      damage: 1, // Rebalanced down from 3       
      fireRate: 0.8,   
      cost: 350,
      type: 'medic',
      color: '#e74c3c',
      name: 'Medic'
    });
    this.abilityCooldown = 45;
    this.abilityDuration = 6;
    this.abilityCooldownTimer = 0;
    this.abilityActiveTimer = 0;
    this.isAbilityActive = false;
  }

  activateAbility(effectManager, game) {
    if (this.abilityCooldownTimer > 0 || this.isAbilityActive) return false;
    this.isAbilityActive = true;
    this.abilityActiveTimer = this.abilityDuration;
    this.abilityCooldownTimer = this.abilityCooldown;

    const healAmount = this.level;
    game.lives = Math.min(game.isHardcore ? 10 : 100, game.lives + healAmount);
    effectManager.spawnText(this.x, this.y - 30, `HEAL! +${healAmount} HP`, '#2ecc71');

    const currentRange = this.range * (this.djRangeBuffed ? 1.15 : 1.0);
    for (const agent of game.grid.towers.values()) {
      const dist = Math.hypot(agent.x - this.x, agent.y - this.y);
      if (dist <= currentRange) {
        if (agent.fireCooldown > 1.0) {
          agent.fireCooldown = 0; 
          effectManager.spawnText(agent.x, agent.y - 15, "CLEANSED", '#2ecc71');
          effectManager.spawnImpact(agent.x, agent.y, '#2ecc71', 4, 0.4);
        }
      }
    }
    return true;
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    } else {
      this.muzzleFlashActive = false;
    }

    if (this.recoilOffset > 0) {
      this.recoilOffset -= dt * 30;
      if (this.recoilOffset < 0) this.recoilOffset = 0;
    }

    let speedMultiplier = this.commanderSpeedBuffed ? 1.35 : 1.0;
    if (this.commanderAbilityActive) speedMultiplier *= 1.40;
    const currentFireRate = this.fireRate * speedMultiplier;
    
    const djMultiplier = this.djRangeBuffed ? (this.level >= 5 ? 1.20 : 1.15) : 1.0;
    const currentRange = this.range * djMultiplier;

    if (this.target && (this.target.health <= 0 || Math.hypot(this.target.x - this.x, this.target.y - this.y) > currentRange)) {
      this.target = null;
    }

    if (!this.target) {
      this.target = this.acquireTarget(enemies);
    }

    if (this.target) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let diff = targetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * Math.min(1.0, dt * 10);

      if (this.fireCooldown <= 0) {
        this.fire(effectManager, bullets);
        soundManager.playShoot();
        this.fireCooldown = 1.0 / currentFireRate;
      }
    }

    if (this.isAbilityActive) {
      this.abilityActiveTimer -= dt;
      if (this.abilityActiveTimer <= 0) {
        this.isAbilityActive = false;
      }
    }
    if (this.abilityCooldownTimer > 0) {
      this.abilityCooldownTimer -= dt;
    }
  }

  fire(effectManager, bullets) {
    this.muzzleFlashActive = true;
    this.recoilOffset = 2;

    const muzzleX = this.x + Math.cos(this.angle) * 16;
    const muzzleY = this.y + Math.sin(this.angle) * 16;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 6);

    bullets.push(new Bullet(this.x, this.y, this.target, {
      speed: 550,
      damage: this.damage,
      color: '#2ecc71', 
      radius: 3,
      damageType: 'syringe'
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Medic stats matching TDS progression
    if (this.level === 2) {
      this.damage = 2;
    } else if (this.level === 3) {
      this.damage = 3;
      this.range = 110;
    } else if (this.level === 4) {
      this.fireRate = 1.0;
    } else if (this.level === 5) {
      this.damage = 4;
      this.fireRate = 1.35;
      this.range = 120;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#ffffff', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#fff'; 
        c.fillRect(-5, -7, 10, 3);
        c.fillStyle = '#e74c3c'; 
        c.fillRect(-1, -7, 2, 3);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(6 - this.recoilOffset, 1, 8, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#e74c3c'; 
        c.fillRect(-6, -6, 3, 12);
        c.fillStyle = '#fff'; 
        c.fillRect(-5, -7, 10, 3);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(6 - this.recoilOffset, 1, 10, 3.5);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(3, -3, 2, 6);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 0, 12, 4);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#2ecc71'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 0, 14, 4.5);
      } 
      else {
        c.fillStyle = '#2ecc71'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#2ecc71'; 
        c.fillRect(6 - this.recoilOffset, -4, 12, 3);
        c.fillRect(6 - this.recoilOffset, 4, 12, 3);
      }
    });
  }
}

// ─── 7. PYROMANCER ───
export class Pyromancer extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 90,       
      damage: 1, // Rebalanced down from 2      
      fireRate: 2.0, // Rebalanced down from 3.0   
      cost: 300,
      type: 'pyromancer',
      color: '#e67e22',
      name: 'Pyromancer',
      camoDetection: true 
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 2;
    const burnDps = 15 + this.level * 4;
    
    if (this.level >= 5) {
      bullets.push(new FlameProjectile(this.x, this.y, this.angle - 0.20, this.damage, burnDps, 280, this.range));
      bullets.push(new FlameProjectile(this.x, this.y, this.angle, this.damage, burnDps, 280, this.range));
      bullets.push(new FlameProjectile(this.x, this.y, this.angle + 0.20, this.damage, burnDps, 280, this.range));
    } else if (this.level >= 3) {
      bullets.push(new FlameProjectile(this.x, this.y, this.angle - 0.12, this.damage, burnDps, 250, this.range));
      bullets.push(new FlameProjectile(this.x, this.y, this.angle + 0.12, this.damage, burnDps, 250, this.range));
    } else {
      bullets.push(new FlameProjectile(this.x, this.y, this.angle, this.damage, burnDps, 250, this.range));
    }

    if (this.level >= 5 && this.target) {
      this.target.isLead = false;
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Pyromancer stats matching TDS progression
    if (this.level === 2) {
      this.damage = 2;
    } else if (this.level === 3) {
      this.fireRate = 2.5;
      this.range = 95;
    } else if (this.level === 4) {
      this.damage = 3;
    } else if (this.level === 5) {
      this.damage = 4;
      this.fireRate = 4.0;
      this.range = 110;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#d35400', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#e67e22'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(6 - this.recoilOffset, 1, 10, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#34495e'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, 1, 12, 4.5);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#2c3e50'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#ff6700'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 0, 14, 5);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#2c3e50';
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#111'; 
        c.fillRect(-12, -10, 4, 20);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(16 - this.recoilOffset, 1, 3, 3);
      } 
      else {
        c.fillStyle = '#111'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(6 - this.recoilOffset, -4, 14, 3);
        c.fillRect(6 - this.recoilOffset, 4, 14, 3);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(-12, -8, 4, 16);
      }
    });
  }
}

// ─── 8. ROCKETEER ───
export class Rocketeer extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,      
      damage: 8, // Rebalanced down from 12      
      fireRate: 0.35,  
      cost: 500,
      type: 'rocketeer',
      color: '#95a5a6',
      name: 'Rocketeer'
    });
  }

  fire(effectManager, bullets) {
    this.muzzleFlashActive = true;
    this.recoilOffset = 8;

    const muzzleX = this.x + Math.cos(this.angle) * 20;
    const muzzleY = this.y + Math.sin(this.angle) * 20;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 15);

    const splash = this.level >= 5 ? 120 : 80;
    bullets.push(new Rocket(this.x, this.y, this.target, {
      speed: 300,
      damage: this.damage,
      color: '#e74c3c',
      radius: 6,
      splashRadius: splash
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Rocketeer stats matching TDS progression
    if (this.level === 2) {
      this.damage = 12;
    } else if (this.level === 3) {
      this.damage = 18;
      this.range = 115;
    } else if (this.level === 4) {
      this.damage = 24;
    } else if (this.level === 5) {
      this.damage = 30;
      this.fireRate = 0.50;
      this.range = 130;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#95a5a6'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#34495e'; 
        c.fillRect(4 - this.recoilOffset, -3, 12, 6);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-6, -6, 3, 12);
        c.fillStyle = '#34495e'; 
        c.fillRect(4 - this.recoilOffset, -3, 15, 6);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#34495e';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-8, -6, 2, 12);
        c.fillStyle = '#111'; 
        c.fillRect(4 - this.recoilOffset, -4, 16, 8);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#222';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#34495e'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#111'; 
        c.fillRect(4 - this.recoilOffset, -5, 18, 10);
      } 
      else {
        c.fillStyle = '#ff3c00'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(4 - this.recoilOffset, -8, 15, 5);
        c.fillRect(4 - this.recoilOffset, 3, 15, 5);
      }
    });
  }
}

// ─── 9. FREEZER ───
export class Freezer extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 100,
      damage: 1, // Rebalanced down from 2
      fireRate: 0.65,
      cost: 250,
      type: 'freezer',
      color: '#3498db',
      name: 'Freezer'
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 4;
    this.muzzleFlashActive = true;
    bullets.push(new FreezeBullet(this.x, this.y, this.target, this.damage, this.level));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Freezer stats matching TDS progression
    if (this.level === 2) {
      this.fireRate = 0.75;
    } else if (this.level === 3) {
      this.damage = 2;
      this.range = 105;
    } else if (this.level === 4) {
      this.fireRate = 0.85;
    } else if (this.level === 5) {
      this.damage = 3;
      this.fireRate = 1.0;
      this.range = 115;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#5dade2', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#3498db'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(6 - this.recoilOffset, 0, 10, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(-12, -5, 4, 10);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 0, 12, 4);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#ecf0f1'; 
        c.fillRect(-8, -8, 16, 2);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 0, 14, 5);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#2e86de'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -4, 14, 3);
        c.fillRect(6 - this.recoilOffset, 1, 14, 3);
      } 
      else {
        c.fillStyle = '#00ffe0'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -2, 16, 5.5);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(10 - this.recoilOffset, -1, 3, 3);
      }
    });
  }
}

// ─── 10. SHOTGUNNER ───
export class Shotgunner extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 90,
      damage: 2, // Rebalanced down from 4
      fireRate: 0.55,
      cost: 350,
      type: 'shotgunner',
      color: '#2c3e50',
      name: 'Shotgunner'
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 7;
    this.muzzleFlashActive = true;
    const pellets = this.level >= 5 ? 6 : 4;
    const spread = 0.26;
    for (let i = 0; i < pellets; i++) {
      const angleOffset = ((i / (pellets - 1)) - 0.5) * spread;
      bullets.push(new ShotgunPellet(this.x, this.y, this.angle + angleOffset, this.damage, this.range));
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Shotgunner stats matching TDS progression
    if (this.level === 2) {
      this.damage = 3;
    } else if (this.level === 3) {
      this.damage = 4;
      this.range = 95;
    } else if (this.level === 4) {
      this.damage = 5;
    } else if (this.level === 5) {
      this.damage = 6;
      this.fireRate = 0.85;
      this.range = 110;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#2c3e50', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#222'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(6 - this.recoilOffset, -1, 12, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(-5, -8, 3, 16);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 14, 4);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#e74c3c'; 
        c.fillRect(-7, -7, 14, 2);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -1, 15, 4.5);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -1, 15, 4.5);
        c.fillStyle = '#111'; 
        c.fillRect(10 - this.recoilOffset, 3, 3, 3);
      } 
      else {
        c.fillStyle = '#ff0055'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(6 - this.recoilOffset, -5, 14, 3.5);
        c.fillRect(6 - this.recoilOffset, 2, 14, 3.5);
      }
    });
  }
}

// ─── 11. CROOK BOSS ───
export class CrookBoss extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 120,
      damage: 2, // Rebalanced down from 5
      fireRate: 1.8,
      cost: 500,
      type: 'crook_boss',
      color: '#f5f6fa',
      name: 'Crook Boss'
    });
    this.summonCooldown = 25.0;
    this.summonTimer = 18.0; 
  }

  update(enemies, effectManager, bullets, dt) {
    super.update(enemies, effectManager, bullets, dt);
    
    this.summonTimer += dt;
    if (this.summonTimer >= this.summonCooldown) {
      this.summonTimer = 0;
      
      const dmg = 45 + this.level * 10;
      bullets.push(new VehicleProjectile(this.x, this.y, {
        speed: 85,
        damage: dmg,
        type: 'guard',
        color: '#2f3640'
      }));
      effectManager.spawnText(this.x, this.y - 20, "GUARD CALLED!", '#2f3640');
      soundManager.playPlace();
    }
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 3;
    this.muzzleFlashActive = true;
    bullets.push(new Bullet(this.x, this.y, this.target, {
      speed: 680,
      damage: this.damage,
      color: '#f1c40f',
      radius: 3
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Crook Boss stats matching TDS progression
    if (this.level === 2) {
      this.damage = 3;
    } else if (this.level === 3) {
      this.damage = 4;
      this.range = 125;
    } else if (this.level === 4) {
      this.damage = 5;
    } else if (this.level === 5) {
      this.damage = 6;
      this.fireRate = 2.5;
      this.range = 135;
      this.summonCooldown = Math.max(14.0, this.summonCooldown - 2.5);
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#111', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#2f3640'; 
        c.fillRect(-8, -8, 3, 16);
        c.fillRect(5, -8, 3, 16);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 1, 8, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#c0392b'; 
        c.fillRect(-2, -4, 4, 12);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -4, 8, 3);
        c.fillRect(6 - this.recoilOffset, 2, 8, 3);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#c0392b'; 
        c.fillRect(-2, -4, 4, 12);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(-7, -7, 14, 2);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 1, 14, 4);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#f1c40f'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, 1, 14, 4);
        c.fillStyle = '#d4ac0d'; 
        c.fillRect(9 - this.recoilOffset, 4, 3, 3);
      } 
      else {
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -4, 14, 3);
        c.fillRect(6 - this.recoilOffset, 2, 14, 3);
      }
    });
  }
}

// ─── 12. MILITARY BASE ───
export class MilitaryBase extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 0,
      damage: 0,
      fireRate: 0,
      cost: 400,
      type: 'military_base',
      color: '#27ae60',
      name: 'Military Base'
    });
    this.spawnCooldown = 26.0;
    this.spawnTimer = 22.0; 
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;
    this.spawnTimer += dt;
    
    if (this.spawnTimer >= this.spawnCooldown) {
      this.spawnTimer = 0;
      
      const type = this.level >= 5 ? 'tank' : (this.level >= 3 ? 'armored_car' : 'humvee');
      const damage = this.level >= 5 ? 350 : (this.level >= 3 ? 150 : 60);
      const speed = this.level >= 5 ? 75 : 110;

      bullets.push(new VehicleProjectile(this.x, this.y, {
        speed: speed,
        damage: damage,
        type: type,
        color: '#1e3d2f'
      }));
      effectManager.spawnText(this.x, this.y - 20, `${type.toUpperCase()} SENT!`, '#27ae60');
      soundManager.playCrateDrop();
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.spawnCooldown = Math.max(12.0, this.spawnCooldown - 3.0);
  }

  draw(ctx) {
    super.draw(ctx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    if (this.level === 1) {
      ctx.fillStyle = '#27ae60'; 
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
    } 
    else if (this.level === 2) {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = '#fff'; 
      ctx.fillRect(-3, -15, 6, 4);
      ctx.strokeRect(-3, -15, 6, 4);
    } 
    else if (this.level === 3) {
      ctx.fillStyle = '#1e3d2f'; 
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.fillStyle = '#ff3c00'; 
      ctx.fillRect(-8, 12, 4, 3);
      ctx.fillRect(4, 12, 4, 3);
    } 
    else if (this.level === 4) {
      ctx.fillStyle = '#1e3d2f';
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.fillStyle = '#7f8c8d'; 
      ctx.strokeRect(-8, -8, 16, 16);
    } 
    else {
      ctx.fillStyle = '#111'; 
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      
      ctx.fillStyle = '#00ffe0'; 
      ctx.fillRect(-10, 0, 20, 2);
      ctx.fillRect(-10, 8, 20, 2);
    }
    ctx.restore();
  }
}

// ─── 13. MINIGUNNER ───
export class Minigunner extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 130,      
      damage: 1, // Rebalanced down from 2       
      fireRate: 4.5,   
      cost: 650,
      type: 'minigunner',
      color: '#e67e22',
      name: 'Minigunner'
    });
    this.spinUpTimer = 0.8; 
    this.currentSpin = 0.0;
    this.idleTimer = 0;
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;
    const speedMultiplier = this.commanderSpeedBuffed ? 1.35 : 1.0;
    const currentFireRate = this.fireRate * speedMultiplier;
    
    const djMultiplier = this.djRangeBuffed ? (this.level >= 5 ? 1.20 : 1.15) : 1.0;
    const currentRange = this.range * djMultiplier;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    if (this.target && (this.target.health <= 0 || Math.hypot(this.target.x - this.x, this.target.y - this.y) > currentRange)) {
      this.target = null;
    }

    if (!this.target) {
      this.target = this.acquireTarget(enemies);
    }

    if (this.target) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let diff = targetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * Math.min(1.0, dt * 8);

      this.idleTimer = 0;
      if (this.currentSpin < 1.0) {
        this.currentSpin = Math.min(1.0, this.currentSpin + dt / this.spinUpTimer);
      } else {
        if (this.fireCooldown <= 0) {
          this.fire(effectManager, bullets);
          this.fireCooldown = 1.0 / currentFireRate;
        }
      }
    } else {
      this.idleTimer += dt;
      if (this.idleTimer >= 0.6) {
        this.currentSpin = Math.max(0.0, this.currentSpin - dt * 2);
      }
    }
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 2;
    const muzzleX = this.x + Math.cos(this.angle) * 22;
    const muzzleY = this.y + Math.sin(this.angle) * 22;
    effectManager.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, 8);
    bullets.push(new MinigunnerBullet(this.x, this.y, this.target, this.damage));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Minigunner stats matching TDS progression
    if (this.level === 2) {
      this.fireRate = 5.5;
    } else if (this.level === 3) {
      this.damage = 2;
    } else if (this.level === 4) {
      this.fireRate = 7.0;
      this.range = 140;
    } else if (this.level === 5) {
      this.damage = 3;
      this.fireRate = 10.0;
      this.range = 155;
      this.spinUpTimer = 0.2; 
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#2c3e50', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#000'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#2c3e50'; 
        c.fillRect(6 - this.recoilOffset, -3, 11, 5);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(-5, -8, 3, 16);
        c.fillStyle = '#2c3e50'; 
        c.fillRect(6 - this.recoilOffset, -4, 12, 7);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#2c3e50'; 
        c.fillRect(6 - this.recoilOffset, -4, 12, 8);
        c.fillStyle = '#555'; 
        c.fillRect(18 - this.recoilOffset, -3, 12, 6);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#2c3e50'; 
        c.fillRect(6 - this.recoilOffset, -4, 12, 8);
        c.fillStyle = '#555'; 
        c.fillRect(18 - this.recoilOffset, -3, 14, 6);
      } 
      else {
        c.fillStyle = '#ff0055'; 
        c.fillRect(3, -4, 2, 8);

        const spinAngle = this.timeAccumulator * 30.0;
        c.save();
        c.translate(12 - this.recoilOffset, 0);
        c.fillStyle = '#222';
        c.fillRect(0, -6, 8, 12);
        c.fillStyle = '#ff0055'; 
        c.fillRect(8, -6 + Math.sin(spinAngle) * 2, 14, 3.5);
        c.fillRect(8, 2 - Math.sin(spinAngle) * 2, 14, 3.5);
        c.restore();
      }
    });
  }
}

// ─── 14. COMMANDER ───
export class Commander extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,      
      damage: 0,
      fireRate: 0,
      cost: 450,
      type: 'commander',
      color: '#c0392b',
      name: 'Commander'
    });
    this.calloutTimer = 6.0;
    this.buffDurationLeft = 0;

    this.abilityCooldown = 45;
    this.abilityDuration = 6;
    this.abilityCooldownTimer = 0;
    this.abilityActiveTimer = 0;
    this.isAbilityActive = false;
  }

  activateAbility(effectManager) {
    if (this.abilityCooldownTimer > 0 || this.isAbilityActive) return false;
    this.isAbilityActive = true;
    this.abilityActiveTimer = this.abilityDuration;
    this.abilityCooldownTimer = this.abilityCooldown;
    
    const label = this.level >= 5 ? "GLORY TO THE EMPIRE!" : "CALL TO ARMS!";
    effectManager.spawnText(this.x, this.y - 30, label, '#f1c40f');
    effectManager.spawnPlacementSparks(this.x, this.y, this.cellSize * 1.5);
    return true;
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;
    if (this.buffDurationLeft > 0) {
      this.buffDurationLeft -= dt;
    }

    this.calloutTimer -= dt;
    if (this.calloutTimer <= 0) {
      this.calloutTimer = 8.0;
      this.buffDurationLeft = 3.5;
      
      const label = this.level >= 5 ? "MAX POWER!" : "TACTICAL FOCUS!";
      effectManager.spawnText(this.x, this.y - 20, label, '#f1c40f');
      effectManager.spawnPlacementSparks(this.x, this.y, this.cellSize);
    }

    if (this.isAbilityActive) {
      this.abilityActiveTimer -= dt;
      if (this.abilityActiveTimer <= 0) {
        this.isAbilityActive = false;
      }
      if (Math.random() < 0.15) {
        effectManager.spawnImpact(this.x + (Math.random() - 0.5) * 20, this.y + (Math.random() - 0.5) * 20, '#f1c40f', 2, 0.4);
      }
    }
    if (this.abilityCooldownTimer > 0) {
      this.abilityCooldownTimer -= dt;
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.range += 15;
    this.calloutTimer = Math.max(4.0, this.calloutTimer - 0.5);
    if (this.level >= 5) {
      this.abilityCooldown = 35; 
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#5c3a21', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#2c3e50'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#111'; 
        c.fillRect(6, 1, 6, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#c0392b'; 
        c.fillRect(-8, -4, 2, 8);
        c.fillRect(6, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(5, -2, 6, 4);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#1e3d2f'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-2, -2, 2, 2);
        c.fillStyle = '#111'; 
        c.fillRect(6, 1, 4, 6);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#ff3131'; 
        c.fillRect(3, -3, 2, 6);
        c.fillStyle = '#222'; 
        c.fillRect(-8, -8, 16, 16);
      } 
      else {
        c.fillStyle = '#f1c40f'; 
        c.beginPath();
        c.moveTo(-6, -6); c.lineTo(-4, -9); c.lineTo(-2, -6);
        c.lineTo(0, -11); c.lineTo(2, -6); c.lineTo(4, -9); c.lineTo(6, -6);
        c.closePath(); c.fill(); c.stroke();

        c.fillStyle = '#ff0055'; 
        c.fillRect(6, -12, 2.5, 24);
        c.fillStyle = '#f1c40f'; 
        c.fillRect(5, -2, 4, 3);
      }
    });

    if (this.buffDurationLeft > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ─── 15. DJ UNIT ───
export class DJUnit extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 120,      
      damage: 0,
      fireRate: 0,
      cost: 500,
      type: 'dj',
      color: '#9b59b6',
      name: 'DJ Unit'
    });
    this.noteSpawnTimer = 0;
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;
    this.noteSpawnTimer += dt;
    if (this.noteSpawnTimer >= 0.8) {
      this.noteSpawnTimer = 0;
      effectManager.spawnMusicNote(this.x, this.y);
      bullets.push(new DJMusicWave(this.x, this.y, this.range));
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.range += 15;
  }

  draw(ctx) {
    if (this.level >= 3) {
      ctx.save();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      const pulse = Math.abs(Math.sin(this.timeAccumulator * 8.0)) * 4;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(this.x - 24, this.y - 8, 8, 16);
      ctx.strokeRect(this.x - 24, this.y - 8, 8, 16);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(this.x - 20, this.y - 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.arc(this.x - 20, this.y + 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(this.x + 16, this.y - 8, 8, 16);
      ctx.strokeRect(this.x + 16, this.y - 8, 8, 16);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(this.x + 20, this.y - 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.arc(this.x + 20, this.y + 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(155, 89, 182, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range * 0.4 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    super.draw(ctx);

    this.drawBlockyAgent(ctx, '#111', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#9b59b6'; 
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);
        c.fillStyle = '#111'; 
        c.fillRect(8, -10, 6, 20);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#9b59b6';
        c.fillRect(-7, -9, 14, 2);
        c.fillStyle = '#1e293b'; 
        c.fillRect(8, -12, 8, 24);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(11, -6, 2, 12);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#00ffe0'; 
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);

        c.fillStyle = '#1e293b'; 
        c.fillRect(8, -14, 10, 28);
        c.strokeRect(8, -14, 10, 28);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#00ffe0';
        c.fillRect(-7, -9, 14, 2);
        c.fillStyle = '#1e293b';
        c.fillRect(8, -14, 10, 28);
        c.strokeRect(8, -14, 10, 28);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(12, -4, 3, 8);
      } 
      else {
        c.fillStyle = '#ff00aa'; 
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);

        c.fillStyle = '#1e293b';
        c.fillRect(8, -14, 10, 28);
        c.strokeRect(8, -14, 10, 28);

        c.fillStyle = '#111'; 
        c.beginPath();
        c.arc(13, -7, 4, 0, Math.PI * 2);
        c.arc(13, 7, 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ff00aa';
        c.fillRect(12, -8, 2, 2);
      }
    });
  }
}

// ─── 16. RANGER ───
export class Ranger extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 220,
      damage: 20, // Rebalanced down from 40
      fireRate: 0.16,
      cost: 850,
      type: 'ranger',
      color: '#1a1a2e',
      name: 'Ranger',
      camoDetection: false 
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 10;
    this.muzzleFlashActive = true;
    bullets.push(new RangerBullet(this.x, this.y, this.target, this.damage));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Ranger stats matching TDS progression
    if (this.level === 2) {
      this.damage = 35;
    } else if (this.level === 3) {
      this.damage = 60;
      this.range = 230;
    } else if (this.level === 4) {
      this.damage = 90;
    } else if (this.level === 5) {
      this.damage = 120;
      this.fireRate = 0.25;
      this.range = 260;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#1a1a2e', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#1e293b'; 
        c.fillRect(-6, -6, 12, 3);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -2, 16, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#ff3c00'; 
        c.fillRect(14 - this.recoilOffset, -1, 3, 2);
        c.fillStyle = '#1e293b'; 
        c.fillRect(6 - this.recoilOffset, -2, 18, 4);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#00ffe0'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -2, 18, 5);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#00ffe0';
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; 
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#111'; 
        c.fillRect(6 - this.recoilOffset, -2, 20, 5);
      } 
      else {
        c.fillStyle = '#ff0055'; 
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#ff0055'; 
        c.fillRect(6 - this.recoilOffset, -2, 22, 5.5);
        c.fillStyle = '#ff0055'; 
        c.fillRect(12 - this.recoilOffset, -4, 4, 2);
      }
    });
  }
}

// ─── 17. TURRET ───
export class Turret extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 150,
      damage: 2, // Rebalanced down from 4
      fireRate: 6.0, 
      cost: 800,
      type: 'turret',
      color: '#1e293b',
      name: 'Turret'
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 2;
    this.muzzleFlashActive = true;
    bullets.push(new TurretBullet(this.x, this.y, this.target, this.damage));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Turret stats matching TDS progression
    if (this.level === 2) {
      this.fireRate = 7.0;
    } else if (this.level === 3) {
      this.damage = 3;
      this.range = 160;
    } else if (this.level === 4) {
      this.fireRate = 8.5;
    } else if (this.level === 5) {
      this.damage = 6;
      this.fireRate = 10.0;
      this.range = 170;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#1e293b', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(4 - this.recoilOffset, -4, 14, 8);
        c.fillStyle = '#111'; 
        c.fillRect(18 - this.recoilOffset, -2, 2, 4);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#bdc3c7'; 
        c.fillRect(4 - this.recoilOffset, -5, 14, 10);
        c.fillStyle = '#111'; 
        c.fillRect(18 - this.recoilOffset, -4, 2, 3);
        c.fillRect(18 - this.recoilOffset, 1, 2, 3);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(4 - this.recoilOffset, -6, 16, 12);
        c.fillStyle = '#111'; 
        c.fillRect(20 - this.recoilOffset, -5, 2, 10);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#f1c40f'; 
        c.fillRect(-10, -5, 2, 10);
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(4 - this.recoilOffset, -6, 18, 12);
        c.fillStyle = '#111'; 
        c.fillRect(22 - this.recoilOffset, -5, 2, 10);
      } 
      else {
        c.fillStyle = '#00ffe0'; 
        c.fillRect(-10, -5, 2, 10);
        c.fillStyle = '#222'; 
        c.fillRect(4 - this.recoilOffset, -6, 18, 12);
        c.fillStyle = '#00ffe0'; 
        c.fillRect(14 - this.recoilOffset, -1, 4, 2);
      }
    });
  }
}

// ─── 18. GLADIATOR ───
export class Gladiator extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 55,       
      damage: 2, // Rebalanced down from 8       
      fireRate: 1.1,   
      cost: 300,
      type: 'gladiator',
      color: '#7f8c8d',
      name: 'Gladiator',
      isMeleeOnly: true 
    });

    this.abilityCooldown = 45;
    this.abilityDuration = 6;
    this.abilityCooldownTimer = 0;
    this.abilityActiveTimer = 0;
    this.isAbilityActive = false;
  }

  activateAbility(effectManager) {
    if (this.abilityCooldownTimer > 0 || this.isAbilityActive) return false;
    this.isAbilityActive = true;
    this.abilityActiveTimer = this.abilityDuration;
    this.abilityCooldownTimer = this.abilityCooldown;
    effectManager.spawnText(this.x, this.y - 30, "WARRIOR'S RAGE!", '#e74c3c');
    effectManager.spawnPlacementSparks(this.x, this.y, this.cellSize * 1.5);
    return true;
  }

  update(enemies, effectManager, bullets, dt) {
    this.timeAccumulator += dt;

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    } else {
      this.muzzleFlashActive = false;
    }

    if (this.recoilOffset > 0) {
      this.recoilOffset -= dt * 30;
      if (this.recoilOffset < 0) this.recoilOffset = 0;
    }

    const abilitySpeedMult = this.isAbilityActive ? 1.5 : 1.0;
    const speedMultiplier = (this.commanderSpeedBuffed ? 1.35 : 1.0) * abilitySpeedMult;
    const currentFireRate = this.fireRate * speedMultiplier;
    
    const djMultiplier = this.djRangeBuffed ? (this.level >= 5 ? 1.20 : 1.15) : 1.0;
    const currentRange = this.range * djMultiplier;

    if (this.target) {
      const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (this.target.health <= 0 || dist > currentRange) {
        this.target = null;
      }
    }

    if (!this.target && this.fireRate > 0) {
      this.target = this.acquireTarget(enemies);
    }

    if (this.target) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let diff = targetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * Math.min(1.0, dt * 10);

      if (this.fireCooldown <= 0 && this.fireRate > 0) {
        this.fire(effectManager, bullets);
        this.fireCooldown = 1.0 / currentFireRate;
      }
    }

    if (this.isAbilityActive) {
      this.abilityActiveTimer -= dt;
      if (this.abilityActiveTimer <= 0) {
        this.isAbilityActive = false;
      }
    }
    if (this.abilityCooldownTimer > 0) {
      this.abilityCooldownTimer -= dt;
    }
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 5;
    const dmg = this.isAbilityActive ? this.damage * 1.5 : this.damage;
    
    if (this.target && this.target.health > 0) {
      this.target.takeDamage(dmg, 'physical', effectManager);
      if (this.level >= 3 || this.isAbilityActive) {
        effectManager.spawnImpact(this.target.x, this.target.y, '#e67e22', 3, 0.4);
      }
    }
    effectManager.spawnSwingArc(this.x, this.y, this.angle, this.range);
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    
    // Balanced Gladiator stats matching TDS progression
    if (this.level === 2) {
      this.damage = 3;
    } else if (this.level === 3) {
      this.damage = 6;
      this.fireRate = 1.3;
    } else if (this.level === 4) {
      this.damage = 15;
    } else if (this.level === 5) {
      this.damage = 30;
      this.fireRate = 1.8;
      this.range = 65;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level === 1) {
        c.fillStyle = '#8d6e63'; 
        c.fillRect(5 - this.recoilOffset, 1, 10, 3);
      } 
      else if (this.level === 2) {
        c.fillStyle = '#7f8c8d'; 
        c.fillRect(-8, -4, 2, 8);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(5 - this.recoilOffset, 1, 12, 3.5);
      } 
      else if (this.level === 3) {
        c.fillStyle = '#bdc3c7'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#bdc3c7'; 
        c.fillRect(5 - this.recoilOffset, 1, 15, 4);
      } 
      else if (this.level === 4) {
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#cbd5e1'; 
        c.fillRect(5 - this.recoilOffset, 1, 16, 4.5);
        c.fillStyle = '#ff3c00'; 
        c.fillRect(4 - this.recoilOffset, 1.5, 2, 2);
      } 
      else {
        c.fillStyle = '#ff0055'; 
        c.fillRect(-6, -9, 12, 3);
        c.fillStyle = '#e67e22'; 
        c.fillRect(5 - this.recoilOffset, -4, 15, 3);
        c.fillRect(5 - this.recoilOffset, 2, 15, 3);
      }
    });
  }
}