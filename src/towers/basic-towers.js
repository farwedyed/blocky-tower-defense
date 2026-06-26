// src/towers/basic-towers.js
// Basic combat agents: Scout, Soldier, Sniper, Demoman, and Gladiator.

import { Agent } from './agent-base.js';
import { Bullet, Rocket } from '../bullet.js';

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

// ─── 5. GLADIATOR ───
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