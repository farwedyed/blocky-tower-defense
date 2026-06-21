// Enemy Module for Blocky Tactical Defense (BTD 2D)

export class Enemy {
  static hardcoreMode = false;
  static nextId = 1;

  constructor(x, y, stats) {
    this.x = x;
    this.y = y;
    
    // Assign a unique network ID for multiplayer tracking
    this.id = Enemy.nextId++;

    // Retrieve active difficulty from globally exposed game instance
    const activeDiff = (window.game && window.game.selectedDifficulty) ? window.game.selectedDifficulty : 'molten';
    const diffConfig = window.game ? window.game.difficultySettings[activeDiff] : { hpMultiplier: 1.15 };
    const diffHpMult = diffConfig.hpMultiplier;

    // Apply Hardcore Mode and active Difficulty multipliers at spawn time
    const hpMult = (Enemy.hardcoreMode ? 1.5 : 1.0) * diffHpMult;
    const spdMult = Enemy.hardcoreMode ? 1.2 : 1.0;

    this.maxHealth = Math.round(stats.maxHealth * hpMult);
    this.health = this.maxHealth;
    this.baseSpeed = stats.speed * spdMult;
    this.speed = this.baseSpeed;
    this.goldReward = stats.goldReward;
    this.radius = stats.radius || 12;
    this.color = stats.color || '#fff';
    this.name = stats.name || 'Zombie';
    
    // Roblox TDS-style distinct leakage base damage values
    this.baseDamage = stats.baseDamage || 1;

    // Armor and Status attributes
    this.isCamo = stats.isCamo || false;
    this.isLead = stats.isLead || false;
    this.isFlying = stats.isFlying || false;
    this.isBoss = stats.isBoss || false;
    this.isFireImmune = stats.isFireImmune || false;

    // Energy Shield Pool
    this.maxShield = Math.round((stats.maxShield || 0) * hpMult);
    this.shield = this.maxShield;

    // Path movement tracking
    this.targetNodeIndex = 1;

    // Visual timers
    this.hitFlashTimer = 0;

    // Status effects
    this.slowDuration = 0;
    this.slowFactor = 1.0;

    // Pyromancer burning DoT status
    this.burnDuration = 0;
    this.burnDamagePerSecond = 0;
    this.burnTimer = 0;

    // Boss Phase Attributes
    this.enraged = false;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    // 1. Enraged Boss check (triggers at <50% HP)
    if (this.isBoss && !this.enraged && this.health < this.maxHealth * 0.5) {
      this.enraged = true;
      this.slowDuration = 0; // Clear slows immediately
      this.slowFactor = 1.0;
      this.speed = this.baseSpeed;
      effectManager.spawnText(this.x, this.y - 25, "RAGE!", '#e74c3c');
    }

    // 2. Update Slow status effect (ignore slows if enraged)
    if (this.slowDuration > 0 && !this.enraged) {
      this.slowDuration -= dt;
      this.speed = this.baseSpeed * this.slowFactor;
      if (this.slowDuration <= 0) {
        this.slowFactor = 1.0;
        this.speed = this.baseSpeed;
      }
    } else {
      this.speed = this.baseSpeed;
    }

    // 3. Update Burning DoT status effect
    if (this.burnDuration > 0) {
      this.burnDuration -= dt;
      this.health -= this.burnDamagePerSecond * dt;
      
      this.burnTimer += dt;
      if (this.burnTimer >= 0.1) {
        this.burnTimer = 0;
        effectManager.spawnImpact(this.x + (Math.random() - 0.5) * 12, this.y + (Math.random() - 0.5) * 12, '#ff6700', 1, 0.4);
      }

      if (this.health <= 0) {
        this.health = 0;
      }
    }

    // 4. Movement along path nodes
    if (this.health > 0 && this.targetNodeIndex < pixelPath.length) {
      const target = pixelPath[this.targetNodeIndex];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);

      // 35% speed boost during rage phase
      const currentSpeed = this.enraged ? this.speed * 1.35 : this.speed;
      const moveDist = currentSpeed * dt;

      if (dist <= moveDist) {
        this.x = target.x;
        this.y = target.y;
        this.targetNodeIndex++;
      } else {
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
      }
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }
  }

  applySlow(factor, duration) {
    if (this.enraged) return; // Immune to crowd control during rage phase
    if (factor < this.slowFactor || (factor === this.slowFactor && duration > this.slowDuration)) {
      this.slowFactor = factor;
      this.slowDuration = duration;
    }
  }

  applyBurn(damagePerSecond, duration) {
    if (this.isFireImmune) return;
    if (damagePerSecond >= this.burnDamagePerSecond || duration > this.burnDuration) {
      this.burnDamagePerSecond = damagePerSecond;
      this.burnDuration = duration;
    }
  }

  takeDamage(amount, damageType, effectManager) {
    // 1. Lead / Heavy Armor Resistance (Immune to physical, takes exactly 1 dmg)
    if (this.isLead && damageType === 'physical') {
      amount = 1;
      effectManager.spawnText(this.x, this.y - 18, "RESIST", '#95a5a6');
    }

    // 2. Energy Shield damage absorption
    if (this.shield > 0) {
      if (this.shield >= amount) {
        this.shield -= amount;
        amount = 0;
        effectManager.spawnImpact(this.x, this.y, '#3498db', 2, 0.4);
      } else {
        amount -= this.shield;
        this.shield = 0;
        effectManager.spawnText(this.x, this.y - 18, "SHIELD SHATTER!", '#5dade2');
      }
    }

    this.health -= amount;
    this.hitFlashTimer = 0.08;

    if (this.health <= 0) {
      this.health = 0;
      return true; // Dead
    }
    return false; // Alive
  }

  draw(ctx) {
    if (this.health <= 0) return;

    ctx.save();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3.5;

    // Apply 50% opacity to Camo enemies to reflect invisibility
    if (this.isCamo) {
      ctx.globalAlpha = 0.55;
    }

    // Offset altitude coordinates if the target is Flying
    let renderY = this.y;
    if (this.isFlying) {
      // Draw ground shadow first
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 12, this.radius * 0.9, this.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Elevate actual rendering model
      renderY = this.y - 18;
    }

    // Draw Boss Rage Fire Aura
    if (this.enraged) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.25)';
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, renderY, this.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Render sprites
    if (this.hitFlashTimer > 0) {
      ctx.fillStyle = '#ff3131';
      ctx.strokeStyle = '#222';
      this.drawBlockyZombieBody(ctx, renderY);
    } else {
      this.drawBlockyZombieBody(ctx, renderY);
    }

    // Draw floating wings/caps if flying
    if (this.isFlying) {
      ctx.fillStyle = '#e67e22'; // Orange balloon details
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, renderY - this.radius - 12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x, renderY - this.radius);
      ctx.lineTo(this.x, renderY - this.radius - 6);
      ctx.stroke();
    }

    // Status effect ring indicators on ground
    if (this.slowDuration > 0 && !this.enraged) {
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.radius, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.burnDuration > 0) {
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.radius, this.radius + 2, (this.radius + 2) * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Health and Shield Bars
    const barW = this.radius * 2.2;
    const barH = 5;
    const barX = this.x - barW / 2;
    
    // Position health stats above elevation
    const barY = renderY - this.radius - 12;

    // 1. Draw base health frame
    ctx.fillStyle = '#222';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    const healthPercent = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.2 ? '#f1c40f' : '#e74c3c';
    ctx.fillRect(barX, barY, barW * healthPercent, barH);

    // 2. Draw active blue Shield Bar above health bar
    if (this.maxShield > 0 && this.shield > 0) {
      const shieldY = barY - 6;
      ctx.fillStyle = '#222';
      ctx.fillRect(barX - 1, shieldY - 1, barW + 2, barH + 2);

      const shieldPercent = Math.max(0, this.shield / this.maxShield);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(barX, shieldY, barW * shieldPercent, barH);
    }

    ctx.restore();
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;

    // Left Arm (raised forward)
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(this.x - r - 6, renderY - 4, 8, 5);
    ctx.strokeRect(this.x - r - 6, renderY - 4, 8, 5);

    // Right Arm (raised forward)
    ctx.fillRect(this.x + r - 2, renderY - 4, 8, 5);
    ctx.strokeRect(this.x + r - 2, renderY - 4, 8, 5);

    // Blocky Torso (Shirt)
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(this.x - r, renderY - 6, r * 2, r * 1.5);
    ctx.strokeRect(this.x - r, renderY - 6, r * 2, r * 1.5);

    // Square Head
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.0);

    // Simple blocky facial details
    ctx.fillStyle = '#111';
    ctx.fillRect(this.x - r * 0.4, renderY - r * 1.2, 2, 2);
    ctx.fillRect(this.x + r * 0.2, renderY - r * 1.2, 2, 2);
  }
}

// ─── EARLY MATCH ENEMIES ──────────────────────────────────────────────────

// 1. Basic Zombie
export class Runner extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 15, // Roblox TDS aligned
      speed: 65,
      goldReward: 12,
      radius: 10,
      color: '#8e44ad',
      name: 'Zombie',
      baseDamage: 1
    });
  }
}

// 2. Speedy Zombie
export class Quick extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 12, // Roblox TDS aligned
      speed: 120,
      goldReward: 10,
      radius: 9,
      color: '#e74c3c',
      name: 'Quick Zombie',
      baseDamage: 1
    });
  }
}

// 3. Tanky Heavy Zombie
export class Slow extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 40, // Roblox TDS aligned
      speed: 40,
      goldReward: 20,
      radius: 13,
      color: '#34495e',
      name: 'Slow Zombie',
      baseDamage: 3
    });
  }
}

// 4. Invisible Hidden (Requires Camo Detection)
export class Hidden extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 30, // Roblox TDS aligned
      speed: 95,
      goldReward: 18,
      radius: 10,
      isCamo: true,
      color: '#9b59b6',
      name: 'Hidden',
      baseDamage: 2
    });
  }
}

// 5. Heavy Armored Lead (Immune to light physical bullets)
export class Lead extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 50, // Roblox TDS aligned
      speed: 40,
      goldReward: 20,
      radius: 11,
      isLead: true,
      color: '#7f8c8d',
      name: 'Lead',
      baseDamage: 4
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    super.drawBlockyZombieBody(ctx, renderY);
    ctx.fillStyle = '#555'; // Metallic face shield
    ctx.fillRect(this.x - this.radius * 0.4, renderY - this.radius * 1.3, this.radius * 0.8, 4);
  }
}

// ─── MID MATCH ENEMIES ────────────────────────────────────────────────────

// 6. Invisible Speedster (Shadow)
export class Shadow extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 80, // Roblox TDS aligned
      speed: 115,
      goldReward: 35,
      radius: 11,
      isCamo: true,
      color: '#1a1a2e',
      name: 'Shadow',
      baseDamage: 5
    });
  }
}

// 7. Toxic Giant (Goliath)
export class Goliath extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 800, // Roblox TDS aligned
      speed: 35,
      goldReward: 60,
      radius: 18,
      color: '#27ae60',
      name: 'Toxic Giant',
      baseDamage: 15
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#f1c40f'; // Hazmat yellow
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#145a32'; // Toxic green arms
    ctx.fillRect(this.x - r - 8, renderY - 6, 10, 8);
    ctx.strokeRect(this.x - r - 8, renderY - 6, 10, 8);
    ctx.fillRect(this.x + r - 2, renderY - 6, 10, 8);
    ctx.strokeRect(this.x + r - 2, renderY - 6, 10, 8);

    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(this.x - r * 0.7, renderY - r * 1.5, r * 1.4, r * 1.1);
    ctx.strokeRect(this.x - r * 0.7, renderY - r * 1.5, r * 1.4, r * 1.1);

    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(this.x - r * 0.4, renderY - r * 1.2, r * 0.8, r * 0.4);
  }
}

// 8. Shielded Armored heavy (Templar)
export class Templar extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 3000, // Roblox TDS aligned
      maxShield: 1000, // Roblox TDS aligned
      speed: 30,
      goldReward: 100,
      radius: 19,
      isLead: true,
      color: '#bdc3c7',
      name: 'Templar',
      baseDamage: 25
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#ecf0f1'; // Polished plate chest
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#c0392b'; // Crest Cross
    ctx.fillRect(this.x - 3, renderY - 8, 6, r * 1.6);
    ctx.fillRect(this.x - r, renderY - 2, r * 2, 4);

    ctx.fillStyle = '#bdc3c7'; // Shield block
    ctx.fillRect(this.x - r - 6, renderY - 2, 8, 12);
    ctx.strokeRect(this.x - r - 6, renderY - 2, 8, 12);
  }
}

// ─── BOSS ENEMIES ─────────────────────────────────────────────────────────

// 9. Wave 10 Boss: Grave Digger
export class GraveDigger extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 8000, // Roblox TDS aligned
      speed: 32,
      goldReward: 200,
      radius: 26,
      isBoss: true,
      color: '#34495e',
      name: 'Grave Digger',
      baseDamage: 40
    });
    this.summonTimer = 0;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    super.update(pixelPath, effectManager, dt, allEnemies, towers);
    
    // Spawns support runners every 7 seconds
    this.summonTimer += dt;
    if (this.summonTimer >= 7.0 && this.health > 0) {
      this.summonTimer = 0;
      allEnemies.push(new Runner(this.x - 12, this.y));
      allEnemies.push(new Quick(this.x + 12, this.y));
      effectManager.spawnText(this.x, this.y - 20, "SUMMON!", '#bdc3c7');
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#2c3e50'; // Trenchcoat
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#7f8c8d'; // Spade shovel
    ctx.fillRect(this.x + r * 0.5, renderY - 22, 12, 10);
    ctx.strokeRect(this.x + r * 0.5, renderY - 22, 12, 10);
    ctx.fillStyle = '#784212';
    ctx.fillRect(this.x + r * 0.6, renderY - 12, 4, 25);
    ctx.strokeRect(this.x + r * 0.6, renderY - 12, 4, 25);

    ctx.fillStyle = '#27ae60';
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.4, r * 1.2, r * 1.0);
  }
}

// 10. Wave 20 Boss: Molten Titan
export class MoltenTitan extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 35000, // Roblox TDS aligned
      speed: 30,
      goldReward: 350,
      radius: 28,
      isBoss: true,
      isFireImmune: true,
      color: '#d35400',
      name: 'Molten Titan',
      baseDamage: 60
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#111'; // Dark magma crust
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#ff6700'; // Lava cracks
    ctx.fillRect(this.x - r * 0.5, renderY - 4, 3, 10);
    ctx.fillRect(this.x + r * 0.2, renderY - 6, 4, 8);

    ctx.fillStyle = '#e67e22';
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.3, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.3, r * 1.2, r * 1.0);
  }
}

// 11. Wave 30 Boss: Fallen Guardian
export class FallenGuardian extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 85000, // Roblox TDS aligned
      speed: 28,
      goldReward: 500,
      radius: 30,
      isBoss: true,
      isLead: true,
      color: '#2c3e50',
      name: 'Fallen Guardian',
      baseDamage: 80
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#2c3e50'; // Dark iron plates
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#00ffe0'; // Glowing core
    ctx.fillRect(this.x - 4, renderY - 4, 8, 8);

    ctx.fillStyle = '#7f8c8d'; // Heavy shoulder pads
    ctx.fillRect(this.x - r - 4, renderY - 12, 6, 10);
    ctx.fillRect(this.x + r - 2, renderY - 12, 6, 10);
  }
}

// 12. Wave 40 Boss: Fallen King
export class FallenKing extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 180000, // Roblox TDS aligned
      speed: 24,
      goldReward: 800,
      radius: 33,
      isBoss: true,
      color: '#f1c40f',
      name: 'Fallen King',
      baseDamage: 100
    });
    this.slamTimer = 0;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    super.update(pixelPath, effectManager, dt, allEnemies, towers);
    
    // Slams greatsword to freeze/stun all units within 120px range
    this.slamTimer += dt;
    if (this.slamTimer >= 7.0 && this.health > 0) {
      this.slamTimer = 0;
      effectManager.spawnText(this.x, this.y - 30, "KING'S SLAM!", '#9b59b6');
      effectManager.spawnExplosion(this.x, this.y, 120);

      if (towers) {
        for (const tower of towers.values()) {
          const dist = Math.hypot(tower.x - this.x, tower.y - this.y);
          if (dist <= 125) {
            tower.fireCooldown = Math.max(tower.fireCooldown, 3.0); // Stun for 3 seconds
            effectManager.spawnText(tower.x, tower.y - 15, "STUNNED", '#9b59b6');
          }
        }
      }
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#f1c40f'; // Golden plate armor
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#8e44ad'; // Purple royal sword
    ctx.fillRect(this.x + r * 0.6, renderY - 30, 8, 26);
    ctx.strokeRect(this.x + r * 0.6, renderY - 30, 8, 26);

    ctx.fillStyle = '#f1c40f'; // Crown
    ctx.beginPath();
    ctx.moveTo(this.x - r * 0.4, renderY - r * 1.4);
    ctx.lineTo(this.x - r * 0.4, renderY - r * 1.7);
    ctx.lineTo(this.x - r * 0.2, renderY - r * 1.5);
    ctx.lineTo(this.x, renderY - r * 1.8);
    ctx.lineTo(this.x + r * 0.2, renderY - r * 1.5);
    ctx.lineTo(this.x + r * 0.4, renderY - r * 1.7);
    ctx.lineTo(this.x + r * 0.4, renderY - r * 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// 13. Wave 40 Ultimate Final Boss: Void Reaver
export class VoidReaver extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 350000, // Roblox TDS aligned
      maxShield: 100000, // Roblox TDS aligned
      speed: 22,
      goldReward: 1500,
      radius: 36,
      isBoss: true,
      isLead: true,
      color: '#2c003e',
      name: 'Void Reaver',
      baseDamage: 100
    });
    this.summonTimer = 0;
    this.stunTimer = 0;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    super.update(pixelPath, effectManager, dt, allEnemies, towers);

    if (this.health <= 0) return;

    // Summons fast Shadows from void portal gates
    this.summonTimer += dt;
    if (this.summonTimer >= 8.5) {
      this.summonTimer = 0;
      allEnemies.push(new Shadow(this.x - 15, this.y));
      allEnemies.push(new Shadow(this.x + 15, this.y));
      effectManager.spawnText(this.x, this.y - 30, "VOID SUMMON!", '#9b59b6');
    }

    // Targets and stuns random towers
    this.stunTimer += dt;
    if (this.stunTimer >= 5.0) {
      this.stunTimer = 0;
      if (towers && towers.size > 0) {
        const list = Array.from(towers.values());
        const target = list[Math.floor(Math.random() * list.length)];
        target.fireCooldown = Math.max(target.fireCooldown, 3.0);
        effectManager.spawnText(target.x, target.y - 15, "VOID STUNNED", '#8e44ad');
        effectManager.spawnImpact(target.x, target.y, '#8e44ad', 6, 0.7);
      }
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#2c003e'; // Cosmic purple dark void coat
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.8);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.8);

    ctx.fillStyle = '#ff0080'; // Dual glowing pink blades
    ctx.fillRect(this.x + r * 0.6, renderY - 32, 6, 26);
    ctx.strokeRect(this.x + r * 0.6, renderY - 32, 6, 26);
    ctx.fillRect(this.x - r * 0.8, renderY - 32, 6, 26);
    ctx.strokeRect(this.x - r * 0.8, renderY - 32, 6, 26);

    ctx.fillStyle = '#ff0080'; // Glowing eyes
    ctx.fillRect(this.x - r * 0.3, renderY - r * 1.0, 5, 4);
    ctx.fillRect(this.x + r * 0.1, renderY - r * 1.0, 5, 4);
  }
}

// ─── SAFE fallback aliases for compilation during module transit ───
export { MoltenTitan as MoltenBoss, GraveDigger as BossZombie };