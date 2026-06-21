// Agent (Tower) Characters Module for Blocky Tactical Defense (BTD 2D)

import { Bullet, MinigunnerBullet, FlameProjectile, DJMusicWave, Rocket } from './bullet.js';
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

    // Targeting strategies: 'first', 'last', 'strongest', 'weakest'
    this.targetingStrategy = 'first';

    // Recoil and animations
    this.recoilOffset = 0;
    this.muzzleFlashActive = false;
    this.timeAccumulator = 0;
  }

  // Getters and setters for skin buffs
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
      // Golden Skins grant heavy physical damage and rate boosts
      this.damage = Math.floor(this.damage * 1.25);
      this.fireRate = Number((this.fireRate * 1.15).toFixed(2));
    } else if (this._equippedSkin.endsWith('_Cyber')) {
      // Cyber Skins grant range boosters
      this.range = Math.floor(this.range * 1.15);
    } else if (this._equippedSkin.endsWith('_Hazmat')) {
      // Hazmat skins grant complete immunity to stun locks
      this.stunResistance = true;
    }
  }

  // Roblox TDS Strategy Targeting Logic
  acquireTarget(enemies) {
    const hasCamoDetection = this.camoDetection || this.djCamoDetectionBuffed;

    const inRange = enemies.filter(enemy => {
      if (enemy.health <= 0) return false;
      
      // Melee units (Gladiator) are restrained from hitting flying targets
      if (this.isMeleeOnly && enemy.isFlying) return false;

      // Check camo detection rules
      if (enemy.isCamo && !hasCamoDetection) return false;

      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      // Level 5 DJ Units scale range aura buffs up to 20%
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
      // Reduce stuns/cooldowns 40% faster if hazmat skin is equipped
      const cooldownDeduction = this.stunResistance ? dt * 1.4 : dt;
      this.fireCooldown -= cooldownDeduction;
    } else {
      this.muzzleFlashActive = false;
    }

    if (this.recoilOffset > 0) {
      this.recoilOffset -= dt * 30;
      if (this.recoilOffset < 0) this.recoilOffset = 0;
    }

    // Dynamic support stat multipliers
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
    if (this.level >= 5) return 0; // Max level reached
    const baseCost = Math.floor(this.cost * 0.95 * this.level);
    // DJ units at level 5 reduce upgrade costs by 15% (instead of 10%)
    const discount = this.djRangeBuffed ? (this.level >= 5 ? 0.85 : 0.90) : 1.0;
    return Math.floor(baseCost * discount);
  }

  getSellValue() {
    let invested = this.cost;
    for (let l = 1; l < this.level; l++) {
      invested += Math.floor(this.cost * 0.95 * l);
    }
    return Math.floor(invested * 0.65);
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3.5;
    
    // Bottom pedestal shadow
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

    // Range auras
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

    ctx.fillStyle = currentTorsoColor;
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

// ─── 1. SCOUT ─────────────────────────────────────────────────────────────
export class Scout extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,      // Reduced from 135
      damage: 3,       // Heavily reduced from 10
      fireRate: 1.0,   // Reduced from 1.5
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

    // Level 5 dual-wield triggers two bullets
    if (this.level >= 5) {
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 650, damage: this.damage, color: '#f1c40f', radius: 3 }));
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 650, damage: this.damage, color: '#f1c40f', radius: 3 }));
    } else {
      bullets.push(new Bullet(this.x, this.y, this.target, { speed: 600, damage: this.damage, color: '#f1c40f', radius: 3.5 }));
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.damage += 3;
    this.range += 12;
    this.fireRate += 0.20;
    if (this.level === 4) {
      this.camoDetection = true; // Level 4 grants Camo Detection
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#27ae60';
        c.fillRect(-6, -6, 12, 12);
        c.fillRect(3, -4, 5, 8);
        c.fillStyle = '#34495e';
        c.fillRect(7 - this.recoilOffset, 2, 10, 4);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#556b2f'; // Camo cap
        c.fillRect(-6, -6, 12, 12);
        c.fillRect(3, -4, 5, 8);
        c.fillStyle = '#111'; // Goggles
        c.fillRect(3, -4, 2, 8);

        c.fillStyle = '#34495e'; // Dual pistols
        c.fillRect(7 - this.recoilOffset, -8, 10, 4);
        c.fillRect(7 - this.recoilOffset, 4, 10, 4);
      } else {
        // Level 5: Golden pilot headset, dual glowing heavy pistols
        c.fillStyle = '#f1c40f';
        c.fillRect(-6, -6, 12, 12);
        c.fillRect(-7, -4, 2, 8);
        c.fillRect(5, -4, 2, 8);

        c.fillStyle = '#e67e22'; // Golden muzzle/blades
        c.fillRect(7 - this.recoilOffset, -8, 12, 4);
        c.fillRect(7 - this.recoilOffset, 4, 12, 4);
      }
    });
  }
}

// ─── 2. MINIGUNNER ────────────────────────────────────────────────────────
export class Minigunner extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 130,      // Reduced from 155
      damage: 2,       // Reduced from 6
      fireRate: 4.5,   // Reduced from 8.0
      cost: 250,
      type: 'minigunner',
      color: '#e67e22',
      name: 'Minigunner'
    });
    this.spinUpTimer = 0.8; // Spin up takes slightly longer
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
    this.damage += 2;
    this.range += 10;
    this.fireRate += 1.2;
    if (this.level >= 5) {
      this.spinUpTimer = 0.2; // Level 5 decreases spin-up time significantly
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#2c3e50', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#000'; // sunglasses
        c.fillRect(3, -4, 2, 3);
        c.fillRect(3, 1, 2, 3);
        c.fillStyle = '#2c3e50';
        c.fillRect(6 - this.recoilOffset, -3, 12, 6);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#7f8c8d'; // Steel helmet
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#2c3e50'; // Minigun barrels
        c.fillRect(6 - this.recoilOffset, -4, 12, 8);
        c.fillStyle = '#555';
        c.fillRect(18 - this.recoilOffset, -3, 12, 6);
      } else {
        // Level 5: Plasma Minigunner, blue visor, massive dual minigun barrels
        c.fillStyle = '#00ffe0'; // neon blue visor
        c.fillRect(3, -4, 2, 8);

        const spinAngle = this.timeAccumulator * 30.0;
        c.save();
        c.translate(12 - this.recoilOffset, 0);
        c.fillStyle = '#2c3e50';
        c.fillRect(0, -6, 8, 12);
        c.fillStyle = '#00ffe0'; // glowing plasma core barrels
        c.fillRect(8, -6 + Math.sin(spinAngle) * 2, 14, 4);
        c.fillRect(8, 2 - Math.sin(spinAngle) * 2, 14, 4);
        c.restore();
      }
    });
  }
}

// ─── 3. COMMANDER ─────────────────────────────────────────────────────────
export class Commander extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,      // Reduced from 120
      damage: 0,
      fireRate: 0,
      cost: 350,
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
    
    // Level 5 active speed boost is enhanced
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
      
      const label = this.level >= 5 ? "MAXIMUM VOLTAGE!" : "CALL TO ARMS!";
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
      this.abilityCooldown = 35; // Level 5 reduces active ability cooldown
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#5c3a21', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#2c3e50'; // Officer cap
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#111';
        c.fillRect(4, -5, 2, 10);
        c.fillStyle = '#f5f5f5'; // white megaphone
        c.fillRect(7, 1, 6, 4);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#145a32'; // Camo cap/helmet
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#27ae60'; // Body armor
        c.fillRect(-6, -6, 12, 12);
      } else {
        // Level 5: Golden Emperor Uniform, dual hologram monitors on sleeves
        c.fillStyle = '#f1c40f'; // Golden Cap
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#111';
        c.fillRect(4, -5, 2, 10);
        c.fillStyle = '#ff3131'; // Medals red dot
        c.fillRect(-4, -2, 2, 2);
        c.fillStyle = '#00ffe0'; // Cyan hologram tablet on left arm
        c.fillRect(4, -13, 6, 6);
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

// ─── 4. DJ UNIT ───────────────────────────────────────────────────────────
export class DJUnit extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 120,      // Reduced from 140
      damage: 0,
      fireRate: 0,
      cost: 400,
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
    // Spawns massive subwoofers around pedestal at level 3+
    if (this.level >= 3) {
      ctx.save();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      const pulse = Math.abs(Math.sin(this.timeAccumulator * 8.0)) * 4;

      // Left Speaker
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(this.x - 24, this.y - 8, 8, 16);
      ctx.strokeRect(this.x - 24, this.y - 8, 8, 16);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(this.x - 20, this.y - 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.arc(this.x - 20, this.y + 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.fill();

      // Right Speaker
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(this.x + 16, this.y - 8, 8, 16);
      ctx.strokeRect(this.x + 16, this.y - 8, 8, 16);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(this.x + 20, this.y - 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.arc(this.x + 20, this.y + 4, 3 + pulse * 0.3, 0, Math.PI*2);
      ctx.fill();

      // Pulse wave circle on beat
      ctx.strokeStyle = 'rgba(155, 89, 182, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range * 0.4 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    super.draw(ctx);

    this.drawBlockyAgent(ctx, '#111', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#9b59b6'; // Purple headphones
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);
        c.fillStyle = '#111'; // Soundboard
        c.fillRect(8, -10, 8, 20);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#00ffe0'; // Bright LED headphones
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);

        c.fillStyle = '#1e293b'; // Mixing deck
        c.fillRect(8, -14, 10, 28);
        c.strokeRect(8, -14, 10, 28);
      } else {
        // Level 5: Golden DJ, giant spinning neon records
        c.fillStyle = '#ff00aa';
        c.fillRect(-7, -9, 14, 2);
        c.fillRect(-8, -6, 2, 4);
        c.fillRect(6, -6, 2, 4);

        c.fillStyle = '#1e293b';
        c.fillRect(8, -14, 10, 28);
        c.strokeRect(8, -14, 10, 28);

        c.fillStyle = '#111';
        c.beginPath();
        ctx.arc(13, -7, 4, 0, Math.PI * 2);
        ctx.arc(13, 7, 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ff00aa';
        c.fillRect(12, -8, 2, 2);
      }
    });
  }
}

// ─── 5. PYROMANCER ────────────────────────────────────────────────────────
export class Pyromancer extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 90,       // Reduced from 105
      damage: 2,       // Reduced from 5
      fireRate: 3.0,   // Reduced from 4.5
      cost: 300,
      type: 'pyromancer',
      color: '#e67e22',
      name: 'Pyromancer',
      camoDetection: true // Pyromancers naturally scan and hit Camo enemies
    });
  }

  fire(effectManager, bullets) {
    this.recoilOffset = 2;
    const burnDps = 15 + this.level * 4;
    
    // Level 5 Pyro sprays melting plasma flames in wider arches
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

    // Melts Lead defense: Any hit target has its isLead armor removed at Level 5
    if (this.level >= 5 && this.target) {
      this.target.isLead = false;
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.damage += 3;
    this.range += 10;
    this.fireRate += 0.5;
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#d35400', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#34495e'; // Orange suit, dark visor
        c.fillRect(2, -4, 3, 8);
        c.fillStyle = '#d35400'; // back gas tank
        c.fillRect(-12, -7, 4, 14);
        c.fillStyle = '#7f8c8d';
        c.fillRect(6 - this.recoilOffset, 1, 12, 5);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#2c3e50'; // Metal gas mask
        c.fillRect(2, -5, 3, 10);
        c.fillStyle = '#bdc3c7'; // filters on mask sides
        c.fillRect(1, -7, 3, 3);
        c.fillRect(1, 4, 3, 3);
      } else {
        // Level 5: Magma Pyromancer, radiant core visor, massive magma exhaust pipes
        c.fillStyle = '#ff3c00'; // Glowing lava visor
        c.fillRect(2, -5, 3, 10);
        c.fillStyle = '#111'; // Dark volcanic armor
        c.fillRect(-6, -6, 12, 12);
        
        c.fillStyle = '#e67e22'; // dual lava packs
        c.fillRect(-12, -10, 4, 8);
        c.fillRect(-12, 2, 4, 8);
      }
    });
  }
}

// ─── 6. FARM (Wave Income Generator) ──────────────────────────────────────
export class Farm extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 0,
      damage: 0,
      fireRate: 0, // Economy towers do not target
      cost: 250,
      type: 'farm',
      color: '#8d6e63',
      name: 'Farm'
    });
  }

  getHarvestIncome() {
    // 40-Wave economic progression payout
    switch (this.level) {
      case 1: return 100;
      case 2: return 220;
      case 3: return 500;
      case 4: return 1200;
      case 5: return 2800; // Level 5 Golden yields high capital
      default: return 100;
    }
  }

  draw(ctx) {
    super.draw(ctx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    if (this.level <= 2) {
      ctx.fillStyle = '#8d6e63'; // dirt patch
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = '#4caf50'; // sprouts
      ctx.fillRect(-6, -6, 3, 3);
      ctx.fillRect(4, 3, 3, 3);
    } else if (this.level === 3 || this.level === 4) {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.strokeStyle = '#784212'; // fences
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.fillStyle = '#f1c40f'; // mature corn
      ctx.fillRect(-5, -6, 4, 5);
      ctx.fillRect(3, 2, 4, 5);
    } else {
      // Level 5: Golden Silo Barn, spinning power windmill
      ctx.fillStyle = '#d4ac0d'; // Golden grain ground
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);

      ctx.fillStyle = '#c0392b'; // red barn house
      ctx.fillRect(-10, -10, 8, 12);
      ctx.strokeRect(-10, -10, 8, 12);

      ctx.fillStyle = '#7f8c8d'; // Spinning Windmill
      ctx.fillRect(4, -8, 6, 16);
      ctx.strokeRect(4, -8, 6, 16);

      const rotateSpeed = this.timeAccumulator * 5.0;
      ctx.save();
      ctx.translate(7, -8);
      ctx.rotate(rotateSpeed);
      ctx.strokeStyle = '#bdc3c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
      ctx.moveTo(0, -10); ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ─── 7. GLADIATOR (Melee attacker) ────────────────────────────────────────
export class Gladiator extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 55,       // Reduced from 65
      damage: 8,       // Heavily reduced from 25
      fireRate: 1.1,   // Reduced from 1.25
      cost: 200,
      type: 'gladiator',
      color: '#7f8c8d',
      name: 'Gladiator',
      isMeleeOnly: true // Restricts targeting of Flying/Floating targets
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
      if (Math.random() < 0.25) {
        effectManager.spawnImpact(this.x + (Math.random() - 0.5) * 16, this.y + (Math.random() - 0.5) * 16, '#e74c3c', 2, 0.4);
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
    this.damage += 8;
    this.range += 6;
    this.fireRate += 0.15;
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      if (this.level <= 2) {
        c.fillStyle = '#d35400'; // Bronze helmet
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#c0392b'; // crest
        c.fillRect(-8, -2, 2, 4);
        c.fillStyle = '#8d6e63'; // wooden sword
        c.fillRect(5 - this.recoilOffset, 1, 10, 3);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#bdc3c7'; // Steel plate armor
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#ecf0f1';
        c.fillRect(-8, -8, 16, 16);
        c.fillStyle = '#bdc3c7'; // steel sword
        c.fillRect(5 - this.recoilOffset, 1, 15, 4);
      } else {
        // Level 5: Golden Valkyrie Gladiator, glowing visual flames sword
        c.fillStyle = '#f1c40f'; // Gold plated helm
        ctx.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#ff0055'; // pink feathers
        c.fillRect(-6, -9, 12, 3);

        c.fillStyle = '#e67e22'; // lava/fire core broadsword
        c.fillRect(5 - this.recoilOffset, 1, 18, 5);
      }
    });
  }
}

// ─── 8. SOLDIER (Burst rifle unit) ────────────────────────────────────────
export class Soldier extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 115,      // Reduced from 125
      damage: 4,       // Reduced from 8
      fireRate: 2.5,   // Reduced from 3.2
      cost: 150,
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
    // Level 5 burst increases from 3 to 5 rounds per sequence
    const maxBurst = this.level >= 5 ? 5 : 3;
    if (this.burstCount >= maxBurst) {
      this.burstCount = 0;
      this.fireCooldown = 0.8; // reload window
    } else {
      this.fireCooldown = 0.12; // inter-burst pacing
    }
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.damage += 3;
    this.range += 10;
    if (this.level === 4) {
      this.camoDetection = true; // Level 4 grants Camo goggles
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
      if (this.level <= 2) {
        c.fillStyle = '#27ae60'; // helmet
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#111'; // rifle
        c.fillRect(6, 1, 14, 4);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#00ffe0'; // blue goggles
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#1e293b'; // tactical vest
        c.fillRect(-8, -8, 16, 16);
      } else {
        // Level 5: Futuristic Laser Commando, full exo-skeleton visor, heavy laser rifle
        c.fillStyle = '#ff0055'; // neon pink targeting visor
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#222'; // heavy assault rifle
        c.fillRect(6 - this.recoilOffset, 1, 18, 5);
        c.fillStyle = '#ff0055'; // laser pointer module on rifle
        c.fillRect(10 - this.recoilOffset, -1, 4, 2);
      }
    });
  }
}

// ─── 9. SNIPER ────────────────────────────────────────────────────────────
export class Sniper extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 180,      // Reduced from 220
      damage: 15,      // Reduced from 35
      fireRate: 0.25,  // Reduced from 0.35
      cost: 200,
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
      // Level 5 Sniper rounds gain explosive armor penetration (penetrates Lead armor)
      damageType: this.level >= 5 ? 'explosive' : 'physical'
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.damage += 18;
    this.range += 18;
    if (this.level === 3) {
      this.camoDetection = true; // Level 3 Sniper scope grants Camo Detection
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
      c.fillStyle = '#222'; // Long barrel
      c.fillRect(6 - this.recoilOffset, 0, 18, 3);
      c.fillStyle = '#7f8c8d'; // scope
      c.fillRect(10 - this.recoilOffset, -2, 6, 2);

      if (this.level <= 2) {
        c.fillStyle = '#d35400'; // orange beanie hat
        c.fillRect(-5, -7, 10, 3);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#27ae60'; // foliage leaves on back
        c.fillRect(-10, -5, 3, 10);
      } else {
        // Level 5: Spec-Ops Recon Sniper, active camo suit, laser-guided heavy scope
        c.fillStyle = '#2c3e50';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#00ffe0'; // active digital visor
        c.fillRect(3, -3, 2, 6);
        c.fillStyle = '#1e8449'; // leafy ghillie drape
        c.fillRect(-11, -7, 4, 14);
      }
    });
  }
}

// ─── 10. MEDIC ────────────────────────────────────────────────────────────
export class Medic extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 100,      // Reduced from 110
      damage: 3,       // Reduced from 5
      fireRate: 0.8,   // Reduced from 1.0
      cost: 300,
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

    // Level 5 active health heal increases to +5 lives
    const healAmount = this.level;
    game.lives = Math.min(game.isHardcore ? 10 : 100, game.lives + healAmount);
    effectManager.spawnText(this.x, this.y - 30, `RESTORE INTEGRITY! +${healAmount} HP`, '#2ecc71');

    const currentRange = this.range * (this.djRangeBuffed ? 1.15 : 1.0);
    for (const agent of game.grid.towers.values()) {
      const dist = Math.hypot(agent.x - this.x, agent.y - this.y);
      if (dist <= currentRange) {
        if (agent.fireCooldown > 1.0) {
          agent.fireCooldown = 0; // Cleanses active stuns
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
      color: '#2ecc71', // syringe projectile
      radius: 3,
      damageType: 'syringe'
    }));
  }

  upgrade(effectManager) {
    super.upgrade(effectManager);
    this.damage += 2;
    this.range += 12;
    this.fireRate += 0.15;
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#ffffff', (c) => {
      c.fillStyle = '#bdc3c7'; // Syringe launcher
      c.fillRect(6 - this.recoilOffset, 1, 10, 3);
      c.fillStyle = '#2ecc71';
      c.fillRect(8 - this.recoilOffset, -1, 3, 2);

      if (this.level <= 2) {
        c.fillStyle = '#fff'; // White doctor hat
        c.fillRect(-5, -7, 10, 3);
        c.fillStyle = '#e74c3c';
        c.fillRect(-1, -7, 2, 3);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#1e293b'; // pouches
        c.fillRect(-8, 5, 4, 3);
      } else {
        // Level 5: Quantum Nano-Surgeon, hazard containment hood, glowing plasma vials
        c.fillStyle = '#34495e';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#2ecc71'; // active nano shield visor
        c.fillRect(3, -3, 2, 6);
      }
    });
  }
}

// ─── 11. ROCKETEER ────────────────────────────────────────────────────────
export class Rocketeer extends Agent {
  constructor(gridX, gridY, cellSize) {
    super(gridX, gridY, cellSize, {
      range: 110,      // Reduced from 120
      damage: 12,      // Reduced from 20
      fireRate: 0.35,  // Reduced from 0.45
      cost: 400,
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

    // Large splash cluster radius at Level 5
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
    this.damage += 15;
    this.range += 10;
  }

  draw(ctx) {
    super.draw(ctx);
    this.drawBlockyAgent(ctx, '#7f8c8d', (c) => {
      c.fillStyle = '#34495e'; // Bazooka tube
      c.fillRect(4 - this.recoilOffset, -3, 16, 6);
      c.fillStyle = '#222';
      c.fillRect(2 - this.recoilOffset, -4, 2, 8);

      if (this.level <= 2) {
        c.fillStyle = '#95a5a6'; // grey helmet
        c.fillRect(-6, -6, 12, 12);
      } else if (this.level === 3 || this.level === 4) {
        c.fillStyle = '#34495e'; // armored spec helm
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#f1c40f'; // hazard warnings
        c.fillRect(-6, -6, 2, 12);
      } else {
        // Level 5: Mech Heavy Demolisher, visual power-armor suit with shoulder rockets
        c.fillStyle = '#222';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#f1c40f'; // cyber haz visor
        c.fillRect(3, -4, 2, 8);
        c.fillStyle = '#34495e'; // extra rocket packs on back
        c.fillRect(-12, -7, 4, 14);
      }
    });
  }
}