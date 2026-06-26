// src/towers/agent-base.js
// Core base class Agent containing targeting, skin buffs, pricing formulas, and base rendering logic.

import { soundManager } from '../sound.js';

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