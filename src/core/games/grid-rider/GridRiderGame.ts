import { GameLoop } from "../../engine/GameLoop";
import { AudioSynth } from "../../utils/AudioSynth";

/* ── Types ──────────────────────────────────────────────────────── */

interface SpriteInfo {
  x: number; // Offset from road center (-2.0 to 2.0)
  type: 'palm' | 'light' | 'gate' | 'barrier' | 'sign_checkpoint';
  width: number;
  height: number;
  color: string;
}

interface Segment {
  index: number;
  world: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
  curve: number;
  hill: number;
  color: {
    road: string;
    grass: string;
    rumble: string;
    lane?: string;
  };
  sprites: SpriteInfo[];
  boostPad?: {
    x: number; // Offset from center
    width: number;
    active: boolean;
  };
}

interface AICar {
  id: number;
  x: number; // Offset from road center (-0.8 to 0.8)
  z: number; // Z position on track
  speed: number;
  color: string;
  type: number; // visual variety
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

/* ── Constants ──────────────────────────────────────────────────── */

const SEGMENT_LENGTH = 200; // Length of each track segment (Z units)
const DRAW_DISTANCE = 160;  // How many segments to draw ahead
const ROAD_WIDTH = 2200;    // Width of the road
const LANES = 3;            // Number of lanes
const CAMERA_HEIGHT = 900;  // Height of camera above road
const CAMERA_DEPTH = 0.85;   // Scale factor (FOV helper)
const TRACK_SEGMENTS = 800; // Total track length in segments
const GAME_DURATION = 40;   // Initial time limit (seconds)

// Colors palette (Neon / Cyberpunk theme)
const COLORS = {
  skyDark: '#0a0015',
  skyLight: '#240038',
  sunGold: '#ff007f',
  sunYellow: '#fff01f',
  gridLine: 'rgba(255, 0, 240, 0.12)',
  roadDark: '#120024',
  roadLight: '#18002d',
  grassDark: '#05000d',
  grassLight: '#080012',
  rumbleCyan: '#00f0ff',
  rumblePink: '#ff00f0',
  laneLine: 'rgba(255, 255, 255, 0.4)',
  carTailRed: '#ff3333',
  carTailAmber: '#ffaa00',
  boostBlue: '#00f0ff',
};

/* ── Grid Rider Game Engine ─────────────────────────────────────── */

export class GridRiderGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;

  // Game metrics (UI bindable)
  public score = 0;
  public bestScore = 0;
  public timeLeft = GAME_DURATION;
  public speed = 0; // Current speed (miles per hour display: 0 to 180)
  public distance = 0; // Total distance traveled (meters)
  public isGameOver = false;
  public isCompleted = false; // Finished track
  public gameTime = 0;
  public checkpointIndex = 1;

  // Settings
  public audio = new AudioSynth();

  // Callbacks
  public onScore?: (score: number) => void;
  public onTime?: (time: number) => void;
  public onSpeed?: (speed: number) => void;
  public onDistance?: (dist: number) => void;
  public onGameOver?: (score: number, best: number, completed: boolean) => void;
  public onCheckpoint?: (msg: string) => void;

  // Core road database
  private segments: Segment[] = [];
  private trackLength = 0;

  // Camera and Player position
  private playerX = 0; // Relative to road center (-1 to 1 is road surface)
  private playerZ = 0; // Position along track (0 to trackLength)
  private playerSpeed = 0; // Real Z speed (0 to maxSpeed)
  private maxSpeed = 12000; // Z units per second
  private boostSpeed = 17500; // Speed on boost pad
  private accel = 5000;      // Acceleration Z units / s^2
  private decel = -4000;     // Natural deceleration / braking
  private offRoadDrag = -10000; // High friction off-road
  private offRoadLimit = 3500;  // Max speed allowed off-road

  // Horizon & Background
  private backgroundOffset = 0; // For parallax scrolling of mountains/sky
  private skyOffset = 0;

  // Key controls state
  private keys: Record<string, boolean> = {};

  // Game entities
  private aiCars: AICar[] = [];
  private particles: Particle[] = [];
  private screenFlash = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  private boostTimer = 0; // Super boost timer

  // Touch overlays buttons configuration (used on mobile)
  private touchSteer = 0; // -1 to 1 (left to right)
  private touchAccel = false;
  private touchBrake = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not found");
    this.ctx = ctx;

    this.bestScore = parseInt(localStorage.getItem('gridRiderBest') || '0');

    this.loop = new GameLoop(
      this.update.bind(this),
      this.draw.bind(this)
    );

    this.buildTrack();
    this.spawnAICars();
    this.attachEvents();
  }

  /* ── Input Event Handlers ───────────────────────────────────── */

  private attachEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public destroy() {
    this.loop.stop();
    this.audio.destroy();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'].includes(e.code)) {
      e.preventDefault(); // Stop page scrolling
    }
    this.keys[e.code] = true;
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  // External controller bindings for React touch UI
  public setTouchSteer(val: number) { this.touchSteer = val; }
  public setTouchAccel(active: boolean) { this.touchAccel = active; }
  public setTouchBrake(active: boolean) { this.touchBrake = active; }

  /* ── Track Generation ───────────────────────────────────────── */

  private buildTrack() {
    this.segments = [];

    // Local segment helpers to inject sections
    const addSection = (
      length: number,
      curveVal: number,
      hillVal: number
    ) => {
      const start = this.segments.length;
      for (let i = 0; i < length; i++) {
        const index = start + i;
        const z = index * SEGMENT_LENGTH;

        // Alternating colors for movement illusion
        const isAlternate = Math.floor(index / 3) % 2 === 0;
        const road = isAlternate ? COLORS.roadLight : COLORS.roadDark;
        const grass = isAlternate ? COLORS.grassLight : COLORS.grassDark;
        const rumble = isAlternate ? COLORS.rumbleCyan : COLORS.rumblePink;

        // Calculate smooth curve/hill transitions
        // We use sine interpolation to smooth in and out curve/hill deltas
        const ratio = i / length;
        const curve = curveVal * Math.sin(ratio * Math.PI);
        const hill = hillVal * Math.sin(ratio * Math.PI);

        const segment: Segment = {
          index,
          world: { x: 0, y: 0, z },
          screen: { x: 0, y: 0, w: 0, scale: 0 },
          curve,
          hill,
          color: { road, grass, rumble, lane: isAlternate ? COLORS.laneLine : undefined },
          sprites: [],
        };

        // Add roadside sprites randomly
        if (index > 15 && index < TRACK_SEGMENTS - 20) {
          if (index % 12 === 0) {
            // Palm trees on the left/right
            segment.sprites.push({
              x: -1.7 - Math.random() * 0.4,
              type: 'palm',
              width: 280,
              height: 380,
              color: '#ff00f0',
            });
            segment.sprites.push({
              x: 1.7 + Math.random() * 0.4,
              type: 'palm',
              width: 280,
              height: 380,
              color: '#00f0ff',
            });
          }

          if (index % 30 === 0) {
            // Cyber lights overhead arches/gates
            segment.sprites.push({
              x: 0,
              type: 'gate',
              width: 2400,
              height: 1200,
              color: '#fff01f',
            });
          }

          // Road obstacles (barriers) at specific spots
          if (index % 47 === 0) {
            segment.sprites.push({
              x: Math.random() > 0.5 ? 0.45 : -0.45,
              type: 'barrier',
              width: 140,
              height: 120,
              color: '#ff3333',
            });
          }

          // Neon lampposts
          if (index % 18 === 0) {
            segment.sprites.push({
              x: index % 36 === 0 ? -1.4 : 1.4,
              type: 'light',
              width: 120,
              height: 400,
              color: '#fff01f',
            });
          }

          // Speed boost pads on the road surface
          if (index % 63 === 0 && index < TRACK_SEGMENTS - 50) {
            segment.boostPad = {
              x: (Math.random() - 0.5) * 1.2, // Random lane
              width: 350,
              active: true,
            };
          }
        }

        // Add checkpoint banners
        if (index > 0 && index % 200 === 0 && index < TRACK_SEGMENTS - 50) {
          segment.sprites.push({
            x: 0,
            type: 'sign_checkpoint',
            width: 2800,
            height: 1400,
            color: '#00f0ff',
          });
        }

        this.segments.push(segment);
      }
    };

    // Construct the loopable highway track
    addSection(100, 0, 0);       // Intro straight
    addSection(80, 1.5, 0);     // Soft right turn
    addSection(60, -2.0, 15);    // Left turn climbing hill
    addSection(70, 0, -25);     // Straight going downhill
    addSection(90, -3.0, 0);     // Sharp left hairpin
    addSection(100, 2.5, 30);    // Right turn climbing steep hill
    addSection(80, 0, -10);      // Flat bridge
    addSection(120, -1.8, -15);  // Downhill curve left
    addSection(100, 0, 0);       // Highway run
    addSection(100, 0, 0);       // Final run to checkpoint loop

    this.trackLength = this.segments.length * SEGMENT_LENGTH;

    // Apply hills mathematically to cumulative world Y positions
    let currentY = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      currentY += seg.hill;
      seg.world.y = currentY;
    }
  }

  private spawnAICars() {
    this.aiCars = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      // Spread them across the track starting from segment 80
      const segIndex = 80 + Math.floor(Math.random() * (this.segments.length - 150));
      this.aiCars.push({
        id: i,
        x: (Math.random() - 0.5) * 1.4, // Lane offset
        z: segIndex * SEGMENT_LENGTH,
        speed: 4000 + Math.random() * 3800, // Speed in world units
        color: i % 3 === 0 ? '#ff9900' : (i % 3 === 1 ? '#fff01f' : '#39ff14'),
        type: i % 2,
        width: 320,
        height: 160,
      });
    }
  }

  /* ── Game Lifecycle ─────────────────────────────────────────── */

  public start() {
    this.audio.unlock();
    this.reset();
    this.loop.start();
  }

  private reset() {
    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.playerX = 0;
    this.playerZ = 0;
    this.playerSpeed = 0;
    this.speed = 0;
    this.distance = 0;
    this.isGameOver = false;
    this.isCompleted = false;
    this.gameTime = 0;
    this.checkpointIndex = 1;
    this.boostTimer = 0;
    this.screenFlash = 0;
    this.shakeTime = 0;
    this.backgroundOffset = 0;
    this.skyOffset = 0;
    this.particles = [];
    
    this.spawnAICars();
    this.resetBoostPads();

    if (this.onScore) this.onScore(0);
    if (this.onTime) this.onTime(GAME_DURATION);
    if (this.onSpeed) this.onSpeed(0);
    if (this.onDistance) this.onDistance(0);
  }

  private resetBoostPads() {
    for (const seg of this.segments) {
      if (seg.boostPad) seg.boostPad.active = true;
    }
  }

  /* ── Core Loop Update ───────────────────────────────────────── */

  private update(dt: number) {
    const dtSec = dt / 1000;
    this.gameTime += dtSec;

    // Fade screens and timers
    if (this.screenFlash > 0) {
      this.screenFlash -= dtSec * 3;
      if (this.screenFlash < 0) this.screenFlash = 0;
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime < 0) this.shakeTime = 0;
    }
    if (this.boostTimer > 0) {
      this.boostTimer -= dtSec;
      if (this.boostTimer < 0) this.boostTimer = 0;
    }

    if (this.isGameOver || this.isCompleted) {
      // Minimal updates
      this.playerSpeed *= 0.95;
      this.speed = Math.floor(this.playerSpeed * (180 / this.maxSpeed));
      if (this.onSpeed) this.onSpeed(this.speed);
      this.updateParticles(dtSec);
      return;
    }

    // Time countdown
    this.timeLeft = Math.max(0, this.timeLeft - dtSec);
    if (this.onTime) this.onTime(this.timeLeft);
    if (this.timeLeft <= 0) {
      this.triggerGameOver(false);
      return;
    }

    // Capture controls
    const steerLeft = this.keys['ArrowLeft'] || this.keys['KeyA'] || (this.touchSteer < -0.2);
    const steerRight = this.keys['ArrowRight'] || this.keys['KeyD'] || (this.touchSteer > 0.2);
    const accelerate = this.keys['ArrowUp'] || this.keys['KeyW'] || this.touchAccel;
    const brake = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touchBrake;

    // Steering velocity factor based on speed (can't steer if stationary)
    const speedPct = this.playerSpeed / this.maxSpeed;
    const steerFactor = 2.4 * dtSec * Math.min(speedPct, 1.2);

    if (steerLeft) {
      this.playerX -= steerFactor * (this.touchSteer < -0.2 ? Math.abs(this.touchSteer) : 1);
    } else if (steerRight) {
      this.playerX += steerFactor * (this.touchSteer > 0.2 ? this.touchSteer : 1);
    }

    // Off-road check & steering drag
    const playerSegmentIndex = Math.floor(this.playerZ / SEGMENT_LENGTH);
    const playerSeg = this.segments[playerSegmentIndex % this.segments.length];
    
    // Road drift physics on curve
    const curveInfluence = playerSeg.curve * 0.2 * (this.playerSpeed / this.maxSpeed);
    this.playerX -= curveInfluence * dtSec * 15;

    const isOffRoad = Math.abs(this.playerX) > 1.0;

    // Speed calculation
    const currentMaxSpeed = this.boostTimer > 0 ? this.boostSpeed : (isOffRoad ? this.offRoadLimit : this.maxSpeed);

    if (accelerate) {
      this.playerSpeed += this.accel * dtSec;
    } else if (brake) {
      this.playerSpeed += this.decel * 2.0 * dtSec; // Strong braking
    } else {
      this.playerSpeed += this.decel * 0.5 * dtSec; // Friction
    }

    // Off road braking drag
    if (isOffRoad && this.playerSpeed > this.offRoadLimit) {
      this.playerSpeed += this.offRoadDrag * dtSec;
    }

    // Clamp speed limits
    this.playerSpeed = Math.max(0, Math.min(this.playerSpeed, currentMaxSpeed));

    // Move player
    this.playerZ += this.playerSpeed * dtSec;
    this.distance += this.playerSpeed * dtSec;
    if (this.onDistance) this.onDistance(Math.floor(this.distance / 10));

    // Update screen speed display
    this.speed = Math.floor(this.playerSpeed * (180 / this.maxSpeed));
    if (this.onSpeed) this.onSpeed(this.speed);

    // Score increments slowly while driving fast
    if (this.playerSpeed > 1000) {
      this.score += Math.floor((this.playerSpeed / 1000) * dtSec * 5);
      if (this.onScore) this.onScore(this.score);
    }

    // Loop or finish check
    if (this.playerZ >= this.trackLength) {
      // Loop track
      this.playerZ -= this.trackLength;
      this.resetBoostPads();
      this.checkpointIndex = 1;
      this.triggerCheckpoint("VÒNG MỚI! +15 GIÂY");
    }

    // Checkpoint detection inside the track
    const currentCheckpoint = Math.floor(this.playerZ / (200 * SEGMENT_LENGTH)) + 1;
    if (currentCheckpoint > this.checkpointIndex && currentCheckpoint <= 3) {
      this.checkpointIndex = currentCheckpoint;
      this.triggerCheckpoint(`CHECKPOINT ${this.checkpointIndex - 1}! +15 GIÂY`);
    }

    // Parallax backgrounds offsets
    this.backgroundOffset += playerSeg.curve * 0.05 * speedPct;
    this.skyOffset += playerSeg.curve * 0.01 * speedPct;

    // Update particles (exhaust fires)
    this.updateParticles(dtSec);
    if (this.playerSpeed > 100 && Math.random() < 0.35) {
      this.spawnExhaustParticles();
    }

    // Update AI cars
    this.updateAICars(dtSec);

    // Check collisions
    this.checkCollisions(playerSeg);
  }

  private triggerCheckpoint(msg: string) {
    this.timeLeft += 15;
    this.audio.playMilestone();
    this.screenFlash = 0.25;
    if (this.onCheckpoint) this.onCheckpoint(msg);
  }

  private spawnExhaustParticles() {
    // Left/right exhausts position offsets relative to player's center
    const tilt = this.keys['ArrowLeft'] || this.keys['KeyA'] ? -15 : (this.keys['ArrowRight'] || this.keys['KeyD'] ? 15 : 0);
    const leftOffset = -40 + tilt * 0.3;
    const rightOffset = 40 + tilt * 0.3;
    const isBoosting = this.boostTimer > 0;

    const baseColor = isBoosting ? '#00f0ff' : '#ff007f';

    // Spawn exhaust left
    this.particles.push({
      x: this.canvas.width / 2 + leftOffset + (Math.random() - 0.5) * 6,
      y: this.canvas.height - 75,
      vx: (Math.random() - 0.5) * 1.5 + (tilt * -0.05),
      vy: Math.random() * 2 + 1,
      size: Math.random() * (isBoosting ? 6 : 4) + 2,
      color: baseColor,
      life: 0.4,
    });

    // Spawn exhaust right
    this.particles.push({
      x: this.canvas.width / 2 + rightOffset + (Math.random() - 0.5) * 6,
      y: this.canvas.height - 75,
      vx: (Math.random() - 0.5) * 1.5 + (tilt * -0.05),
      vy: Math.random() * 2 + 1,
      size: Math.random() * (isBoosting ? 6 : 4) + 2,
      color: baseColor,
      life: 0.4,
    });
  }

  private updateParticles(dtSec: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y -= p.vy; // Float upwards relative to camera
      p.life -= dtSec * 2.5;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateAICars(dtSec: number) {
    const playerSeg = Math.floor(this.playerZ / SEGMENT_LENGTH);

    for (const car of this.aiCars) {
      // Update Z coordinate
      car.z += car.speed * dtSec;

      // Keep them on track bounds
      if (car.z >= this.trackLength) {
        car.z -= this.trackLength;
      }

      // Add a little bit of wave-like steering movement to AI
      const carSegIndex = Math.floor(car.z / SEGMENT_LENGTH);
      const seg = this.segments[carSegIndex % this.segments.length];
      
      // AI steers inside road curves
      car.x += seg.curve * 0.04 * dtSec;

      // AI avoids off-road bounds
      if (car.x < -0.8) car.x = -0.8;
      if (car.x > 0.8) car.x = 0.8;
    }
  }

  private checkCollisions(playerSeg: Segment) {
    // 1. Check AI car collisions
    const playerSegZ = Math.floor(this.playerZ / SEGMENT_LENGTH);
    for (const car of this.aiCars) {
      const carSegZ = Math.floor(car.z / SEGMENT_LENGTH);
      
      // Detect if in the same proximity
      const zDiff = Math.abs(this.playerZ - car.z);
      if (zDiff < 140) {
        // Side offset overlap
        const xDiff = Math.abs(this.playerX - car.x);
        if (xDiff < 0.45) {
          // Crash!
          this.triggerCrash();
          // Bounce car away
          if (this.playerX > car.x) {
            this.playerX = car.x + 0.48;
          } else {
            this.playerX = car.x - 0.48;
          }
          break;
        }
      }
    }

    // 2. Check roadside obstacles on current segments
    const visibleSegs = 5;
    for (let i = 0; i < visibleSegs; i++) {
      const idx = (playerSeg.index + i) % this.segments.length;
      const seg = this.segments[idx];
      const zDiff = Math.abs(this.playerZ - (seg.index * SEGMENT_LENGTH));

      if (zDiff < 120) {
        for (const sprite of seg.sprites) {
          if (sprite.type === 'barrier') {
            const xDiff = Math.abs(this.playerX - sprite.x);
            if (xDiff < 0.42) {
              this.triggerCrash();
              this.playerX += this.playerX > sprite.x ? 0.3 : -0.3;
            }
          }
        }

        // 3. Check Speed Boost Pads
        if (seg.boostPad && seg.boostPad.active) {
          const xDiff = Math.abs(this.playerX - seg.boostPad.x);
          if (xDiff < 0.35) {
            // Pick up boost pad
            seg.boostPad.active = false;
            this.boostTimer = 1.8; // 1.8 seconds of super boost
            this.playerSpeed = this.boostSpeed;
            this.audio.playEat(); // Boost chime sound
            this.screenFlash = 0.3;
            this.triggerShake(6, 250);
            
            // Score bonus
            this.score += 250;
            if (this.onScore) this.onScore(this.score);
          }
        }
      }
    }
  }

  private triggerCrash() {
    this.audio.playCrash(); // low crash explosion sound
    this.playerSpeed = 2200; // Slow down heavily
    this.triggerShake(12, 450);
    this.screenFlash = 0.25;
    
    // Negative visual feedback
    this.particles.push({
      x: this.canvas.width / 2 + (Math.random() - 0.5) * 50,
      y: this.canvas.height - 80,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 5 + 3,
      size: Math.random() * 12 + 6,
      color: '#ff3333',
      life: 0.6
    });
  }

  private triggerShake(mag: number, dur: number) {
    this.shakeMag = mag;
    this.shakeTime = dur;
  }

  private triggerGameOver(completed: boolean) {
    this.isGameOver = !completed;
    this.isCompleted = completed;
    this.audio.playCrash();
    this.triggerShake(16, 500);

    const best = parseInt(localStorage.getItem('gridRiderBest') || '0');
    if (this.score > best) {
      localStorage.setItem('gridRiderBest', this.score.toString());
      this.bestScore = this.score;
    } else {
      this.bestScore = best;
    }

    if (this.onGameOver) {
      this.onGameOver(this.score, this.bestScore, completed);
    }
  }

  /* ── Canvas Rendering ───────────────────────────────────────── */

  private draw() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Apply Screen Shake
    c.save();
    if (this.shakeTime > 0) {
      const dx = (Math.random() - 0.5) * this.shakeMag;
      const dy = (Math.random() - 0.5) * this.shakeMag;
      c.translate(dx, dy);
    }

    // 1. Draw Sky & Horizon Sunset
    this.drawSky(c, w, h);

    // 2. Draw Road and Sprites Z-Sorted
    this.drawRoadAndAssets(c, w, h);

    // 3. Draw player exhaust fire particles
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      c.fillStyle = p.color;
      c.globalAlpha = p.life;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // 4. Draw Player's Cyber Sports Car
    this.drawPlayerCar(c, w, h);

    // 5. Draw screen flashing (red crash overlay or white boost flash)
    if (this.screenFlash > 0) {
      c.save();
      c.fillStyle = this.boostTimer > 0.1 
        ? `rgba(0, 240, 255, ${this.screenFlash * 0.35})` // boost cyan flash
        : `rgba(255, 51, 51, ${this.screenFlash * 0.35})`; // damage red flash
      c.fillRect(0, 0, w, h);
      c.restore();
    }

    c.restore();
  }

  private drawSky(c: CanvasRenderingContext2D, w: number, h: number) {
    const horizon = h / 2;

    // Sky gradient
    const skyGrad = c.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, COLORS.skyDark);
    skyGrad.addColorStop(1, COLORS.skyLight);
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, w, horizon);

    // Stars
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 40; i++) {
      const starX = (Math.sin(i * 123.45) * 0.5 + 0.5) * w;
      const starY = (Math.cos(i * 456.78) * 0.5 + 0.5) * (horizon - 20);
      c.fillRect(starX, starY, 1.5, 1.5);
    }

    // Drawing the Synthwave grid sun
    c.save();
    const sunX = w / 2 - (this.skyOffset * w * 0.5) % (w * 0.4);
    const sunY = horizon - 20;
    const sunRadius = 130;

    c.shadowColor = COLORS.sunGold;
    c.shadowBlur = 40;

    const sunGrad = c.createLinearGradient(0, sunY - sunRadius, 0, sunY);
    sunGrad.addColorStop(0, COLORS.sunYellow);
    sunGrad.addColorStop(1, COLORS.sunGold);
    c.fillStyle = sunGrad;

    c.beginPath();
    c.arc(sunX, sunY, sunRadius, Math.PI, 0, false);
    c.fill();

    // Horizontal grid cut lines in the sun
    c.shadowBlur = 0;
    c.fillStyle = COLORS.skyLight;
    const lines = 8;
    for (let i = 0; i < lines; i++) {
      const lineY = sunY - (i * 15) - 3;
      const lineHeight = Math.max(1, i * 1.5);
      c.fillRect(sunX - sunRadius - 10, lineY - lineHeight, sunRadius * 2 + 20, lineHeight);
    }
    c.restore();

    // Mountain silhouettes in background
    c.save();
    c.fillStyle = '#11001e';
    c.beginPath();
    c.moveTo(0, horizon);
    
    // Multi-layered jagged neon hills
    const hillsCount = 8;
    const sliceWidth = w / hillsCount;
    for (let i = 0; i <= hillsCount; i++) {
      const shiftX = (this.skyOffset * w * 0.2) % sliceWidth;
      const x = i * sliceWidth - shiftX;
      const y = horizon - 15 - Math.abs(Math.sin(i * 987.65) * 35);
      c.lineTo(x, y);
    }
    c.lineTo(w, horizon);
    c.closePath();
    c.fill();
    c.restore();

    // Draw grid horizon line
    c.strokeStyle = COLORS.sunGold;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, horizon);
    c.lineTo(w, horizon);
    c.stroke();
  }

  private drawRoadAndAssets(c: CanvasRenderingContext2D, w: number, h: number) {
    const horizon = h / 2;
    const playerSegmentIndex = Math.floor(this.playerZ / SEGMENT_LENGTH);
    const playerPercent = (this.playerZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;

    let dx = 0;
    let dy = 0;
    let segmentCurveAccum = 0;
    let segmentHillAccum = 0;

    let minY = h;
    const segmentVisible = new Array(DRAW_DISTANCE).fill(true);

    // Reset coordinates database for visible segments
    for (let i = 0; i < DRAW_DISTANCE; i++) {
      const idx = (playerSegmentIndex + i) % this.segments.length;
      const seg = this.segments[idx];

      // World coordinates calculation
      // Wrap-around track calculation
      const zOffset = (playerSegmentIndex + i >= this.segments.length) ? this.trackLength : 0;
      const pz = Math.max(20, seg.world.z + zOffset - this.playerZ);

      // Project coordinates
      const scale = CAMERA_DEPTH / pz;
      seg.screen.scale = scale;

      segmentCurveAccum += seg.curve;
      segmentHillAccum += seg.hill;

      dx += segmentCurveAccum;
      dy += segmentHillAccum;

      // Project to 2D
      const px = w / 2 + (seg.world.x - this.playerX * ROAD_WIDTH + dx) * scale * (w / 2);
      const py = horizon - (seg.world.y - CAMERA_HEIGHT + dy) * scale * (h / 2);
      const pw = ROAD_WIDTH * scale * (w / 2);

      seg.screen.x = px;
      seg.screen.y = py;
      seg.screen.w = pw;

      // Hill culling check: if a further segment Y is below/equal to a closer crest Y (larger Y), it is hidden
      if (i > 0) {
        if (py >= minY) {
          segmentVisible[i] = false;
        } else {
          segmentVisible[i] = true;
          minY = py;
        }
      }
    }

    // Now, render road segments from furthest back (DRAW_DISTANCE - 1) to closest (1)
    // To prevent overlap issues and keep z-order correct
    for (let i = DRAW_DISTANCE - 1; i > 0; i--) {
      if (!segmentVisible[i]) continue;

      const curr = this.segments[(playerSegmentIndex + i) % this.segments.length];
      const prev = this.segments[(playerSegmentIndex + i - 1) % this.segments.length];

      // Draw grass and road surfaces
      c.save();
      
      // 1. Draw Grass/Glow outer area
      c.fillStyle = curr.color.grass;
      c.beginPath();
      c.moveTo(0, prev.screen.y);
      c.lineTo(w, prev.screen.y);
      c.lineTo(w, curr.screen.y);
      c.lineTo(0, curr.screen.y);
      c.fill();

      // 2. Draw Rumble strips (neon edges)
      const rumbleW1 = prev.screen.w * 0.12;
      const rumbleW2 = curr.screen.w * 0.12;
      c.fillStyle = curr.color.rumble;
      
      // Left rumble strip
      c.beginPath();
      c.moveTo(prev.screen.x - prev.screen.w - rumbleW1, prev.screen.y);
      c.lineTo(prev.screen.x - prev.screen.w, prev.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w - rumbleW2, curr.screen.y);
      c.fill();

      // Right rumble strip
      c.beginPath();
      c.moveTo(prev.screen.x + prev.screen.w, prev.screen.y);
      c.lineTo(prev.screen.x + prev.screen.w + rumbleW1, prev.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w + rumbleW2, curr.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y);
      c.fill();

      // 3. Draw Road body
      c.fillStyle = curr.color.road;
      c.beginPath();
      c.moveTo(prev.screen.x - prev.screen.w, prev.screen.y);
      c.lineTo(prev.screen.x + prev.screen.w, prev.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y);
      c.fill();

      // 4. Draw Center dash lanes
      if (curr.color.lane) {
        c.fillStyle = curr.color.lane;
        const laneW1 = prev.screen.w * 0.015;
        const laneW2 = curr.screen.w * 0.015;
        
        // Loop lanes separators
        for (let lane = 1; lane < LANES; lane++) {
          const laneRatio = (lane / LANES) * 2 - 1; // -0.33, 0.33
          
          c.beginPath();
          c.moveTo(prev.screen.x + prev.screen.w * laneRatio - laneW1, prev.screen.y);
          c.lineTo(prev.screen.x + prev.screen.w * laneRatio + laneW1, prev.screen.y);
          c.lineTo(curr.screen.x + curr.screen.w * laneRatio + laneW2, curr.screen.y);
          c.lineTo(curr.screen.x + curr.screen.w * laneRatio - laneW2, curr.screen.y);
          c.fill();
        }
      }

      // 5. Draw speed boost pads on the road surface
      if (curr.boostPad && curr.boostPad.active) {
        c.fillStyle = COLORS.boostBlue;
        c.shadowColor = COLORS.boostBlue;
        c.shadowBlur = 15;
        const padX1 = curr.screen.x + curr.screen.w * curr.boostPad.x;
        const padW1 = curr.screen.w * 0.15;
        const padH1 = Math.max(3, curr.screen.w * 0.06);

        // Chevron arrow pointing forward
        c.beginPath();
        c.moveTo(padX1 - padW1, curr.screen.y);
        c.lineTo(padX1, curr.screen.y - padH1);
        c.lineTo(padX1 + padW1, curr.screen.y);
        c.lineTo(padX1 + padW1 * 0.4, curr.screen.y);
        c.lineTo(padX1, curr.screen.y - padH1 * 0.4);
        c.lineTo(padX1 - padW1 * 0.4, curr.screen.y);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
      }

      c.restore();

      // 6. Draw AI cars driving in front of player
      // We check if an AI car is located on this Z segment
      const curZ = curr.index * SEGMENT_LENGTH;
      for (const car of this.aiCars) {
        if (Math.abs(car.z - curZ) < SEGMENT_LENGTH / 2) {
          this.drawAICar(c, curr, car);
        }
      }

      // 7. Draw roadside scenery objects (billboards, lights, palms)
      for (const sprite of curr.sprites) {
        this.drawRoadsideSprite(c, curr, sprite);
      }
    }
  }

  private drawRoadsideSprite(
    c: CanvasRenderingContext2D,
    seg: Segment,
    sprite: SpriteInfo
  ) {
    const sx = seg.screen.x + seg.screen.w * sprite.x;
    const sy = seg.screen.y;
    
    // Scale sprite dimension with perspective
    const width = sprite.width * seg.screen.scale * (this.canvas.width / 2);
    const height = sprite.height * seg.screen.scale * (this.canvas.height / 2);

    if (width <= 0 || height <= 0) return;

    c.save();
    c.translate(sx, sy);

    if (sprite.type === 'palm') {
      // Draw neon cyber palm tree
      c.shadowColor = sprite.color;
      c.shadowBlur = 15;
      c.fillStyle = '#110022';
      c.strokeStyle = sprite.color;
      c.lineWidth = 2;

      // Trunk
      c.beginPath();
      c.moveTo(-width * 0.1, 0);
      c.quadraticCurveTo(-width * 0.05, -height * 0.5, 0, -height);
      c.lineTo(width * 0.05, -height);
      c.quadraticCurveTo(width * 0.05, -height * 0.5, width * 0.1, 0);
      c.closePath();
      c.fill();
      c.stroke();

      // Leaves (neon arcs)
      c.fillStyle = sprite.color;
      const leaves = 5;
      for (let i = 0; i < leaves; i++) {
        const angle = (i / (leaves - 1)) * Math.PI - Math.PI; // -180 to 0 deg
        c.beginPath();
        c.moveTo(0, -height);
        c.quadraticCurveTo(
          Math.cos(angle) * width * 0.6,
          -height + Math.sin(angle) * height * 0.25,
          Math.cos(angle) * width * 0.9,
          -height + Math.sin(angle) * height * 0.1 - 20
        );
        c.lineTo(0, -height);
        c.stroke();
      }
    } 
    else if (sprite.type === 'light') {
      // Neon street light pole
      c.strokeStyle = '#00f0ff';
      c.lineWidth = 2.5;
      c.beginPath();
      // Pole
      c.moveTo(0, 0);
      c.lineTo(0, -height * 0.9);
      // Arm reaching road
      const reach = sprite.x > 0 ? -width * 0.8 : width * 0.8;
      c.lineTo(reach, -height);
      c.stroke();

      // Light beam polygon
      const beamGrad = c.createLinearGradient(reach, -height, reach, 0);
      beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
      beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      c.fillStyle = beamGrad;
      c.beginPath();
      c.moveTo(reach, -height);
      c.lineTo(reach - width * 0.5, 0);
      c.lineTo(reach + width * 0.5, 0);
      c.closePath();
      c.fill();
    } 
    else if (sprite.type === 'gate') {
      // Large overhead Cyber Arch Gate spanning the road
      c.shadowColor = sprite.color;
      c.shadowBlur = 20;
      c.strokeStyle = sprite.color;
      c.lineWidth = 4;
      c.fillStyle = 'rgba(255, 0, 240, 0.05)';

      // Gate outline
      c.beginPath();
      c.moveTo(-width * 0.5, 0);
      c.lineTo(-width * 0.45, -height);
      c.lineTo(width * 0.45, -height);
      c.lineTo(width * 0.5, 0);
      c.stroke();

      // Inner glow panel
      c.beginPath();
      c.moveTo(-width * 0.45, 0);
      c.lineTo(-width * 0.41, -height * 0.9);
      c.lineTo(width * 0.41, -height * 0.9);
      c.lineTo(width * 0.45, 0);
      c.closePath();
      c.fill();

      // "NEXUS" sign on checkpoint gate
      if (sprite.color === '#00f0ff') {
        c.font = `bold ${Math.max(8, Math.floor(18 * seg.screen.scale * 3))}px "Orbitron", sans-serif`;
        c.fillStyle = '#fff';
        c.shadowColor = '#fff';
        c.shadowBlur = 10;
        c.textAlign = 'center';
        c.fillText("NEXUS DRIVE", 0, -height * 0.93);
      }
    }
    else if (sprite.type === 'sign_checkpoint') {
      // Neon Checkpoint overhead Banner
      c.shadowColor = sprite.color;
      c.shadowBlur = 25;
      c.strokeStyle = sprite.color;
      c.lineWidth = 4;
      c.fillStyle = 'rgba(0,0,0,0.8)';

      c.beginPath();
      c.moveTo(-width * 0.5, 0);
      c.lineTo(-width * 0.45, -height);
      c.lineTo(width * 0.45, -height);
      c.lineTo(width * 0.5, 0);
      c.stroke();

      // Header board
      c.fillStyle = '#110022';
      c.fillRect(-width * 0.35, -height * 0.9, width * 0.7, height * 0.25);
      c.strokeRect(-width * 0.35, -height * 0.9, width * 0.7, height * 0.25);

      c.fillStyle = '#00f0ff';
      c.font = `bold ${Math.max(10, Math.floor(22 * seg.screen.scale * 4))}px "Orbitron", sans-serif`;
      c.textAlign = 'center';
      c.fillText("CHECKPOINT", 0, -height * 0.73);
    }
    else if (sprite.type === 'barrier') {
      // Red hazard barrier cones
      c.fillStyle = '#110022';
      c.strokeStyle = '#ff3333';
      c.lineWidth = 2.5;
      c.shadowColor = '#ff3333';
      c.shadowBlur = 15;

      c.beginPath();
      c.moveTo(-width * 0.5, 0);
      c.lineTo(-width * 0.3, -height);
      c.lineTo(width * 0.3, -height);
      c.lineTo(width * 0.5, 0);
      c.closePath();
      c.fill();
      c.stroke();

      // Hazard stripes
      c.fillStyle = '#ff3333';
      c.fillRect(-width * 0.2, -height * 0.7, width * 0.4, height * 0.15);
      c.fillRect(-width * 0.3, -height * 0.35, width * 0.6, height * 0.15);
    }

    c.restore();
  }

  private drawAICar(
    c: CanvasRenderingContext2D,
    seg: Segment,
    car: AICar
  ) {
    const scale = seg.screen.scale;
    const sx = seg.screen.x + seg.screen.w * car.x;
    const sy = seg.screen.y;

    const width = car.width * scale * (this.canvas.width / 2);
    const height = car.height * scale * (this.canvas.height / 2);

    if (width <= 0 || height <= 0) return;

    c.save();
    c.translate(sx, sy);

    c.shadowColor = car.color;
    c.shadowBlur = 15;
    c.fillStyle = '#0f001b';
    c.strokeStyle = car.color;
    c.lineWidth = 2;

    // Drawing AI car chassis vector box
    c.beginPath();
    c.moveTo(-width * 0.5, 0);
    c.lineTo(-width * 0.45, -height * 0.5);
    c.lineTo(-width * 0.35, -height * 0.95);
    c.lineTo(width * 0.35, -height * 0.95);
    c.lineTo(width * 0.45, -height * 0.5);
    c.lineTo(width * 0.5, 0);
    c.closePath();
    c.fill();
    c.stroke();

    // Spoiler
    c.fillStyle = car.color;
    c.fillRect(-width * 0.52, -height * 1.1, width * 1.04, height * 0.15);

    // Glowing Neon Tail Lights
    c.fillStyle = COLORS.carTailRed;
    c.shadowColor = COLORS.carTailRed;
    c.shadowBlur = 8;
    c.fillRect(-width * 0.4, -height * 0.42, width * 0.22, height * 0.15);
    c.fillRect(width * 0.18, -height * 0.42, width * 0.22, height * 0.15);

    // Hover exhaust grid
    c.fillStyle = car.color;
    c.fillRect(-width * 0.12, -height * 0.25, width * 0.24, height * 0.1);

    c.restore();
  }

  private drawPlayerCar(c: CanvasRenderingContext2D, w: number, h: number) {
    c.save();

    // Center player car at bottom of screen
    const carX = w / 2;
    const carY = h - 35;
    
    // Add small rumble wiggle based on speed
    const rumble = (Math.random() - 0.5) * (this.playerSpeed / this.maxSpeed) * 2.5;

    c.translate(carX + rumble, carY);

    // Steering tilt calculation
    const isSteeringLeft = this.keys['ArrowLeft'] || this.keys['KeyA'] || (this.touchSteer < -0.2);
    const isSteeringRight = this.keys['ArrowRight'] || this.keys['KeyD'] || (this.touchSteer > 0.2);
    
    let rollAngle = 0;
    if (isSteeringLeft) rollAngle = -0.06;
    if (isSteeringRight) rollAngle = 0.06;

    c.rotate(rollAngle);

    // Scale sizing of player car
    const width = 230;
    const height = 110;

    const isBraking = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touchBrake;
    const isBoosting = this.boostTimer > 0;
    const neonTheme = isBoosting ? '#00f0ff' : '#ff00f0';

    c.shadowColor = neonTheme;
    c.shadowBlur = 25;
    c.fillStyle = '#080010';
    c.strokeStyle = neonTheme;
    c.lineWidth = 3.5;

    // Outer premium cyber car vector chassis (DeLorean / Countach style)
    c.beginPath();
    c.moveTo(-width * 0.48, 0); // Bottom-left wheel arch
    c.lineTo(-width * 0.44, -height * 0.45); // Left flank
    c.lineTo(-width * 0.33, -height * 0.85); // Left windshield column
    c.lineTo(-width * 0.18, -height * 0.98); // Left roof
    c.lineTo(width * 0.18, -height * 0.98);  // Right roof
    c.lineTo(width * 0.33, -height * 0.85);  // Right windshield column
    c.lineTo(width * 0.44, -height * 0.45);  // Right flank
    c.lineTo(width * 0.48, 0);  // Bottom-right wheel arch
    c.closePath();
    c.fill();
    c.stroke();

    // Spoiler wings
    c.fillStyle = '#0c001a';
    c.beginPath();
    c.moveTo(-width * 0.51, -height * 0.9);
    c.lineTo(-width * 0.51, -height * 1.05);
    c.lineTo(width * 0.51, -height * 1.05);
    c.lineTo(width * 0.51, -height * 0.9);
    c.closePath();
    c.fill();
    c.stroke();

    // Windshield screen (tinted glass look)
    c.fillStyle = 'rgba(0, 240, 255, 0.15)';
    c.beginPath();
    c.moveTo(-width * 0.28, -height * 0.5);
    c.lineTo(-width * 0.2, -height * 0.8);
    c.lineTo(width * 0.2, -height * 0.8);
    c.lineTo(width * 0.28, -height * 0.5);
    c.closePath();
    c.fill();
    c.stroke();

    // Neon glowing license plate board
    c.fillStyle = COLORS.sunYellow;
    c.shadowColor = COLORS.sunYellow;
    c.shadowBlur = 10;
    c.fillRect(-width * 0.08, -height * 0.22, width * 0.16, height * 0.12);

    c.fillStyle = '#000';
    c.font = 'bold 8px "Orbitron", sans-serif';
    c.textAlign = 'center';
    c.fillText("NEXUS", 0, -height * 0.13);

    // Glowing Neon Tail lights (Bright red or intense neon red when braking)
    const tailGlowColor = isBraking ? '#ff0000' : '#ff4444';
    c.fillStyle = tailGlowColor;
    c.shadowColor = tailGlowColor;
    c.shadowBlur = isBraking ? 25 : 12;

    // Left Tail light bar
    c.fillRect(-width * 0.42, -height * 0.45, width * 0.25, height * 0.12);
    // Right Tail light bar
    c.fillRect(width * 0.17, -height * 0.45, width * 0.25, height * 0.12);

    // Cyber hover wheels
    c.fillStyle = '#110022';
    c.strokeStyle = neonTheme;
    c.lineWidth = 2;
    c.shadowBlur = 0;
    c.fillRect(-width * 0.48, -height * 0.15, width * 0.09, height * 0.35); // Left wheel
    c.fillRect(width * 0.39, -height * 0.15, width * 0.09, height * 0.35);  // Right wheel

    c.restore();
  }
}
