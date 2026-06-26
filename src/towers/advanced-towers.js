// src/towers/advanced-towers.js
// Advanced combat and tactical agents: Minigunner, Pyromancer, Rocketeer, Freezer, Shotgunner, Crook Boss, Ranger, and Turret.

import { Agent } from './agent-base.js';
import { 
  Bullet, 
  MinigunnerBullet, 
  FlameProjectile, 
  Rocket, 
  FreezeBullet, 
  ShotgunPellet, 
  VehicleProjectile, 
  RangerBullet, 
  TurretBullet 
} from '../bullet.js';
import { soundManager } from '../sound.js';

// ─── 1. MINIGUNNER ───
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

// ─── 2. PYROMANCER ───
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

// ─── 3. ROCKETEER ───
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

// ─── 4. FREEZER ───
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

// ─── 5. SHOTGUNNER ───
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

// ─── 6. CROOK BOSS ───
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

// ─── 7. RANGER ───
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

// ─── 8. TURRET ───
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