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
  type?: 'neon' | 'magma' | 'matrix' | 'saturn' | 'disco' | 'plasma';
  decayRate?: number;
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
  type: 'ember' | 'spark' | 'smoke' | 'flash' | 'shockwave' | 'binary' | 'star' | 'lava' | 'confetti' | 'lightning' | 'laser';
  maxSize?: number;
  text?: string;
  angle?: number;
  points?: { x: number; y: number }[];
  laserAngle?: number;
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
  private ballHistory: { x: number; y: number }[] = []; // History of ball positions for organic trails
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
    this.ballHistory = [];
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
        // Fever Mode: Supercharged VFX trails per skin
        if (this.activeSkin === 'magma') {
          // Raging firestorm: embers, lava drips, and smoke
          for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.03 + Math.random() * 0.06;
            this.particles.push({
              x: (Math.random() - 0.5) * 14,
              y: this.ballY - 4 - Math.random() * 10,
              vx: Math.cos(angle) * speed,
              vy: -0.04 - Math.random() * 0.05,
              color: Math.random() > 0.45 ? '#ff4c00' : '#ffaa00',
              size: 5 + Math.random() * 4,
              life: 1.0,
              decay: 0.002,
              type: 'ember'
            });
          }
          if (Math.random() < 0.35) {
            this.particles.push({
              x: (Math.random() - 0.5) * 10,
              y: this.ballY - 2,
              vx: (Math.random() - 0.5) * 0.02,
              vy: -0.08 - Math.random() * 0.05,
              color: '#ff2200',
              size: 3 + Math.random() * 2,
              life: 1.0,
              decay: 0.003,
              type: 'lava'
            });
          }
          if (Math.random() < 0.25) {
            this.particles.push({
              x: (Math.random() - 0.5) * 16,
              y: this.ballY + 8,
              vx: (Math.random() - 0.5) * 0.03,
              vy: 0.02 + Math.random() * 0.03,
              color: 'rgba(30, 30, 35, 0.45)',
              size: 6,
              maxSize: 24,
              life: 1.0,
              decay: 0.002,
              type: 'smoke'
            });
          }
        } else if (this.activeSkin === 'matrix') {
          // Hacker digital rain: green binary codes streaming down
          for (let i = 0; i < 2; i++) {
            this.particles.push({
              x: (Math.random() - 0.5) * 36,
              y: this.ballY + 12 - Math.random() * 24,
              vx: (Math.random() - 0.5) * 0.02,
              vy: -0.06 - Math.random() * 0.06,
              color: '#39ff14',
              size: 10 + Math.random() * 4,
              life: 1.0,
              decay: 0.0025,
              type: 'binary',
              text: Math.random() > 0.5 ? '1' : '0'
            });
          }
        } else if (this.activeSkin === 'saturn') {
          // Nebula singularity: golden orbital dust and expanding rings
          for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 16 + Math.random() * 8;
            this.particles.push({
              x: Math.cos(angle) * dist,
              y: this.ballY + Math.sin(angle) * dist * 0.28,
              vx: -Math.sin(angle) * 0.07,
              vy: Math.cos(angle) * 0.07 * 0.28,
              color: '#e6b85c',
              size: 3 + Math.random() * 3,
              life: 1.0,
              decay: 0.003,
              type: 'spark'
            });
          }
          if (Math.random() < 0.12) {
            this.particles.push({
              x: 0,
              y: this.ballY,
              vx: 0,
              vy: 0,
              color: 'rgba(230, 184, 92, 0.6)',
              size: 8,
              maxSize: 55,
              life: 1.0,
              decay: 0.005,
              type: 'shockwave'
            });
          }
        } else if (this.activeSkin === 'disco') {
          // Rainbow party: confetti and flashing glints
          const rainbowColors = ['#ff0055', '#ffaa00', '#39ff14', '#00f0ff', '#bd00ff', '#ffffff'];
          for (let i = 0; i < 2; i++) {
            const col = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];
            this.particles.push({
              x: (Math.random() - 0.5) * 20,
              y: this.ballY - Math.random() * 12,
              vx: (Math.random() - 0.5) * 0.06,
              vy: -0.02 - Math.random() * 0.04,
              color: col,
              size: 5 + Math.random() * 3,
              life: 1.0,
              decay: 0.002,
              type: 'confetti',
              angle: Math.random() * Math.PI * 2
            });
          }
          if (Math.random() < 0.25) {
            this.particles.push({
              x: (Math.random() - 0.5) * 24,
              y: this.ballY + (Math.random() - 0.5) * 24,
              vx: 0,
              vy: 0,
              color: '#ffffff',
              size: 8 + Math.random() * 6,
              life: 1.0,
              decay: 0.005,
              type: 'star'
            });
          }
        } else if (this.activeSkin === 'plasma') {
          // Electromagnetic storm: violet sparks and lightning lines
          for (let i = 0; i < 2; i++) {
            this.particles.push({
              x: (Math.random() - 0.5) * 24,
              y: this.ballY + (Math.random() - 0.5) * 24,
              vx: (Math.random() - 0.5) * 0.08,
              vy: (Math.random() - 0.5) * 0.08,
              color: '#bd00ff',
              size: 2.5 + Math.random() * 2,
              life: 1.0,
              decay: 0.004,
              type: 'spark'
            });
          }
          if (Math.random() < 0.15) {
            // Jagged discharge arc around the ball
            const points = [{ x: 0, y: 0 }];
            const ang = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 16;
            points.push({
              x: Math.cos(ang) * (dist * 0.5) + (Math.random() - 0.5) * 8,
              y: Math.sin(ang) * (dist * 0.5) * 0.28 + (Math.random() - 0.5) * 4
            });
            points.push({
              x: Math.cos(ang) * dist,
              y: Math.sin(ang) * dist * 0.28
            });
            this.particles.push({
              x: 0,
              y: this.ballY,
              vx: 0,
              vy: 0,
              color: '#ffffff',
              size: 1.5,
              life: 1.0,
              decay: 0.012,
              type: 'lightning',
              points
            });
          }
        } else {
          // Default Neon Fever Mode: glowing cyan sparks and ring pulses
          for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.03 + Math.random() * 0.05;
            this.particles.push({
              x: (Math.random() - 0.5) * 14,
              y: this.ballY - 4 - Math.random() * 8,
              vx: Math.cos(angle) * speed,
              vy: -0.03 - Math.random() * 0.04,
              color: '#00f0ff',
              size: 3 + Math.random() * 3,
              life: 1.0,
              decay: 0.003,
              type: 'spark'
            });
          }
        }
      } else {
        // Normal Mode: Idle particle/VFX emitters per skin
        if (this.activeSkin === 'neon') {
          // Ambient cyan sparks
          if (Math.random() < 0.12) {
            this.particles.push({
              x: (Math.random() - 0.5) * 12,
              y: this.ballY + (Math.random() - 0.5) * 8,
              vx: (Math.random() - 0.5) * 0.02,
              vy: -0.01 - Math.random() * 0.01,
              color: '#00f0ff',
              size: 2 + Math.random() * 1.5,
              life: 1.0,
              decay: 0.004,
              type: 'spark'
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
        } else if (this.activeSkin === 'matrix') {
          // Glitching digital bits popping up
          if (Math.random() < 0.18) {
            this.particles.push({
              x: (Math.random() - 0.5) * 20,
              y: this.ballY + (Math.random() - 0.5) * 12,
              vx: 0,
              vy: 0.01 + Math.random() * 0.02,
              color: '#39ff14',
              size: 8 + Math.random() * 3,
              life: 1.0,
              decay: 0.004,
              type: 'binary',
              text: Math.random() > 0.5 ? '1' : '0'
            });
          }
        } else if (this.activeSkin === 'saturn') {
          // Golden stardust orbiting planet
          if (Math.random() < 0.25) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 16 + Math.random() * 4;
            this.particles.push({
              x: Math.cos(angle) * dist,
              y: this.ballY + Math.sin(angle) * dist * 0.28,
              vx: -Math.sin(angle) * 0.03,
              vy: Math.cos(angle) * 0.03 * 0.28,
              color: '#e6b85c',
              size: 1.5 + Math.random() * 2,
              life: 1.0,
              decay: 0.004,
              type: 'spark'
            });
          }
        } else if (this.activeSkin === 'disco') {
          // Facet sparkling glints
          if (Math.random() < 0.20) {
            this.particles.push({
              x: (Math.random() - 0.5) * 16,
              y: this.ballY + (Math.random() - 0.5) * 16,
              vx: 0,
              vy: 0,
              color: '#ffffff',
              size: 4 + Math.random() * 4,
              life: 1.0,
              decay: 0.008,
              type: 'star'
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

    // Track ball history for organic trails
    this.ballHistory.push({ x: 0, y: this.ballY });
    if (this.ballHistory.length > 15) {
      this.ballHistory.shift();
    }
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

      // Color mapping based on active skin
      let color = palette.safe;
      let darkColor = palette.safeDark;
      
      if (seg.type === 'hazard') {
        color = '#1c1c24';
        darkColor = '#0b0b10';
      } else {
        if (this.activeSkin === 'magma') {
          color = '#ff4c00';
          darkColor = '#8c1a00';
        } else if (this.activeSkin === 'matrix') {
          color = '#39ff14';
          darkColor = '#003300';
        } else if (this.activeSkin === 'saturn') {
          color = '#e6b85c';
          darkColor = '#664d1a';
        } else if (this.activeSkin === 'disco') {
          const rainbowColors = ['#ff0055', '#ffaa00', '#39ff14', '#00f0ff', '#bd00ff'];
          color = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];
          darkColor = '#1a1a1a';
        } else if (this.activeSkin === 'plasma') {
          color = '#bd00ff';
          darkColor = '#3c004d';
        }
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
        life: 1.0,
        type: seg.type === 'safe' ? this.activeSkin : 'neon',
        decayRate: seg.type === 'hazard' ? 0.002 : (this.activeSkin === 'matrix' ? 0.003 : (this.activeSkin === 'magma' ? 0.0025 : 0.0016))
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
      const decay = s.decayRate || 0.0016;
      s.life -= decay * dt;

      // Spawn secondary trail particles from the flying shards
      if (s.life > 0.15) {
        if (s.type === 'magma' && Math.random() < 0.06) {
          // Dripping hot lava from the flying magma chunk
          this.particles.push({
            x: s.x,
            y: s.y,
            vx: s.vx * 0.2 + (Math.random() - 0.5) * 0.02,
            vy: s.vy * 0.2 - 0.03 - Math.random() * 0.03,
            color: '#ff4c00',
            size: 3 + Math.random() * 3,
            life: 0.8,
            decay: 0.003,
            type: 'lava'
          });
        } else if (s.type === 'matrix' && Math.random() < 0.08) {
          // Green digital glitch trail
          this.particles.push({
            x: s.x + (Math.random() - 0.5) * 8,
            y: s.y,
            vx: (Math.random() - 0.5) * 0.01,
            vy: -0.02 - Math.random() * 0.03,
            color: '#39ff14',
            size: 8 + Math.random() * 3,
            life: 0.9,
            decay: 0.003,
            type: 'binary',
            text: Math.random() > 0.5 ? '1' : '0'
          });
        } else if (s.type === 'saturn' && Math.random() < 0.08) {
          // Stardust trailing the cosmic shards
          this.particles.push({
            x: s.x,
            y: s.y,
            vx: (Math.random() - 0.5) * 0.02,
            vy: (Math.random() - 0.5) * 0.02,
            color: '#e6b85c',
            size: 1.5 + Math.random() * 2,
            life: 0.8,
            decay: 0.004,
            type: 'spark'
          });
        } else if (s.type === 'disco') {
          // Disco shards cycle color rapidly (flashing strobe effect)
          const rainbowColors = ['#ff0055', '#ffaa00', '#39ff14', '#00f0ff', '#bd00ff'];
          s.color = rainbowColors[Math.floor((this.gameTime + i * 50) / 80) % rainbowColors.length];
          if (Math.random() < 0.05) {
            this.particles.push({
              x: s.x,
              y: s.y,
              vx: s.vx * 0.5,
              vy: s.vy * 0.5,
              color: '#ffffff',
              size: 4 + Math.random() * 3,
              life: 0.7,
              decay: 0.005,
              type: 'star'
            });
          }
        } else if (s.type === 'plasma') {
          // Electro sparks crackle from flying plasma shard
          if (Math.random() < 0.07) {
            this.particles.push({
              x: s.x,
              y: s.y,
              vx: (Math.random() - 0.5) * 0.05,
              vy: (Math.random() - 0.5) * 0.05,
              color: '#bd00ff',
              size: 2 + Math.random() * 2,
              life: 0.8,
              decay: 0.005,
              type: 'spark'
            });
          }
        }
      }

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

      // Fill colors depending on active skin
      let fill = palette.safe;
      let sideFill = palette.safeDark;

      if (seg.type === 'hazard') {
        fill = '#1c1c24';
        sideFill = '#0e0e12';
      } else {
        if (this.activeSkin === 'magma') {
          fill = '#1c0c08'; // Volcanic dark rock
          sideFill = '#0a0503';
        } else if (this.activeSkin === 'matrix') {
          fill = 'rgba(0, 25, 0, 0.45)'; // Cyber transparent green
          sideFill = '#001a00';
        } else if (this.activeSkin === 'saturn') {
          fill = 'rgba(230, 184, 92, 0.42)'; // Golden stardust
          sideFill = '#805d15';
        } else if (this.activeSkin === 'disco') {
          fill = 'rgba(20, 20, 25, 0.45)'; // Dark mirror base
          sideFill = '#111116';
        } else if (this.activeSkin === 'plasma') {
          fill = 'rgba(60, 0, 90, 0.48)'; // Electrified violet
          sideFill = '#220038';
        }
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
        if (this.activeSkin === 'neon') {
          const hexToRgb = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `${r}, ${g}, ${b}`;
          };
          const rgb = hexToRgb(palette.safe);
          c.fillStyle = `rgba(${rgb}, 0.55)`; // Translucent cyber-glass
        } else {
          c.fillStyle = fill;
        }
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

      // Add skin-specific detailed textures and visual effects inside safe segments
      if (seg.type === 'safe') {
        if (this.activeSkin === 'magma') {
          // Shifting volcanic cracks
          c.save();
          c.clip();
          c.strokeStyle = '#ff5500';
          c.lineWidth = 1.6;
          c.shadowBlur = 4;
          c.shadowColor = '#ff5500';
          
          c.beginPath();
          const seed = Math.sin(platform.y) * 80;
          for (let j = 0; j < 4; j++) {
            const crackAngle1 = ang1 + (ang2 - ang1) * ((j + 0.15) / 4);
            const crackAngle2 = ang1 + (ang2 - ang1) * ((j + 0.85) / 4);
            const x1 = cx + (rInner + 5) * Math.cos(crackAngle1);
            const y1 = screenY + (rInner + 5) * 0.28 * Math.sin(crackAngle1);
            const x2 = cx + (rOuter - 10) * Math.cos(crackAngle2);
            const y2 = screenY + (rOuter - 10) * 0.28 * Math.sin(crackAngle2);
            c.moveTo(x1, y1);
            
            const midAng = (crackAngle1 + crackAngle2) / 2;
            const midR = (rInner + rOuter) / 2;
            const mx = cx + midR * Math.cos(midAng) + (Math.sin(seed + j) * 8);
            const my = screenY + midR * 0.28 * Math.sin(midAng) + (Math.cos(seed + j) * 4);
            c.lineTo(mx, my);
            c.lineTo(x2, y2);
          }
          c.stroke();
          c.restore();
        } else if (this.activeSkin === 'matrix') {
          // Green matrix terminal wireframe grid
          c.save();
          c.clip();
          c.strokeStyle = 'rgba(57, 255, 20, 0.25)';
          c.lineWidth = 1.0;
          
          // Concentric lines
          for (let r = rInner + 20; r < rOuter; r += 24) {
            c.beginPath();
            c.ellipse(cx, screenY, r, r * 0.28, 0, ang1, ang2);
            c.stroke();
          }
          // Radial lines
          const gridLines = 4;
          for (let j = 0; j <= gridLines; j++) {
            const a = ang1 + (ang2 - ang1) * (j / gridLines);
            c.beginPath();
            c.moveTo(cx + rInner * Math.cos(a), screenY + rInner * 0.28 * Math.sin(a));
            c.lineTo(cx + rOuter * Math.cos(a), screenY + rOuter * 0.28 * Math.sin(a));
            c.stroke();
          }
          c.restore();
        } else if (this.activeSkin === 'disco') {
          // Blinking neon dance floor tiles
          c.save();
          c.clip();
          const subTiles = 3;
          for (let j = 0; j < subTiles; j++) {
            const ta1 = ang1 + (ang2 - ang1) * (j / subTiles);
            const ta2 = ang1 + (ang2 - ang1) * ((j + 1) / subTiles);
            
            const tileIdx = Math.floor(platform.y / 25) + j;
            const hue = (tileIdx * 80 + Math.floor(this.gameTime / 240) * 120) % 360;
            c.fillStyle = `hsla(${hue}, 85%, 60%, 0.48)`;
            
            c.beginPath();
            // Start from inner boundary
            c.moveTo(cx + rInner * Math.cos(ta1), screenY + rInner * 0.28 * Math.sin(ta1));
            for (let a = ta1; a <= ta2 + 0.01; a += 0.05) {
              c.lineTo(cx + rInner * Math.cos(a), screenY + rInner * 0.28 * Math.sin(a));
            }
            // Trace outer boundary
            for (let a = ta2; a >= ta1 - 0.01; a -= 0.05) {
              c.lineTo(cx + rOuter * Math.cos(a), screenY + rOuter * 0.28 * Math.sin(a));
            }
            c.closePath();
            c.fill();
            
            c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            c.lineWidth = 0.8;
            c.stroke();
          }
          c.restore();
        } else if (this.activeSkin === 'plasma') {
          // Electrified violet storm cracks
          c.save();
          c.clip();
          c.strokeStyle = '#e600ff';
          c.lineWidth = 1.3;
          c.shadowBlur = 4;
          c.shadowColor = '#e600ff';
          
          const seed = Math.sin(platform.y) * 200;
          if (Math.floor(platform.y + this.gameTime * 0.02) % 18 === 0) {
            c.beginPath();
            const startAng = ang1 + (ang2 - ang1) * 0.5;
            let lx = cx + rInner * Math.cos(startAng);
            let ly = screenY + rInner * 0.28 * Math.sin(startAng);
            c.moveTo(lx, ly);
            
            const steps = 4;
            for (let k = 1; k <= steps; k++) {
              const r = rInner + (rOuter - rInner) * (k / steps);
              const a = startAng + (Math.sin(seed + k) * 0.12);
              const nlx = cx + r * Math.cos(a) + (Math.random() - 0.5) * 4;
              const nly = screenY + r * 0.28 * Math.sin(a) + (Math.random() - 0.5) * 2;
              c.lineTo(nlx, nly);
            }
            c.stroke();
          }
          c.restore();
        }
      }

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

      // Glowing outline stroke matching skin base colors
      let borderStroke = palette.safe;
      if (seg.type === 'safe') {
        if (this.activeSkin === 'magma') borderStroke = '#ff5500';
        else if (this.activeSkin === 'matrix') borderStroke = '#39ff14';
        else if (this.activeSkin === 'saturn') borderStroke = '#e6b85c';
        else if (this.activeSkin === 'disco') borderStroke = '#ff00ff';
        else if (this.activeSkin === 'plasma') borderStroke = '#bd00ff';
      }
      c.strokeStyle = seg.type === 'hazard' ? '#ff2a2a' : borderStroke;
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

      // Draw lightning connection back to pole for Plasma shards
      if (s.type === 'plasma' && s.life > 0.4 && Math.random() < 0.15) {
        c.save();
        c.strokeStyle = '#bd00ff';
        c.lineWidth = 1.2 * s.life;
        c.shadowBlur = 6;
        c.shadowColor = '#bd00ff';
        c.beginPath();
        c.moveTo(cx + s.x, screenY);
        const segments = 3;
        for (let j = 1; j < segments; j++) {
          const t = j / segments;
          const jx = cx + s.x * (1 - t) + (Math.random() - 0.5) * 8;
          const jy = screenY + (Math.random() - 0.5) * 6;
          c.lineTo(jx, jy);
        }
        c.lineTo(cx, screenY);
        c.stroke();
        c.restore();
      }

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
      } else if (p.type === 'binary') {
        c.font = `bold ${p.size * p.life}px 'Courier New', monospace`;
        c.fillStyle = p.color;
        c.shadowColor = p.color;
        c.shadowBlur = 4;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.text || '0', cx + p.x, screenY);
      } else if (p.type === 'star') {
        c.strokeStyle = p.color;
        c.lineWidth = 1.8 * p.life;
        c.shadowBlur = 8;
        c.shadowColor = p.color;
        c.beginPath();
        const r = p.size * p.life;
        c.moveTo(cx + p.x - r, screenY);
        c.lineTo(cx + p.x + r, screenY);
        c.moveTo(cx + p.x, screenY - r);
        c.lineTo(cx + p.x, screenY + r);
        c.stroke();
        // Small inner glow
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(cx + p.x, screenY, r * 0.3, 0, Math.PI * 2);
        c.fill();
      } else if (p.type === 'lava') {
        c.fillStyle = p.color;
        c.beginPath();
        const r = p.size * p.life;
        // Elongated drip shape pointing downwards
        c.ellipse(cx + p.x, screenY, r * 0.65, r * 1.35, 0, 0, Math.PI * 2);
        c.fill();
      } else if (p.type === 'confetti') {
        c.fillStyle = p.color;
        c.save();
        c.translate(cx + p.x, screenY);
        c.rotate(p.angle || 0);
        const size = p.size * p.life;
        c.fillRect(-size / 2, -size / 2, size, size);
        c.restore();
      } else if (p.type === 'lightning') {
        if (p.points && p.points.length > 0) {
          c.strokeStyle = p.color;
          c.lineWidth = p.size * p.life;
          c.shadowColor = p.color;
          c.shadowBlur = 10;
          c.beginPath();
          p.points.forEach((pt, idx) => {
            if (idx === 0) c.moveTo(cx + p.x + pt.x, screenY + pt.y);
            else c.lineTo(cx + p.x + pt.x, screenY + pt.y);
          });
          c.stroke();
        }
      } else if (p.type === 'smoke') {
        c.fillStyle = p.color;
        c.beginPath();
        const currentSize = p.size + (p.maxSize! - p.size) * (1 - p.life);
        c.arc(cx + p.x, screenY, currentSize, 0, Math.PI * 2);
        c.fill();
      } else if (p.type === 'laser') {
        c.strokeStyle = p.color;
        c.lineWidth = p.size * p.life;
        c.shadowColor = p.color;
        c.shadowBlur = 12;
        c.beginPath();
        c.moveTo(cx + p.x, screenY);
        const len = 350;
        const lx = cx + p.x + Math.cos(p.laserAngle || 0) * len;
        const ly = screenY + Math.sin(p.laserAngle || 0) * len;
        c.lineTo(lx, ly);
        c.stroke();
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

    // 1. Physics-based Organic Ball Trail (tracks history of coordinates)
    if (this.ballHistory.length > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      
      const isFever = this.isFeverMode;
      const historyLength = this.ballHistory.length;
      const baseHue = (this.gameTime * 0.35) % 360;
      
      this.ballHistory.forEach((pos, idx) => {
        // t goes from 0 (oldest) to 1 (newest)
        const t = idx / historyLength;
        const histScreenY = ballScreenY - (pos.y - this.cameraY);
        
        // Don't draw the trail exactly on the ball
        if (idx === historyLength - 1) return;

        // Trail radius gets smaller for older coordinates
        const r = this.ballRadius * (0.35 + t * 0.65) * (isFever ? 1.25 : 0.85);
        
        // Define trail color per skin
        let color = '';
        if (this.activeSkin === 'magma') {
          color = isFever ? `rgba(255, ${Math.floor(80 + t * 130)}, 0, ${0.15 + t * 0.5})` : `rgba(220, 60, 0, ${0.1 + t * 0.35})`;
        } else if (this.activeSkin === 'matrix') {
          color = `rgba(57, 255, 20, ${0.15 + t * 0.45})`;
        } else if (this.activeSkin === 'saturn') {
          color = `rgba(230, 184, 92, ${0.15 + t * 0.45})`;
        } else if (this.activeSkin === 'disco') {
          const hue = (baseHue + idx * 24) % 360;
          color = `hsla(${hue}, 85%, 65%, ${0.18 + t * 0.45})`;
        } else if (this.activeSkin === 'plasma') {
          color = `rgba(189, 0, 255, ${0.15 + t * 0.45})`;
        } else {
          color = `rgba(0, 240, 255, ${0.15 + t * 0.45})`; // Neon Cyan
        }
        
        c.fillStyle = color;
        c.save();
        c.shadowBlur = isFever ? 14 : 5;
        c.shadowColor = color;
        
        if (this.activeSkin === 'matrix') {
          // Matrix: draw square bits
          const sqSize = r * 1.5;
          c.fillRect(cx - sqSize / 2, histScreenY - sqSize / 2, sqSize, sqSize);
        } else if (this.activeSkin === 'plasma') {
          // Plasma: electric distorted ovals
          c.beginPath();
          c.ellipse(cx, histScreenY, r * (1 + (Math.random() - 0.5) * 0.2), r * 0.9, 0, 0, Math.PI * 2);
          c.fill();
        } else {
          c.beginPath();
          c.arc(cx, histScreenY, r, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      });
      c.restore();
    }

    // Shadow & glow matching fever state
    c.shadowBlur = this.isFeverMode ? 35 : 12;
    c.shadowColor = this.isFeverMode 
      ? (this.activeSkin === 'matrix' ? '#39ff14' : this.activeSkin === 'plasma' ? '#bd00ff' : this.activeSkin === 'saturn' ? '#e6b85c' : this.activeSkin === 'disco' ? '#ff00ff' : '#ff4500')
      : (this.activeSkin === 'matrix' ? '#39ff14' : this.activeSkin === 'plasma' ? '#bd00ff' : this.activeSkin === 'saturn' ? '#e6b85c' : this.activeSkin === 'disco' ? '#ff00ff' : 'rgba(0, 240, 255, 0.45)');

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
    c.save();
    
    // Draw Neon Fever Aura
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      c.shadowBlur = 25;
      c.shadowColor = '#00f0ff';
      
      // Expanding energy waves
      const waveCount = 3;
      for (let i = 0; i < waveCount; i++) {
        const t = ((this.gameTime * 0.0015 + i / waveCount) % 1);
        c.strokeStyle = `rgba(0, 240, 255, ${0.4 * (1 - t)})`;
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(cx, sy, this.ballRadius * (1 + t * 1.8), this.ballRadius * 0.3 * (1 + t * 1.8), 0, 0, Math.PI * 2);
        c.stroke();
      }
      
      // Outer fire flares
      for (let i = 0; i < 5; i++) {
        const radius = this.ballRadius * (1.1 + Math.random() * 0.4);
        c.fillStyle = `rgba(0, 180, 255, ${0.15 + Math.random() * 0.15})`;
        c.beginPath();
        c.arc(cx + (Math.random() - 0.5) * 8, sy + (Math.random() - 0.5) * 8, radius, 0, Math.PI * 2);
        c.fill();
      }
    }

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
      ballGrad.addColorStop(0.3, '#00f0ff');
      ballGrad.addColorStop(1, '#003366');
    } else {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#00f0ff');
      ballGrad.addColorStop(1, '#005577');
    }
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // 3D Orbital neon ring
    c.save();
    c.translate(cx, sy);
    c.rotate(Math.PI * 0.12 + Math.sin(this.gameTime * 0.001) * 0.05);
    c.strokeStyle = '#00f0ff';
    c.lineWidth = 1.6;
    c.shadowBlur = 6;
    c.shadowColor = '#00f0ff';
    c.beginPath();
    const rx = this.ballRadius * 1.5;
    const ry = this.ballRadius * 0.4;
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    c.stroke();

    // Orbiting neon dot
    const ringAngle = this.gameTime * 0.0025;
    const px = Math.cos(ringAngle) * rx;
    const py = Math.sin(ringAngle) * ry;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(px, py, 3.5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Specular highlight
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath();
    c.ellipse(cx - 4, sy - 5, 5, 3, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
    
    c.restore();
  }

  private drawMagmaSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();

    // Magma Fever Mode: Raging solar flares and licking Bezier flames pointing UPWARDS!
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      c.shadowBlur = 30;
      c.shadowColor = '#ff4500';

      // 1. Draw glowing background fire core
      for (let i = 0; i < 5; i++) {
        const radius = this.ballRadius * (1.3 + Math.random() * 0.4);
        const grad = c.createRadialGradient(cx, sy, this.ballRadius * 0.2, cx, sy, radius);
        grad.addColorStop(0, 'rgba(255, 200, 0, 0.5)');
        grad.addColorStop(0.5, 'rgba(255, 69, 0, 0.22)');
        grad.addColorStop(1, 'rgba(120, 0, 0, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(cx + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 6, radius, 0, Math.PI * 2);
        c.fill();
      }

      // 2. Draw actual flickering licking flames pointing UP (against gravity)
      const flameCount = 5;
      for (let i = 0; i < flameCount; i++) {
        c.save();
        c.translate(cx, sy);
        // Tilt each flame petal slightly
        const angle = -0.15 + (0.3 / flameCount) * i + (Math.sin(this.gameTime * 0.012 + i) * 0.06);
        c.rotate(angle);
        
        c.beginPath();
        c.moveTo(-this.ballRadius * 0.8, 0);
        // Flame curves up
        const flameHeight = this.ballRadius * (1.8 + Math.random() * 0.6);
        const cp1x = -this.ballRadius * 1.25;
        const cp1y = -flameHeight * 0.45;
        const cp2x = -this.ballRadius * 0.3;
        const cp2y = -flameHeight * 0.8;
        const endx = (Math.random() - 0.5) * 6;
        const endy = -flameHeight;
        
        c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
        c.bezierCurveTo(cp2x + 8, cp2y, this.ballRadius * 1.25, cp1y, this.ballRadius * 0.8, 0);
        c.closePath();
        
        const flameGrad = c.createLinearGradient(0, 0, 0, -flameHeight);
        flameGrad.addColorStop(0, 'rgba(255, 69, 0, 0.9)');
        flameGrad.addColorStop(0.45, 'rgba(255, 170, 0, 0.7)');
        flameGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        c.fillStyle = flameGrad;
        c.fill();
        c.restore();
      }
    }

    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.2,
      sy - this.ballRadius * 0.2,
      this.ballRadius * 0.05,
      cx,
      sy,
      this.ballRadius
    );
    if (this.isFeverMode) {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#ffaa00');
      ballGrad.addColorStop(0.7, '#ff3300');
      ballGrad.addColorStop(1, '#660000');
    } else {
      ballGrad.addColorStop(0, '#ffff88');
      ballGrad.addColorStop(0.35, '#ff5500');
      ballGrad.addColorStop(0.8, '#aa1100');
      ballGrad.addColorStop(1, '#330000');
    }
    
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Specular highlight
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.beginPath();
    c.ellipse(cx - 3, sy - 4, 4, 2, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();
    
    // Draw animated cracks
    const crackOffset = Math.sin(this.gameTime * 0.002) * 1.5;
    c.strokeStyle = this.isFeverMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 200, 0, 0.7)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(cx - 8 + crackOffset, sy + 2);
    c.lineTo(cx - 2 + crackOffset * 0.5, sy - 2);
    c.lineTo(cx + 4 + crackOffset, sy + 3);
    c.moveTo(cx - 3 - crackOffset, sy - 6);
    c.lineTo(cx + 2 - crackOffset * 0.5, sy - 1);
    c.lineTo(cx + 8 - crackOffset, sy - 4);
    c.stroke();

    c.restore();
  }

  private drawMatrixSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();
    c.translate(cx, sy);

    const angle = this.gameTime * 0.0016;
    const size = this.ballRadius * 1.15;

    // 3D Cube Vertices
    const vertices = [
      { x: -size, y: -size, z: -size }, // 0
      { x: size, y: -size, z: -size },  // 1
      { x: size, y: size, z: -size },   // 2
      { x: -size, y: size, z: -size },  // 3
      { x: -size, y: -size, z: size },  // 4
      { x: size, y: -size, z: size },   // 5
      { x: size, y: size, z: size },    // 6
      { x: -size, y: size, z: size },   // 7
    ];

    // Orthographic rotations
    const cosY = Math.cos(angle);
    const sinY = Math.sin(angle);
    const cosX = Math.cos(angle * 0.75);
    const sinX = Math.sin(angle * 0.75);

    const projected = vertices.map(v => {
      const x1 = v.x * cosY - v.z * sinY;
      const z1 = v.z * cosY + v.x * sinY;
      const y2 = v.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + v.y * sinX;
      return { x: x1, y: y2, z: z2 };
    });

    // Winding faces
    const faces = [
      { indices: [0, 1, 2, 3], color: 'rgba(5, 32, 5, 0.82)' }, // Back
      { indices: [4, 5, 6, 7], color: 'rgba(15, 65, 15, 0.88)' }, // Front
      { indices: [0, 1, 5, 4], color: 'rgba(10, 48, 10, 0.85)' }, // Top
      { indices: [2, 3, 7, 6], color: 'rgba(10, 48, 10, 0.85)' }, // Bottom
      { indices: [0, 3, 7, 4], color: 'rgba(8, 42, 8, 0.84)' }, // Left
      { indices: [1, 2, 6, 5], color: 'rgba(12, 52, 12, 0.86)' }  // Right
    ];

    // Calculate Z depths
    const facesWithZ = faces.map(face => {
      const avgZ = face.indices.reduce((sum, idx) => sum + projected[idx].z, 0) / 4;
      return { ...face, avgZ };
    });

    // Painter's algorithm: sort ascending by Z (furthest first)
    facesWithZ.sort((a, b) => a.avgZ - b.avgZ);

    c.strokeStyle = '#39ff14'; // Matrix green
    c.shadowColor = '#39ff14';
    c.shadowBlur = this.isFeverMode ? 35 : 10;
    c.lineWidth = 1.8;

    // Draw cube faces
    facesWithZ.forEach(face => {
      c.beginPath();
      face.indices.forEach((idx, i) => {
        const pt = projected[idx];
        if (i === 0) c.moveTo(pt.x, pt.y);
        else c.lineTo(pt.x, pt.y);
      });
      c.closePath();
      c.fillStyle = face.color;
      c.fill();
      c.stroke();

      // Draw cyber matrix glyphs inside visible faces
      if (face.avgZ > 0) {
        const faceCX = face.indices.reduce((sum, idx) => sum + projected[idx].x, 0) / 4;
        const faceCY = face.indices.reduce((sum, idx) => sum + projected[idx].y, 0) / 4;
        
        c.save();
        c.fillStyle = '#ffffff';
        c.font = 'bold 9px monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowBlur = 4;
        c.shadowColor = '#39ff14';
        c.fillText(Math.random() > 0.5 ? '1' : '0', faceCX, faceCY);
        c.restore();
      }
    });

    // Matrix Fever Glitch Effect
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        c.fillStyle = 'rgba(57, 255, 20, 0.22)';
        c.fillRect(
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
          8 + Math.random() * 12,
          8 + Math.random() * 12
        );
      }
    }

    c.restore();
  }

  private drawSaturnSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();

    // Saturn Nebula Singularity Accretion Disk (Fever Mode)
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      c.shadowBlur = 30;
      c.shadowColor = '#e6b85c';

      // Large orbiting golden accretion disk
      c.save();
      c.translate(cx, sy);
      c.rotate(Math.PI * 0.12);
      const diskGrad = c.createRadialGradient(0, 0, this.ballRadius, 0, 0, this.ballRadius * 3.3);
      diskGrad.addColorStop(0, 'rgba(255, 235, 150, 0.48)');
      diskGrad.addColorStop(0.4, 'rgba(230, 184, 92, 0.25)');
      diskGrad.addColorStop(1, 'rgba(100, 70, 20, 0)');
      c.fillStyle = diskGrad;
      c.beginPath();
      c.ellipse(0, 0, this.ballRadius * 3.3, this.ballRadius * 0.85, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // Polar jet streams shooting up and down
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2.5;
      c.shadowColor = '#e6b85c';
      c.shadowBlur = 10;
      c.beginPath();
      c.moveTo(cx, sy - this.ballRadius);
      c.lineTo(cx, sy - this.ballRadius * 3);
      c.moveTo(cx, sy + this.ballRadius);
      c.lineTo(cx, sy + this.ballRadius * 3);
      c.stroke();
    }

    const planetGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.3,
      sy - this.ballRadius * 0.3,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    if (this.isFeverMode) {
      planetGrad.addColorStop(0, '#ffffff');
      planetGrad.addColorStop(0.3, '#ffeb99');
      planetGrad.addColorStop(0.7, '#e6b85c');
      planetGrad.addColorStop(1, '#5c4314');
    } else {
      planetGrad.addColorStop(0, '#fff3cc');
      planetGrad.addColorStop(0.4, '#e6b85c');
      planetGrad.addColorStop(0.8, '#b37d1a');
      planetGrad.addColorStop(1, '#4d3300');
    }
    c.fillStyle = planetGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Draw Saturn gas bands
    c.save();
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.clip(); // clip to planet sphere
    c.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    c.lineWidth = 2.2;
    for (let offset = -8; offset <= 8; offset += 4) {
      c.beginPath();
      c.ellipse(cx, sy + offset, this.ballRadius * 1.2, this.ballRadius * 0.18, Math.PI * 0.05, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // Tilted Ring System
    c.save();
    c.translate(cx, sy);
    c.rotate(Math.PI * 0.12);
    
    c.strokeStyle = this.isFeverMode ? 'rgba(255, 235, 150, 0.95)' : 'rgba(230, 184, 92, 0.85)';
    c.lineWidth = this.isFeverMode ? 6 : 4;
    c.shadowBlur = 8;
    c.shadowColor = '#e6b85c';
    
    c.beginPath();
    c.ellipse(0, 0, this.ballRadius * 1.8, this.ballRadius * 0.4, 0, 0, Math.PI * 2);
    c.stroke();
    
    c.restore();
    
    // Specular highlight
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.beginPath();
    c.ellipse(cx - 3, sy - 4, 4, 2, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  private drawDiscoSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();

    // Disco Fever Laser Show
    if (this.isFeverMode) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const laserCount = 6;
      const angleOffset = this.gameTime * 0.002;
      for (let i = 0; i < laserCount; i++) {
        const angle = angleOffset + (Math.PI * 2 / laserCount) * i;
        const color = `hsl(${(this.gameTime * 0.45 + i * 60) % 360}, 90%, 65%)`;
        c.strokeStyle = color;
        c.lineWidth = 2 + Math.sin(this.gameTime * 0.005 + i) * 1;
        c.shadowColor = color;
        c.shadowBlur = 15;
        
        c.beginPath();
        c.moveTo(cx, sy);
        const len = 400;
        c.lineTo(cx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
        c.stroke();
      }
      c.restore();
    }

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
        
        // Dynamic shimmer facets
        const timeFactor = this.isFeverMode ? 0.85 : 0.25;
        const hue = (this.gameTime * timeFactor + r * 30 + col * 20) % 360;
        c.fillStyle = `hsla(${hue}, 85%, ${this.isFeverMode ? '80%' : '72%'}, 0.45)`;
        c.fillRect(fx, fy, step - 0.8, step - 0.8);

        c.fillStyle = 'rgba(255, 255, 255, 0.7)';
        c.fillRect(fx + 1.2, fy + 1.2, 1.8, 1.8);
      }
    }
    c.restore();

    // Specular highlight
    c.fillStyle = 'rgba(255, 255, 255, 0.45)';
    c.beginPath();
    c.ellipse(cx - 4, sy - 5, 5, 3, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  private drawPlasmaSkin(c: CanvasRenderingContext2D, cx: number, sy: number) {
    c.save();

    // Plasma Fever: pulsating plasma lightning storms
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      c.shadowBlur = 30;
      c.shadowColor = '#e600ff';
      
      // Pulsating field
      const fieldRadius = this.ballRadius * (1.3 + Math.sin(this.gameTime * 0.015) * 0.2);
      const fieldGrad = c.createRadialGradient(cx, sy, this.ballRadius, cx, sy, fieldRadius);
      fieldGrad.addColorStop(0, 'rgba(230, 0, 255, 0.35)');
      fieldGrad.addColorStop(0.5, 'rgba(150, 0, 200, 0.15)');
      fieldGrad.addColorStop(1, 'rgba(50, 0, 100, 0)');
      c.fillStyle = fieldGrad;
      c.beginPath();
      c.arc(cx, sy, fieldRadius, 0, Math.PI * 2);
      c.fill();
      
      // Electric aura stroke
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.8;
      c.beginPath();
      c.arc(cx, sy, fieldRadius * 0.95, 0, Math.PI * 2);
      c.stroke();
    }

    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.2,
      sy - this.ballRadius * 0.2,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );
    if (this.isFeverMode) {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#ffb3ff');
      ballGrad.addColorStop(0.7, '#e600ff');
      ballGrad.addColorStop(1, '#2a0033');
    } else {
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.3, '#cc00ff');
      ballGrad.addColorStop(0.8, '#550080');
      ballGrad.addColorStop(1, '#0f001f');
    }
    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Plasma lightning discharges
    c.strokeStyle = this.isFeverMode ? '#ffffff' : '#e600ff';
    c.lineWidth = this.isFeverMode ? 1.8 : 1.3;
    c.shadowColor = '#e600ff';
    c.shadowBlur = this.isFeverMode ? 18 : 10;
    
    const numArcs = this.isFeverMode ? 7 : 4;
    for (let i = 0; i < numArcs; i++) {
      const ang = Math.random() * Math.PI * 2;
      const len = this.ballRadius * (this.isFeverMode ? 1.5 + Math.random() * 0.5 : 1.1 + Math.random() * 0.38);
      
      c.beginPath();
      c.moveTo(cx, sy);
      const midX = cx + Math.cos(ang) * (len * 0.5) + (Math.random() - 0.5) * 6;
      const midY = sy + Math.sin(ang) * (len * 0.5) + (Math.random() - 0.5) * 6;
      const endX = cx + Math.cos(ang) * len;
      const endY = sy + Math.sin(ang) * len;
      
      c.lineTo(midX, midY);
      c.lineTo(endX, endY);
      c.stroke();
      
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(endX, endY, this.isFeverMode ? 3 : 2, 0, Math.PI * 2);
      c.fill();
    }
    
    c.restore();
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
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // 1. Shockwave ring (flattened for 3D perspective)
    if (this.activeSkin === 'saturn') {
      // Saturn spawns multiple concentric golden orbital rings
      for (let r = 0; r < 2; r++) {
        this.particles.push({
          x,
          y,
          vx: 0,
          vy: 0,
          color: '#e6b85c',
          size: 10 + r * 15,
          maxSize: 120 + r * 30,
          life: 1.0,
          decay: 0.003 - r * 0.0005,
          type: 'shockwave'
        });
      }
    } else if (this.activeSkin === 'disco') {
      // Disco spawns concentric rainbow colored shockwaves
      const colors = ['#ff0055', '#39ff14', '#00f0ff'];
      colors.forEach((col, idx) => {
        this.particles.push({
          x,
          y,
          vx: 0,
          vy: 0,
          color: col,
          size: 12 + idx * 8,
          maxSize: 110 + idx * 25,
          life: 1.0,
          decay: 0.003 + idx * 0.0005,
          type: 'shockwave'
        });
      });
    } else if (this.activeSkin === 'magma') {
      // Fiery orange/red expanding wave
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#ff4500',
        size: 15,
        maxSize: 140,
        life: 1.0,
        decay: 0.003,
        type: 'shockwave'
      });
    } else if (this.activeSkin === 'matrix') {
      // Digital matrix green wave
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#39ff14',
        size: 15,
        maxSize: 135,
        life: 1.0,
        decay: 0.0035,
        type: 'shockwave'
      });
    } else if (this.activeSkin === 'plasma') {
      // Electric violet wave
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#bd00ff',
        size: 15,
        maxSize: 145,
        life: 1.0,
        decay: 0.003,
        type: 'shockwave'
      });
    } else {
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
    }

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

    // 3. Custom Skin Particles
    const numSparks = 22 + Math.floor(Math.random() * 15);
    
    if (this.activeSkin === 'magma') {
      // Magma: lava drips + embers + dark smoke
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.10 + Math.random() * 0.22;
        
        // Lava blob
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: (Math.random() * 0.12) + 0.04, // shoot up
          color: Math.random() > 0.4 ? '#ff5500' : '#ffaa00',
          size: 4 + Math.random() * 4,
          life: 1.0,
          decay: 0.0018 + Math.random() * 0.0015,
          type: 'lava'
        });

        // Smoke puff
        if (i < 8) {
          this.particles.push({
            x,
            y: y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.04,
            vy: 0.03 + Math.random() * 0.04,
            color: 'rgba(40, 40, 45, 0.4)',
            size: 8,
            maxSize: 32,
            life: 1.0,
            decay: 0.002,
            type: 'smoke'
          });
        }
      }
    } else if (this.activeSkin === 'matrix') {
      // Matrix: falling binary digits + green pixel squares
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.08 + Math.random() * 0.16;
        
        // Binary digit particle
        this.particles.push({
          x: x + (Math.random() - 0.5) * 40,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: -0.02 - Math.random() * 0.04, // fall down
          color: '#39ff14',
          size: 12 + Math.random() * 4,
          life: 1.0,
          decay: 0.0016 + Math.random() * 0.0012,
          type: 'binary',
          text: Math.random() > 0.5 ? '1' : '0'
        });

        // Green pixel spark
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * (speed * 1.5),
          vy: (Math.random() * 0.1) - 0.03,
          color: '#20c20e',
          size: 3 + Math.random() * 2,
          life: 1.0,
          decay: 0.002 + Math.random() * 0.0015,
          type: 'spark'
        });
      }
    } else if (this.activeSkin === 'saturn') {
      // Saturn: golden stardust + gold stars
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.25;
        const isStar = Math.random() < 0.35;
        
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: (Math.random() * 0.12) - 0.04,
          color: isStar ? '#ffffff' : '#e6b85c',
          size: isStar ? 5 + Math.random() * 4 : 2 + Math.random() * 3,
          life: 1.0,
          decay: isStar ? 0.0016 : 0.002,
          type: isStar ? 'star' : 'spark'
        });
      }
    } else if (this.activeSkin === 'disco') {
      // Disco: rainbow confetti + sparkles
      const rainbowColors = ['#ff0055', '#ffaa00', '#39ff14', '#00f0ff', '#bd00ff', '#ffffff'];
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.28;
        const col = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];
        const isStar = Math.random() < 0.25;
        
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: (Math.random() * 0.15) - 0.05,
          color: col,
          size: isStar ? 6 + Math.random() * 4 : 3 + Math.random() * 4,
          life: 1.0,
          decay: 0.0015 + Math.random() * 0.0015,
          type: isStar ? 'star' : 'confetti',
          angle: Math.random() * Math.PI * 2
        });
      }
    } else if (this.activeSkin === 'plasma') {
      // Plasma: lightning segments + electric sparks
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.3;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: (Math.random() * 0.16) - 0.06,
          color: '#d300ff',
          size: 2 + Math.random() * 3,
          life: 1.0,
          decay: 0.002 + Math.random() * 0.002,
          type: 'spark'
        });
      }
      
      // Spawn 3 lightning bolt paths connecting center to outer edges
      for (let j = 0; j < 3; j++) {
        const targetAng = (Math.PI * 2 / 3) * j + Math.random() * 0.5;
        const dist = 100 + Math.random() * 40;
        
        // Generate zigzag points
        const points = [{ x: 0, y: 0 }];
        const segments = 4;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const currDist = dist * t;
          const noise = (Math.random() - 0.5) * 16;
          points.push({
            x: Math.cos(targetAng) * currDist + Math.sin(targetAng) * noise,
            y: Math.sin(targetAng) * currDist * 0.28 - Math.cos(targetAng) * noise * 0.28 // flatten
          });
        }
        
        this.particles.push({
          x,
          y,
          vx: 0,
          vy: 0,
          color: '#ffffff',
          size: 1.5,
          life: 1.0,
          decay: 0.006, // extremely fast lightning flash
          type: 'lightning',
          points
        });
      }
    } else {
      // Neon/Default cyan sparks
      for (let i = 0; i < numSparks; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.28;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: (Math.random() * 0.14) - 0.04,
          color,
          size: 2.5 + Math.random() * 3,
          life: 1.0,
          decay: 0.0015 + Math.random() * 0.002,
          type: 'spark'
        });
      }
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
