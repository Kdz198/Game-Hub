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
  private rotationSpeed = 0.0016; // Radians per ms
  private platforms: Platform[] = [];
  private shards: Shard[] = [];
  private bounceStrength = 0.38; // Upward velocity on bounce
  private gravity = 0.00095; // Gravity per ms^2
  private smashSpeed = 0.95; // Downward smash speed
  private platformSpacing = 74;

  // Fever states
  private feverTimer = 0; // Fever duration remaining
  private feverBuildRate = 0.85; // How fast fever builds per smash
  private feverDecayRate = 0.018; // How fast fever decays when not smashing

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
        // Hazard size starts at 2 segments at Level 1, up to 4 at Level 10
        const hazardSize = Math.min(4, 2 + Math.floor(this.level / 6)); 
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

    if (this.isGameOver || this.isCompleted) {
      // Gentle camera centering even when dead/finished
      this.cameraY += (this.targetCameraY - this.cameraY) * 0.005 * dt;
      return;
    }

    // Fever Mode timer countdown
    if (this.isFeverMode) {
      this.feverTimer -= dt;
      this.feverMeter = Math.max(0, (this.feverTimer / 4000) * 100);
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
    const speedMultiplier = 1 + (this.level * 0.05); // slightly faster rotation at higher levels
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
      }
    }

    // Smooth camera tracking
    // Keep camera centered on the active platform
    const activePlatformY = this.platforms[this.currentPlatformIndex].y;
    this.targetCameraY = activePlatformY + 32;
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
      } else {
        this.audio.play('shatter');
        this.triggerShake(7, 100);
        this.score += 1;
        
        // Build up Fever meter
        this.feverMeter = Math.min(100, this.feverMeter + this.feverBuildRate * 10);
        if (this.onFever) this.onFever(Math.floor(this.feverMeter));

        if (this.feverMeter >= 100) {
          this.isFeverMode = true;
          this.feverTimer = 4000; // 4 seconds of super rage fireball
        }
      }

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

    const centerX = w / 2;

    // Draw tháp và các đĩa trong không gian giả 3D
    this.drawTower(c, w, h, centerX);

    // Draw flying particles/shards
    this.drawShards(c, w, h, centerX);

    // Draw player ball
    if (!this.isGameOver) {
      this.drawBall(c, w, h, centerX);
    }

    c.restore();
  }

  private drawTower(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const rInner = 52;
    const rOuter = 135;
    const thickness = 20;

    // 1. Draw central pole (Thân tháp)
    const poleGrad = c.createLinearGradient(cx - rInner, 0, cx + rInner, 0);
    poleGrad.addColorStop(0, '#0c0d12');
    poleGrad.addColorStop(0.3, '#353a47');
    poleGrad.addColorStop(0.5, '#757f9c'); // metal sheen highlight
    poleGrad.addColorStop(0.8, '#252933');
    poleGrad.addColorStop(1, '#0c0d12');
    c.fillStyle = poleGrad;
    c.fillRect(cx - rInner + 2, 0, rInner * 2 - 4, h);

    const palette = PALETTES[(this.level - 1) % PALETTES.length];

    // Determine platform draw range based on camera culling
    // Top-most index to draw, bottom-most to draw
    const ballScreenY = h * 0.22;

    // Draw platforms in Z-sorted order (back-to-front within each platform)
    // Draw from bottom platforms (index 0) to top platforms (index totalPlatforms - 1)
    // This provides correct Z-sorting of overlapping rings
    for (let i = 0; i < this.totalPlatforms; i++) {
      const platform = this.platforms[i];
      if (platform.shattered) continue;

      // Project world Y to screen coordinate
      // Y goes up in world coordinates, camera moves up to track it
      const screenY = ballScreenY - (platform.y - this.cameraY);

      // Culling: check if platform is visible on screen
      if (screenY < -150 || screenY > h + 150) continue;

      const baseAngle = this.towerAngle + platform.rotationAngle;

      // Prepare segments sorted by depth
      // Mid-point angle projected Z depth is sin(angle)
      // Front is sin(angle) > 0, back is sin(angle) < 0
      // We sort ascending so furthest segments are drawn first
      const sortedSegs = platform.segments.map((seg, idx) => {
        const midAngle = (seg.startAngle + seg.endAngle) / 2 + baseAngle;
        const depth = Math.sin(midAngle);
        return { seg, depth };
      });

      sortedSegs.sort((a, b) => a.depth - b.depth);

      // Draw segments
      sortedSegs.forEach(({ seg }) => {
        const ang1 = seg.startAngle + baseAngle;
        const ang2 = seg.endAngle + baseAngle;

        // Choose segment color
        let fill = palette.safe;
        let sideFill = palette.safeDark;

        if (seg.type === 'hazard') {
          fill = '#1d1d24';
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

        // Draw top face of disk segment
        c.fillStyle = fill;
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

        // Soft outline separation
        c.strokeStyle = 'rgba(0,0,0,0.18)';
        c.lineWidth = 1.0;
        c.stroke();
      });
    }
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

      c.beginPath();
      s.points.forEach((pt, idx) => {
        if (idx === 0) c.moveTo(pt.x, pt.y);
        else c.lineTo(pt.x, pt.y);
      });
      c.closePath();
      c.fill();

      c.restore();
    });
    c.globalAlpha = 1.0;
  }

  private drawBall(c: CanvasRenderingContext2D, w: number, h: number, cx: number) {
    const ballScreenY = h * 0.22;
    const sy = ballScreenY - (this.ballY - this.cameraY);

    c.save();

    // 1. Fever/Fireball Trail
    if (this.isFeverMode) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const trailY = sy + (i * 12);
        const trailR = this.ballRadius * (1 - i * 0.15);
        c.fillStyle = `rgba(255, 69, 0, ${0.45 - i * 0.07})`;
        c.beginPath();
        c.arc(cx + (Math.random() - 0.5) * 8, trailY, trailR, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      c.save();
    }

    // 2. Main Ball Sphere
    c.shadowBlur = this.isFeverMode ? 30 : 10;
    c.shadowColor = this.isFeverMode ? '#ff4500' : 'rgba(0, 240, 255, 0.45)';

    const ballGrad = c.createRadialGradient(
      cx - this.ballRadius * 0.3,
      sy - this.ballRadius * 0.3,
      this.ballRadius * 0.1,
      cx,
      sy,
      this.ballRadius
    );

    if (this.isFeverMode) {
      ballGrad.addColorStop(0, '#ffffff'); // bright fire center
      ballGrad.addColorStop(0.3, '#ffaa00');
      ballGrad.addColorStop(1, '#ff1100');
    } else {
      ballGrad.addColorStop(0, '#ffffff'); // glossy reflection
      ballGrad.addColorStop(0.3, '#00f0ff'); // bright cyan neon
      ballGrad.addColorStop(1, '#005577');
    }

    c.fillStyle = ballGrad;
    c.beginPath();
    c.arc(cx, sy, this.ballRadius, 0, Math.PI * 2);
    c.fill();

    // Soft white specular gloss cap
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.beginPath();
    c.ellipse(cx - 4, sy - 5, 5, 3, Math.PI * 0.2, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }
}
