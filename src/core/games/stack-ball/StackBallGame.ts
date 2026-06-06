import { GameLoop } from "../../engine/GameLoop";

/* ── Types ──────────────────────────────────────────────────────── */

interface Shard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  color: string;
  darkColor: string;
  points: { x: number; y: number }[]; // 2D polygon shape of the shard
  life: number;
}

interface PlatformSegment {
  type: 'safe' | 'hazard';
  startAngle: number;
  endAngle: number;
}

interface Platform {
  y: number; // World Y position
  rotationAngle: number;
  segments: PlatformSegment[];
  shattered: boolean;
}

export type BallSkin = 'neon' | 'magma' | 'matrix' | 'saturn' | 'disco' | 'plasma';

interface VisualParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  decay: number;
  type: 'ember' | 'spark' | 'smoke' | 'flash' | 'shockwave';
  maxSize?: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
  scale: number;
}

/* ── Module-level Audio Singleton ─────────────────────────────── */
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioCtx = new AC();
  }
  return sharedAudioCtx;
}

class StackBallAudio {
  private buffers: Record<string, AudioBuffer | null> = {};
  private initialised = false;

  public unlock() {
    if (this.initialised) return;
    this.initialised = true;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Pre-render sound effects
    this.buffers.bounce = this.renderBuffer(ctx, 0.12, (t) => {
      const env = Math.max(0, 1 - t / 0.12);
      const freq = 300 - t * 400; // descending slide
      return Math.sin(2 * Math.PI * freq * t) * env * 0.15;
    });

    this.buffers.shatter = this.renderBuffer(ctx, 0.25, (t) => {
      const env = Math.max(0, 1 - t / 0.25);
      const freq = 600 + Math.random() * 200;
      const noise = Math.random() * 2 - 1;
      const wave = Math.sin(2 * Math.PI * freq * t);
      return (wave * 0.5 + noise * 0.5) * env * 0.18;
    });

    this.buffers.feverShatter = this.renderBuffer(ctx, 0.35, (t) => {
      const env = Math.max(0, 1 - t / 0.35);
      const freq = 120 + Math.random() * 80;
      const noise = Math.random() * 2 - 1;
      const wave = Math.sin(2 * Math.PI * freq * t);
      return (wave * 0.3 + noise * 0.7) * env * 0.30;
    });

    this.buffers.crash = this.renderBuffer(ctx, 0.60, (t) => {
      const env = Math.max(0, 1 - t / 0.60);
      const freq = 150 * Math.pow(0.01, t / 0.60);
      const noise = Math.random() * 2 - 1;
      const phase = freq * t;
      const tri = (phase % 1) < 0.5 ? 4 * (phase % 1) - 1 : 3 - 4 * (phase % 1);
      return (tri * 0.4 + noise * 0.6) * env * 0.32;
    });

    this.buffers.levelUp = this.renderBuffer(ctx, 0.50, (t) => {
      const env = Math.max(0, 1 - t / 0.50);
      let freq = 523.25; // C5
      if (t > 0.15) freq = 659.25; // E5
      if (t > 0.30) freq = 783.99; // G5
      if (t > 0.40) freq = 1046.50; // C6
      return Math.sin(2 * Math.PI * freq * t) * env * 0.22;
    });
  }

  private renderBuffer(ctx: AudioContext, dur: number, gen: (t: number) => number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = gen(i / sr);
    }
    return buf;
  }

  public play(name: string) {
    const buf = this.buffers[name];
    if (!buf) return;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }

  public destroy() {
    this.buffers = {};
    this.initialised = false;
  }
}

/* ── Color Palettes ─────────────────────────────────────────────── */

interface Palette {
  safe: string;
  safeDark: string;
  bgGrad1: string;
  bgGrad2: string;
}

const PALETTES: Palette[] = [
  { safe: '#ff007f', safeDark: '#99004c', bgGrad1: '#0a0314', bgGrad2: '#1c082e' }, // Pink / Deep Purple
  { safe: '#39ff14', safeDark: '#1d800a', bgGrad1: '#020d04', bgGrad2: '#08280f' }, // Green / Jungle
  { safe: '#00f0ff', safeDark: '#009099', bgGrad1: '#010f17', bgGrad2: '#03263a' }, // Cyan / Deep Ocean
  { safe: '#ffaa00', safeDark: '#a36d00', bgGrad1: '#0f0701', bgGrad2: '#281504' }, // Orange / Fire
  { safe: '#bd00ff', safeDark: '#710099', bgGrad1: '#07010f', bgGrad2: '#1a042e' }, // Purple / Violet
];

/* ── Stack Ball Game Engine ─────────────────────────────────────── */

export class StackBallGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  private audio = new StackBallAudio();

  // Metrics
  public score = 0;
  public bestScore = 0;
  public level = 1;
  public isGameOver = false;
  public isCompleted = false;
  public feverMeter = 0; // 0 to 100
  public isFeverMode = false;
  public totalPlatforms = 42; // Height of the level
  public currentPlatformIndex = 41; // Starts at top (index = totalPlatforms - 1)
  public activeSkin: BallSkin = 'neon';

  // Callbacks
  public onScore?: (score: number) => void;
  public onBestScore?: (bestScore: number) => void;
  public onLevel?: (level: number) => void;
  public onFever?: (fever: number) => void;
  public onProgress?: (progress: number) => void; // 0 to 1
  public onGameOver?: (score: number, bestScore: number) => void;
  public onLevelComplete?: () => void;

  // Game Physics State
  private ballY = 0; // World Y position
  private ballVY = 0; // Vertical velocity
  private ballRadius = 16;
  private isPressing = false; // Player is clicking/holding
  private targetCameraY = 0;
  private cameraY = 0;

  // Visual Properties
  private towerAngle = 0;
  private rotationSpeed = 0.00085; // Radians per ms (slower for chill play)
  private platforms: Platform[] = [];
  private shards: Shard[] = [];
  private particles: VisualParticle[] = [];
  private floatingTexts: FloatingText[] = [];
  private comboStreak = 0;
  private bounceStrength = 0.38; // Upward velocity on bounce
  private gravity = 0.00095; // Gravity per ms^2
  private smashSpeed = 0.95; // Downward smash speed
  private platformSpacing = 74;

  // Fever states
  private feverTimer = 0; // Fever duration remaining
  private feverBuildRate = 1.8; // How fast fever builds per smash
  private feverDecayRate = 0.008; // How fast fever decays when not smashing

  // Screen shake
  private shakeTime = 0;
  private shakeMag = 0;
  private gameTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas 2D context not found");
    this.ctx = ctx;

    this.bestScore = parseInt(localStorage.getItem('stackBallBest') || '0');

    this.loop = new GameLoop(
      this.update.bind(this),
      this.draw.bind(this)
    );

    this.setupLevel();
  }

  /* ── Level Generation ───────────────────────────────────────── */

  private setupLevel() {
    this.platforms = [];
    this.shards = [];
    this.particles = [];
    this.floatingTexts = [];
    this.comboStreak = 0;
    this.isGameOver = false;
    this.isCompleted = false;
    this.isFeverMode = false;
    this.feverMeter = 0;
    this.feverTimer = 0;

    // Platform spacing along Y axis
    this.totalPlatforms = 35 + this.level * 4; // levels get taller
    this.currentPlatformIndex = this.totalPlatforms - 1;

    // Ball starts bouncing above the top platform
    const topPlatformY = (this.totalPlatforms - 1) * this.platformSpacing;
    this.ballY = topPlatformY + 10;
    this.ballVY = this.bounceStrength;
    this.targetCameraY = topPlatformY + 60;
    this.cameraY = this.targetCameraY;

    // Choose palette for the current level
    const palette = PALETTES[(this.level - 1) % PALETTES.length];

    // Generate platforms from bottom (index 0) to top (index total - 1)
    for (let i = 0; i < this.totalPlatforms; i++) {
      const y = i * this.platformSpacing;
      
      // Customize segment layout based on height
      const segments: PlatformSegment[] = [];
      const numSegments = 12;
      const step = (Math.PI * 2) / numSegments;

      // Golden Base at the bottom (index 0)
      if (i === 0) {
        for (let j = 0; j < numSegments; j++) {
          segments.push({
            type: 'safe',
            startAngle: j * step,
            endAngle: (j + 1) * step
          });
        }
      } else {
        // Normal platforms: single contiguous hazard block
        // Hazard size starts at 1 segment at Level 1, up to 2 at Level 10
        const hazardSize = Math.max(1, Math.min(2, 1 + Math.floor(this.level / 10))); 
        // Choose a random start index for the hazard block (leave starting index 0 safe)
        const startHazardIdx = 2 + Math.floor(Math.random() * (numSegments - hazardSize - 2));

        for (let j = 0; j < numSegments; j++) {
          const isHazard = j >= startHazardIdx && j < startHazardIdx + hazardSize;
          segments.push({
            type: isHazard ? 'hazard' : 'safe',
            startAngle: j * step,
            endAngle: (j + 1) * step
          });
        }
      }

      this.platforms.push({
        y,
        rotationAngle: Math.random() * Math.PI * 2, // randomized start rotation
        segments,
        shattered: false
      });
    }

    if (this.onLevel) this.onLevel(this.level);
    if (this.onFever) this.onFever(0);
    if (this.onProgress) this.onProgress(0);
    if (this.onScore) this.onScore(this.score);
    if (this.onBestScore) this.onBestScore(this.bestScore);
  }

  /* ── User Inputs ────────────────────────────────────────────── */

  public start() {
    this.audio.unlock();
    this.loop.start();
  }

  public setPressing(pressed: boolean) {
    if (this.isGameOver || this.isCompleted) return;
    this.isPressing = pressed;
    this.audio.unlock(); // Ensure unlocked
  }

  public restart() {
    this.score = 0;
    this.level = 1;
    this.setupLevel();
  }

  public nextLevel() {
    this.level++;
    this.setupLevel();
  }

  public destroy() {
    this.loop.stop();
    this.audio.destroy();
  }

  /* ── Game Update Loop ───────────────────────────────────────── */

  private update(dt: number) {
    this.gameTime += dt;

    // Manage screen shake duration
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime < 0) this.shakeTime = 0;
    }

    // Process flying shards
    this.updateShards(dt);

    // Process visual particles
    this.updateParticles(dt);

    // Process floating texts
    this.updateFloatingTexts(dt);

    // Spawn active skin/fever particles
    if (!this.isGameOver && !this.isCompleted) {
      if (this.isFeverMode) {
        // Fever fire trail
        for (let i = 0; i < 2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.02 + Math.random() * 0.05;
          this.particles.push({
            x: (Math.random() - 0.5) * 12,
            y: this.ballY - 4 - Math.random() * 8,
            vx: Math.cos(angle) * speed,
            vy: -0.03 - Math.random() * 0.04,
            color: Math.random() > 0.4 ? '#ff4500' : '#ffaa00',
            size: 4 + Math.random() * 4,
            life: 1.0,
            decay: 0.0025,
            type: 'ember'
          });
        }
      } else if (this.activeSkin === 'magma') {
        // Magma ember rising particles
        if (Math.random() < 0.22) {
          this.particles.push({
            x: (Math.random() - 0.5) * 12,
            y: this.ballY + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 0.02,
            vy: 0.02 + Math.random() * 0.03,
            color: '#ffaa00',
            size: 2 + Math.random() * 2,
            life: 1.0,
            decay: 0.003,
            type: 'ember'
          });
        }
      } else if (this.activeSkin === 'plasma') {
        // Plasma electricity sparks
        if (Math.random() < 0.15) {
          this.particles.push({
            x: (Math.random() - 0.5) * 16,
            y: this.ballY + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 0.04,
            vy: (Math.random() - 0.5) * 0.04,
            color: '#e600ff',
            size: 1.5 + Math.random() * 2,
            life: 1.0,
            decay: 0.006,
            type: 'spark'
          });
        }
      }
    }

    if (this.isGameOver || this.isCompleted) {
      // Gentle camera centering even when dead/finished
      this.cameraY += (this.targetCameraY - this.cameraY) * 0.005 * dt;
      return;
    }

    // Fever Mode timer countdown
    if (this.isFeverMode) {
      this.feverTimer -= dt;
      this.feverMeter = Math.max(0, (this.feverTimer / 5500) * 100);
      if (this.onFever) this.onFever(Math.floor(this.feverMeter));
      
      if (this.feverTimer <= 0) {
        this.isFeverMode = false;
        this.feverMeter = 0;
      }
    } else {
      // Natural decay of Fever meter when NOT pressing/smashing
      if (!this.isPressing && this.feverMeter > 0) {
        this.feverMeter = Math.max(0, this.feverMeter - this.feverDecayRate * dt);
        if (this.onFever) this.onFever(Math.floor(this.feverMeter));
      }
    }

    // Rotate the tower
    const speedMultiplier = 1 + (this.level * 0.02); // scale up much slower
    this.towerAngle += this.rotationSpeed * speedMultiplier * dt;

    // Get current top platform info
    const platformSpacing = this.platformSpacing;
    const currentPlatform = this.platforms[this.currentPlatformIndex];
    const platformY = currentPlatform.y;

    // Ball physics
    if (this.isPressing) {
      // Smash downwards
      this.ballVY = -this.smashSpeed;
      this.ballY += this.ballVY * dt;

      // Smashed through?
      if (this.ballY <= platformY) {
        this.ballY = platformY;
        this.checkCollision(currentPlatform);
      }
    } else {
      // Normal bouncing physics: gravity + bounce
      this.ballVY -= this.gravity * dt;
      this.ballY += this.ballVY * dt;

      // Bounce check when ball hits platform top
      if (this.ballY <= platformY && this.ballVY < 0) {
        this.ballY = platformY;
        this.ballVY = this.bounceStrength;
        this.audio.play('bounce');
        this.comboStreak = 0; // reset combo streak on normal bounce
      }
    }

    // Smooth camera tracking
    // Keep camera centered on the active platform
    if (this.currentPlatformIndex >= 0) {
      const activePlatformY = this.platforms[this.currentPlatformIndex].y;
      this.targetCameraY = activePlatformY + 32;
    }
    this.cameraY += (this.targetCameraY - this.cameraY) * 0.0065 * dt;
  }

  private checkCollision(platform: Platform) {
    // Determine which segment the ball landed on.
    // The ball is physically at the front of the screen.
    // In our projection, the front of the cylinder corresponds to visual angle = Math.PI / 2.
    // We must find the segment matching this angle in the platform's local coordinates.
    const platformLocalAngle = (Math.PI / 2 - this.towerAngle - platform.rotationAngle) % (Math.PI * 2);
    
    // Normalize angle to [0, 2PI]
    let targetAngle = platformLocalAngle;
    if (targetAngle < 0) targetAngle += Math.PI * 2;

    let hitSegment: PlatformSegment | null = null;
    for (const seg of platform.segments) {
      if (targetAngle >= seg.startAngle && targetAngle <= seg.endAngle) {
        hitSegment = seg;
        break;
      }
    }

    if (!hitSegment) {
      // Fallback in case of rounding errors
      hitSegment = platform.segments[0];
    }

    // Collision Resolution
    if (hitSegment.type === 'safe' || this.isFeverMode) {
      // Smash & Shatter Platform!
      platform.shattered = true;
      this.shatterPlatform(platform);
      
      if (this.isFeverMode) {
        this.audio.play('feverShatter');
        this.triggerShake(12, 180);
        this.score += 3;
        this.comboStreak++;
        this.spawnFloatingText(0, platform.y + 12, `FEVER! +3`, '#ff3300', 1.35);
      } else {
        this.audio.play('shatter');
        this.triggerShake(7, 100);
        this.score += 1;
        this.comboStreak++;
        if (this.comboStreak >= 3) {
          this.spawnFloatingText(0, platform.y + 12, `COMBO x${this.comboStreak}`, '#00f0ff', 1.15);
        } else {
          this.spawnFloatingText(0, platform.y + 12, `+1`, '#ffffff', 0.9);
        }
        
        // Build up Fever meter
        this.feverMeter = Math.min(100, this.feverMeter + this.feverBuildRate * 10);
        if (this.onFever) this.onFever(Math.floor(this.feverMeter));

        if (this.feverMeter >= 100) {
          this.isFeverMode = true;
          this.feverTimer = 5500; // 5.5 seconds of super rage fireball
        }
      }

      // Spawn visual impact VFX (shockwave, flash, sparks) at the center of smash
      const palette = PALETTES[(this.level - 1) % PALETTES.length];
      const fxColor = this.isFeverMode ? '#ff4500' : palette.safe;
      this.spawnImpactVFX(0, platform.y, fxColor);

      if (this.onScore) this.onScore(this.score);

      // Level Progress
      const progress = (this.totalPlatforms - 1 - this.currentPlatformIndex) / (this.totalPlatforms - 1);
      if (this.onProgress) this.onProgress(progress);

      // Decrement platform index
      this.currentPlatformIndex--;

      if (this.currentPlatformIndex < 0) {
        // Level complete!
        this.isCompleted = true;
        this.isPressing = false;
        this.audio.play('levelUp');
        this.triggerShake(20, 600);
        
        if (this.score > this.bestScore) {
          this.bestScore = this.score;
          localStorage.setItem('stackBallBest', this.bestScore.toString());
          if (this.onBestScore) this.onBestScore(this.bestScore);
        }

        if (this.onLevelComplete) this.onLevelComplete();
      } else {
        // Pop the ball down slightly to start smashing the next platform
        this.ballY = platform.y - 10;
      }
    } else {
      // Hit a Hazard block (Miếng màu đen) -> CRASH!
      this.isGameOver = true;
      this.isPressing = false;
      this.isFeverMode = false;
      this.audio.play('crash');
      this.triggerShake(22, 500);

      // Spawn ball pieces exploding
      this.shatterBall();

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem('stackBallBest', this.bestScore.toString());
        if (this.onBestScore) this.onBestScore(this.bestScore);
      }

      if (this.onGameOver) this.onGameOver(this.score, this.bestScore);
    }
  }

  private shatterPlatform(platform: Platform) {
    const palette = PALETTES[(this.level - 1) % PALETTES.length];
    const rInner = 52;
    const rOuter = 135;
    const thickness = 20;

    // Spawn flying shards for each segment
    platform.segments.forEach((seg) => {
      const midAngle = (seg.startAngle + seg.endAngle) / 2 + this.towerAngle + platform.rotationAngle;
      
      // Shards fly outwards from the center
      const speed = 0.15 + Math.random() * 0.18;
      const vx = Math.cos(midAngle) * speed;
      const vy = (Math.random() * 0.1) + 0.08; // upward burst
      const vz = Math.sin(midAngle) * speed;

      // Color mapping
      let color = palette.safe;
      let darkColor = palette.safeDark;
      if (seg.type === 'hazard') {
        color = '#1c1c24';
        darkColor = '#0b0b10';
      }

      // Generate polygon points for shard drawing
      const p1 = { x: Math.cos(seg.startAngle) * rInner, y: Math.sin(seg.startAngle) * rInner * 0.28 };
      const p2 = { x: Math.cos(seg.startAngle) * rOuter, y: Math.sin(seg.startAngle) * rOuter * 0.28 };
      const p3 = { x: Math.cos(seg.endAngle) * rOuter, y: Math.sin(seg.endAngle) * rOuter * 0.28 };
      const p4 = { x: Math.cos(seg.endAngle) * rInner, y: Math.sin(seg.endAngle) * rInner * 0.28 };

      this.shards.push({
        x: 0, // platform relative center
        y: platform.y,
        z: 0,
        vx,
        vy,
        vz,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        vRotX: (Math.random() - 0.5) * 0.015,
        vRotY: (Math.random() - 0.5) * 0.015,
        vRotZ: (Math.random() - 0.5) * 0.015,
        color,
        darkColor,
        points: [p1, p2, p3, p4],
        life: 1.0
      });
    });
  }

  private shatterBall() {
    // Generate 12 tiny shards representing the shattered ball
    const palette = PALETTES[(this.level - 1) % PALETTES.length];
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.15;
      this.shards.push({
        x: 0,
        y: this.ballY,
        z: 0,
        vx: Math.cos(angle) * speed,
        vy: 0.12 + Math.random() * 0.12, // burst up
        vz: Math.sin(angle) * speed,
        rotX: Math.random(),
        rotY: Math.random(),
        rotZ: Math.random(),
        vRotX: 0.01,
        vRotY: 0.01,
        vRotZ: 0.01,
        color: '#ffffff',
        darkColor: palette.safe,
        points: [
          { x: -5, y: -5 },
          { x: 5, y: -5 },
          { x: 5, y: 5 },
          { x: -5, y: 5 }
        ],
        life: 1.0
      });
    }
  }

  private updateShards(dt: number) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      // Physics: Position += Velocity * dt
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      // Gravity pulls downwards
      s.vy -= this.gravity * 0.9 * dt;

      // Rotation updates
      s.rotX += s.vRotX * dt;
      s.rotY += s.vRotY * dt;
      s.rotZ += s.vRotZ * dt;

      // Shard decay
      s.life -= 0.0016 * dt;
      if (s.life <= 0) {
        this.shards.splice(i, 1);
      }
    }
  }

  private triggerShake(mag: number, dur: number) {
    this.shakeMag = mag;
    this.shakeTime = dur;
  }

  /* ── Canvas Rendering ───────────────────────────────────────── */

  private draw() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const palette = PALETTES[(this.level - 1) % PALETTES.length];

    // 1. Draw Background Gradient
    const bgGrad = c.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, palette.bgGrad1);
    bgGrad.addColorStop(1, palette.bgGrad2);
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, w, h);

    c.save();

    // Screen shake
    if (this.shakeTime > 0) {
      const dx = (Math.random() - 0.5) * this.shakeMag;
      const dy = (Math.random() - 0.5) * this.shakeMag;
      c.translate(dx, dy);
    }

    const centerX = w / 2;

    // Draw tháp và các đĩa trong không gian giả 3D
    this.drawTower(c, w, h, centerX);

    // Draw flying particles/shards
    this.drawShards(c, w, h, centerX);

    // Draw visual particles
    this.drawParticles(c, w, h, centerX);

    // Draw player ball
    if (!this.isGameOver) {
      this.drawBall(c, w, h, centerX);
    }

    // Draw floating combo texts
    this.drawFloatingTexts(c, w, h, centerX);

    c.restore();
  }

  private drawTower(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const rInner = 52;
    const ballScreenY = h * 0.22;

    // Pass 1: Draw BACK segments of all visible platforms (from bottom to top)
    for (let i = 0; i < this.totalPlatforms; i++) {
      const platform = this.platforms[i];
      if (platform.shattered) continue;

      const screenY = ballScreenY - (platform.y - this.cameraY);
      if (screenY < -150 || screenY > h + 150) continue;

      this.drawPlatform(c, platform, screenY, cx, true); // true = drawBackOnly
    }

    // Pass 2: Draw Central Pole (Thân tháp)
    const poleGrad = c.createLinearGradient(cx - rInner, 0, cx + rInner, 0);
    poleGrad.addColorStop(0, '#0c0d12');
    poleGrad.addColorStop(0.3, '#353a47');
    poleGrad.addColorStop(0.5, '#757f9c'); // metal sheen highlight
    poleGrad.addColorStop(0.8, '#252933');
    poleGrad.addColorStop(1, '#0c0d12');
    c.fillStyle = poleGrad;
    c.fillRect(cx - rInner + 2, 0, rInner * 2 - 4, h);

    // Draw horizontal grid lines on the pole for 3D metallic texture depth
    c.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    c.lineWidth = 1.0;
    for (let y = 0; y < h; y += 40) {
      c.beginPath();
      c.moveTo(cx - rInner + 2, y);
      c.lineTo(cx + rInner - 2, y);
      c.stroke();
    }

    // Pass 3: Draw FRONT segments of all visible platforms (from bottom to top)
    for (let i = 0; i < this.totalPlatforms; i++) {
      const platform = this.platforms[i];
      if (platform.shattered) continue;

      const screenY = ballScreenY - (platform.y - this.cameraY);
      if (screenY < -150 || screenY > h + 150) continue;

      this.drawPlatform(c, platform, screenY, cx, false); // false = drawFrontOnly
    }
  }

  private drawPlatform(c: CanvasRenderingContext2D, platform: Platform, screenY: number, cx: number, drawBackOnly: boolean) {
    const rInner = 52;
    const rOuter = 135;
    const thickness = 20;
    const palette = PALETTES[(this.level - 1) % PALETTES.length];
    const baseAngle = this.towerAngle + platform.rotationAngle;

    const segsWithDepth = platform.segments.map((seg) => {
      const midAngle = (seg.startAngle + seg.endAngle) / 2 + baseAngle;
      const depth = Math.sin(midAngle);
      return { seg, depth };
    });

    // Sort: furthest drawn first (ascending depth)
    segsWithDepth.sort((a, b) => a.depth - b.depth);

    segsWithDepth.forEach(({ seg, depth }) => {
      const isBack = depth < 0;
      if (drawBackOnly && !isBack) return;
      if (!drawBackOnly && isBack) return;

      const ang1 = seg.startAngle + baseAngle;
      const ang2 = seg.endAngle + baseAngle;

      // Fill colors
      let fill = palette.safe;
      let sideFill = palette.safeDark;

      if (seg.type === 'hazard') {
        fill = '#1c1c24';
        sideFill = '#0e0e12';
      }

      // Draw outer wall (side face of 3D disk)
      c.fillStyle = sideFill;
      c.beginPath();
      // Outer arc top
      for (let a = ang1; a <= ang2 + 0.01; a += 0.05) {
        const px = cx + rOuter * Math.cos(a);
        const py = screenY + rOuter * 0.28 * Math.sin(a);
        if (a === ang1) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      // Outer arc bottom
      for (let a = ang2; a >= ang1 - 0.01; a -= 0.05) {
        const px = cx + rOuter * Math.cos(a);
        const py = screenY + thickness + rOuter * 0.28 * Math.sin(a);
        c.lineTo(px, py);
      }
      c.closePath();
      c.fill();

      // Highlight stripe on side walls
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.beginPath();
      c.moveTo(cx + rOuter * Math.cos(ang1), screenY + rOuter * 0.28 * Math.sin(ang1));
      c.lineTo(cx + rOuter * Math.cos(ang2), screenY + rOuter * 0.28 * Math.sin(ang2));
      c.lineTo(cx + rOuter * Math.cos(ang2), screenY + thickness * 0.3 + rOuter * 0.28 * Math.sin(ang2));
      c.lineTo(cx + rOuter * Math.cos(ang1), screenY + thickness * 0.3 + rOuter * 0.28 * Math.sin(ang1));
      c.closePath();
      c.fill();

      // Modern Safe Segments: Cyber Glass style with Neon borders
      if (seg.type === 'safe') {
        const hexToRgb = (hex: string) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `${r}, ${g}, ${b}`;
        };
        const rgb = hexToRgb(palette.safe);
        c.fillStyle = `rgba(${rgb}, 0.55)`; // Translucent cyber-glass
      } else {
        // Hazard segments: charcoal metallic
        c.fillStyle = '#1c1c24';
      }

      // Draw top face of disk segment
      c.beginPath();
      // Inner arc
      for (let a = ang1; a <= ang2 + 0.01; a += 0.05) {
        const px = cx + rInner * Math.cos(a);
        const py = screenY + rInner * 0.28 * Math.sin(a);
        if (a === ang1) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      // Outer arc
      for (let a = ang2; a >= ang1 - 0.01; a -= 0.05) {
        const px = cx + rOuter * Math.cos(a);
        const py = screenY + rOuter * 0.28 * Math.sin(a);
        c.lineTo(px, py);
      }
      c.closePath();
      c.fill();

      // Modern diagonal warning lines on hazard blocks
      if (seg.type === 'hazard') {
        c.save();
        c.clip(); // Clip to top face
        
        c.strokeStyle = '#ff3333';
        c.lineWidth = 4;
        c.globalAlpha = 0.20 + Math.sin(this.gameTime * 0.005) * 0.08; // slow warning pulse
        
        // Draw warning diagonal stripes
        const stepSize = 14;
        for (let xOffset = -rOuter * 2; xOffset < rOuter * 2; xOffset += stepSize) {
          c.beginPath();
          c.moveTo(cx + xOffset - 30, screenY - 50);
          c.lineTo(cx + xOffset + 30, screenY + 50);
          c.stroke();
        }
        c.restore();
      }

      // Glowing Neon outline stroke
      c.strokeStyle = seg.type === 'hazard' ? '#ff2a2a' : palette.safe;
      c.lineWidth = 1.8;
      c.shadowBlur = 5;
      c.shadowColor = c.strokeStyle;
      c.beginPath();
      // Inner arc outline
      for (let a = ang1; a <= ang2 + 0.01; a += 0.05) {
        const px = cx + rInner * Math.cos(a);
        const py = screenY + rInner * 0.28 * Math.sin(a);
        if (a === ang1) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      // Outer arc outline
      for (let a = ang2; a >= ang1 - 0.01; a -= 0.05) {
        const px = cx + rOuter * Math.cos(a);
        const py = screenY + rOuter * 0.28 * Math.sin(a);
        c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
      
      // Reset shadows
      c.shadowBlur = 0;

      // Specular glassy highlight curve on top face
      c.fillStyle = 'rgba(255, 255, 255, 0.09)';
      c.beginPath();
      const specRInner = rInner + (rOuter - rInner) * 0.45;
      const specROuter = rInner + (rOuter - rInner) * 0.85;
      for (let a = ang1; a <= ang2 + 0.01; a += 0.05) {
        const px = cx + specRInner * Math.cos(a);
        const py = screenY + specRInner * 0.28 * Math.sin(a);
        if (a === ang1) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      for (let a = ang2; a >= ang1 - 0.01; a -= 0.05) {
        const px = cx + specROuter * Math.cos(a);
        const py = screenY + specROuter * 0.28 * Math.sin(a);
        c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
    });
  }

  private drawShards(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const ballScreenY = h * 0.22;
    
    this.shards.forEach((s) => {
      const screenY = ballScreenY - (s.y - this.cameraY);
      if (screenY < -50 || screenY > h + 50) return;

      c.save();
      c.translate(cx + s.x, screenY);
      c.rotate(s.rotZ);

      c.fillStyle = s.color;
      c.globalAlpha = s.life;

      // Add a slight neon border to shards to match the rest of the game
      c.strokeStyle = s.color;
      c.lineWidth = 1;
      c.beginPath();
      s.points.forEach((pt, idx) => {
        if (idx === 0) c.moveTo(pt.x, pt.y);
        else c.lineTo(pt.x, pt.y);
      });
      c.closePath();
      c.fill();
      c.stroke();

      c.restore();
    });
    c.globalAlpha = 1.0;
  }

  private drawParticles(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const ballScreenY = h * 0.22;
    
    this.particles.forEach((p) => {
      const screenY = ballScreenY - (p.y - this.cameraY);
      if (screenY < -100 || screenY > h + 100) return;

      c.save();
      c.globalAlpha = p.life;
      
      if (p.type === 'shockwave') {
        c.strokeStyle = p.color;
        const currentSize = p.size + (p.maxSize! - p.size) * (1 - p.life);
        c.lineWidth = 3 * p.life;
        c.shadowBlur = 10;
        c.shadowColor = p.color;
        c.beginPath();
        // Render in pseudo-3D perspective flat angle (ellipse 0.28)
        c.ellipse(cx + p.x, screenY, currentSize, currentSize * 0.28, 0, 0, Math.PI * 2);
        c.stroke();
      } else if (p.type === 'flash') {
        c.fillStyle = p.color;
        const currentSize = p.size + (p.maxSize! - p.size) * (1 - p.life);
        c.shadowBlur = 15;
        c.shadowColor = p.color;
        c.beginPath();
        c.ellipse(cx + p.x, screenY, currentSize, currentSize * 0.28, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        // Sparks or Embers
        c.fillStyle = p.color;
        c.shadowColor = p.color;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(cx + p.x, screenY, p.size * p.life, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    });
  }

  private drawFloatingTexts(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const ballScreenY = h * 0.22;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    
    this.floatingTexts.forEach((t) => {
      const screenY = ballScreenY - (t.y - this.cameraY);
      if (screenY < -50 || screenY > h + 50) return;

      c.font = `900 ${Math.floor(18 * t.scale)}px 'Orbitron', sans-serif`;
      
      // Floating text border/shadow
      c.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      c.lineWidth = 4;
      c.strokeText(t.text, cx + t.x, screenY);
      
      c.fillStyle = t.color;
      c.globalAlpha = t.life;
      c.fillText(t.text, cx + t.x, screenY);
    });
    
    c.restore();
  }

  private drawBall(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const ballScreenY = h * 0.22;
    const sy = ballScreenY - (this.ballY - this.cameraY);

    c.save();

    // 1. Fever/Fireball Trail
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const trailY = sy + (i * 10);
        const trailR = this.ballRadius * (1 - i * 0.12);
        c.fillStyle = `rgba(255, 69, 0, ${0.55 - i * 0.07})`;
        c.beginPath();
        c.arc(cx + (Math.random() - 0.5) * 10, trailY, trailR, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      c.save();
    }

    // Shadow & glow matching fever state
    c.shadowBlur = this.isFeverMode ? 35 : 12;
    c.shadowColor = this.isFeverMode ? '#ff4500' : 'rgba(0, 240, 255, 0.45)';

    // Render active skin
    switch (this.activeSkin) {
      case 'magma':
        this.drawMagmaSkin(c, cx, sy);
        break;
      case 'matrix':
        this.drawMatrixSkin(c, cx, sy);
        break;
      case 'saturn':
        this.drawSaturnSkin(c, cx, sy);
        break;
      case 'disco':
        this.drawDiscoSkin(c, cx, sy);
        break;
      case 'plasma':
        this.drawPlasmaSkin(c, cx, sy);
        break;
      case 'neon':
      default:
        this.drawNeonSkin(c, cx, sy);
        break;
    }

    c.restore();
  }

  private drawNeonSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.3,
      sy - this.ballRadius * 0.3,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    if (this.isFeverMode) {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#ffaa00');
      ballGrad.addColorStop(1, '#ff1100');
    } else {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#00f0ff');
      ballGrad.addColorStop(1, '#005577');
    }
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // specular reflection
    c.fillStyle = 'rgba(255, 255, 255, 0.3)';
    c.beginPath();
    c.ellipse(cx - 4, sy - 5, 5, 3, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
  }

  private drawMagmaSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.2,
      sy - this.ballRadius * 0.2,
      this.ballRadius * 0.05,
      cx,
      sy,
      this.ballRadius
    );
    ballGrad.addColorStop(0, '#ffff88');
    ballGrad.addColorStop(0.35, '#ff5500');
    ballGrad.addColorStop(0.8, '#aa1100');
    ballGrad.addColorStop(1, '#330000');
    
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.beginPath();
    c.ellipse(cx - 3, sy - 4, 4, 2, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
    
    // Draw magma surface cracks
    c.strokeStyle = 'rgba(255, 200, 0, 0.6)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(cx - 8, sy + 2);
    c.lineTo(cx - 2, sy - 2);
    c.lineTo(cx + 4, sy + 3);
    c.moveTo(cx - 3, sy - 6);
    c.lineTo(cx + 2, sy - 1);
    c.lineTo(cx + 8, sy - 4);
    c.stroke();
  }

  private drawMatrixSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();
    c.translate(cx, sy);
    
    const angle = this.gameTime * 0.0016;
    const size = this.ballRadius * 1.15;
    
    // 3D Cube Vertices
    const vertices = [
      { x: -size, y: -size, z: -size },
      { x: size, y: -size, z: -size },
      { x: size, y: size, z: -size },
      { x: -size, y: size, z: -size },
      { x: -size, y: -size, z: size },
      { x: size, y: -size, z: size },
      { x: size, y: size, z: size },
      { x: -size, y: size, z: size },
    ];

    // Orthographic rotations
    const cosY = Math.cos(angle);
    const sinY = Math.sin(angle);
    const cosX = Math.cos(angle * 0.75);
    const sinX = Math.sin(angle * 0.75);

    const projected = vertices.map(v => {
      let x1 = v.x * cosY - v.z * sinY;
      let z1 = v.z * cosY + v.x * sinY;
      let y2 = v.y * cosX - z1 * sinX;
      return { x: x1, y: y2 };
    });

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    c.strokeStyle = '#39ff14'; // matrix neon green
    c.shadowColor = '#39ff14';
    c.shadowBlur = this.isFeverMode ? 35 : 10;
    c.lineWidth = 1.8;

    c.fillStyle = 'rgba(0, 35, 0, 0.4)';
    c.beginPath();
    c.arc(0, 0, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    edges.forEach(edge => {
      c.beginPath();
      c.moveTo(projected[edge[0]].x, projected[edge[0]].y);
      c.lineTo(projected[edge[1]].x, projected[edge[1]].y);
      c.stroke();
    });

    c.restore();
  }

  private drawSaturnSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    const planetGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.3,
      sy - this.ballRadius * 0.3,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    planetGrad.addColorStop(0, '#fff3cc');
    planetGrad.addColorStop(0.4, '#e6b85c');
    planetGrad.addColorStop(0.8, '#b37d1a');
    planetGrad.addColorStop(1, '#4d3300');
    c.fillStyle = planetGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Tilted Saturn Ring
    c.save();
    c.translate(cx, sy);
    c.rotate(Math.PI * 0.12);
    
    c.strokeStyle = 'rgba(230, 184, 92, 0.85)';
    c.lineWidth = 4;
    c.shadowBlur = 8;
    c.shadowColor = '#e6b85c';
    
    c.beginPath();
    c.ellipse(0, 0, this.ballRadius * 1.8, this.ballRadius * 0.4, 0, 0, Math.PI * 2);
    c.stroke();
    
    c.restore();
    
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.beginPath();
    c.ellipse(cx - 3, sy - 4, 4, 2, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
  }

  private drawDiscoSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.4,
      sy - this.ballRadius * 0.4,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.5, '#cccccc');
    ballGrad.addColorStop(1, '#3c3c3c');
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Glitter facets
    c.save();
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.clip();

    const rows = 6;
    const cols = 6;
    const step = (this.ballRadius * 2) / rows;
    
    for (let r = 0; r < rows; r++) {
      const fy = sy - this.ballRadius + r * step;
      for (let col = 0; col < cols; col++) {
        const fx = cx - this.ballRadius + col * step;
        
        const hue = (this.gameTime * 0.35 + r * 30 + col * 20) % 360;
        c.fillStyle = `hsla(${hue}, 80%, 75%, 0.38)`;
        c.fillRect(fx, fy, step - 0.8, step - 0.8);

        c.fillStyle = 'rgba(255, 255, 255, 0.65)';
        c.fillRect(fx + 1.2, fy + 1.2, 1.8, 1.8);
      }
    }
    c.restore();

    // Specular highlight
    c.fillStyle = 'rgba(255, 255, 255, 0.45)';
    c.beginPath();
    c.ellipse(cx - 4, sy - 5, 5, 3, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
  }

  private drawPlasmaSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.2,
      sy - this.ballRadius * 0.2,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.3, '#cc00ff');
    ballGrad.addColorStop(0.8, '#550080');
    ballGrad.addColorStop(1, '#0f001f');
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Plasma lightning discharges
    c.strokeStyle = '#e600ff';
    c.lineWidth = 1.3;
    c.shadowColor = '#e600ff';
    c.shadowBlur = 10;
    
    const numArcs = 4;
    for (let i = 0; i < numArcs; i++) {
      const ang = Math.random() * Math.PI * 2;
      const len = this.ballRadius * (1.1 + Math.random() * 0.38);
      
      c.beginPath();
      c.moveTo(cx, sy);
      const midX = cx + Math.cos(ang) * (len * 0.5) + (Math.random() - 0.5) * 5;
      const midY = sy + Math.sin(ang) * (len * 0.5) + (Math.random() - 0.5) * 5;
      const endX = cx + Math.cos(ang) * len;
      const endY = sy + Math.sin(ang) * len;
      
      c.lineTo(midX, midY);
      c.lineTo(endX, endY);
      c.stroke();
      
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(endX, endY, 2, 0, Math.PI * 2);
      c.fill();
    }
    
    c.shadowBlur = 0;
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      if (p.type === 'spark' || p.type === 'ember') {
        p.vy -= 0.00015 * dt; // gravitational pull
      }
    }
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life -= 0.0018 * dt;
      if (t.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.96; // deceleration
    }
  }

  private spawnImpactVFX(x: number, y: number, color: string) {
    // 1. Shockwave ring
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color,
      size: 15,
      maxSize: 135,
      life: 1.0,
      decay: 0.0035, // fast fade
      type: 'shockwave'
    });

    // 2. White flash impact center
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#ffffff',
      size: 10,
      maxSize: 65,
      life: 1.0,
      decay: 0.006, // instant fade
      type: 'flash'
    });

    // 3. Tiny sparks shooting out
    const numSparks = 20 + Math.floor(Math.random() * 15);
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.12 + Math.random() * 0.28;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: (Math.random() * 0.14) - 0.04, // slight upwards bias
        color,
        size: 2.5 + Math.random() * 3,
        life: 1.0,
        decay: 0.0015 + Math.random() * 0.002,
        type: 'spark'
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, scale = 1.0) {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 16,
      y,
      text,
      color,
      life: 1.0,
      vy: 0.05 + Math.random() * 0.03, // float upwards
      scale
    });
  }
}
