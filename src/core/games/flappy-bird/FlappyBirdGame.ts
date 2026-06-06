import { GameLoop } from "../../engine/GameLoop";
import { InputManager } from "../../engine/InputManager";

const GRAVITY = 0.0022;
const JUMP_VELOCITY = -0.55;
const PIPE_SPEED = 0.2;
const PIPE_SPAWN_RATE = 1800; // ms
const PIPE_WIDTH = 70;
const PIPE_GAP = 170;

export type BirdSkin = 'cyber-bird' | 'neon-cat' | 'toxic-bat' | 'plasma-fox';

export const SKIN_COLORS = {
  'cyber-bird': { main: '#00f0ff', glow: 'rgba(0, 240, 255, 0.8)' },
  'neon-cat': { main: '#ff00ff', glow: 'rgba(255, 0, 255, 0.8)' },
  'toxic-bat': { main: '#39ff14', glow: 'rgba(57, 255, 20, 0.8)' },
  'plasma-fox': { main: '#ffeb3b', glow: 'rgba(255, 235, 59, 0.8)' },
};

export const ANIMAL_PATHS: Record<BirdSkin, string> = {
  'cyber-bird': 'M 16 0 L 6 -6 L -10 -6 L -16 -12 L -12 0 L -16 12 L -6 4 L 0 6 Z',
  'neon-cat': 'M 12 4 L 6 -10 L 2 -6 L -6 -10 L -10 -2 L -10 8 L -4 12 L 6 12 Z',
  'toxic-bat': 'M 10 0 L 4 -12 L -2 -4 L -14 -10 L -8 2 L -14 12 L -2 4 L 4 12 Z',
  'plasma-fox': 'M 16 2 L 8 -12 L 0 -6 L -10 -10 L -12 2 L -6 12 L 2 10 Z'
};

export const ANIMAL_EYES: Record<BirdSkin, {x: number, y: number}> = {
  'cyber-bird': {x: 6, y: -2},
  'neon-cat': {x: 4, y: -2},
  'toxic-bat': {x: 2, y: -1},
  'plasma-fox': {x: 4, y: -1}
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'circle' | 'square';
}

interface Bird {
  y: number;
  velocity: number;
  size: number;
  rotation: number;
}

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

export class FlappyBirdGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  private input: InputManager;
  
  private width: number;
  private height: number;
  
  private bird: Bird;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private trails: {x: number, y: number}[] = [];
  
  private score: number = 0;
  private bestScore: number = 0;
  public isGameOver: boolean = false;
  public isStarted: boolean = false;
  public isPaused: boolean = false;
  
  private lastPipeSpawn: number = 0;
  private bgOffset: number = 0;
  private currentSkin: BirdSkin = 'cyber-bird';

  private stars: {x: number, y: number, size: number, speed: number}[] = [];

  // Callbacks for React
  public onScore?: (score: number) => void;
  public onGameOver?: (score: number, best: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    
    this.width = canvas.width;
    this.height = canvas.height;
    
    this.input = new InputManager(this.canvas);
    this.loop = new GameLoop(this.update.bind(this), this.draw.bind(this));
    
    if (typeof window !== 'undefined') {
      this.bestScore = parseInt(localStorage.getItem('fb_best') || '0');
    }

    for(let i=0; i<60; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 1.5,
        speed: Math.random() * 0.05 + 0.01
      });
    }

    this.bird = this.getInitialBird();
    this.draw(); 
  }

  public setSkin(skin: BirdSkin) {
    this.currentSkin = skin;
    if (!this.isStarted && !this.isGameOver) {
      this.draw(); 
    }
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    if (!this.isStarted && !this.isGameOver) {
      this.draw();
    }
  }

  private getInitialBird(): Bird {
    return {
      y: this.height / 2,
      velocity: 0,
      size: 20,
      rotation: 0
    };
  }

  // Called from React to start
  public start() {
    this.reset();
    this.isStarted = true;
    this.bird.velocity = JUMP_VELOCITY;
    this.createJumpEffect();
    this.loop.start();
  }

  public pause() {
    this.isPaused = true;
    this.loop.stop();
  }

  public resume() {
    this.isPaused = false;
    this.loop.start();
  }

  // Called to just render idle state
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

  private reset() {
    this.bird = this.getInitialBird();
    this.pipes = [];
    this.particles = [];
    this.trails = [];
    this.score = 0;
    this.isGameOver = false;
    this.isStarted = false;
    this.isPaused = false;
    this.lastPipeSpawn = 0;
    if (this.onScore) this.onScore(0);
  }

  private createExplosion(x: number, y: number) {
    const colors = [SKIN_COLORS[this.currentSkin].main, '#ffffff', '#ff0055'];
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1,
        maxLife: Math.random() * 40 + 20,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: Math.random() > 0.5 ? 'square' : 'circle'
      });
    }
  }

  private spawnPipe() {
    const minHeight = 80;
    const maxHeight = this.height - PIPE_GAP - minHeight - 100; // 100 for floor
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    
    this.pipes.push({
      x: this.width,
      topHeight,
      passed: false
    });
  }

  private update(deltaTime: number) {
    const hasAction = this.input.consumeAction();
    
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // Scroll Background
    this.bgOffset = (this.bgOffset + PIPE_SPEED * 0.2 * deltaTime) % 40;
    this.stars.forEach(star => {
      star.y += star.speed * deltaTime;
      if (star.y > this.height) {
        star.y = 0;
        star.x = Math.random() * this.width;
      }
    });

    if (this.isGameOver) {
      return; // Stop physics when dead, let particles finish
    }

    if (!this.isStarted) {
      // Idle floating
      this.bird.y = this.height / 2 + Math.sin(Date.now() / 300) * 10;
      return;
    }

    this.handleJump(hasAction);
    
    this.bird.velocity += GRAVITY * deltaTime;
    this.bird.y += this.bird.velocity * deltaTime;
    this.bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.bird.velocity * 0.1)));

    // Trails Update
    if (deltaTime > 0) {
      this.trails.push({ x: this.width / 3 - 20, y: this.bird.y });
      if (this.trails.length > 25) this.trails.shift();
    }
    for (let i = 0; i < this.trails.length; i++) {
      this.trails[i].x -= PIPE_SPEED * deltaTime;
    }

    // Pipe spawning
    this.lastPipeSpawn += deltaTime;
    if (this.lastPipeSpawn > PIPE_SPAWN_RATE) {
      this.spawnPipe();
      this.lastPipeSpawn = 0;
    }

    // Pipe movement & collision
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pipe = this.pipes[i];
      pipe.x -= PIPE_SPEED * deltaTime;

      const birdBox = {
        left: this.width / 3 - this.bird.size + 4,
        right: this.width / 3 + this.bird.size - 4,
        top: this.bird.y - this.bird.size + 4,
        bottom: this.bird.y + this.bird.size - 4
      };

      const topPipeBox = {
        left: pipe.x,
        right: pipe.x + PIPE_WIDTH,
        top: 0,
        bottom: pipe.topHeight
      };

      const bottomPipeBox = {
        left: pipe.x,
        right: pipe.x + PIPE_WIDTH,
        top: pipe.topHeight + PIPE_GAP,
        bottom: this.height - 100
      };

      if (
        this.checkCollision(birdBox, topPipeBox) ||
        this.checkCollision(birdBox, bottomPipeBox) ||
        this.bird.y >= this.height - 100 || // Ground collision
        this.bird.y <= 0
      ) {
        this.triggerGameOver();
      }

      // Scoring
      if (!pipe.passed && pipe.x + PIPE_WIDTH < this.width / 3) {
        pipe.passed = true;
        this.score++;
        if (this.onScore) this.onScore(this.score);
        
        if (this.score > this.bestScore) {
          this.bestScore = this.score;
          if (typeof window !== 'undefined') {
            localStorage.setItem('fb_best', this.bestScore.toString());
          }
        }
      }

      if (pipe.x + PIPE_WIDTH < 0) {
        this.pipes.splice(i, 1);
      }
    }
  }

  private handleJump(hasAction: boolean) {
    if (this.isGameOver || this.isPaused) return;

    if (hasAction) {
      this.bird.velocity = JUMP_VELOCITY;
      this.createJumpEffect();
    }
  }

  private createJumpEffect() {
    const glow = SKIN_COLORS[this.currentSkin].glow;
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.width / 3 - 5, 
        y: this.bird.y,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 2 + 1,
        life: 1,
        maxLife: 15,
        size: Math.random() * 3 + 1,
        color: glow,
        type: 'circle'
      });
    }
  }

  private triggerGameOver() {
    this.isGameOver = true;
    this.createExplosion(this.width / 3, this.bird.y);
    this.bird.y = -1000; 
    if (this.onGameOver) {
      this.onGameOver(this.score, this.bestScore);
    }
  }

  private checkCollision(rect1: any, rect2: any) {
    return (
      rect1.left < rect2.right &&
      rect1.right > rect2.left &&
      rect1.top < rect2.bottom &&
      rect1.bottom > rect2.top
    );
  }

  private drawBackground() {
    // Deep Space
    this.ctx.fillStyle = '#0a0514';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Stars
    this.ctx.fillStyle = '#ffffff';
    this.stars.forEach(star => {
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI*2);
      this.ctx.fill();
    });

    // Synthwave Sun
    const sunRadius = 120;
    const sunX = this.width / 2;
    const sunY = this.height - 150; 
    
    const sunGrad = this.ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
    sunGrad.addColorStop(0, '#ffeb3b');
    sunGrad.addColorStop(0.5, '#ff0055');
    sunGrad.addColorStop(1, '#673ab7');

    this.ctx.fillStyle = sunGrad;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Sun cutouts
    this.ctx.fillStyle = '#0a0514'; 
    for(let i=0; i<8; i++) {
      const yOffset = Math.pow(i, 1.4) * 8;
      const height = 2 + i * 0.8;
      this.ctx.fillRect(sunX - sunRadius, sunY + 20 + yOffset, sunRadius * 2, height);
    }

    // Grid Floor
    const horizonY = this.height - 100;
    
    this.ctx.strokeStyle = '#ff00ff';
    this.ctx.lineWidth = 1;
    this.ctx.shadowColor = '#ff00ff';
    this.ctx.shadowBlur = 10;
    
    this.ctx.beginPath();
    this.ctx.moveTo(0, horizonY);
    this.ctx.lineTo(this.width, horizonY);
    this.ctx.stroke();

    this.ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
      const x1 = this.width / 2 + i * 40;
      const x2 = this.width / 2 + i * 150 - this.bgOffset * 3.75; 
      this.ctx.moveTo(x1, horizonY);
      this.ctx.lineTo(x2, this.height);
    }
    
    for(let i=1; i<6; i++) {
       const y = horizonY + Math.pow(i, 1.5) * 8;
       this.ctx.moveTo(0, y);
       this.ctx.lineTo(this.width, y);
    }
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  private draw() {
    this.drawBackground();

    // Draw Pipes (Neon Cyan Style)
    this.pipes.forEach(pipe => {
      this.ctx.fillStyle = 'rgba(10, 5, 20, 0.9)';
      this.ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      this.ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, this.height - 100);

      this.ctx.strokeStyle = '#00f0ff';
      this.ctx.lineWidth = 3;
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.shadowBlur = 15;
      
      this.ctx.strokeRect(pipe.x, -10, PIPE_WIDTH, pipe.topHeight + 10);
      this.ctx.strokeRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, this.height);
      
      // Caps
      this.ctx.strokeRect(pipe.x - 4, pipe.topHeight - 20, PIPE_WIDTH + 8, 20);
      this.ctx.strokeRect(pipe.x - 4, pipe.topHeight + PIPE_GAP, PIPE_WIDTH + 8, 20);
    });
    this.ctx.shadowBlur = 0;

    // Draw Tron Light Ribbon Trail
    if (!this.isGameOver && this.isStarted && this.trails.length > 1) {
      const skinColor = SKIN_COLORS[this.currentSkin].main;
      const skinGlow = SKIN_COLORS[this.currentSkin].glow;

      const tailX = this.trails[0].x;
      const headX = this.width / 3 - 20;
      
      const grad = this.ctx.createLinearGradient(tailX, 0, headX, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, skinColor);

      this.ctx.beginPath();
      this.ctx.moveTo(this.trails[0].x, this.trails[0].y);
      for (let i = 1; i < this.trails.length; i++) {
        this.ctx.lineTo(this.trails[i].x, this.trails[i].y);
      }
      this.ctx.lineTo(headX, this.bird.y);

      // Outer Neon Ribbon
      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = 5;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.shadowColor = skinGlow;
      this.ctx.shadowBlur = 15;
      this.ctx.stroke();
      
      // Inner Bright Core
      const gradInner = this.ctx.createLinearGradient(tailX, 0, headX, 0);
      gradInner.addColorStop(0, 'rgba(255,255,255,0)');
      gradInner.addColorStop(1, '#ffffff');
      this.ctx.strokeStyle = gradInner;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 0;
      this.ctx.stroke();
    }

    // Draw Bird (Neon Animal Holograms)
    if (!this.isGameOver) {
      this.ctx.save();
      this.ctx.translate(this.width / 3, this.bird.y);
      this.ctx.rotate(this.bird.rotation);
      
      const scaleFactor = this.bird.size / 14;
      this.ctx.scale(scaleFactor, scaleFactor);
      
      const skinColor = SKIN_COLORS[this.currentSkin].main;
      const skinGlow = SKIN_COLORS[this.currentSkin].glow;

      const path = new Path2D(ANIMAL_PATHS[this.currentSkin]);
      
      // Deep dark base (Solid Black for contrast against space)
      this.ctx.fillStyle = '#000000'; 
      this.ctx.fill(path);

      // Holographic inner glow (Brighter to pop out)
      this.ctx.fillStyle = skinColor;
      this.ctx.globalAlpha = 0.5;
      this.ctx.fill(path);
      this.ctx.globalAlpha = 1.0;

      // Sharp Neon Outline
      this.ctx.shadowColor = skinGlow;
      this.ctx.shadowBlur = 20;
      this.ctx.strokeStyle = skinColor;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();

      // Eye
      const eye = ANIMAL_EYES[this.currentSkin];
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ffffff';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(eye.x, eye.y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    // Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = 1 - (p.life / p.maxLife);
      
      if (p.type === 'circle') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      }
      
      this.ctx.globalAlpha = 1.0;
    });
  }
}
