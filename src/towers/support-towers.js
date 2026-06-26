// src/towers/support-towers.js
// Support and Economic agents: Farm, Medic, Commander, DJ Unit, and Military Base.

import { Agent } from './agent-base.js';
import { Bullet, VehicleProjectile, DJMusicWave } from '../bullet.js';
import { soundManager } from '../sound.js';

// ─── 1. FARM ───
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

// ─── 2. MEDIC ───
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
        c.fillRect(-6, -6, 12, 12);
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

// ─── 3. COMMANDER ───
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

// ─── 4. DJ UNIT ───
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

// ─── 5. MILITARY BASE ───
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