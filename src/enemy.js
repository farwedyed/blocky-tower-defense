// Enemy Module for Blocky Tactical Defense (BTD 2D)

export class Enemy {
  static hardcoreMode = false;
  static nextId = 1;

  constructor(x, y, stats) {
    this.x = x;
    this.y = y;
    
    // Assign unique network ID
    this.id = Enemy.nextId++;

    const activeDiff = (window.game && window.game.selectedDifficulty) ? window.game.selectedDifficulty : 'molten';
    const diffConfig = window.game ? window.game.difficultySettings[activeDiff] : { hpMultiplier: 1.0 };
    const diffPhMult = diffConfig.hpMultiplier;

    // Apply Hardcore and active Difficulty multipliers
    const hpMult = (Enemy.hardcoreMode ? 1.5 : 1.0) * diffPhMult;
    const spdMult = Enemy.hardcoreMode ? 1.2 : 1.0;

    this.maxHealth = Math.round(stats.maxHealth * hpMult);
    this.health = this.maxHealth;
    this.baseSpeed = stats.speed * spdMult;
    this.speed = this.baseSpeed;
    this.goldReward = stats.goldReward;
    this.radius = stats.radius || 12;
    this.color = stats.color || '#fff';
    this.name = stats.name || 'Zombie';
    
    // Roblox TDS distinct leakage base damage values
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
    if (this.enraged) return; 
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

    // Apply 50% opacity to Camo enemies
    if (this.isCamo) {
      ctx.globalAlpha = 0.55;
    }

    let renderY = this.y;
    if (this.isFlying) {
      // Draw ground shadow first
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 12, this.radius * 0.9, this.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Elevate actual model
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

    // Draw balloon details if flying
    if (this.isFlying) {
      ctx.fillStyle = '#e67e22'; 
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

    // Status effect ring indicators
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
    const barY = renderY - this.radius - 12;

    ctx.fillStyle = '#222';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    const healthPercent = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.2 ? '#f1c40f' : '#e74c3c';
    ctx.fillRect(barX, barY, barW * healthPercent, barH);

    // Shield Bar
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

    // Facial details
    ctx.fillStyle = '#111';
    ctx.fillRect(this.x - r * 0.4, renderY - r * 1.2, 2, 2);
    ctx.fillRect(this.x + r * 0.2, renderY - r * 1.2, 2, 2);
  }
}

// ─── BASE MATCH ENEMIES (REBALANCED TO OFFICIAL ROBLOX TDS STATS) ───
export class Runner extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 10, // Rebalanced down from 15 to match TDS
      speed: 65,
      goldReward: 12,
      radius: 10,
      color: '#8e44ad',
      name: 'Zombie',
      baseDamage: 1
    });
  }
}

export class Quick extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 6, // Rebalanced down from 12 to match TDS Speedy
      speed: 120,
      goldReward: 10,
      radius: 9,
      color: '#e74c3c',
      name: 'Quick Zombie',
      baseDamage: 1
    });
  }
}

export class Slow extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 25, // Rebalanced down from 40 to match TDS Slow
      speed: 40,
      goldReward: 20,
      radius: 13,
      color: '#34495e',
      name: 'Slow Zombie',
      baseDamage: 1
    });
  }
}

export class Hidden extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 10, // Rebalanced down from 15 to match TDS
      speed: 80,
      goldReward: 20,
      radius: 10,
      color: '#cbd5e1',
      name: 'Hidden',
      baseDamage: 1,
      isCamo: true
    });
  }
}

export class Lead extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 30, // Rebalanced down from 50 to match TDS
      speed: 35,
      goldReward: 25,
      radius: 11,
      color: '#7f8c8d',
      name: 'Lead',
      baseDamage: 1,
      isLead: true
    });
  }
}

export class Shadow extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 50, // Rebalanced down from 80 to match TDS
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

export class Goliath extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 200, // Rebalanced down from 400 to match TDS Normal Boss scale
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

export class Templar extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 1500, // Rebalanced down from 3000 to scale with 2D singleplayer
      maxShield: 500, 
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

// ─── THE SIX UNIQUE DIFFICULTIES BOSSES (SCALED FOR 2D BALANCING) ───

// 1. EASY MODE BOSS: BRUTE
export class Brute extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 1000, // Rebalanced down from 22000 to make Easy Mode fair for solo play
      speed: 32,
      goldReward: 150,
      radius: 24,
      isBoss: true,
      color: '#1e8449',
      name: 'Brute',
      baseDamage: 20
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#1e8449'; // Dark forest green chest
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#27ae60'; // Heavy bulk shoulders
    ctx.fillRect(this.x - r - 7, renderY - 10, 8, 12);
    ctx.strokeRect(this.x - r - 7, renderY - 10, 8, 12);
    ctx.fillRect(this.x + r - 1, renderY - 10, 8, 12);
    ctx.strokeRect(this.x + r - 1, renderY - 10, 8, 12);

    ctx.fillStyle = '#27ae60'; // Muscular green head
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.4, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.4, r * 1.2, r * 1.0);

    ctx.fillStyle = '#ff3131'; // Red raging eye slits
    ctx.fillRect(this.x - r * 0.3, renderY - r * 1.1, 4, 3);
    ctx.fillRect(this.x + r * 0.1, renderY - r * 1.1, 4, 3);
  }
}

// 2. CASUAL MODE BOSS: GRAVE DIGGER
export class GraveDigger extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 2000, // Rebalanced down from 40000 
      speed: 30,
      goldReward: 250,
      radius: 26,
      isBoss: true,
      color: '#2c3e50',
      name: 'Grave Digger',
      baseDamage: 30
    });
    this.summonTimer = 0;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    super.update(pixelPath, effectManager, dt, allEnemies, towers);
    
    // Periodically summons reinforcements
    this.summonTimer += dt;
    if (this.summonTimer >= 8.0 && this.health > 0) {
      this.summonTimer = 0;
      allEnemies.push(new Runner(this.x - 12, this.y));
      allEnemies.push(new Quick(this.x + 12, this.y));
      effectManager.spawnText(this.x, this.y - 20, "SUMMON!", '#bdc3c7');
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#2f3542'; // Dark Robe
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#7f8c8d'; // Spade shovel weapon
    ctx.fillRect(this.x + r * 0.5, renderY - 24, 12, 10);
    ctx.strokeRect(this.x + r * 0.5, renderY - 24, 12, 10);
    ctx.fillStyle = '#784212';
    ctx.fillRect(this.x + r * 0.6, renderY - 14, 4, 25);
    ctx.strokeRect(this.x + r * 0.6, renderY - 14, 4, 25);

    ctx.fillStyle = '#1e272e'; // Dark Hood
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.1);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.1);

    ctx.fillStyle = '#9b59b6'; // Glowing purple slits
    ctx.fillRect(this.x - r * 0.25, renderY - r * 1.1, 3, 3);
    ctx.fillRect(this.x + r * 0.1, renderY - r * 1.1, 3, 3);
  }
}

// 3. INTERMEDIATE BOSS: HAZARD GIANT
export class HazardGiant extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 3500, // Rebalanced down from 55000
      maxShield: 1000,
      speed: 28,
      goldReward: 350,
      radius: 28,
      isBoss: true,
      color: '#f1c40f',
      name: 'Hazard Giant',
      baseDamage: 40
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#f1c40f'; // Neon Hazmat Yellow suit
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#2ecc71'; // Radioactive barrels strapped on shoulders
    ctx.fillRect(this.x - r - 6, renderY - 12, 6, 14);
    ctx.strokeRect(this.x - r - 6, renderY - 12, 6, 14);
    ctx.fillRect(this.x + r, renderY - 12, 6, 14);
    ctx.strokeRect(this.x + r, renderY - 12, 6, 14);

    ctx.fillStyle = '#f1c40f'; // Dome visor head
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.4, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.4, r * 1.2, r * 1.0);

    ctx.fillStyle = '#2ecc71'; // Toxic glowing green glass window
    ctx.fillRect(this.x - r * 0.35, renderY - r * 1.15, r * 0.7, 4);
  }
}

// 4. MOLTEN BOSS: MOLTEN TITAN
export class MoltenTitan extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 5000, // Rebalanced down from 80000 
      speed: 30,
      goldReward: 450,
      radius: 30,
      isBoss: true,
      isFireImmune: true,
      color: '#d35400',
      name: 'Molten Titan',
      baseDamage: 50
    });
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#1e272e'; // Obsidian/Magma crust body
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.6);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.6);

    ctx.fillStyle = '#ff6b6b'; // Active molten lava veins
    ctx.fillRect(this.x - r * 0.5, renderY - 4, 3, 10);
    ctx.fillRect(this.x + r * 0.2, renderY - 6, 4, 8);

    ctx.fillStyle = '#1e272e'; // Molten volcanic head
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.3, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.3, r * 1.2, r * 1.0);

    // Volcano spark crest crown
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.moveTo(this.x - r * 0.6, renderY - r * 1.3);
    ctx.lineTo(this.x - r * 0.45, renderY - r * 1.6);
    ctx.lineTo(this.x - r * 0.2, renderY - r * 1.3);
    ctx.lineTo(this.x, renderY - r * 1.8);
    ctx.lineTo(this.x + r * 0.2, renderY - r * 1.3);
    ctx.lineTo(this.x + r * 0.45, renderY - r * 1.6);
    ctx.lineTo(this.x + r * 0.6, renderY - r * 1.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

// 5. MID-BOSS: FALLEN GUARDIAN
export class FallenGuardian extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 4000, // Rebalanced down from 85000 
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
    ctx.fillStyle = '#2c3e50'; 
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#00ffe0'; 
    ctx.fillRect(this.x - 4, renderY - 4, 8, 8);

    ctx.fillStyle = '#7f8c8d'; 
    ctx.fillRect(this.x - r - 4, renderY - 12, 6, 10);
    ctx.fillRect(this.x + r - 2, renderY - 12, 6, 10);
  }
}

// 6. FALLEN BOSS: FALLEN KING
export class FallenKing extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 8000, // Rebalanced down from 150000 
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
            tower.fireCooldown = Math.max(tower.fireCooldown, 3.0); 
            effectManager.spawnText(tower.x, tower.y - 15, "STUNNED", '#9b59b6');
          }
        }
      }
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#f1c40f'; // Golden Royal plate armor
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.7);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.7);

    ctx.fillStyle = '#8e44ad'; // Purple Greatsword
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

// 7. FROST BOSS: FROST SPIRIT (REQ. LEVEL 60 ACCESS)
export class FrostSpirit extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 12000, // Rebalanced down from 280000 
      maxShield: 3000,
      speed: 20,
      goldReward: 1200,
      radius: 36,
      isBoss: true,
      color: '#d4e6f1',
      name: 'Frost Spirit',
      baseDamage: 100
    });
    this.blizzardTimer = 0;
  }

  update(pixelPath, effectManager, dt, allEnemies, towers) {
    super.update(pixelPath, effectManager, dt, allEnemies, towers);

    // Periodically summons deep freeze blizzard across all defensive grids (stuns 1 random tower map-wide)
    this.blizzardTimer += dt;
    if (this.blizzardTimer >= 6.0 && this.health > 0) {
      this.blizzardTimer = 0;
      effectManager.spawnText(this.x, this.y - 30, "GLACIAL AURA!", '#74b9ff');
      
      if (towers && towers.size > 0) {
        const activeTowers = Array.from(towers.values());
        const target = activeTowers[Math.floor(Math.random() * activeTowers.length)];
        target.fireCooldown = Math.max(target.fireCooldown, 4.0); // Global global ice freeze slow stuns target for 4 seconds
        effectManager.spawnText(target.x, target.y - 15, "FROZEN", '#0984e3');
        effectManager.spawnImpact(target.x, target.y, '#74b9ff', 6, 0.7);
      }
    }
  }

  drawBlockyZombieBody(ctx, renderY) {
    const r = this.radius;
    ctx.fillStyle = '#ebf5fb'; // Pale ice body
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.8);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.8);

    ctx.fillStyle = '#00ffe0'; // Cyan core lines
    ctx.fillRect(this.x - 4, renderY, 8, 8);

    ctx.fillStyle = '#74b9ff'; // Glacier shoulder shield crystals
    ctx.fillRect(this.x - r - 6, renderY - 12, 6, 12);
    ctx.strokeRect(this.x - r - 6, renderY - 12, 6, 12);
    ctx.fillRect(this.x + r, renderY - 12, 6, 12);
    ctx.strokeRect(this.x + r, renderY - 12, 6, 12);

    ctx.fillStyle = '#ebf5fb'; // Glacier head
    ctx.fillRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.0);
    ctx.strokeRect(this.x - r * 0.6, renderY - r * 1.5, r * 1.2, r * 1.0);

    ctx.fillStyle = '#5dade2'; // Frozen horns
    ctx.fillRect(this.x - r * 0.6 - 3, renderY - r * 1.7, 3, 6);
    ctx.fillRect(this.x + r * 0.6, renderY - r * 1.7, 3, 6);
  }
}

// 8. FINAL VOID REAVER EXTRA
export class VoidReaver extends Enemy {
  constructor(x, y) {
    super(x, y, {
      maxHealth: 15000, // Rebalanced down from 350000 
      maxShield: 5000, 
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

    this.summonTimer += dt;
    if (this.summonTimer >= 8.5) {
      this.summonTimer = 0;
      allEnemies.push(new Shadow(this.x - 15, this.y));
      allEnemies.push(new Shadow(this.x + 15, this.y));
      effectManager.spawnText(this.x, this.y - 30, "VOID SUMMON!", '#9b59b6');
    }

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
    ctx.fillStyle = '#2c003e'; 
    ctx.fillRect(this.x - r, renderY - 8, r * 2, r * 1.8);
    ctx.strokeRect(this.x - r, renderY - 8, r * 2, r * 1.8);

    ctx.fillStyle = '#ff0080'; 
    ctx.fillRect(this.x + r * 0.6, renderY - 32, 6, 26);
    ctx.strokeRect(this.x + r * 0.6, renderY - 32, 6, 26);
    ctx.fillRect(this.x - r * 0.8, renderY - 32, 6, 26);
    ctx.strokeRect(this.x - r * 0.8, renderY - 32, 6, 26);

    ctx.fillStyle = '#ff0080'; 
    ctx.fillRect(this.x - r * 0.3, renderY - r * 1.0, 5, 4);
    ctx.fillRect(this.x + r * 0.1, renderY - r * 1.0, 5, 4);
  }
}

// Visual asset maps fallback aliases
export { MoltenTitan as MoltenBoss, GraveDigger as BossZombie };