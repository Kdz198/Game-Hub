import { GameLoop } from "../../engine/GameLoop";
import { AudioSynth } from "../../utils/AudioSynth";

/* ── Types ──────────────────────────────────────────────────────── */

interface SpriteInfo {
  x: number; // Offset from road center
  type: 'palm' | 'light' | 'gate' | 'barrier' | 'sign_checkpoint' | 'building' | 'pole';
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
const CAMERA_HEIGHT = 900;  // Height of camera above road (lowered for a fast 3D chase perspective)
const CAMERA_DEPTH = 0.85;   // Scale factor (FOV helper)
const TRACK_SEGMENTS = 800; // Total track length in segments
const GAME_DURATION = 40;   // Initial time limit (seconds)

// Colors palette (Midnight / realistic night theme)
const COLORS = {
  skyDark: '#010003',
  skyLight: '#03020c',
  sunGold: '#060414',
  sunYellow: '#b8c5e0',
  gridLine: 'rgba(255, 0, 240, 0.01)',
  roadDark: '#05050a',
  roadLight: '#080810',
  grassDark: '#010102',
  grassLight: '#010104',
  rumbleCyan: '#2d3345', // dark steel slate
  rumblePink: '#232838', // dark steel slate
  laneLine: 'rgba(255, 255, 255, 0.08)', // faint white reflect line
  carTailRed: '#d1152a',
  carTailAmber: '#cc7a00',
  boostBlue: '#4fa1d9',
};

/* ── Grid Rider Game Engine ─────────────────────────────────────── */

export class GridRiderGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;

  // Game metrics (UI bindable)
  public score = 0;
  public bestScore = 0;
  public timeElapsed = 0;
  public shield = 100;
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
  public onShield?: (shield: number) => void;
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
  private maxSpeed = 9000; // Z units per second (slightly reduced for better control)
  private accel = 3800;      // Acceleration Z units / s^2 (smoother build-up)
  private decel = -3000;     // Natural deceleration / braking
  private offRoadDrag = -9000; // High friction off-road
  private offRoadLimit = 2500;  // Max speed allowed off-road

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

  // Touch overlays buttons configuration (used on mobile)
  private touchSteer = 0; // -1 to 1 (left to right)
  private touchAccel = false;
  private touchBrake = false;
  private playerRumble = 0;
  private lastLeftPole: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private lastRightPole: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private playerDX = 0;
  private rollAngle = 0;
  private rollVelocity = 0;
  private yawAngle = 0;
  private isDrifting = false;
  private driftDirection = 0;
  private visualCarX = 0;
  private pitchY = 0;

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
          // 1. Towering buildings corridor: place a building every 12 segments on both sides to create separate skyscrapers
          if (index % 12 === 0) {
            const leftColor = index % 36 === 0 ? '#1f3c6d' : (index % 36 === 12 ? '#16354d' : '#224a56');
            const rightColor = index % 36 === 0 ? '#224a56' : (index % 36 === 12 ? '#1f3c6d' : '#16354d');
            
            segment.sprites.push({
              x: -2.8, // Situated in the background
              type: 'building',
              width: 1200 + (Math.sin(index) * 200),
              height: 4500 + (Math.cos(index * 2) * 1500),
              color: leftColor,
            });
            segment.sprites.push({
              x: 2.8, // Situated in the background
              type: 'building',
              width: 1200 + (Math.cos(index) * 200),
              height: 4500 + (Math.sin(index * 2) * 1500),
              color: rightColor,
            });
          }

          // 2. Neon lampposts placed every 12 segments
          if (index % 12 === 6) {
            segment.sprites.push({
              x: index % 24 === 6 ? -1.35 : 1.35,
              type: 'light',
              width: 100,
              height: 420,
              color: '#ffe070', // warm yellow streetlights
            });
          }

          // 3. Telephone poles placed every 16 segments
          if (index % 16 === 0) {
            segment.sprites.push({
              x: -1.75, // in front of buildings, outside guardrail
              type: 'pole',
              width: 90,
              height: 500,
              color: '#1a1424',
            });
            segment.sprites.push({
              x: 1.75, // in front of buildings, outside guardrail
              type: 'pole',
              width: 90,
              height: 500,
              color: '#1a1424',
            });
          }
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
    const count = 5;
    for (let i = 0; i < count; i++) {
      // Spread them across the track starting from segment 80
      const segIndex = 80 + Math.floor(Math.random() * (this.segments.length - 150));
      this.aiCars.push({
        id: i,
        x: (Math.random() - 0.5) * 1.4, // Lane offset
        z: segIndex * SEGMENT_LENGTH,
        speed: 1200 + Math.random() * 1000, // Speed in world units (chilling slow traffic)
        color: i % 3 === 0 ? '#2a446c' : (i % 3 === 1 ? '#3c3f4a' : '#1b2a22'),
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
    this.timeElapsed = 0;
    this.shield = 100;
    this.playerX = 0;
    this.playerDX = 0;
    this.rollAngle = 0;
    this.rollVelocity = 0;
    this.playerZ = 0;
    this.playerSpeed = 0;
    this.speed = 0;
    this.distance = 0;
    this.isGameOver = false;
    this.isCompleted = false;
    this.gameTime = 0;
    this.checkpointIndex = 1;
    this.screenFlash = 0;
    this.shakeTime = 0;
    this.backgroundOffset = 0;
    this.skyOffset = 0;
    this.particles = [];
    this.yawAngle = 0;
    this.isDrifting = false;
    this.driftDirection = 0;
    this.visualCarX = 0;
    this.pitchY = 0;
    
    this.spawnAICars();

    if (this.onScore) this.onScore(0);
    if (this.onTime) this.onTime(0);
    if (this.onShield) this.onShield(100);
    if (this.onSpeed) this.onSpeed(0);
    if (this.onDistance) this.onDistance(0);
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

    if (this.isGameOver || this.isCompleted) {
      // Minimal updates
      this.playerSpeed *= 0.95;
      this.speed = Math.floor(this.playerSpeed * (180 / this.maxSpeed));
      if (this.onSpeed) this.onSpeed(this.speed);
      this.updateParticles(dtSec);
      return;
    }

    // Time counts up for endless runner
    this.timeElapsed += dtSec;
    if (this.onTime) this.onTime(this.timeElapsed);

    // Get track segment at current position
    const playerSegmentIndex = Math.floor(this.playerZ / SEGMENT_LENGTH);
    const playerSeg = this.segments[playerSegmentIndex % this.segments.length];
    const isOffRoad = Math.abs(this.playerX) > 1.0;

    // Read steering, accelerate, brake, handbrake keys
    const steerLeft = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touchSteer < -0.2;
    const steerRight = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touchSteer > 0.2;
    const accelerate = this.keys['ArrowUp'] || this.keys['KeyW'] || this.touchAccel;
    const brake = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touchBrake;
    const handbrake = this.keys['Space'];

    const speedPct = this.playerSpeed / this.maxSpeed;

    // 1. Handbrake & Drifting Logic (GTA style)
    // Drift initiates when handbrake is held while steering at decent speed
    if (handbrake && speedPct > 0.22 && (steerLeft || steerRight)) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDirection = steerLeft ? -1 : 1;
      }
    }

    // Stop drifting if speed drops too low or we aren't steering/handbraking
    if (this.isDrifting) {
      if (speedPct < 0.12 || (!steerLeft && !steerRight && !handbrake)) {
        this.isDrifting = false;
        this.driftDirection = 0;
      }
    }

    // 2. Steering Grip & Quán tính đánh lái (GTA style responsive grip & slide)
    // Đánh lái phụ thuộc vào vận tốc hiện tại (không thể lái khi đứng yên)
    let steerResponse = 0;
    if (speedPct > 0.05) {
      steerResponse = Math.min(1.0, speedPct * 2.0); // starts scaling up
      if (speedPct > 0.65) {
        steerResponse = 1.0 - (speedPct - 0.65) * 1.85; // heavy understeer at max speed for downforce stability
        steerResponse = Math.max(0.35, steerResponse);
      }
    }

    // Steering is more violent/rapid when drifting (slides rear out), heavier under normal drive
    const steerPower = this.isDrifting ? 8.5 * steerResponse : 4.6 * steerResponse;

    if (steerLeft) {
      this.playerDX -= steerPower * dtSec * (this.touchSteer < -0.2 ? Math.abs(this.touchSteer) : 1);
    } else if (steerRight) {
      this.playerDX += steerPower * dtSec * (this.touchSteer > 0.2 ? this.touchSteer : 1);
    } else {
      // Xe tự động bám đường và trả lái về tâm nhanh gọn khi nhả nút
      // Damping is lower, so the car slides sideways or rebounds heavily/smoothly (GTA boat feel)
      const centerDamping = this.isDrifting ? 1.8 : (isOffRoad ? 3.0 : 6.0);
      this.playerDX += (0 - this.playerDX) * centerDamping * dtSec;
    }

    // Lực ly tâm của khúc cua kéo xe ra làn ngoài
    const curveForce = playerSeg.curve * 2.8 * speedPct;
    this.playerDX -= curveForce * dtSec;

    // Giới hạn vận tốc ngang tối đa (slightly wider range for drift slide)
    const maxDX = this.isDrifting ? 2.2 : 1.8;
    this.playerDX = Math.max(-maxDX, Math.min(this.playerDX, maxDX));

    // Cập nhật vị trí ngang
    this.playerX += this.playerDX * dtSec;

    // 3. Vật lý Hộ Lan phản lực (Va chạm nảy ngược lại và sụt giáp)
    if (Math.abs(this.playerX) > 1.15) {
      this.playerX = this.playerX > 0 ? 1.14 : -1.14;
      this.playerDX = -this.playerDX * 0.45; // Nảy ngược vào trong
      this.triggerCrash(); // Trừ giáp, gầm rú âm thanh và rung lắc
    }

    // 4. Hệ thống treo vật lý lò xo - giảm chấn (Spring-Damper) cho góc nghiêng (GTA style body sway)
    const targetRoll = -this.playerDX * 0.075; // Leans opposite to slide/movement due to centrifugal force
    const rollSpring = 135.0; // Spring stiffness
    const rollDamping = 11.5; // Shock damper
    const rollAcc = (targetRoll - this.rollAngle) * rollSpring - this.rollVelocity * rollDamping;
    this.rollVelocity += rollAcc * dtSec;
    this.rollAngle += this.rollVelocity * dtSec;

    // Update visual yaw angle for camera perspective (larger angle when drifting)
    const targetYaw = this.isDrifting ? this.driftDirection * 0.22 : this.playerDX * 0.07;
    this.yawAngle += (targetYaw - this.yawAngle) * (this.isDrifting ? 6.0 : 12.0) * dtSec;

    // Camera trailing lag on screen
    const targetVisualCarX = this.playerDX * 48; // Shift up to 86px left/right
    this.visualCarX += (targetVisualCarX - this.visualCarX) * 4.5 * dtSec;

    // Suspension pitch (nose-dive on brakes, tail-squat on accel)
    const isBraking = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touchBrake;
    const isAccelerating = this.keys['ArrowUp'] || this.keys['KeyW'] || this.touchAccel;
    const targetPitchY = (isBraking || handbrake) ? 4.0 : (isAccelerating ? -3.0 : 0);
    this.pitchY += (targetPitchY - this.pitchY) * 8.0 * dtSec;

    // 5. Bức tốc động cơ (Torque Curve) & Lực cản gió khí động học (Wind Drag)
    const currentMaxSpeed = isOffRoad ? this.offRoadLimit : this.maxSpeed;

    // Torque curve: Động cơ tăng tốc khỏe ở dải tua thấp, đuối dần ở dải tốc cao (Bức tốc từ từ)
    const torqueFactor = Math.max(0.25, 1.0 - (this.playerSpeed / this.maxSpeed) * 0.75);
    const engineForce = this.accel * torqueFactor;

    // Lực cản lăn tuyến tính + lực cản gió tăng theo hàm bình phương tốc độ
    const rollingFriction = this.playerSpeed * 0.25;
    const windDrag = Math.pow(this.playerSpeed, 2) * 0.000045;

    // Brake / deceleration calculations
    if (accelerate) {
      this.playerSpeed += (engineForce - rollingFriction - windDrag) * dtSec;
    } else if (brake || handbrake) {
      const brakeForce = handbrake ? this.decel * 1.5 : this.decel * 2.0; // handbrake slides, brake stops
      this.playerSpeed += brakeForce * dtSec;
    } else {
      // Trôi tự do chịu ma sát lăn và cản gió
      this.playerSpeed += (this.decel * 0.4 - rollingFriction - windDrag) * dtSec;
    }

    // Ma sát off-road kéo phanh phụ thêm
    if (isOffRoad && this.playerSpeed > this.offRoadLimit) {
      this.playerSpeed += this.offRoadDrag * dtSec;
    }

    // Giới hạn tốc độ theo làn đường hiện tại
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

    // Loop track silently (no checkpoints)
    if (this.playerZ >= this.trackLength) {
      this.playerZ -= this.trackLength;
      this.checkpointIndex = 1;
    }

    // Parallax backgrounds offsets
    this.backgroundOffset += playerSeg.curve * 0.05 * speedPct;
    this.skyOffset += playerSeg.curve * 0.01 * speedPct;

    // Update particles (exhaust fires & drift smoke)
    this.updateParticles(dtSec);
    if (this.playerSpeed > 100 && Math.random() < 0.35) {
      this.spawnExhaustParticles();
    }
    if (this.isDrifting && Math.random() < 0.6) {
      this.spawnDriftSmoke();
    }

    // Update AI cars
    this.updateAICars(dtSec);

    // Check collisions
    this.checkCollisions(playerSeg);
  }

  private triggerCheckpoint(msg: string) {
    this.shield = Math.min(100, this.shield + 25);
    this.audio.playMilestone();
    this.screenFlash = 0.25;
    if (this.onShield) this.onShield(this.shield);
    if (this.onCheckpoint) this.onCheckpoint(msg);
  }

  private spawnExhaustParticles() {
    // Left/right exhausts position offsets relative to player's center
    const tilt = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touchSteer < -0.2 ? -15 : (this.keys['ArrowRight'] || this.keys['KeyD'] || this.touchSteer > 0.2 ? 15 : 0);
    
    // Aligned to new car design dimensions (width = 240, height = 110, carY = h - 110)
    // Exhaust ports are at +/- 0.2 * width = +/- 48px, Y is h - 110 - 13 = h - 123
    const leftOffset = -48 + tilt * 0.3;
    const rightOffset = 48 + tilt * 0.3;

    const baseColor = 'rgba(75, 65, 90, 0.45)'; // soft grey-purple exhaust smoke
    const spawnY = this.canvas.height - 123 + this.pitchY;

    // Spawn exhaust left
    this.particles.push({
      x: this.canvas.width / 2 + this.visualCarX + leftOffset + (Math.random() - 0.5) * 6,
      y: spawnY,
      vx: (Math.random() - 0.5) * 1.0 + (tilt * -0.03),
      vy: Math.random() * 1.2 + 0.6,
      size: Math.random() * 3.5 + 1.5,
      color: baseColor,
      life: 0.35,
    });

    // Spawn exhaust right
    this.particles.push({
      x: this.canvas.width / 2 + this.visualCarX + rightOffset + (Math.random() - 0.5) * 6,
      y: spawnY,
      vx: (Math.random() - 0.5) * 1.0 + (tilt * -0.03),
      vy: Math.random() * 1.2 + 0.6,
      size: Math.random() * 3.5 + 1.5,
      color: baseColor,
      life: 0.35,
    });
  }

  private spawnDriftSmoke() {
    const spawnY = this.canvas.height - 110 + this.pitchY;
    // Left and right tire offsets (rear wheels)
    const leftOffset = -80;
    const rightOffset = 80;
    
    // Spawn smoke & sparks left
    this.particles.push({
      x: this.canvas.width / 2 + this.visualCarX + leftOffset + (Math.random() - 0.5) * 15,
      y: spawnY + 15,
      vx: (Math.random() - 0.5) * 2 - this.playerDX * 3,
      vy: Math.random() * 2 + 1,
      size: Math.random() * 8 + 4,
      color: 'rgba(220, 220, 230, 0.45)', // white/grey tire smoke
      life: 0.4,
    });
    if (Math.random() < 0.45) {
      this.particles.push({
        x: this.canvas.width / 2 + this.visualCarX + leftOffset + (Math.random() - 0.5) * 8,
        y: spawnY + 15,
        vx: (Math.random() - 0.5) * 4 - this.playerDX * 5,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 2.5 + 1.2,
        color: Math.random() < 0.5 ? '#ffaa00' : '#ff3300', // orange/red friction sparks
        life: 0.28,
      });
    }
    
    // Spawn smoke & sparks right
    this.particles.push({
      x: this.canvas.width / 2 + this.visualCarX + rightOffset + (Math.random() - 0.5) * 15,
      y: spawnY + 15,
      vx: (Math.random() - 0.5) * 2 - this.playerDX * 3,
      vy: Math.random() * 2 + 1,
      size: Math.random() * 8 + 4,
      color: 'rgba(220, 220, 230, 0.45)',
      life: 0.4,
    });
    if (Math.random() < 0.45) {
      this.particles.push({
        x: this.canvas.width / 2 + this.visualCarX + rightOffset + (Math.random() - 0.5) * 8,
        y: spawnY + 15,
        vx: (Math.random() - 0.5) * 4 - this.playerDX * 5,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 2.5 + 1.2,
        color: Math.random() < 0.5 ? '#ffaa00' : '#ff3300',
        life: 0.28,
      });
    }
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
    for (const car of this.aiCars) {
      // Calculate Z distance taking loop wrap-around into account
      let carZ = car.z;
      if (carZ < this.playerZ - this.trackLength / 2) {
        carZ += this.trackLength;
      } else if (carZ > this.playerZ + this.trackLength / 2) {
        carZ -= this.trackLength;
      }

      const zDiff = Math.abs(this.playerZ - carZ);
      if (zDiff < 140) {
        // Side offset overlap (tightened threshold to 0.26 to prevent side-swiping adjacent lanes)
        const xDiff = Math.abs(this.playerX - car.x);
        if (xDiff < 0.26) {
          // Crash!
          this.triggerCrash();
          // Bounce car away
          if (this.playerX > car.x) {
            this.playerX = car.x + 0.28;
          } else {
            this.playerX = car.x - 0.28;
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
      
      let segZ = seg.index * SEGMENT_LENGTH;
      // Calculate Z distance taking loop wrap-around into account
      if (segZ < this.playerZ - this.trackLength / 2) {
        segZ += this.trackLength;
      } else if (segZ > this.playerZ + this.trackLength / 2) {
        segZ -= this.trackLength;
      }

      const zDiff = Math.abs(this.playerZ - segZ);

      if (zDiff < 120) {
        for (const sprite of seg.sprites) {
          if (sprite.type === 'barrier') {
            // Side offset overlap (tightened threshold to 0.22 to fix invisible collisions)
            const xDiff = Math.abs(this.playerX - sprite.x);
            if (xDiff < 0.22) {
              this.triggerCrash();
              this.playerX += this.playerX > sprite.x ? 0.24 : -0.24;
            }
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

    // Keep shield at 100
    this.shield = 100;
    if (this.onShield) this.onShield(this.shield);
    
    // Negative visual feedback (centered on new car y-level)
    this.particles.push({
      x: this.canvas.width / 2 + (Math.random() - 0.5) * 50,
      y: this.canvas.height - 120,
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

    // Calculate consistent player rumble for both reflections and car rendering
    this.playerRumble = (Math.random() - 0.5) * (this.playerSpeed / this.maxSpeed) * 2.5;

    // Apply Screen Shake & High-Speed Vibration
    c.save();
    let totalShakeX = 0;
    let totalShakeY = 0;
    if (this.shakeTime > 0) {
      totalShakeX += (Math.random() - 0.5) * this.shakeMag;
      totalShakeY += (Math.random() - 0.5) * this.shakeMag;
    }
    const speedPct = this.playerSpeed / this.maxSpeed;
    if (speedPct > 0.65) {
      // High-frequency speed vibration
      const vib = (speedPct - 0.65) * 1.8;
      totalShakeX += (Math.random() - 0.5) * vib;
      totalShakeY += (Math.random() - 0.5) * vib;
    }
    if (totalShakeX !== 0 || totalShakeY !== 0) {
      c.translate(totalShakeX, totalShakeY);
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

    // 5. Draw screen flashing (red crash overlay)
    if (this.screenFlash > 0) {
      c.save();
      c.fillStyle = `rgba(255, 51, 51, ${this.screenFlash * 0.35})`; // damage red flash
      c.fillRect(0, 0, w, h);
      c.restore();
    }

    c.restore();
  }

  private drawSky(c: CanvasRenderingContext2D, w: number, h: number) {
    const horizon = h / 2;

    // 1. Midnight sky gradient (dark and easy on the eyes)
    const skyGrad = c.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, '#030108'); // pitch black top
    skyGrad.addColorStop(0.6, '#08041c'); // midnight blue middle
    skyGrad.addColorStop(1, '#180d38'); // deep indigo-purple horizon glow
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, w, horizon);

    // 2. Faint twinkling stars in the night sky
    c.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let i = 0; i < 60; i++) {
      const starX = (Math.sin(i * 321.45) * 0.5 + 0.5) * w;
      const starY = (Math.cos(i * 123.78) * 0.5 + 0.5) * (horizon - 25);
      const twinkle = 0.3 + Math.sin(this.gameTime * 2 + i) * 0.25;
      c.globalAlpha = twinkle;
      c.fillRect(starX, starY, 1.2, 1.2);
    }
    c.globalAlpha = 1.0;

    // 3. Painterly thin dark wispy night clouds
    c.save();
    c.globalAlpha = 0.06;
    c.fillStyle = '#6c4fa1';
    for (let i = 0; i < 3; i++) {
      const cy = horizon * 0.3 + i * horizon * 0.12;
      const cx = ((w * 0.15 + i * w * 0.3) - this.skyOffset * w * 0.05) % w;
      c.beginPath();
      c.ellipse(cx, cy, w * 0.22, horizon * 0.05, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // 4. Drawing the silver crescent moon in the upper-left
    c.save();
    const moonX = w / 2 - 200 - (this.playerX * 10);
    const moonY = horizon - 150;
    const moonRadius = 35;

    // Moon body with soft cyan/blue glow
    c.shadowColor = '#5c8aff';
    c.shadowBlur = 25;
    c.fillStyle = '#e8f0ff';
    c.beginPath();
    c.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    c.fill();

    // Cut out circle to create crescent effect (colored with midnight sky color)
    c.shadowBlur = 0;
    c.fillStyle = '#050212'; // matches middle sky gradient stop
    c.beginPath();
    c.arc(moonX + 11, moonY - 5, moonRadius, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Draw grid horizon line (extremely soft, deep purple haze)
    c.save();
    c.strokeStyle = 'rgba(120, 100, 255, 0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, horizon);
    c.lineTo(w, horizon);
    c.stroke();
    c.restore();
  }

  private drawRoadAndAssets(c: CanvasRenderingContext2D, w: number, h: number) {
    const horizon = h / 2;
    const playerSegmentIndex = Math.floor(this.playerZ / SEGMENT_LENGTH);
    const playerPercent = (this.playerZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerSeg = this.segments[playerSegmentIndex % this.segments.length];
    const playerY = playerSeg.world.y + playerPercent * playerSeg.hill;

    this.lastLeftPole = null;
    this.lastRightPole = null;

    let dx = 0;
    let segmentCurveAccum = 0;

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
      dx += segmentCurveAccum;

      // Project to 2D
      const px = w / 2 + (seg.world.x - this.playerX * ROAD_WIDTH + dx) * scale * (w / 2);
      // Dynamic camera height: camera drops closer to the road at high speed, flattening perspective and emphasizing speed
      const speedPct = this.playerSpeed / this.maxSpeed;
      const dynamicCameraHeight = CAMERA_HEIGHT - (speedPct * 180);
      const py = horizon - (seg.world.y - playerY - dynamicCameraHeight) * scale * (h / 2);
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
      
      // 1. Draw Grass/Glow outer area (shaded city ground)
      c.fillStyle = curr.color.grass;
      c.beginPath();
      c.moveTo(0, prev.screen.y);
      c.lineTo(w, prev.screen.y);
      c.lineTo(w, curr.screen.y);
      c.lineTo(0, curr.screen.y);
      c.fill();

      // 2. Draw 3D metallic guardrails (concrete/barrier walls)
      // Guardrail height in world units: 140
      const H_prev = 140 * prev.screen.scale * (h / 2);
      const H_curr = 140 * curr.screen.scale * (h / 2);

      const isAlternate = Math.floor(curr.index / 3) % 2 === 0;
      
      // Left guardrail face (facing road)
      c.fillStyle = isAlternate ? '#1a1a24' : '#22222f';
      c.beginPath();
      c.moveTo(prev.screen.x - prev.screen.w, prev.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y - H_curr);
      c.lineTo(prev.screen.x - prev.screen.w, prev.screen.y - H_prev);
      c.closePath();
      c.fill();

      // Left guardrail top highlight (reflecting orange sunset)
      c.strokeStyle = curr.color.rumble; // Use the rumble color which is orange/red
      c.lineWidth = Math.max(1.5, 3.5 * curr.screen.scale * (w / 2) * 0.05);
      c.beginPath();
      c.moveTo(prev.screen.x - prev.screen.w, prev.screen.y - H_prev);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y - H_curr);
      c.stroke();

      // Left guardrail vertical seam to show speed
      c.strokeStyle = '#0e0e13';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(curr.screen.x - curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x - curr.screen.w, curr.screen.y - H_curr);
      c.stroke();

      // Right guardrail face (facing road)
      c.fillStyle = isAlternate ? '#1a1a24' : '#22222f';
      c.beginPath();
      c.moveTo(prev.screen.x + prev.screen.w, prev.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y - H_curr);
      c.lineTo(prev.screen.x + prev.screen.w, prev.screen.y - H_prev);
      c.closePath();
      c.fill();

      // Right guardrail top highlight (reflecting orange sunset)
      c.strokeStyle = curr.color.rumble;
      c.lineWidth = Math.max(1.5, 3.5 * curr.screen.scale * (w / 2) * 0.05);
      c.beginPath();
      c.moveTo(prev.screen.x + prev.screen.w, prev.screen.y - H_prev);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y - H_curr);
      c.stroke();

      // Right guardrail vertical seam
      c.strokeStyle = '#0e0e13';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(curr.screen.x + curr.screen.w, curr.screen.y);
      c.lineTo(curr.screen.x + curr.screen.w, curr.screen.y - H_curr);
      c.stroke();

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

      c.restore();

      // Get pz again to cull close sprites/AI cars that go out of field of view
      const zOffset = (playerSegmentIndex + i >= this.segments.length) ? this.trackLength : 0;
      const pz = curr.world.z + zOffset - this.playerZ;

      if (pz >= 300) {
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

    // DRAW WET ROAD REFLECTIONS
    c.save();
    c.globalCompositeOperation = 'screen';

    // 1. Streetlight reflections
    for (let i = 1; i < DRAW_DISTANCE - 1; i++) {
      const idx = (playerSegmentIndex + i) % this.segments.length;
      const seg = this.segments[idx];
      if (!segmentVisible[i]) continue;

      for (const sprite of seg.sprites) {
        if (sprite.type === 'light') {
          // Calculate screen position of light base
          const lx = seg.screen.x + seg.screen.w * sprite.x;
          const ly = seg.screen.y;
          
          // Width of reflection (proportional to segment width)
          const refW = Math.max(15, seg.screen.w * 0.12);

          const grad = c.createLinearGradient(lx, ly, lx, h);
          grad.addColorStop(0, 'rgba(255, 220, 100, 0.10)');
          grad.addColorStop(0.3, 'rgba(255, 220, 100, 0.03)');
          grad.addColorStop(1, 'rgba(255, 220, 100, 0)');
          
          c.fillStyle = grad;
          c.fillRect(lx - refW / 2, ly, refW, h - ly);
        }
      }
    }

    // 2. AI Car reflections
    const curPlayerZ = this.playerZ;
    for (const car of this.aiCars) {
      // Find Z distance relative to player
      let carZ = car.z;
      if (carZ < curPlayerZ - this.trackLength / 2) carZ += this.trackLength;
      else if (carZ > curPlayerZ + this.trackLength / 2) carZ -= this.trackLength;

      const zDiff = carZ - curPlayerZ;
      if (zDiff > 0 && zDiff < DRAW_DISTANCE * SEGMENT_LENGTH) {
        // Project car coordinates
        const scale = CAMERA_DEPTH / zDiff;
        if (scale > 0) {
          const visualSegIdx = Math.floor(zDiff / SEGMENT_LENGTH);
          if (visualSegIdx > 0 && visualSegIdx < DRAW_DISTANCE) {
            const roadSeg = this.segments[(playerSegmentIndex + visualSegIdx) % this.segments.length];
            const sx = roadSeg.screen.x + roadSeg.screen.w * car.x;
            const sy = roadSeg.screen.y;
            const width = car.width * scale * (w / 2);

            const leftLightX = sx - width * 0.33;
            const rightLightX = sx + width * 0.33;
            const refW = Math.max(8, width * 0.15);

            // Left tail light reflection
            const leftGrad = c.createLinearGradient(leftLightX, sy, leftLightX, h);
            leftGrad.addColorStop(0, 'rgba(209, 21, 42, 0.25)');
            leftGrad.addColorStop(0.4, 'rgba(209, 21, 42, 0.05)');
            leftGrad.addColorStop(1, 'rgba(209, 21, 42, 0)');
            c.fillStyle = leftGrad;
            c.fillRect(leftLightX - refW / 2, sy, refW, h - sy);

            // Right tail light reflection
            const rightGrad = c.createLinearGradient(rightLightX, sy, rightLightX, h);
            rightGrad.addColorStop(0, 'rgba(209, 21, 42, 0.25)');
            rightGrad.addColorStop(0.4, 'rgba(209, 21, 42, 0.05)');
            rightGrad.addColorStop(1, 'rgba(209, 21, 42, 0)');
            c.fillStyle = rightGrad;
            c.fillRect(rightLightX - refW / 2, sy, refW, h - sy);
          }
        }
      }
    }

    // 3. Player Car Reflections (drawn stretching from carY to screen bottom)
    const pLeftX = w / 2 + this.playerRumble + this.visualCarX - 80;
    const pRightX = w / 2 + this.playerRumble + this.visualCarX + 80;
    const pRefW = 24;
    const carY = h - 110 + this.pitchY;

    const pLeftGrad = c.createLinearGradient(pLeftX, carY, pLeftX, h);
    pLeftGrad.addColorStop(0, 'rgba(209, 21, 42, 0.35)');
    pLeftGrad.addColorStop(0.5, 'rgba(209, 21, 42, 0.10)');
    pLeftGrad.addColorStop(1, 'rgba(209, 21, 42, 0)');
    c.fillStyle = pLeftGrad;
    c.fillRect(pLeftX - pRefW / 2, carY, pRefW, h - carY);

    const pRightGrad = c.createLinearGradient(pRightX, carY, pRightX, h);
    pRightGrad.addColorStop(0, 'rgba(209, 21, 42, 0.35)');
    pRightGrad.addColorStop(0.5, 'rgba(209, 21, 42, 0.10)');
    pRightGrad.addColorStop(1, 'rgba(209, 21, 42, 0)');
    c.fillStyle = pRightGrad;
    c.fillRect(pRightX - pRefW / 2, carY, pRefW, h - carY);

    c.restore();
  }

  private drawRoadsideSprite(
    c: CanvasRenderingContext2D,
    seg: Segment,
    sprite: SpriteInfo
  ) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sx = seg.screen.x + seg.screen.w * sprite.x;
    const sy = seg.screen.y;
    
    // Scale sprite dimension with perspective
    const width = sprite.width * seg.screen.scale * (w / 2);
    const height = sprite.height * seg.screen.scale * (h / 2);

    if (width <= 0 || height <= 0) return;

    if (sprite.type === 'building') {
      // Draw 3D neon cyber building/skyscraper corridor with perspective depth
      c.save();
      const leftSide = sprite.x < 0;
      
      const frontIndex = (seg.index - 6 + this.segments.length) % this.segments.length;
      let frontSeg = this.segments[frontIndex];
      
      // If the front segment has outdated or invalid scale, mock it
      if (frontSeg.screen.scale <= seg.screen.scale) {
        frontSeg = {
          ...seg,
          screen: {
            x: seg.screen.x,
            y: this.canvas.height + 100,
            w: seg.screen.w * 1.6,
            scale: seg.screen.scale * 1.6
          }
        };
      }
      
      const scale_back = seg.screen.scale;
      const scale_front = frontSeg.screen.scale;
      
      const xOffset = sprite.x;
      const buildingWidth = sprite.width;
      const buildingHeight = sprite.height;
      const screenW = this.canvas.width / 2;
      const screenH = this.canvas.height / 2;
      
      // Back Face base points
      const x_back_road = seg.screen.x + seg.screen.w * xOffset;
      const y_back_road = seg.screen.y;
      
      // Front Face base points
      const x_front_road = frontSeg.screen.x + frontSeg.screen.w * xOffset;
      const y_front_road = frontSeg.screen.y;
      
      // Outer points
      const outer_factor = leftSide ? -1 : 1;
      const x_back_outer = x_back_road + outer_factor * buildingWidth * scale_back * screenW;
      const x_front_outer = x_front_road + outer_factor * buildingWidth * scale_front * screenW;
      
      // Roof height points
      const y_back_roof = y_back_road - buildingHeight * scale_back * screenH;
      const y_front_roof = y_front_road - buildingHeight * scale_front * screenH;
      
      const strokeColor = sprite.color;
      
      // 1. Draw SIDE WALL (facing the road, going into perspective)
      c.fillStyle = '#090510';
      c.strokeStyle = strokeColor;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x_front_road, y_front_road);
      c.lineTo(x_back_road, y_back_road);
      c.lineTo(x_back_road, y_back_roof);
      c.lineTo(x_front_road, y_front_roof);
      c.closePath();
      c.fill();
      c.stroke();
      
      // Draw window grid on the side wall (perspective rows)
      c.fillStyle = 'rgba(240, 210, 140, 0.18)'; // warm soft amber windows
      c.shadowBlur = 0;
      
      const rows = 6;
      const cols = 5;
      for (let r = 0; r < rows; r++) {
        const rRatio = (r + 0.5) / rows;
        const y_front_w = y_front_roof + (y_front_road - y_front_roof) * rRatio;
        const y_back_w = y_back_roof + (y_back_road - y_back_roof) * rRatio;
        
        for (let col = 0; col < cols; col++) {
          const colRatio = (col + 0.5) / cols;
          const wx = x_front_road + (x_back_road - x_front_road) * colRatio;
          const wy = y_front_w + (y_back_w - y_front_w) * colRatio;
          
          const wScale = scale_front + (scale_back - scale_front) * colRatio;
          const winSizeW = Math.max(2.5, 45 * wScale * screenW * 0.15);
          const winSizeH = Math.max(3.5, 70 * wScale * screenH * 0.15);
          
          const litSeed = Math.sin(sprite.width + r * 17 + col * 23) * 0.5 + 0.5;
          if (litSeed > 0.45 && winSizeW > 1.5) {
            c.fillRect(wx - winSizeW/2, wy - winSizeH/2, winSizeW, winSizeH);
          }
        }
      }
      c.shadowBlur = 0;
      
      // 2. Draw FRONT FACE (facing the player)
      const frontGrad = c.createLinearGradient(x_front_outer, 0, x_front_road, 0);
      frontGrad.addColorStop(0, '#0e0a1a');
      frontGrad.addColorStop(1, '#06040e');
      c.fillStyle = frontGrad;
      
      c.beginPath();
      c.moveTo(x_front_outer, y_front_road);
      c.lineTo(x_front_road, y_front_road);
      c.lineTo(x_front_road, y_front_roof);
      c.lineTo(x_front_outer, y_front_roof);
      c.closePath();
      c.fill();
      c.stroke();
      
      // Draw window grid on the front face
      c.fillStyle = 'rgba(170, 200, 240, 0.15)'; // cool soft blue-grey windows
      c.shadowBlur = 0;
      
      for (let r = 0; r < rows; r++) {
        const rRatio = (r + 0.5) / rows;
        const wy = y_front_roof + (y_front_road - y_front_roof) * rRatio;
        const winSizeH = Math.max(3.0, 50 * scale_front * screenH * 0.15);
        
        for (let col = 0; col < 3; col++) {
          const colRatio = (col + 0.5) / 3;
          const wx = x_front_outer + (x_front_road - x_front_outer) * colRatio;
          const winSizeW = Math.max(3.0, 50 * scale_front * screenW * 0.15);
          
          const litSeed = Math.sin(sprite.height + r * 13 + col * 29) * 0.5 + 0.5;
          if (litSeed > 0.5 && winSizeW > 1.5) {
            c.fillRect(wx - winSizeW/2, wy - winSizeH/2, winSizeW, winSizeH);
          }
        }
      }
      c.shadowBlur = 0;
      
      // 3. Draw ROOF
      c.fillStyle = '#05030a';
      c.beginPath();
      c.moveTo(x_front_outer, y_front_roof);
      c.lineTo(x_front_road, y_front_roof);
      c.lineTo(x_back_road, y_back_roof);
      c.lineTo(x_back_outer, y_back_roof);
      c.closePath();
      c.fill();
      c.stroke();
      
      // Roof accent neon line
      c.strokeStyle = strokeColor;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x_front_outer, y_front_roof);
      c.lineTo(x_front_road, y_front_roof);
      c.stroke();
      
      // Draw neon antenna on some buildings
      const hasAntenna = (sprite.width % 3 === 0);
      if (hasAntenna) {
        c.strokeStyle = strokeColor;
        c.lineWidth = 1.5;
        const antX = x_front_outer + (x_front_road - x_front_outer) * 0.5;
        const antY = y_front_roof;
        const antH = buildingHeight * scale_front * screenH * 0.15;
        
        c.beginPath();
        c.moveTo(antX, antY);
        c.lineTo(antX, antY - antH);
        c.stroke();
        
        c.fillStyle = '#ff3333';
        c.shadowColor = '#ff3333';
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(antX, antY - antH, 3, 0, Math.PI * 2);
        c.fill();
      }
      
      c.restore();
    }
    else {
      // Translated draw for lampposts, poles, and billboards
      c.save();
      c.translate(sx, sy);
      
      if (sprite.type === 'light') {
        c.strokeStyle = '#1b122b';
        c.lineWidth = Math.max(1.5, 3.5 * seg.screen.scale * (w / 2) * 0.04);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -height * 0.95);
        const reach = sprite.x > 0 ? -width * 0.8 : width * 0.8;
        c.lineTo(reach, -height);
        c.stroke();

        // Light fixture bulb
        c.fillStyle = '#ffe030';
        c.shadowColor = '#ffe030';
        c.shadowBlur = 12;
        c.beginPath();
        c.arc(reach, -height, Math.max(2, 4 * seg.screen.scale * (w / 2) * 0.03), 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;

        // Glowing light cone
        const beamGrad = c.createLinearGradient(reach, -height, reach, 0);
        beamGrad.addColorStop(0, 'rgba(255, 224, 48, 0.26)');
        beamGrad.addColorStop(1, 'rgba(255, 224, 48, 0)');
        c.fillStyle = beamGrad;
        c.beginPath();
        c.moveTo(reach, -height);
        c.lineTo(reach - width * 0.5, 0);
        c.lineTo(reach + width * 0.5, 0);
        c.closePath();
        c.fill();
      }
      else if (sprite.type === 'pole') {
        const tx1 = sx - width * 0.45;
        const ty1 = sy - height * 0.82;
        const tx2 = sx + width * 0.45;
        const ty2 = sy - height * 0.82;

        const isLeft = sprite.x < 0;
        const lastPole = isLeft ? this.lastLeftPole : this.lastRightPole;

        if (lastPole) {
          c.restore(); // Escape translated space
          c.save(); // Save root space
          
          c.strokeStyle = 'rgba(23, 11, 43, 0.45)';
          c.lineWidth = Math.max(0.6, 1.2 * seg.screen.scale);
          
          // Wire 1: outer tip
          c.beginPath();
          c.moveTo(lastPole.x1, lastPole.y1);
          const midX1 = (lastPole.x1 + tx1) / 2;
          const midY1 = (lastPole.y1 + ty1) / 2 + 10 * seg.screen.scale * (h / 2) * 0.25;
          c.quadraticCurveTo(midX1, midY1, tx1, ty1);
          c.stroke();

          // Wire 2: inner tip
          c.beginPath();
          c.moveTo(lastPole.x2, lastPole.y2);
          const midX2 = (lastPole.x2 + tx2) / 2;
          const midY2 = (lastPole.y2 + ty2) / 2 + 10 * seg.screen.scale * (h / 2) * 0.25;
          c.quadraticCurveTo(midX2, midY2, tx2, ty2);
          c.stroke();
          
          c.restore(); // Restore root
          c.save(); // Re-save root
          c.translate(sx, sy); // Re-translate
        }

        if (isLeft) {
          this.lastLeftPole = { x1: tx1, y1: ty1, x2: tx2, y2: ty2 };
        } else {
          this.lastRightPole = { x1: tx1, y1: ty1, x2: tx2, y2: ty2 };
        }

        // Draw the local pole (in translated space)
        c.fillStyle = '#0a0614';
        c.strokeStyle = '#150f24';
        c.lineWidth = 1;

        // Vertical pole
        c.fillRect(-width * 0.08, -height, width * 0.16, height);
        c.strokeRect(-width * 0.08, -height, width * 0.16, height);

        // Lower crossarm
        c.fillRect(-width * 0.5, -height * 0.85, width, height * 0.05);
        c.strokeRect(-width * 0.5, -height * 0.85, width, height * 0.05);

        // Upper crossarm
        c.fillRect(-width * 0.5, -height * 0.96, width, height * 0.05);
        c.strokeRect(-width * 0.5, -height * 0.96, width, height * 0.05);

        // insulations (pegs)
        c.fillStyle = '#1c152b';
        c.fillRect(-width * 0.47, -height * 0.89, width * 0.06, height * 0.04);
        c.fillRect(width * 0.41, -height * 0.89, width * 0.06, height * 0.04);
        c.fillRect(-width * 0.47, -height * 1.0, width * 0.06, height * 0.04);
        c.fillRect(width * 0.41, -height * 1.0, width * 0.06, height * 0.04);
      }
      else if (sprite.type === 'sign_checkpoint') {
        c.save();
        const leftSide = sprite.x < 0;
        
        c.fillStyle = '#110022';
        c.strokeStyle = sprite.color;
        c.lineWidth = 3;
        c.shadowColor = sprite.color;
        c.shadowBlur = 15;
        
        const wWidth = width * 0.6;
        const wHeight = height * 0.4;
        const bx = leftSide ? -wWidth : 0;
        
        c.beginPath();
        c.moveTo(bx + wWidth / 2, 0);
        c.lineTo(bx + wWidth / 2, -height);
        c.stroke();
        
        c.fillRect(bx, -height, wWidth, wHeight);
        c.strokeRect(bx, -height, wWidth, wHeight);
        
        c.fillStyle = '#ffffff';
        c.shadowColor = '#ffffff';
        c.shadowBlur = 6;
        c.font = `bold ${Math.max(6, Math.floor(14 * seg.screen.scale * 3.5))}px "Orbitron", sans-serif`;
        c.textAlign = 'center';
        c.fillText("CHECK", bx + wWidth / 2, -height + wHeight * 0.45);
        c.fillText("POINT", bx + wWidth / 2, -height + wHeight * 0.85);
        
        c.restore();
      }
      
      c.restore();
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

    const neonTheme = car.color;

    let paintDark = '#08080c';
    let paintMid = '#14141c';
    
    if (neonTheme === '#2a446c') {
      paintDark = '#0e1b2f';
      paintMid = '#1c3456';
    } else if (neonTheme === '#3c3f4a') {
      paintDark = '#181a20';
      paintMid = '#2b2e36';
    } else if (neonTheme === '#1b2a22') {
      paintDark = '#0a120f';
      paintMid = '#121f19';
    }

    const bodyGrad = c.createLinearGradient(0, -height, 0, 0);
    bodyGrad.addColorStop(0, paintMid);
    bodyGrad.addColorStop(0.5, paintDark);
    bodyGrad.addColorStop(1, '#05050a');

    // 0. Soft Ground Shadow
    c.fillStyle = 'rgba(0, 0, 0, 0.65)';
    c.beginPath();
    c.ellipse(0, height * 0.08, width * 0.44, height * 0.08, 0, 0, Math.PI * 2);
    c.fill();

    // 1. Rear Tires (with negative camber and scrolling treads)
    const tireW = width * 0.12;
    const tireH = height * 0.32;
    const rimAngle = (car.z * 0.045) % (Math.PI * 2);

    // Left Tire
    c.save();
    c.translate(-width * 0.38, height * 0.08);
    c.rotate(0.04); // negative camber angle tilt inwards
    c.fillStyle = '#06020c';
    c.fillRect(-tireW / 2, -tireH / 2, tireW, tireH);
    
    // Scrolling treads
    c.strokeStyle = '#121217';
    c.lineWidth = 1.5;
    c.beginPath();
    const treadSpacing = 8;
    const treadScroll = (car.z * 0.05) % treadSpacing;
    for (let offset = -tireH / 2 - treadSpacing + treadScroll; offset < tireH / 2; offset += treadSpacing) {
      c.moveTo(-tireW / 2, offset);
      c.lineTo(tireW / 2, offset);
    }
    c.stroke();

    // Rim
    c.save();
    c.rotate(rimAngle);
    c.strokeStyle = '#32323d';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(0, 0, tireW * 0.35, 0, Math.PI * 2);
    c.stroke();
    // 5-spoke wheels
    c.strokeStyle = '#5a5d66';
    c.lineWidth = 2.0;
    for (let s = 0; s < 5; s++) {
      const angle = (s * Math.PI * 2) / 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle) * tireW * 0.33, Math.sin(angle) * tireW * 0.33);
      c.stroke();
    }
    c.restore();
    c.restore();

    // Right Tire
    c.save();
    c.translate(width * 0.38, height * 0.08);
    c.rotate(-0.04); // negative camber angle tilt inwards
    c.fillStyle = '#06020c';
    c.fillRect(-tireW / 2, -tireH / 2, tireW, tireH);
    
    // Scrolling treads
    c.strokeStyle = '#121217';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let offset = -tireH / 2 - treadSpacing + treadScroll; offset < tireH / 2; offset += treadSpacing) {
      c.moveTo(-tireW / 2, offset);
      c.lineTo(tireW / 2, offset);
    }
    c.stroke();

    // Rim
    c.save();
    c.rotate(rimAngle);
    c.strokeStyle = '#32323d';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(0, 0, tireW * 0.35, 0, Math.PI * 2);
    c.stroke();
    // 5-spoke wheels
    c.strokeStyle = '#5a5d66';
    c.lineWidth = 2.0;
    for (let s = 0; s < 5; s++) {
      const angle = (s * Math.PI * 2) / 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle) * tireW * 0.33, Math.sin(angle) * tireW * 0.33);
      c.stroke();
    }
    c.restore();
    c.restore();

    // 2. Diffuser Fins
    c.fillStyle = '#020005';
    c.fillRect(-width * 0.2, 0, width * 0.4, height * 0.1);
    c.fillStyle = '#ff3344';
    c.fillRect(-width * 0.1, 0, 1.5, height * 0.1);
    c.fillRect(width * 0.1, 0, 1.5, height * 0.1);

    // 3. Main Bumper Panel (detailed with carbon mesh)
    c.fillStyle = bodyGrad;
    c.strokeStyle = '#181822';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-width * 0.44, 0);
    c.lineTo(-width * 0.42, -height * 0.4);
    c.lineTo(width * 0.42, -height * 0.4);
    c.lineTo(width * 0.44, 0);
    c.closePath();
    c.fill();
    c.stroke();

    // 4. Upper Cabin Shell
    c.fillStyle = '#0e0a16';
    c.beginPath();
    c.moveTo(-width * 0.37, -height * 0.4);
    c.lineTo(-width * 0.24, -height * 0.84);
    c.lineTo(width * 0.24, -height * 0.84);
    c.lineTo(width * 0.37, -height * 0.4);
    c.closePath();
    c.fill();
    c.stroke();

    // Windshield glass screen
    c.fillStyle = 'rgba(255, 255, 255, 0.06)';
    c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-width * 0.24, -height * 0.46);
    c.lineTo(-width * 0.18, -height * 0.76);
    c.lineTo(width * 0.18, -height * 0.76);
    c.lineTo(width * 0.24, -height * 0.46);
    c.closePath();
    c.fill();
    c.stroke();

    // Louver lines
    c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 1; i <= 3; i++) {
      const hRatio = 0.4 + (i * 0.1);
      const wRatio = 0.37 - (i * 0.04);
      c.beginPath();
      c.moveTo(-width * wRatio, -height * hRatio);
      c.lineTo(width * wRatio, -height * hRatio);
      c.stroke();
    }

    // 5. Dual Brackets Spoiler
    c.fillStyle = '#06060c';
    c.beginPath();
    c.moveTo(-width * 0.39, -height * 0.4);
    c.lineTo(-width * 0.41, -height * 0.9);
    c.lineTo(-width * 0.34, -height * 0.9);
    c.lineTo(-width * 0.34, -height * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(width * 0.34, -height * 0.4);
    c.lineTo(width * 0.34, -height * 0.9);
    c.lineTo(width * 0.41, -height * 0.9);
    c.lineTo(width * 0.39, -height * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
    // Spoiler blade
    c.fillRect(-width * 0.45, -height * 0.98, width * 0.9, height * 0.1);
    c.strokeRect(-width * 0.45, -height * 0.98, width * 0.9, height * 0.1);

    // 6. Glowing LED Tail Lights Bar (always red tail lights for realism)
    c.fillStyle = '#03010a';
    c.fillRect(-width * 0.39, -height * 0.35, width * 0.78, height * 0.12);
    c.strokeRect(-width * 0.39, -height * 0.35, width * 0.78, height * 0.12);
    
    c.fillStyle = '#ff1133';
    c.shadowColor = '#ff1133';
    c.shadowBlur = 10;
    c.fillRect(-width * 0.36, -height * 0.32, width * 0.72, height * 0.05);

    // 7. Glowing License Plate
    c.fillStyle = '#fff01f';
    c.fillRect(-width * 0.07, -height * 0.19, width * 0.14, height * 0.1);
    c.fillStyle = '#000';
    c.font = `bold ${Math.max(4, Math.floor(7 * scale * 2))}px "Orbitron", sans-serif`;
    c.textAlign = 'center';
    c.fillText("CPU", 0, -height * 0.12);

    // 8. Exhaust circles
    c.shadowBlur = 0;
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(-width * 0.2, -height * 0.09, 3.5, 0, Math.PI * 2);
    c.arc(width * 0.2, -height * 0.09, 3.5, 0, Math.PI * 2);
    c.fill();

    // exhaust glow interior
    c.fillStyle = '#ff5500';
    c.beginPath();
    c.arc(-width * 0.2, -height * 0.09, 1.5, 0, Math.PI * 2);
    c.arc(width * 0.2, -height * 0.09, 1.5, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  private drawPlayerCar(c: CanvasRenderingContext2D, w: number, h: number) {
    c.save();

    // Center player car sitting nicely on the road
    const carX = w / 2;
    const carY = h - 110; 
    
    // Apply camera trailing lag (visualCarX) and suspension pitch (pitchY)
    c.translate(carX + this.playerRumble + this.visualCarX, carY + this.pitchY);

    // Combined roll (suspension) and yaw (pointing) rotation
    c.rotate(this.rollAngle + this.yawAngle);

    // Supercar dimensions
    const width = 240;
    const height = 110;

    const isBraking = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touchBrake;
    const handbrake = this.keys['Space'];
    const cabinXOffset = this.playerDX * 14; // 3D perspective shift

    // 0. Soft Ground Shadow (grounds the car, removes "floating" look)
    c.fillStyle = 'rgba(0, 0, 0, 0.7)';
    c.beginPath();
    c.ellipse(0, 10, width * 0.46, 12, 0, 0, Math.PI * 2);
    c.fill();

    // 1. Wide Rear Tires (with negative camber, alloy rims, and scrolling treads)
    const tireW = width * 0.13;
    const tireH = height * 0.36;
    const rimAngle = (this.playerZ * 0.04) % (Math.PI * 2);
    const treadSpacing = 10;
    const treadScroll = (this.playerZ * 0.06) % treadSpacing;

    // Left Tire
    c.save();
    c.translate(-width * 0.395, height * 0.08);
    c.rotate(0.045); // negative camber angle tilt inwards (/ )
    c.fillStyle = '#06060a';
    c.fillRect(-tireW / 2, -tireH / 2, tireW, tireH);

    // Speed-Rolling Tire Treads (scrolling)
    c.strokeStyle = '#121217';
    c.lineWidth = 2;
    c.beginPath();
    for (let offset = -tireH / 2 - treadSpacing + treadScroll; offset < tireH / 2; offset += treadSpacing) {
      c.moveTo(-tireW / 2, offset);
      c.lineTo(tireW / 2, offset);
    }
    c.stroke();

    // Tire side profiles for 3D realism
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(-tireW / 2, -tireH / 2, 3, tireH);
    c.fillRect(tireW / 2 - 3, -tireH / 2, 3, tireH);

    // Brake Rotor
    c.fillStyle = '#222326';
    c.beginPath();
    c.arc(0, 0, tireW * 0.44, 0, Math.PI * 2);
    c.fill();

    // Glowing Brake Discs if braking
    if (isBraking || handbrake) {
      c.save();
      c.shadowColor = '#ff5500';
      c.shadowBlur = 15;
      c.strokeStyle = '#ff6600';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, tireW * 0.38, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // Brake Caliper (red block)
    c.fillStyle = '#dd0c18';
    c.beginPath();
    c.arc(0, 0, tireW * 0.44, -Math.PI * 0.4, -Math.PI * 0.1);
    c.lineWidth = 4;
    c.strokeStyle = '#dd0c18';
    c.stroke();

    // Alloy Rim spokes (spinning!)
    c.save();
    c.rotate(rimAngle);

    // Rim outer ring
    c.strokeStyle = '#5a5e66';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, tireW * 0.36, 0, Math.PI * 2);
    c.stroke();

    // Spokes (5-spoke design)
    c.strokeStyle = '#8a8e98';
    c.lineWidth = 3.5;
    for (let s = 0; s < 5; s++) {
      const angle = (s * Math.PI * 2) / 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle) * tireW * 0.34, Math.sin(angle) * tireW * 0.34);
      c.stroke();

      // Double spoke details
      c.strokeStyle = '#3a3d45';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle + 0.15) * tireW * 0.32, Math.sin(angle + 0.15) * tireW * 0.32);
      c.stroke();
      c.strokeStyle = '#8a8e98';
      c.lineWidth = 3.5;
    }

    // Center rim hub cap
    c.fillStyle = '#181a20';
    c.strokeStyle = '#5a5e66';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, 4, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    c.restore();
    c.restore();

    // Right Tire
    c.save();
    c.translate(width * 0.395, height * 0.08);
    c.rotate(-0.045); // negative camber angle tilt inwards ( \ )
    c.fillStyle = '#06060a';
    c.fillRect(-tireW / 2, -tireH / 2, tireW, tireH);

    // Speed-Rolling Tire Treads (scrolling)
    c.strokeStyle = '#121217';
    c.lineWidth = 2;
    c.beginPath();
    for (let offset = -tireH / 2 - treadSpacing + treadScroll; offset < tireH / 2; offset += treadSpacing) {
      c.moveTo(-tireW / 2, offset);
      c.lineTo(tireW / 2, offset);
    }
    c.stroke();

    // Tire side profiles
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(-tireW / 2, -tireH / 2, 3, tireH);
    c.fillRect(tireW / 2 - 3, -tireH / 2, 3, tireH);

    // Brake Rotor
    c.fillStyle = '#222326';
    c.beginPath();
    c.arc(0, 0, tireW * 0.44, 0, Math.PI * 2);
    c.fill();

    // Glowing Brake Discs if braking
    if (isBraking || handbrake) {
      c.save();
      c.shadowColor = '#ff5500';
      c.shadowBlur = 15;
      c.strokeStyle = '#ff6600';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, tireW * 0.38, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // Brake Caliper
    c.fillStyle = '#dd0c18';
    c.beginPath();
    c.arc(0, 0, tireW * 0.44, Math.PI * 1.1, Math.PI * 1.4);
    c.lineWidth = 4;
    c.strokeStyle = '#dd0c18';
    c.stroke();

    // Alloy Rim spokes (spinning!)
    c.save();
    c.rotate(rimAngle);

    // Rim outer ring
    c.strokeStyle = '#5a5e66';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, tireW * 0.36, 0, Math.PI * 2);
    c.stroke();

    // Spokes
    c.strokeStyle = '#8a8e98';
    c.lineWidth = 3.5;
    for (let s = 0; s < 5; s++) {
      const angle = (s * Math.PI * 2) / 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle) * tireW * 0.34, Math.sin(angle) * tireW * 0.34);
      c.stroke();

      // Double spoke details
      c.strokeStyle = '#3a3d45';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(angle + 0.15) * tireW * 0.32, Math.sin(angle + 0.15) * tireW * 0.32);
      c.stroke();
      c.strokeStyle = '#8a8e98';
      c.lineWidth = 3.5;
    }

    // Center rim hub cap
    c.fillStyle = '#181a20';
    c.strokeStyle = '#5a5e66';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, 4, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    c.restore();
    c.restore();

    // 2. Carbon Mesh Grille (draw behind exhausts and license plate)
    c.fillStyle = '#0a0a0f';
    c.fillRect(-width * 0.43, -height * 0.38, width * 0.86, height * 0.38);
    // Draw cross-hatch carbon mesh lines
    c.strokeStyle = '#161620';
    c.lineWidth = 1;
    c.beginPath();
    for (let gx = -width * 0.43; gx < width * 0.43; gx += 6) {
      c.moveTo(gx, -height * 0.38);
      c.lineTo(gx + 6, 0);
    }
    for (let gx = -width * 0.43; gx < width * 0.43; gx += 6) {
      c.moveTo(gx, 0);
      c.lineTo(gx + 6, -height * 0.38);
    }
    c.stroke();

    // 3. Lower Bumper Shell / Hips (voluptuous hypercar fender curve)
    const paintGrad = c.createLinearGradient(-width * 0.46, 0, width * 0.46, 0);
    const shinePos = 0.5 - this.playerDX * 0.18;
    const clampedShine = Math.max(0.1, Math.min(0.9, shinePos));
    
    paintGrad.addColorStop(0, '#101525');
    paintGrad.addColorStop(clampedShine - 0.1, '#1b223c');
    paintGrad.addColorStop(clampedShine, '#4e5b88');
    paintGrad.addColorStop(clampedShine + 0.1, '#1b223c');
    paintGrad.addColorStop(1, '#101525');

    c.fillStyle = paintGrad;
    c.strokeStyle = '#08080f';
    c.lineWidth = 2.0;
    c.beginPath();
    c.moveTo(-width * 0.46, 0);
    c.quadraticCurveTo(-width * 0.45, -height * 0.38, -width * 0.41, -height * 0.42);
    c.lineTo(width * 0.41, -height * 0.42);
    c.quadraticCurveTo(width * 0.45, -height * 0.38, width * 0.46, 0);
    c.lineTo(width * 0.28, 0);
    c.lineTo(width * 0.26, -height * 0.12);
    c.lineTo(-width * 0.26, -height * 0.12);
    c.lineTo(-width * 0.28, 0);
    c.closePath();
    c.fill();
    c.stroke();

    // Rear Air Vent openings inside bumper flanks
    c.fillStyle = '#060609';
    c.beginPath();
    c.moveTo(-width * 0.40, -height * 0.08);
    c.lineTo(-width * 0.38, -height * 0.34);
    c.lineTo(-width * 0.30, -height * 0.34);
    c.lineTo(-width * 0.29, -height * 0.08);
    c.closePath();
    c.fill();
    c.stroke();

    c.beginPath();
    c.moveTo(width * 0.40, -height * 0.08);
    c.lineTo(width * 0.38, -height * 0.34);
    c.lineTo(width * 0.30, -height * 0.34);
    c.lineTo(width * 0.29, -height * 0.08);
    c.closePath();
    c.fill();
    c.stroke();

    // 4. Central Carbon Exhaust Panel & Quad Chrome Tips
    c.fillStyle = '#06060a';
    c.fillRect(-width * 0.24, -height * 0.14, width * 0.48, height * 0.14);
    
    c.fillStyle = '#3a3e47';
    c.strokeStyle = '#8a8e98';
    c.lineWidth = 1;
    // Left pair
    c.beginPath(); c.arc(-16, -6, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(-26, -6, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    // Right pair
    c.beginPath(); c.arc(16, -6, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(26, -6, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    
    // Exhaust hollow interior
    c.fillStyle = '#000';
    c.beginPath(); c.arc(-16, -6, 3.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(-26, -6, 3.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(16, -6, 3.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(26, -6, 3.5, 0, Math.PI * 2); c.fill();

    // 5. Recovered Windshield, Cabin Shell & Engine Deck
    c.save();
    c.translate(cabinXOffset, 0);

    const cabinColorGrad = c.createLinearGradient(0, -height * 0.88, 0, -height * 0.42);
    cabinColorGrad.addColorStop(0, '#1a1f33');
    cabinColorGrad.addColorStop(0.5, '#121524');
    cabinColorGrad.addColorStop(1, '#080a10');

    c.fillStyle = cabinColorGrad;
    c.strokeStyle = '#050508';
    c.lineWidth = 1.5;

    c.beginPath();
    c.moveTo(-width * 0.36, -height * 0.42);
    c.quadraticCurveTo(-width * 0.28, -height * 0.72, -width * 0.22, -height * 0.86);
    c.lineTo(width * 0.22, -height * 0.86);
    c.quadraticCurveTo(width * 0.28, -height * 0.72, width * 0.36, -height * 0.42);
    c.closePath();
    c.fill();
    c.stroke();

    // Deep Tinted Glass Windshield (Kính sau)
    c.fillStyle = 'rgba(10, 15, 30, 0.85)';
    c.beginPath();
    c.moveTo(-width * 0.20, -height * 0.46);
    c.lineTo(-width * 0.14, -height * 0.80);
    c.lineTo(width * 0.14, -height * 0.80);
    c.lineTo(width * 0.20, -height * 0.46);
    c.closePath();
    c.fill();
    c.stroke();

    // Windshield diagonal reflection highlights
    const glassReflexGrad = c.createLinearGradient(-width * 0.2, -height * 0.8, width * 0.2, -height * 0.46);
    const glShine = 0.5 + this.playerDX * 0.3;
    glassReflexGrad.addColorStop(Math.max(0, glShine - 0.15), 'rgba(255, 255, 255, 0)');
    glassReflexGrad.addColorStop(Math.max(0, Math.min(1, glShine)), 'rgba(255, 255, 255, 0.14)');
    glassReflexGrad.addColorStop(Math.min(1, glShine + 0.15), 'rgba(255, 255, 255, 0)');
    c.fillStyle = glassReflexGrad;
    c.fill();

    // Engine deck spine / louvers
    c.strokeStyle = '#0a0d14';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -height * 0.42);
    c.lineTo(0, -height * 0.86);
    c.stroke();

    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      const yL = -height * (0.46 + r * 0.1);
      c.beginPath();
      c.moveTo(-width * (0.18 - r * 0.02), yL);
      c.lineTo(width * (0.18 - r * 0.02), yL);
      c.stroke();
    }
    c.restore();

    // 6. Active Rear Wing / Spoiler (Twin Struts + Deploy & Airbrake Pitch)
    const speedPct = this.playerSpeed / this.maxSpeed;
    const isHeavyBraking = (isBraking || handbrake) && speedPct > 0.35;
    const wingRise = speedPct * 24;
    const wingTilt = isHeavyBraking ? 0.24 : 0;

    c.save();
    c.translate(cabinXOffset, -height * 0.85 - wingRise);
    c.rotate(wingTilt);

    // Twin struts
    c.fillStyle = '#0a0a0f';
    c.strokeStyle = '#1d222f';
    c.lineWidth = 1;
    // Left strut
    c.beginPath();
    c.moveTo(-width * 0.22, 0);
    c.lineTo(-width * 0.24, wingRise + 8);
    c.lineTo(-width * 0.18, wingRise + 8);
    c.lineTo(-width * 0.18, 0);
    c.closePath();
    c.fill(); c.stroke();
    // Right strut
    c.beginPath();
    c.moveTo(width * 0.22, 0);
    c.lineTo(width * 0.24, wingRise + 8);
    c.lineTo(width * 0.18, wingRise + 8);
    c.lineTo(width * 0.18, 0);
    c.closePath();
    c.fill(); c.stroke();

    // Spoiler Wing Blade
    const wingGrad = c.createLinearGradient(-width * 0.42, 0, width * 0.42, 0);
    wingGrad.addColorStop(0, '#121624');
    wingGrad.addColorStop(0.5, '#23293f');
    wingGrad.addColorStop(1, '#121624');
    c.fillStyle = wingGrad;
    c.strokeStyle = '#050508';
    c.lineWidth = 1.5;

    c.beginPath();
    c.moveTo(-width * 0.43, -4);
    c.quadraticCurveTo(0, -6, width * 0.43, -4);
    c.lineTo(width * 0.45, -12);
    c.quadraticCurveTo(0, -14, -width * 0.45, -12);
    c.closePath();
    c.fill();
    c.stroke();

    // Endplates
    c.fillStyle = '#080b14';
    c.strokeStyle = '#ff3344';
    c.lineWidth = 1;
    // Left endplate
    c.beginPath();
    c.moveTo(-width * 0.44, -14);
    c.lineTo(-width * 0.45, -2);
    c.lineTo(-width * 0.42, 2);
    c.lineTo(-width * 0.41, -10);
    c.closePath();
    c.fill(); c.stroke();
    // Right endplate
    c.beginPath();
    c.moveTo(width * 0.44, -14);
    c.lineTo(width * 0.45, -2);
    c.lineTo(width * 0.42, 2);
    c.lineTo(width * 0.41, -10);
    c.closePath();
    c.fill(); c.stroke();
    c.restore();

    // 7. LED Tail Lights Cluster (Sleek light bar style like Porsche 911 / Bugatti Chiron)
    const tailGlowColor = isBraking ? '#ff081b' : '#cc0212';
    
    // Tail light housing bar
    c.fillStyle = '#08080d';
    c.strokeStyle = '#181a24';
    c.lineWidth = 1.5;
    c.fillRect(-width * 0.42, -height * 0.38, width * 0.84, height * 0.12);
    c.strokeRect(-width * 0.42, -height * 0.38, width * 0.84, height * 0.12);

    // Inner grille detail in housing
    c.strokeStyle = 'rgba(255, 0, 0, 0.08)';
    c.lineWidth = 1;
    c.beginPath();
    for (let tx = -width * 0.40; tx < width * 0.40; tx += 5) {
      c.moveTo(tx, -height * 0.38);
      c.lineTo(tx, -height * 0.26);
    }
    c.stroke();

    // Central LED light strip
    c.shadowColor = tailGlowColor;
    c.shadowBlur = isBraking ? 25 : 12;
    c.strokeStyle = tailGlowColor;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-width * 0.39, -height * 0.32);
    c.bezierCurveTo(-width * 0.18, -height * 0.34, width * 0.18, -height * 0.34, width * 0.39, -height * 0.32);
    c.stroke();
    c.lineCap = 'butt';
    c.shadowBlur = 0;

    // 8. Glowing License Plate
    c.fillStyle = '#282b35';
    c.fillRect(-width * 0.08, -height * 0.21, width * 0.16, height * 0.11);
    c.strokeStyle = '#1c1e24';
    c.lineWidth = 1;
    c.strokeRect(-width * 0.08, -height * 0.21, width * 0.16, height * 0.11);

    c.fillStyle = '#ffaa00'; // LED light
    c.shadowColor = '#ffaa00';
    c.shadowBlur = 4;
    c.font = 'bold 8px "Orbitron", sans-serif';
    c.textAlign = 'center';
    c.fillText("GTA CHILL", 0, -height * 0.13);
    c.shadowBlur = 0;

    // 9. Body Gloss Highlights
    c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c.lineWidth = 1.0;
    
    // Bumper top crease line
    c.beginPath();
    c.moveTo(-width * 0.43, -height * 0.41);
    c.lineTo(width * 0.43, -height * 0.41);
    c.stroke();
    
    // Bumper bottom lip outline
    c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    c.beginPath();
    c.moveTo(-width * 0.45, -2);
    c.lineTo(-width * 0.25, -1);
    c.moveTo(width * 0.25, -1);
    c.lineTo(width * 0.45, -2);
    c.stroke();

    c.restore();
  }
}
