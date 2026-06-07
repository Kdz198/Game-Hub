import { GameLoop } from "../../engine/GameLoop";
import { InputManager } from "../../engine/InputManager";
import { FlappyRLAgent } from "./FlappyRLAgent";

const INITIAL_PIPE_SPEED = 2.8;
const MAX_PIPE_SPEED = 5.5;
const BASE_GRAVITY = 0.45;
const BASE_JUMP_STRENGTH = -7.2;
const PIPE_SPAWN_RATE = 110; 
const BASE_GAP_SIZE = 185;
const MIN_GAP_SIZE = 140;

export type BirdSkin = 'cyber-swift' | 'laser-phoenix' | 'vector-gold' | 'synth-pulse';

export function drawTriangleShip(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, primary: string, secondary: string, accent: string) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.shadowBlur = 15;
    c.shadowColor = primary;
    c.fillStyle = '#ff007f';
    c.beginPath();
    c.moveTo(-size/2, -size/5);
    c.lineTo(-size * 1.1, 0);
    c.lineTo(-size/2, size/5);
    c.closePath();
    c.fill();
    c.fillStyle = primary;
    c.beginPath();
    c.moveTo(size/2, 0);
    c.lineTo(-size/2, -size/2);
    c.lineTo(-size/3, 0);
    c.lineTo(-size/2, size/2);
    c.closePath();
    c.fill();
    c.strokeStyle = secondary;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(size/4, 0);
    c.lineTo(-size/4, -size/4);
    c.moveTo(size/4, 0);
    c.lineTo(-size/4, size/4);
    c.stroke();
    c.fillStyle = accent;
    c.beginPath();
    c.moveTo(size/4, 0);
    c.lineTo(0, -size/6);
    c.lineTo(-size/6, 0);
    c.lineTo(0, size/6);
    c.closePath();
    c.fill();
    c.restore();
}

export function drawPhoenixShip(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, primary: string, secondary: string, accent: string) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.shadowBlur = 18;
    c.shadowColor = primary;
    c.fillStyle = secondary;
    c.beginPath();
    c.moveTo(-size/2, 0);
    c.lineTo(-size * 1.3, -size/4);
    c.lineTo(-size * 0.9, 0);
    c.lineTo(-size * 1.3, size/4);
    c.closePath();
    c.fill();
    c.fillStyle = primary;
    c.beginPath();
    c.moveTo(size/2, 0);
    c.lineTo(-size/3, -size/3);
    c.lineTo(-size/2, 0);
    c.lineTo(-size/3, size/3);
    c.closePath();
    c.fill();
    c.strokeStyle = primary;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(size/4, -size/2, -size/4, -size * 0.6);
    c.moveTo(0, 0);
    c.quadraticCurveTo(size/4, size/2, -size/4, size * 0.6);
    c.stroke();
    c.fillStyle = secondary;
    c.beginPath();
    c.arc(-size/4, -size * 0.6, 3, 0, Math.PI * 2);
    c.arc(-size/4, size * 0.6, 3, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

export function drawDiskShip(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, primary: string, secondary: string, accent: string) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.shadowBlur = 15;
    c.shadowColor = primary;
    c.strokeStyle = primary;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, size/2.2, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = secondary;
    c.beginPath();
    c.arc(0, 0, size/3.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    let pulseAngle = (Date.now() / 150) % (Math.PI * 2);
    c.beginPath();
    c.arc(Math.cos(pulseAngle) * (size/2.2), Math.sin(pulseAngle) * (size/2.2), 3, 0, Math.PI * 2);
    c.arc(Math.cos(pulseAngle + Math.PI) * (size/2.2), Math.sin(pulseAngle + Math.PI) * (size/2.2), 3, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

export const SKINS_CONFIG: Record<BirdSkin, any> = {
  'cyber-swift': { name: 'CYBER SWIFT', primaryColor: '#00f0ff', secondaryColor: '#ffffff', accentColor: '#0055ff', glowColor: 'rgba(0, 240, 255, 0.8)', thrusterColor: '#ff007f', draw: drawTriangleShip },
  'laser-phoenix': { name: 'LASER PHOENIX', primaryColor: '#ff007f', secondaryColor: '#ffbb00', accentColor: '#7a00ff', glowColor: 'rgba(255, 0, 127, 0.8)', thrusterColor: '#00f0ff', draw: drawPhoenixShip },
  'vector-gold': { name: 'VECTOR GOLD', primaryColor: '#ffd700', secondaryColor: '#ffffff', accentColor: '#ff5500', glowColor: 'rgba(255, 215, 0, 0.8)', thrusterColor: '#ff5500', draw: drawTriangleShip },
  'synth-pulse': { name: 'SYNTH PULSE', primaryColor: '#39ff14', secondaryColor: '#bf55ec', accentColor: '#00e676', glowColor: 'rgba(57, 255, 20, 0.8)', thrusterColor: '#bf55ec', draw: drawDiskShip }
};

class AudioSystem {
    private ctx: AudioContext | null = null;
    public isMuted = false;
    public masterBgmVolume = 1.0;
    public masterVfxVolume = 1.0;
    public bgmAudio: HTMLAudioElement | null = null;
    
    public init() {
        if (!this.ctx && typeof window !== 'undefined') {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.bgmAudio = new Audio('/bgm.mp3');
            this.bgmAudio.loop = true;
            
            const savedBgm = localStorage.getItem('sys_bgm_vol');
            const savedVfx = localStorage.getItem('sys_vfx_vol');
            if (savedBgm) this.masterBgmVolume = parseFloat(savedBgm);
            if (savedVfx) this.masterVfxVolume = parseFloat(savedVfx);
        }
        if (this.ctx?.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public updateBgm(state: 'MENU' | 'PLAYING' | 'PAUSED' | 'COUNTDOWN' | 'GAME_OVER') {
        if (!this.bgmAudio) return;
        if (this.isMuted || this.masterBgmVolume === 0) {
            this.bgmAudio.pause();
            return;
        }
        let targetVol = 0;
        switch (state) {
            case 'MENU': targetVol = 0.6; break;
            case 'PLAYING': targetVol = 1.0; break;
            case 'PAUSED':
            case 'COUNTDOWN': targetVol = 0.3; break;
            case 'GAME_OVER': targetVol = 0.2; break;
        }
        this.bgmAudio.volume = Math.max(0, Math.min(1, targetVol * this.masterBgmVolume));
        if (this.bgmAudio.paused) {
            this.bgmAudio.play().catch(e => console.log("BGM autoplay blocked until interaction"));
        }
    }
    
    public playFlap() {
        if (this.isMuted || !this.ctx || this.masterVfxVolume === 0) return;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.12);
        gainNode.gain.setValueAtTime(0.3 * this.masterVfxVolume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.13);
    }

    public playScore() {
        if (this.isMuted || !this.ctx || this.masterVfxVolume === 0) return;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        osc.type = 'sine';
        const t = this.ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(783.99, t + 0.08);
        gainNode.gain.setValueAtTime(0.15 * this.masterVfxVolume, t);
        gainNode.gain.setValueAtTime(0.15 * this.masterVfxVolume, t + 0.08);
        gainNode.gain.exponentialRampToValueAtTime(0.005, t + 0.25);
        osc.start();
        osc.stop(t + 0.26);
    }

    public playHit() {
        if (this.isMuted || !this.ctx || this.masterVfxVolume === 0) return;
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.4 * this.masterVfxVolume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        noiseNode.start();
        noiseNode.stop(this.ctx.currentTime + 0.26);
    }

    public playGameOver() {
        if (this.isMuted || !this.ctx || this.masterVfxVolume === 0) return;
        const t = this.ctx.currentTime;
        const notes = [293.66, 261.63, 220.00, 174.61];
        notes.forEach((freq, index) => {
            if(!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t + index * 0.15);
            gainNode.gain.setValueAtTime(0.1 * this.masterVfxVolume, t + index * 0.15);
            gainNode.gain.setValueAtTime(0.1 * this.masterVfxVolume, t + index * 0.15 + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.005, t + index * 0.15 + 0.15);
            osc.start(t + index * 0.15);
            osc.stop(t + index * 0.15 + 0.16);
        });
    }
}
export const audioSys = new AudioSystem();

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; color: string;
}

interface Bird {
  y: number; velocity: number; size: number; rotation: number; targetRotation: number;
}

interface Pipe {
  x: number; topHeight: number; bottomHeight: number; width: number; passed: boolean;
  isMoving: boolean; vy: number; minY: number; maxY: number; gapSize: number;
}

export class FlappyBirdGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  private input: InputManager;
  
  private width: number;
  private height: number;
  private groundY: number;
  
  private bird: Bird;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private trail: {x: number, y: number}[] = [];
  
  private score: number = 0;
  private bestScore: number = 0;
  public isGameOver: boolean = false;
  public isStarted: boolean = false;
  public isPaused: boolean = false;
  
  private lastPipeSpawn: number = 0;
  private groundOffset: number = 0;
  private basePipeSpeed: number = INITIAL_PIPE_SPEED;
  private currentSkin: BirdSkin = 'cyber-swift';
  private frameCount: number = 0;
  private screenShakeTime: number = 0;
  private screenShakeIntensity: number = 0;

  private stars: {x: number, y: number, size: number, speed: number, phase: number}[] = [];

  // RL Agent properties
  public isRLTraining = false;
  public isExplorationEnabled = true;
  public autoPlaySpeed = 1;
  public rlAgent?: FlappyRLAgent;
  public onRLStats?: (episode: number, avgScore: number, epsilon: number) => void;
  private rlEpisode = 0;
  private rlScores: number[] = [];
  private rlPrevState: number[] | null = null;
  private rlPrevAction = 0;
  private rlPrevScore = 0;
  private rlStepCount = 0;

  // RL Visualization Data
  public isVisualizing = false;
  public rlLastState: number[] = Array(6).fill(0);
  public rlLastQValues: number[] = [0, 0];
  public rlLastAction = 0;

  public onScore?: (score: number) => void;
  public onGameOver?: (score: number, best: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.groundY = this.height - 80;
    
    this.input = new InputManager(this.canvas);
    this.loop = new GameLoop(this.update.bind(this), this.draw.bind(this));
    
    if (typeof window !== 'undefined') {
      this.bestScore = parseInt(localStorage.getItem('fb_best') || '0');
    }

    this.initStars();
    this.bird = this.getInitialBird();
    this.draw(); 
  }

  private initStars() {
    this.stars = [];
    const totalStars = Math.floor(this.width * 0.1);
    for(let i=0; i<totalStars; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.groundY - 100),
        size: Math.random() * 1.8 + 0.5,
        speed: Math.random() * 0.03 + 0.01,
        phase: Math.random() * Math.PI
      });
    }
  }

  public setSkin(skin: BirdSkin) {
    this.currentSkin = skin;
    if (!this.isStarted && !this.isGameOver) this.draw(); 
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.groundY = this.height - 80;
    this.initStars();
    if (!this.isStarted && !this.isGameOver) this.draw();
  }

  private getInitialBird(): Bird {
    return { y: this.height * 0.45, velocity: 0, size: 28, rotation: 0, targetRotation: 0 };
  }

  public start() {
    audioSys.init();
    this.reset();
    this.isStarted = true;
    this.bird.velocity = BASE_JUMP_STRENGTH;
    if (!(this.isRLTraining && this.autoPlaySpeed >= 2)) {
      audioSys.playFlap();
    }
    this.loop.start();
  }

  public pause() {
    this.isPaused = true;
    this.loop.stop();
  }

  public resume() {
    audioSys.init();
    this.isPaused = false;
    this.loop.start();
  }

  public idle() {
    this.reset();
    this.draw();
  }

  public stop() {
    this.loop.stop();
  }

  public destroy() {
    this.stop();
    this.input.destroy();
  }

  public reset() {
    this.bird = this.getInitialBird();
    this.pipes = [];
    this.particles = [];
    this.trail = [];
    this.score = 0;
    this.frameCount = 0;
    this.basePipeSpeed = INITIAL_PIPE_SPEED;
    this.isGameOver = false;
    this.isStarted = false;
    this.isPaused = false;
    this.lastPipeSpawn = 0;

    // Reset RL training variables
    this.rlPrevState = null;
    this.rlPrevAction = 0;
    this.rlPrevScore = 0;
    this.rlStepCount = 0;

    if (this.onScore) this.onScore(0);
  }

  private createParticle(x: number, y: number, color: string, vx: number, vy: number, size: number, decay: number) {
    this.particles.push({ x, y, vx, vy, size, color, life: 1.0, decay });
  }

  private spawnPipe() {
    const currentGapSize = Math.max(MIN_GAP_SIZE, BASE_GAP_SIZE - Math.floor(this.score / 5) * 5);
    const minHeight = 80;
    const maxHeight = this.groundY - currentGapSize - 80;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight)) + minHeight;

    const isMoving = this.score >= 12;
    const verticalVelocity = isMoving ? (Math.random() > 0.5 ? 1 : -1) * 0.8 : 0;

    this.pipes.push({
        x: this.width,
        topHeight: topHeight,
        bottomHeight: this.height - currentGapSize - topHeight - 80,
        width: 72,
        passed: false,
        isMoving: isMoving,
        vy: verticalVelocity,
        minY: 50,
        maxY: this.height - currentGapSize - 120,
        gapSize: currentGapSize
    });
  }

  private update(deltaTime: number) {
    if (this.isRLTraining) {
      // Run the physics/AI loop autoPlaySpeed times per frame
      for (let step = 0; step < this.autoPlaySpeed; step++) {
        this.updatePhysicsStep(deltaTime);
        if (this.isGameOver) break;
      }
    } else {
      this.updatePhysicsStep(deltaTime);
    }
  }

  private updatePhysicsStep(deltaTime: number) {
    const timeScale = deltaTime / 16.666;
    this.frameCount += timeScale;
    
    const isFast = this.isRLTraining && this.autoPlaySpeed >= 2;

    // Update ground offset for background rendering
    this.groundOffset += this.basePipeSpeed * timeScale;
    if (this.groundOffset >= 35) this.groundOffset -= 35;

    if (this.screenShakeTime > 0) this.screenShakeTime -= timeScale;
    
    // Determine action
    let hasAction = false;
    if (this.isRLTraining && this.rlAgent) {
      this.calculateRLStep();
      hasAction = (this.rlLastAction === 1);
    } else {
      hasAction = this.input.consumeAction();
    }
    
    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * timeScale;
      p.y += p.vy * timeScale;
      p.life -= p.decay * timeScale;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    if (this.isGameOver) return;

    if (!this.isStarted) {
      this.bird.y = this.height / 2 + Math.sin(Date.now() / 300) * 10;
      return;
    }

    this.handleJump(hasAction);
    
    this.bird.velocity += BASE_GRAVITY * timeScale;
    this.bird.y += this.bird.velocity * timeScale;

    if (this.bird.y < this.bird.size) {
        this.bird.y = this.bird.size;
        this.bird.velocity = 0;
    }

    if (this.bird.velocity < 3) {
        this.bird.targetRotation = -0.3;
    } else {
        this.bird.targetRotation = Math.min(Math.PI / 2.5, (this.bird.velocity - 3) * 0.12);
    }
    this.bird.rotation += (this.bird.targetRotation - this.bird.rotation) * 0.15;

    const skin = SKINS_CONFIG[this.currentSkin];
    if (Math.floor(this.frameCount) % 2 === 0) {
        this.trail.push({ x: this.width * 0.22 - 8, y: this.bird.y });
        if (this.trail.length > 8) this.trail.shift();
    }

    if (Math.random() < 0.4) {
        this.createParticle(
            this.width * 0.22 - 12, this.bird.y + (Math.random() * 6 - 3),
            skin.thrusterColor,
            -this.basePipeSpeed - Math.random(), Math.random() * 1 - 0.5,
            Math.random() * 3 + 1, 0.08
        );
    }

    this.lastPipeSpawn += timeScale;
    if (this.lastPipeSpawn > PIPE_SPAWN_RATE) {
      this.spawnPipe();
      this.lastPipeSpawn = 0;
    }

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pipe = this.pipes[i];
      pipe.x -= this.basePipeSpeed * timeScale;

      if (pipe.isMoving) {
          pipe.topHeight += pipe.vy * timeScale;
          if (pipe.topHeight < pipe.minY || pipe.topHeight > pipe.maxY) pipe.vy = -pipe.vy;
          pipe.bottomHeight = this.height - pipe.gapSize - pipe.topHeight - 80;
      }

      if (!pipe.passed && pipe.x + pipe.width / 2 < this.width * 0.22) {
          pipe.passed = true;
          this.score++;
          if (!isFast) {
            audioSys.playScore();
          }
          if (this.score % 4 === 0) this.basePipeSpeed = Math.min(MAX_PIPE_SPEED, this.basePipeSpeed + 0.3);
          if (this.onScore) this.onScore(this.score);
          if (this.score > this.bestScore) {
            this.bestScore = this.score;
            if (typeof window !== 'undefined') localStorage.setItem('fb_best', this.bestScore.toString());
          }
      }
      if (pipe.x + pipe.width < 0) this.pipes.splice(i, 1);
    }

    this.checkCollisions();
  }

  private calculateRLStep() {
    if (!this.rlAgent) return;

    const nextPipe = this.getNextPipe();
    const state = this.rlAgent.getState(
      this.bird.y,
      this.bird.velocity,
      nextPipe,
      this.width * 0.22,
      this.width,
      this.height,
      this.groundY
    );

    // Save transition for previous step
    if (this.rlPrevState !== null) {
      let reward = 0.1; // Survival reward
      if (this.score > this.rlPrevScore) {
        reward = 15.0; // High reward for passing pipe
      }
      
      this.rlAgent.remember(
        this.rlPrevState,
        this.rlPrevAction,
        reward,
        state,
        false
      );

      this.rlStepCount++;
      if (this.rlStepCount % 4 === 0) {
        this.rlAgent.trainOnBatch();
      }
    }

    const action = this.rlAgent.getAction(state, this.isExplorationEnabled);

    if (this.isVisualizing) {
      const qValues = this.rlAgent.getQValues(state);
      this.rlLastState = state;
      this.rlLastQValues = qValues;
      this.rlLastAction = action;
    } else {
      this.rlLastAction = action;
    }

    this.rlPrevState = state;
    this.rlPrevAction = action;
    this.rlPrevScore = this.score;
  }

  public getNextPipe(): Pipe | null {
    const birdX = this.width * 0.22;
    for (let i = 0; i < this.pipes.length; i++) {
      const pipe = this.pipes[i];
      if (pipe.x + pipe.width > birdX - this.bird.size / 2) {
        return pipe;
      }
    }
    return null;
  }

  private handleJump(hasAction: boolean) {
    if (this.isGameOver || this.isPaused) return;
    if (hasAction) {
      this.bird.velocity = BASE_JUMP_STRENGTH; 
      const isFast = this.isRLTraining && this.autoPlaySpeed >= 2;
      if (!isFast) {
        audioSys.playFlap();
      }
      const skin = SKINS_CONFIG[this.currentSkin];
      for (let i = 0; i < 4; i++) {
          this.createParticle(
              this.width * 0.22 - 10, this.bird.y, skin.thrusterColor,
              (-Math.random() * 3 - 2), (Math.random() * 2 - 1) * 2,
              Math.random() * 4 + 3, 0.05
          );
      }
    }
  }

  private checkCollisions() {
    if (this.bird.y + (this.bird.size / 2) >= this.groundY) {
        this.triggerGameOver();
        return;
    }
    const bx = this.width * 0.22;
    for (let i = 0; i < this.pipes.length; i++) {
        const p = this.pipes[i];
        if (this.checkCircleBoxOverlap(bx, this.bird.y, this.bird.size/2, p.x, 0, p.width, p.topHeight)) {
            this.triggerGameOver(); return;
        }
        const bottomY = this.height - p.bottomHeight - 80;
        if (this.checkCircleBoxOverlap(bx, this.bird.y, this.bird.size/2, p.x, bottomY, p.width, p.bottomHeight)) {
            this.triggerGameOver(); return;
        }
    }
  }

  private checkCircleBoxOverlap(cx: number, cy: number, radius: number, rx: number, ry: number, rwidth: number, rheight: number) {
    const closestX = Math.max(rx, Math.min(cx, rx + rwidth));
    const closestY = Math.max(ry, Math.min(cy, ry + rheight));
    const distanceX = cx - closestX;
    const distanceY = cy - closestY;
    return (distanceX * distanceX) + (distanceY * distanceY) < (radius * radius);
  }

  private triggerGameOver() {
    this.isGameOver = true;
    
    if (this.isRLTraining && this.rlAgent && this.rlPrevState) {
      const nextState = Array(this.rlAgent.stateSize).fill(0);
      this.rlAgent.remember(this.rlPrevState, this.rlPrevAction, -10.0, nextState, true);
      const epsilon = this.rlAgent.trainOnBatch() || this.rlAgent.epsilon;
      
      this.rlEpisode++;
      this.rlScores.push(this.score);
      if (this.rlScores.length > 100) this.rlScores.shift();
      const avg = this.rlScores.reduce((a, b) => a + b, 0) / this.rlScores.length;
      if (this.onRLStats) this.onRLStats(this.rlEpisode, avg, epsilon);
      
      // Reset training state
      this.rlPrevState = null;
      this.rlPrevAction = 0;

      // Spawn explosion particles for AI bird crash!
      const skin = SKINS_CONFIG[this.currentSkin];
      for (let i = 0; i < 35; i++) {
          const speed = (Math.random() * 6 + 2);
          const angle = Math.random() * Math.PI * 2;
          this.createParticle(this.width * 0.22, this.bird.y, skin.primaryColor, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.random() * 6 + 4, 0.02);
      }
      
      const isFast = this.autoPlaySpeed >= 2;
      if (!isFast) {
        audioSys.playHit();
        audioSys.playGameOver();
        this.screenShakeTime = 10;
        this.screenShakeIntensity = 15;
      }
      
      this.bird.y = -1000;

      setTimeout(() => {
        if (this.isRLTraining) {
          this.start();
        }
      }, 50);
      return;
    }

    const isFast = this.isRLTraining && this.autoPlaySpeed >= 2;
    if (!isFast) {
      audioSys.playHit();
      audioSys.playGameOver();
      this.screenShakeTime = 10;
      this.screenShakeIntensity = 15;
      
      const skin = SKINS_CONFIG[this.currentSkin];
      for (let i = 0; i < 35; i++) {
          const speed = (Math.random() * 6 + 2);
          const angle = Math.random() * Math.PI * 2;
          this.createParticle(this.width * 0.22, this.bird.y, skin.primaryColor, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.random() * 6 + 4, 0.02);
      }
    }
    this.bird.y = -1000; 
    if (this.onGameOver) this.onGameOver(this.score, this.bestScore);
  }

  private drawBackground() {
    this.ctx.fillStyle = '#0a0614';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const alpha = 0.3 + Math.abs(Math.sin(s.phase + this.frameCount * s.speed)) * 0.7;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;

    const sunX = this.width / 2;
    const sunY = this.groundY - 140;
    const sunRadius = 90;

    const sunGrad = this.ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
    sunGrad.addColorStop(0, '#fff01f');
    sunGrad.addColorStop(0.5, '#ff007f');
    sunGrad.addColorStop(1, '#67008a');

    this.ctx.fillStyle = sunGrad;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#0a0614';
    for (let i = 0; i < 8; i++) {
        const stripeY = sunY + 20 + i * 8;
        const stripeHeight = (1.8 + i * 0.8);
        if (stripeY < sunY + sunRadius) {
            this.ctx.fillRect(sunX - sunRadius, stripeY, sunRadius * 2, stripeHeight);
        }
    }

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(122, 0, 255, 0.2)';
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowBlur = 4;
    this.ctx.shadowColor = '#7a00ff';

    const citySpeed = this.basePipeSpeed * 0.1;
    const scrollX = (this.frameCount * citySpeed) % 240;

    const buildings = [
        { w: 50, h: 120 }, { w: 30, h: 180 }, { w: 60, h: 90 }, { w: 40, h: 150 },
        { w: 30, h: 130 }, { w: 70, h: 100 }, { w: 45, h: 170 }, { w: 55, h: 110 }
    ];

    let currentX = -scrollX;
    const totalCycles = Math.ceil(this.width / 240) + 2;

    for (let cycle = 0; cycle < totalCycles; cycle++) {
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            this.ctx.strokeRect(currentX, this.groundY - b.h, b.w, b.h);
            this.ctx.strokeStyle = 'rgba(122, 0, 255, 0.05)';
            this.ctx.beginPath();
            for (let wx = currentX + 10; wx < currentX + b.w; wx += 10) {
                this.ctx.moveTo(wx, this.groundY);
                this.ctx.lineTo(wx, this.groundY - b.h);
            }
            this.ctx.stroke();
            this.ctx.strokeStyle = 'rgba(122, 0, 255, 0.2)';
            currentX += b.w;
        }
    }
    this.ctx.restore();
}

  private drawGround() {
    this.ctx.fillStyle = '#06030b';
    this.ctx.fillRect(0, this.groundY, this.width, 80);

    this.ctx.strokeStyle = '#ff007f';
    this.ctx.lineWidth = 4;
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = '#ff007f';
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.groundY);
    this.ctx.lineTo(this.width, this.groundY);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0; 

    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    this.ctx.lineWidth = 1.5;

    const numVanishingLines = 18;
    for (let i = 0; i <= numVanishingLines; i++) {
        const startX = (this.width / numVanishingLines) * i;
        const horizonX = this.width / 2; 
        this.ctx.beginPath();
        this.ctx.moveTo(horizonX, this.groundY);
        this.ctx.lineTo(startX, this.height);
        this.ctx.stroke();
    }

    const startH = this.groundY;
    let gridOffset = this.groundOffset;
    
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    const spacing = 12;
    for (let y = startH; y < this.height; y += spacing) {
        const densityMultiplier = (y - startH) / 80; 
        const scrollY = y + (gridOffset * densityMultiplier);
        if (scrollY < this.height) {
            this.ctx.globalAlpha = Math.min(1.0, (scrollY - startH) / 60);
            this.ctx.beginPath();
            this.ctx.moveTo(0, scrollY);
            this.ctx.lineTo(this.width, scrollY);
            this.ctx.stroke();
        }
    }
    this.ctx.globalAlpha = 1.0;
  }

  private draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    
    if (this.screenShakeTime > 0) {
        const dx = (Math.random() - 0.5) * this.screenShakeIntensity;
        const dy = (Math.random() - 0.5) * this.screenShakeIntensity;
        this.ctx.translate(dx, dy);
    }

    this.drawBackground();

    if (this.isStarted || this.isGameOver) {
      this.ctx.save();
      for (let i = 0; i < this.pipes.length; i++) {
          const p = this.pipes[i];
          this.ctx.strokeStyle = '#00f0ff';
          this.ctx.lineWidth = 3;
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = '#00f0ff';
          this.ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
          this.ctx.beginPath();
          this.ctx.rect(p.x, -10, p.width, p.topHeight + 10);
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.fillStyle = '#061328';
          this.ctx.beginPath();
          this.ctx.rect(p.x - 4, p.topHeight - 24, p.width + 8, 24);
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(p.x + p.width/2 - 5, -10, 10, p.topHeight);
          
          this.ctx.strokeStyle = '#ff007f';
          this.ctx.shadowColor = '#ff007f';
          this.ctx.fillStyle = 'rgba(255, 0, 127, 0.06)';
          const bottomY = this.height - p.bottomHeight - 80;
          this.ctx.beginPath();
          this.ctx.rect(p.x, bottomY, p.width, p.bottomHeight + 10);
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.fillStyle = '#210515';
          this.ctx.beginPath();
          this.ctx.rect(p.x - 4, bottomY, p.width + 8, 24);
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.3)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(p.x + p.width/2 - 5, bottomY + 24, 10, p.bottomHeight);
      }
      this.ctx.restore();
    }

    if (this.isStarted && !this.isGameOver) {
      this.ctx.save();
      const skin = SKINS_CONFIG[this.currentSkin];
      this.ctx.strokeStyle = skin.primaryColor;
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = skin.primaryColor;

      for (let i = 0; i < this.trail.length; i++) {
          const pt = this.trail[i];
          const opacity = i / this.trail.length * 0.4;
          this.ctx.globalAlpha = opacity;
          this.ctx.beginPath();
          this.ctx.arc(pt.x, pt.y, (this.bird.size / 2) * 0.8 * (i / this.trail.length), 0, Math.PI * 2);
          this.ctx.stroke();
      }
      this.ctx.restore();
    }

    this.ctx.save();
    for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.life;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
    }
    this.ctx.restore();

    if (!this.isGameOver) {
        const activeSkin = SKINS_CONFIG[this.currentSkin];
        activeSkin.draw(this.ctx, this.width * 0.22, this.bird.y, this.bird.size, this.bird.rotation, activeSkin.primaryColor, activeSkin.secondaryColor, activeSkin.accentColor);
    }

    this.drawGround();
    this.ctx.restore();
  }
}
