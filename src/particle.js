// Cartoon Particle and Visual Effects Module for Blocky TDS 2D

// Cloud Particle for Placement dust puffs
export class DustCloudParticle {
  constructor(x, y, vx, vy, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.maxLife = 0.45;
    this.life = 0.45;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.92, dt * 60);
    this.vy *= Math.pow(0.92, dt * 60);
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e2e8f0'; // Soft grey cloud
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    
    // Draw blocky puffy circles
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.arc(this.x - this.size * 0.4, this.y, this.size * 0.7, 0, Math.PI * 2);
    ctx.arc(this.x + this.size * 0.4, this.y, this.size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }
}

// Flame/Sparks for Pyromancer & hits
export class CartoonFlame {
  constructor(x, y, vx, vy, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.maxLife = 0.4;
    this.life = 0.4;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.size = Math.max(1, this.size - dt * 10);
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Shift color from white -> yellow -> orange -> red
    const t = 1 - (this.life / this.maxLife);
    ctx.fillStyle = t < 0.25 ? '#fff' : t < 0.6 ? '#f1c40f' : t < 0.85 ? '#e67e22' : '#e74c3c';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Musical note particle for DJ Unit aura
export class MusicNoteParticle {
  constructor(x, y, vx, vy, noteChar = '🎵') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.noteChar = noteChar;
    this.maxLife = 0.8;
    this.life = 0.8;
    this.angle = (Math.random() - 0.5) * 0.5;
    this.spin = (Math.random() - 0.5) * 2;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#9b59b6'; // Purple note
    ctx.font = "bold 16px Arial";
    ctx.textAlign = 'center';
    ctx.fillText(this.noteChar, 0, 0);
    ctx.restore();
  }
}

// Muzzle Flash star particle
export class MuzzleFlashStar {
  constructor(x, y, angle, size) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.size = size;
    this.maxLife = 0.06;
    this.life = 0.06;
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#f1c40f'; // Golden star
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;

    // Draw 4-point star
    const s = this.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.3, -s * 0.3);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.3, s * 0.3);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.3, s * 0.3);
    ctx.lineTo(-s, 0);
    ctx.lineTo(-s * 0.3, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// Big blocky cartoon explosion sparks
export class ExplosionSpike {
  constructor(x, y, vx, vy, size, color = '#f39c12') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.color = color;
    this.maxLife = 0.35;
    this.life = 0.35;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

export class SwingArcParticle {
  constructor(x, y, angle, range) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.range = range;
    this.maxLife = 0.15;
    this.life = 0.15;
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.strokeStyle = `rgba(236, 240, 241, ${alpha * 0.85})`;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range * 0.85, this.angle - Math.PI / 3, this.angle + Math.PI / 3);
    ctx.stroke();
    
    // inner white thin arc
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range * 0.85, this.angle - Math.PI / 3, this.angle + Math.PI / 3);
    ctx.stroke();
    
    ctx.restore();
  }
}

// Display Level Up notifications and match rewards
export class LevelText {
  constructor(x, y, text, color = '#f1c40f') {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.vy = -60;
    this.maxLife = 1.2;
    this.life = 1.2;
  }

  update(dt) {
    this.y += this.vy * dt;
    this.vy *= Math.pow(0.92, dt * 60);
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 24px 'Fredoka', sans-serif";
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    
    // Draw stroke then fill
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export class ScreenShake {
  constructor() {
    this.intensity = 0;
    this.decay = 0.85;
  }

  shake(amount) {
    this.intensity = Math.min(this.intensity + amount, 15);
  }

  update(dt) {
    if (this.intensity > 0.1) {
      this.intensity *= Math.pow(this.decay, dt * 60);
    } else {
      this.intensity = 0;
    }
  }

  apply(ctx) {
    if (this.intensity > 0.3) {
      const dx = (Math.random() - 0.5) * this.intensity;
      const dy = (Math.random() - 0.5) * this.intensity;
      ctx.translate(dx, dy);
    }
  }
}

export class EffectManager {
  constructor() {
    this.particles = [];
    this.screenShake = new ScreenShake();
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    this.screenShake.update(dt);
  }

  draw(ctx) {
    for (const p of this.particles) {
      p.draw(ctx);
    }
  }

  clear() {
    this.particles = [];
  }

  spawnPlacementSparks(x, y, cellSize = 40) {
    // Spawn dust cloud puff around the tower block boundaries
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const vx = Math.cos(angle) * 35;
      const vy = Math.sin(angle) * 35;
      const size = 6 + Math.random() * 6;
      this.particles.push(new DustCloudParticle(x, y, vx, vy, size));
    }
  }

  spawnImpact(x, y, color, count = 4, speedScale = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (30 + Math.random() * 50) * speedScale;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 4 + Math.random() * 4;
      this.particles.push(new CartoonFlame(x, y, vx, vy, size));
    }
  }

  spawnMusicNote(x, y) {
    const noteSymbols = ['🎵', '🎶', '♩', '♪'];
    const symbol = noteSymbols[Math.floor(Math.random() * noteSymbols.length)];
    const vx = (Math.random() - 0.5) * 30;
    const vy = -40 - Math.random() * 30;
    this.particles.push(new MusicNoteParticle(x, y, vx, vy, symbol));
  }

  spawnMuzzleFlash(x, y, angle, size = 12) {
    this.particles.push(new MuzzleFlashStar(x, y, angle, size));
  }

  spawnExplosion(x, y, radius) {
    this.screenShake.shake(5);

    // Cartoon fiery spikes
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = radius * 1.8 * (0.8 + Math.random() * 0.3);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 6 + Math.random() * 6;
      const color = Math.random() < 0.6 ? '#f39c12' : '#e74c3c';
      this.particles.push(new ExplosionSpike(x, y, vx, vy, size, color));
    }

    // Centered dust ring
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * radius * 0.8;
      const vy = Math.sin(angle) * radius * 0.8;
      this.particles.push(new DustCloudParticle(x, y, vx, vy, 10));
    }
  }

  spawnSwingArc(x, y, angle, range) {
    this.particles.push(new SwingArcParticle(x, y, angle, range));
  }

  spawnText(x, y, text, color = '#f1c40f') {
    this.particles.push(new LevelText(x, y, text, color));
  }
}
