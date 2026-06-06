import { GameLoop } from "../../engine/GameLoop";
import { AudioSynth } from "../../utils/AudioSynth";

/* ── Types ──────────────────────────────────────────────────────── */

interface Bug {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hp: number;
  maxHp: number;
  type: 'normal' | 'fast' | 'tank';
  color: string;
  glowColor: string;
  wingPhase: number;
  alive: boolean;
  deathTimer: number;     // > 0 while exploding
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  size: number;
}

interface FloatText {
  text: string;
  x: number; y: number;
  life: number;
  color: string;
  size: number;
}

/* ── Constants ──────────────────────────────────────────────────── */

const BUG_TYPES = {
  normal: { hp: 1, speed: 1.5, size: 28, color: '#39ff14', glow: '#39ff14', points: 10 },
  fast:   { hp: 1, speed: 3.5, size: 22, color: '#00f0ff', glow: '#00f0ff', points: 25 },
  tank:   { hp: 3, speed: 1.0, size: 38, color: '#ff007f', glow: '#ff007f', points: 50 },
};

const ROUND_DURATION = 30; // seconds
const INITIAL_SPAWN_INTERVAL = 1200; // ms
const MIN_SPAWN_INTERVAL = 400;

/* ── Game ────────────────────────────────────────────────────────── */

export class FlyShooterGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;

  public score = 0;
  public bestScore = 0;
  public combo = 0;
  public maxCombo = 0;
  public timeLeft = ROUND_DURATION;
  public isGameOver = false;
  public wave = 1;

  public onScore?: (score: number) => void;
  public onCombo?: (combo: number) => void;
  public onTime?: (time: number) => void;
  public onWave?: (wave: number) => void;
  public onGameOver?: (score: number, best: number) => void;

  public audio = new AudioSynth();

  private bugs: Bug[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatText[] = [];
  private spawnTimer = 0;
  private spawnInterval = INITIAL_SPAWN_INTERVAL;
  private time = 0;
  private gameTime = 0;

  // Crosshair
  private mouseX = 0;
  private mouseY = 0;
  private clickFlash = 0;

  // Screen effects
  private shakeTime = 0;
  private shakeMag = 0;
  private screenFlash = 0;

  // Kills counter for wave
  private killsThisWave = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not found");
    this.ctx = ctx;

    this.bestScore = parseInt(localStorage.getItem('flyShooterBest') || '0');

    this.loop = new GameLoop(
      this.update.bind(this),
      this.draw.bind(this)
    );

    this.attachEvents();
  }

  /* ── Events ─────────────────────────────────────────────────── */

  private attachEvents() {
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('touchstart', this.onTouch, { passive: false });
    // Hide default cursor
    this.canvas.style.cursor = 'none';
  }

  public destroy() {
    this.loop.stop();
    this.audio.destroy();
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('touchstart', this.onTouch);
    this.canvas.style.cursor = 'default';
  }

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
  };

  private onClick = (e: MouseEvent) => {
    if (this.isGameOver) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    this.shoot(x, y);
  };

  private onTouch = (e: TouchEvent) => {
    e.preventDefault();
    if (this.isGameOver) return;
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const x = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
    this.mouseX = x;
    this.mouseY = y;
    this.shoot(x, y);
  };

  /* ── Lifecycle ──────────────────────────────────────────────── */

  public start() {
    this.audio.unlock();
    this.reset();
    this.loop.start();
  }

  private reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.timeLeft = ROUND_DURATION;
    this.isGameOver = false;
    this.wave = 1;
    this.bugs = [];
    this.particles = [];
    this.floatingTexts = [];
    this.spawnTimer = 0;
    this.spawnInterval = INITIAL_SPAWN_INTERVAL;
    this.gameTime = 0;
    this.shakeTime = 0;
    this.screenFlash = 0;
    this.clickFlash = 0;
    this.killsThisWave = 0;

    if (this.onScore) this.onScore(0);
    if (this.onCombo) this.onCombo(0);
    if (this.onTime) this.onTime(ROUND_DURATION);
    if (this.onWave) this.onWave(1);

    // Spawn initial bugs
    for (let i = 0; i < 3; i++) this.spawnBug();
  }

  /* ── Shoot ──────────────────────────────────────────────────── */

  private shoot(x: number, y: number) {
    this.clickFlash = 1.0;
    this.audio.playEat(); // reuse eat sound as "pew"

    // Spawn crosshair particles
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5,
        color: '#ff3333',
        size: 2
      });
    }

    // Check hits (closest first)
    let hit = false;
    let closestDist = Infinity;
    let closestBug: Bug | null = null;

    for (const bug of this.bugs) {
      if (!bug.alive) continue;
      const dx = x - bug.x;
      const dy = y - bug.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bug.size * 1.2 && dist < closestDist) {
        closestDist = dist;
        closestBug = bug;
      }
    }

    if (closestBug) {
      hit = true;
      closestBug.hp--;
      
      if (closestBug.hp <= 0) {
        this.killBug(closestBug, x, y);
      } else {
        // Hit but not dead (tank)
        this.triggerShake(3, 80);
        this.spawnFloatingText('HIT', x, y - 20, closestBug.glowColor, 18);
        // Damage particles
        for (let i = 0; i < 6; i++) {
          const angle = Math.random() * Math.PI * 2;
          this.particles.push({
            x: closestBug.x, y: closestBug.y,
            vx: Math.cos(angle) * 5,
            vy: Math.sin(angle) * 5,
            life: 0.4,
            color: closestBug.color,
            size: 3
          });
        }
      }
    }

    if (!hit) {
      // Miss → reset combo
      if (this.combo > 0) {
        this.spawnFloatingText('MISS', x, y - 20, '#666', 16);
      }
      this.combo = 0;
      if (this.onCombo) this.onCombo(0);
    }
  }

  private killBug(bug: Bug, x: number, y: number) {
    bug.alive = false;
    bug.deathTimer = 0.5;
    this.killsThisWave++;

    // Combo
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.onCombo) this.onCombo(this.combo);

    // Points
    const typeInfo = BUG_TYPES[bug.type];
    const comboMultiplier = Math.min(this.combo, 5); // Max 5x
    const points = typeInfo.points * comboMultiplier;
    this.score += points;
    if (this.onScore) this.onScore(this.score);

    // VFX
    this.audio.playCrash();
    this.triggerShake(5, 120);

    const label = comboMultiplier > 1 ? `+${points} x${comboMultiplier}` : `+${points}`;
    this.spawnFloatingText(label, x, y - 30, bug.glowColor, comboMultiplier > 1 ? 26 : 22);

    // Explosion particles
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 3;
      this.particles.push({
        x: bug.x, y: bug.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: bug.color,
        size: Math.random() * 5 + 2
      });
    }

    // Combo milestone
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) {
      this.audio.playMilestone();
      this.screenFlash = 0.3;
      this.triggerShake(10, 300);
      this.spawnFloatingText(
        this.combo >= 20 ? 'GODLIKE!' : this.combo >= 10 ? 'UNSTOPPABLE!' : 'COMBO x5!',
        this.canvas.width / 2, this.canvas.height / 2,
        '#fff01f', 40
      );
    }
  }

  /* ── Spawning ───────────────────────────────────────────────── */

  private spawnBug() {
    const roll = Math.random();
    let type: 'normal' | 'fast' | 'tank';
    if (this.wave >= 3 && roll < 0.15) type = 'tank';
    else if (this.wave >= 2 && roll < 0.4) type = 'fast';
    else type = 'normal';

    const info = BUG_TYPES[type];
    const margin = 60;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Spawn from edges
    let x: number, y: number;
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: x = Math.random() * w; y = -margin; break;         // top
      case 1: x = Math.random() * w; y = h + margin; break;      // bottom
      case 2: x = -margin; y = Math.random() * h; break;         // left
      default: x = w + margin; y = Math.random() * h; break;     // right
    }

    // Aim towards center area (with randomness)
    const targetX = w * (0.2 + Math.random() * 0.6);
    const targetY = h * (0.2 + Math.random() * 0.6);
    const angle = Math.atan2(targetY - y, targetX - x);
    const speedMultiplier = 1 + (this.wave - 1) * 0.2;

    this.bugs.push({
      x, y,
      vx: Math.cos(angle) * info.speed * speedMultiplier,
      vy: Math.sin(angle) * info.speed * speedMultiplier,
      size: info.size,
      hp: info.hp,
      maxHp: info.hp,
      type,
      color: info.color,
      glowColor: info.glow,
      wingPhase: Math.random() * Math.PI * 2,
      alive: true,
      deathTimer: 0
    });
  }

  /* ── Update ─────────────────────────────────────────────────── */

  private update(dt: number) {
    this.time += dt;
    const dtSec = dt / 1000;

    // Screen effects
    if (this.screenFlash > 0) {
      this.screenFlash -= dtSec * 3;
      if (this.screenFlash < 0) this.screenFlash = 0;
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime < 0) this.shakeTime = 0;
    }
    if (this.clickFlash > 0) {
      this.clickFlash -= dtSec * 8;
      if (this.clickFlash < 0) this.clickFlash = 0;
    }

    if (this.isGameOver) {
      // Still update particles after game over
      this.updateParticles(dt);
      this.updateFloatingTexts(dt);
      return;
    }

    // Timer
    this.gameTime += dtSec;
    this.timeLeft = Math.max(0, ROUND_DURATION - this.gameTime);
    if (this.onTime) this.onTime(this.timeLeft);

    // Wave check (every 10 seconds)
    const newWave = Math.floor(this.gameTime / 10) + 1;
    if (newWave > this.wave) {
      this.wave = newWave;
      this.spawnInterval = Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - (this.wave - 1) * 200);
      if (this.onWave) this.onWave(this.wave);
      this.audio.playMilestone();
      this.spawnFloatingText(`WAVE ${this.wave}`, this.canvas.width / 2, this.canvas.height * 0.3, '#fff01f', 36);
      this.screenFlash = 0.2;
    }

    // Time's up
    if (this.timeLeft <= 0) {
      this.triggerGameOver();
      return;
    }

    // Spawn bugs
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnBug();
      // Spawn extra bugs in later waves
      if (this.wave >= 2 && Math.random() < 0.3) this.spawnBug();
      if (this.wave >= 3 && Math.random() < 0.2) this.spawnBug();
    }

    // Update bugs
    for (const bug of this.bugs) {
      if (bug.alive) {
        bug.x += bug.vx;
        bug.y += bug.vy;
        bug.wingPhase += dt * 0.03;

        // Random direction changes
        if (Math.random() < 0.02) {
          bug.vx += (Math.random() - 0.5) * 2;
          bug.vy += (Math.random() - 0.5) * 2;
        }

        // Bounce off walls (with some padding for HUD)
        const pad = 50;
        if (bug.x < pad) { bug.x = pad; bug.vx = Math.abs(bug.vx); }
        if (bug.x > this.canvas.width - pad) { bug.x = this.canvas.width - pad; bug.vx = -Math.abs(bug.vx); }
        if (bug.y < pad + 60) { bug.y = pad + 60; bug.vy = Math.abs(bug.vy); } // Extra top padding for HUD
        if (bug.y > this.canvas.height - pad) { bug.y = this.canvas.height - pad; bug.vy = -Math.abs(bug.vy); }

        // Clamp speed
        const speed = Math.sqrt(bug.vx * bug.vx + bug.vy * bug.vy);
        const maxSpeed = BUG_TYPES[bug.type].speed * (1 + (this.wave - 1) * 0.2) * 1.5;
        if (speed > maxSpeed) {
          bug.vx = (bug.vx / speed) * maxSpeed;
          bug.vy = (bug.vy / speed) * maxSpeed;
        }
      } else {
        bug.deathTimer -= dtSec;
      }
    }

    // Remove dead bugs after death animation
    this.bugs = this.bugs.filter(b => b.alive || b.deathTimer > 0);

    // Update VFX
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt * 0.002;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= dt * 0.04;
      ft.life -= dt * 0.0015;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private triggerGameOver() {
    this.isGameOver = true;
    this.audio.playCrash();
    this.screenFlash = 0.8;
    this.triggerShake(15, 500);

    const best = parseInt(localStorage.getItem('flyShooterBest') || '0');
    if (this.score > best) {
      localStorage.setItem('flyShooterBest', this.score.toString());
    }
    this.bestScore = Math.max(best, this.score);

    if (this.onGameOver) {
      this.onGameOver(this.score, this.bestScore);
    }
  }

  private triggerShake(mag: number, dur: number) {
    this.shakeMag = mag;
    this.shakeTime = dur;
  }

  private spawnFloatingText(text: string, x: number, y: number, color: string, size = 22) {
    this.floatingTexts.push({ text, x, y, life: 1.0, color, size });
  }

  /* ── Draw ───────────────────────────────────────────────────── */

  private draw() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    c.clearRect(0, 0, w, h);

    c.save();
    if (this.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMag;
      const sy = (Math.random() - 0.5) * this.shakeMag;
      c.translate(sx, sy);
    }

    // Background grid
    this.drawGrid(c, w, h);

    // Draw bugs
    for (const bug of this.bugs) {
      if (bug.alive) {
        this.drawBug(c, bug);
      } else if (bug.deathTimer > 0) {
        this.drawBugDeath(c, bug);
      }
    }

    // Draw particles
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      c.fillStyle = p.color;
      c.globalAlpha = p.life;
      c.shadowColor = p.color;
      c.shadowBlur = 8;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.restore();

    // Draw floating texts
    c.save();
    c.textAlign = 'center';
    for (const ft of this.floatingTexts) {
      c.font = `bold ${ft.size}px "Orbitron", sans-serif`;
      c.fillStyle = ft.color;
      c.globalAlpha = ft.life;
      c.shadowColor = ft.color;
      c.shadowBlur = 15;
      c.fillText(ft.text, ft.x, ft.y);
    }
    c.restore();

    // Draw crosshair
    this.drawCrosshair(c);

    // Screen flash
    if (this.screenFlash > 0) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = `rgba(255, 255, 255, ${this.screenFlash * 0.4})`;
      c.fillRect(0, 0, w, h);
      c.restore();
    }

    c.restore();
  }

  private drawGrid(c: CanvasRenderingContext2D, w: number, h: number) {
    c.save();
    c.strokeStyle = 'rgba(255, 50, 50, 0.04)';
    c.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x <= w; x += gridSize) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y <= h; y += gridSize) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.restore();
  }

  private drawBug(c: CanvasRenderingContext2D, bug: Bug) {
    c.save();
    c.translate(bug.x, bug.y);

    // Direction angle
    const angle = Math.atan2(bug.vy, bug.vx);
    c.rotate(angle);

    // Glow
    c.shadowColor = bug.glowColor;
    c.shadowBlur = 20;

    // Body (hexagonal shape)
    c.fillStyle = bug.color;
    c.beginPath();
    const s = bug.size * 0.5;
    c.moveTo(s, 0);
    c.lineTo(s * 0.5, s * 0.7);
    c.lineTo(-s * 0.5, s * 0.7);
    c.lineTo(-s, 0);
    c.lineTo(-s * 0.5, -s * 0.7);
    c.lineTo(s * 0.5, -s * 0.7);
    c.closePath();
    c.fill();

    // Inner core
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.arc(0, 0, s * 0.35, 0, Math.PI * 2);
    c.fill();

    // Eye (glowing dot)
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 10;
    c.beginPath();
    c.arc(s * 0.2, 0, s * 0.15, 0, Math.PI * 2);
    c.fill();

    // Wings (animated)
    c.shadowBlur = 5;
    c.strokeStyle = bug.glowColor;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.5 + Math.sin(bug.wingPhase) * 0.3;

    // Top wing
    c.beginPath();
    const wingSpread = Math.sin(bug.wingPhase) * s * 0.6;
    c.moveTo(-s * 0.2, -s * 0.3);
    c.quadraticCurveTo(0, -s - wingSpread, s * 0.3, -s * 0.2);
    c.stroke();

    // Bottom wing
    c.beginPath();
    c.moveTo(-s * 0.2, s * 0.3);
    c.quadraticCurveTo(0, s + wingSpread, s * 0.3, s * 0.2);
    c.stroke();

    c.globalAlpha = 1;

    // Health bar for tanks
    if (bug.type === 'tank' && bug.hp < bug.maxHp) {
      c.rotate(-angle); // Unrotate for horizontal bar
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect(-15, -bug.size - 8, 30, 5);
      c.fillStyle = bug.color;
      c.fillRect(-15, -bug.size - 8, 30 * (bug.hp / bug.maxHp), 5);
    }

    c.restore();
  }

  private drawBugDeath(c: CanvasRenderingContext2D, bug: Bug) {
    c.save();
    c.translate(bug.x, bug.y);
    c.globalAlpha = bug.deathTimer * 2;

    // Expanding ring
    const ringSize = bug.size * (1 + (0.5 - bug.deathTimer) * 4);
    c.strokeStyle = bug.glowColor;
    c.lineWidth = 2;
    c.shadowColor = bug.glowColor;
    c.shadowBlur = 15;
    c.beginPath();
    c.arc(0, 0, ringSize, 0, Math.PI * 2);
    c.stroke();

    c.restore();
  }

  private drawCrosshair(c: CanvasRenderingContext2D) {
    c.save();
    c.translate(this.mouseX, this.mouseY);

    const size = 18;
    const flashScale = 1 + this.clickFlash * 0.5;
    c.scale(flashScale, flashScale);

    // Outer ring
    c.strokeStyle = `rgba(255, 50, 50, ${0.6 + this.clickFlash * 0.4})`;
    c.lineWidth = 2;
    c.shadowColor = '#ff3333';
    c.shadowBlur = this.clickFlash > 0 ? 20 : 10;
    c.beginPath();
    c.arc(0, 0, size, 0, Math.PI * 2);
    c.stroke();

    // Cross lines
    const gap = 6;
    c.beginPath();
    c.moveTo(0, -size - 5); c.lineTo(0, -gap);
    c.moveTo(0, gap); c.lineTo(0, size + 5);
    c.moveTo(-size - 5, 0); c.lineTo(-gap, 0);
    c.moveTo(gap, 0); c.lineTo(size + 5, 0);
    c.stroke();

    // Center dot
    c.fillStyle = '#ff3333';
    c.beginPath();
    c.arc(0, 0, 2, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }
}
