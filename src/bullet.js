// Projectile and Ammo Module for Blocky TDS 2D

import { soundManager } from './sound.js';

export class Bullet {
  constructor(x, y, target, stats) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.speed = stats.speed || 500;
    this.damage = stats.damage || 10;
    this.color = stats.color || '#f1c40f'; // Toy yellow
    this.radius = stats.radius || 4;
    this.damageType = stats.damageType || 'physical';

    this.targetLastX = target ? target.x : x;
    this.targetLastY = target ? target.y : y;

    this.trail = [];
    this.maxTrailLength = 4;
  }

  update(effectManager, enemies, dt) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    if (this.target && this.target.health > 0) {
      this.targetLastX = this.target.x;
      this.targetLastY = this.target.y;
    } else {
      this.target = null;
    }

    const dx = this.targetLastX - this.x;
    const dy = this.targetLastY - this.y;
    const dist = Math.hypot(dx, dy);
    
    const moveDist = this.speed * dt;

    if (dist <= moveDist) {
      this.x = this.targetLastX;
      this.y = this.targetLastY;
      this.onHit(this.target, effectManager, enemies);
      return true; 
    } else {
      this.x += (dx / dist) * moveDist;
      this.y += (dy / dist) * moveDist;
      return false; 
    }
  }

  onHit(target, effectManager, enemies) {
    if (target && target.health > 0) {
      target.takeDamage(this.damage, this.damageType, effectManager);
      effectManager.spawnImpact(this.x, this.y, this.color, 4);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3.5;

    ctx.fillStyle = this.color;
    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      const scale = (i / this.trail.length) * 0.8;
      const size = this.radius * 2 * scale;
      ctx.beginPath();
      ctx.rect(pt.x - size / 2, pt.y - size / 2, size, size);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// 1. Minigunner Fast Tracer Bullet
export class MinigunnerBullet extends Bullet {
  constructor(x, y, target, damage) {
    super(x, y, target, {
      speed: 750,
      damage: damage,
      color: '#e67e22', 
      radius: 3,
      damageType: 'physical'
    });
  }
}

// 2. Pyromancer Flame Stream Projectile
export class FlameProjectile {
  constructor(x, y, angle, damage, burnDps, speed = 250, maxRange = 120) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.burnDps = burnDps;
    this.maxRange = maxRange;
    this.radius = 8;
    this.life = maxRange / speed; 
    this.damageType = 'fire';
  }

  update(effectManager, enemies, dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    for (const enemy of enemies) {
      if (enemy.health > 0) {
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= this.radius + enemy.radius) {
          enemy.takeDamage(this.damage, this.damageType, effectManager);
          enemy.applyBurn(this.burnDps, 3.5); 
          effectManager.spawnImpact(enemy.x, enemy.y, '#e67e22', 2, 0.6);
        }
      }
    }

    return this.life <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#ff6700'; 
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    const scaleSize = this.radius * (1.2 - this.life * 0.5);
    ctx.beginPath();
    ctx.rect(this.x - scaleSize / 2, this.y - scaleSize / 2, scaleSize, scaleSize);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// 3. DJ Music Aura Ring 
export class DJMusicWave {
  constructor(x, y, maxRadius) {
    this.x = x;
    this.y = y;
    this.maxRadius = maxRadius;
    this.radius = 0;
    this.speed = maxRadius * 1.5;
  }

  update(effectManager, enemies, dt) {
    this.radius += this.speed * dt;
    if (this.radius >= this.maxRadius) {
      return true; 
    }
    return false;
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(155, 89, 182, 0.4)'; 
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// 4. Specialized Rocket Bullet (Explosive area of effect damage)
export class Rocket extends Bullet {
  constructor(startX, startY, target, stats) {
    super(startX, startY, target, stats);
    this.splashRadius = stats.splashRadius || 80;
    this.damageType = 'explosive';
  }

  update(enemies, effectManager, dt) {
    let tx = this.target ? this.target.x : this.x;
    let ty = this.target ? this.target.y : this.y;

    if (this.target && this.target.health <= 0) {
      this.target = null;
    }

    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 8 || (dx === 0 && dy === 0)) {
      this.explode(enemies, effectManager);
      return true; 
    }

    const step = this.speed * dt;
    if (dist <= step) {
      this.x = tx;
      this.y = ty;
      this.explode(enemies, effectManager);
      return true; 
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }

    if (Math.random() < 0.3) {
      effectManager.spawnImpact(this.x, this.y, '#7f8c8d', 1, 0.4);
    }

    return false;
  }

  explode(enemies, effectManager) {
    effectManager.spawnExplosion(this.x, this.y, this.splashRadius);
    soundManager.playShoot();

    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d <= this.splashRadius) {
        enemy.takeDamage(this.damage, this.damageType, effectManager);
        effectManager.spawnImpact(enemy.x, enemy.y, '#e74c3c', 2, 0.5);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#34495e';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(this.x - 6, this.y - 3, 12, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e74c3c'; 
    ctx.beginPath();
    ctx.rect(this.x + 6, this.y - 3, 3, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// 5. Freezer cold Bullet (inflicts heavy slow status)
export class FreezeBullet extends Bullet {
  constructor(x, y, target, damage, level) {
    super(x, y, target, {
      speed: 600,
      damage: damage,
      color: '#00ffe0', 
      radius: 4,
      damageType: 'ice'
    });
    this.level = level;
  }

  onHit(target, effectManager, enemies) {
    if (target && target.health > 0) {
      target.takeDamage(this.damage, this.damageType, effectManager);
      const slowFactor = this.level >= 5 ? 0.0 : (this.level >= 3 ? 0.15 : 0.35);
      const duration = 2.0 + this.level * 0.25;
      target.applySlow(slowFactor, duration);
      effectManager.spawnImpact(this.x, this.y, '#00ffe0', 6, 0.8);
    }
  }
}

// 6. Shotgun Spray Pellet
export class ShotgunPellet {
  constructor(x, y, angle, damage, maxRange) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * 450;
    this.vy = Math.sin(angle) * 450;
    this.damage = damage;
    this.maxRange = maxRange;
    this.radius = 3;
    this.life = maxRange / 450;
    this.damageType = 'physical';
  }

  update(effectManager, enemies, dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    for (const enemy of enemies) {
      if (enemy.health > 0) {
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= this.radius + enemy.radius) {
          enemy.takeDamage(this.damage, this.damageType, effectManager);
          effectManager.spawnImpact(this.x, this.y, '#7f8c8d', 2, 0.4);
          return true; 
        }
      }
    }
    return this.life <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// 7. Ranger Railgun Heavy tracer
export class RangerBullet extends Bullet {
  constructor(x, y, target, damage) {
    super(x, y, target, {
      speed: 1300, 
      damage: damage,
      color: '#ff0055', 
      radius: 4,
      damageType: 'physical'
    });
  }

  onHit(target, effectManager, enemies) {
    super.onHit(target, effectManager, enemies);
    effectManager.spawnImpact(this.x, this.y, '#ff0055', 8, 1.2);
    effectManager.screenShake.shake(3.5);
  }
}

// 8. Turret Rapid-Fire laser tracer
export class TurretBullet extends Bullet {
  constructor(x, y, target, damage) {
    super(x, y, target, {
      speed: 850,
      damage: damage,
      color: '#00ffe0', 
      radius: 3,
      damageType: 'physical'
    });
  }
}

// 9. Deployable Marching Crook Guard / Military Base Vehicle Projectile (Spawns at Base and moves backwards)
export class VehicleProjectile {
  constructor(startX, startY, stats) {
    this.x = startX;
    this.y = startY;
    this.speed = stats.speed || 100;
    this.damage = stats.damage || 50;
    this.type = stats.type || 'humvee'; 
    this.color = stats.color || '#27ae60';
    this.radius = this.type === 'tank' ? 14 : (this.type === 'guard' ? 8 : 11);
    
    // Start at the path exit (Base) and navigate backwards to the spawn entrance
    this.targetNodeIndex = 1;
    
    if (window.game && window.game.grid && window.game.grid.pixelPath.length > 0) {
      const path = window.game.grid.pixelPath;
      this.targetNodeIndex = path.length - 2; // target previous node backwards
      this.x = path[path.length - 1].x;
      this.y = path[path.length - 1].y;
    }
  }

  update(effectManager, enemies, dt) {
    if (!window.game || !window.game.grid) return true;
    const path = window.game.grid.pixelPath;

    if (this.targetNodeIndex >= 0) {
      const target = path[this.targetNodeIndex];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const moveDist = this.speed * dt;

      if (dist <= moveDist) {
        this.x = target.x;
        this.y = target.y;
        this.targetNodeIndex--; // Decrement index to move backwards along path
      } else {
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
      }
    } else {
      return true; // Reached the zombie entrance safely without hitting anything
    }

    for (const enemy of enemies) {
      if (enemy.health > 0) {
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.radius + enemy.radius) {
          this.detonate(effectManager, enemies);
          return true; 
        }
      }
    }

    return false;
  }

  detonate(effectManager, enemies) {
    const splash = this.type === 'tank' ? 90 : (this.type === 'armored_car' ? 60 : 40);
    effectManager.spawnExplosion(this.x, this.y, splash);
    
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d <= splash) {
        enemy.takeDamage(this.damage, 'explosive', effectManager);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Calculate angle matching the direction of backward travel
    let angle = 0;
    if (window.game && window.game.grid && window.game.grid.pixelPath.length > 0) {
      const path = window.game.grid.pixelPath;
      if (this.targetNodeIndex >= 0 && this.targetNodeIndex < path.length) {
        const target = path[this.targetNodeIndex];
        angle = Math.atan2(target.y - this.y, target.x - this.x);
      }
    }
    ctx.rotate(angle);
    
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    if (this.type === 'guard') {
      ctx.fillStyle = '#2c3e50'; 
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.fillStyle = '#ffdbac'; 
      ctx.fillRect(-4, -14, 8, 8);
      ctx.strokeRect(-4, -14, 8, 8);
      ctx.fillStyle = '#111'; 
      ctx.fillRect(-2, -12, 5, 2);
    } else {
      ctx.fillStyle = this.color;
      const w = this.type === 'tank' ? 24 : 18;
      const h = this.type === 'tank' ? 16 : 12;
      
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      ctx.fillStyle = '#111';
      ctx.fillRect(-w / 2 + 2, -h / 2 - 2, 4, 2);
      ctx.fillRect(w / 2 - 6, -h / 2 - 2, 4, 2);
      ctx.fillRect(-w / 2 + 2, h / 2, 4, 2);
      ctx.fillRect(w / 2 - 6, h / 2, 4, 2);

      if (this.type === 'tank') {
        ctx.fillStyle = '#1e3d2f';
        ctx.fillRect(0, -2, 14, 4);
        ctx.strokeRect(0, -2, 14, 4);
      }
    }

    ctx.restore();
  }
}