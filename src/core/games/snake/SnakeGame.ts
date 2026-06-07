import { GameLoop } from "../../engine/GameLoop";
import { AudioSynth } from "../../utils/AudioSynth";

type Point = { x: number; y: number };

const COLORS = [
  '#00f0ff', // Cyan
  '#ff007f', // Pink
  '#39ff14', // Green
  '#fff01f', // Yellow
];

export class SnakeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  
  public score = 0;
  public isGameOver = false;
  public onGameOver?: (score: number, bestScore: number) => void;
  public onScore?: (score: number) => void;

  // Grid
  private cellSize = 25;
  private gridCols = 0;
  private gridRows = 0;
  private gridX = 0;
  private gridY = 0;

  // Snake
  private snake: Point[] = [];
  private dx = 1;
  private dy = 0;
  private nextDx = 1;
  private nextDy = 0;
  private baseMoveInterval = 100; // ms (slightly faster base speed)
  private moveInterval = 100;
  private moveTimer = 0;
  private isDigesting = false;
  
  // Auto Play
  public isAutoPlay = false;
  public autoPlaySpeed = 1;

  // Audio
  public audio = new AudioSynth();

  // Food
  private food: Point | null = null;
  private foodColor = COLORS[0];
  private foodPulse = 0;

  // VFX
  private particles: any[] = [];
  private floatingTexts: any[] = [];
  private shakeTime = 0;
  private shakeMag = 0;
  private screenFlash = 0;
  private time = 0;
  private milestoneFlash: { text: string, life: number, scale: number } | null = null;
  private stepsSinceLastEat = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not found");
    this.ctx = ctx;

    this.calculateLayout();
    this.attachEvents();
    
    this.loop = new GameLoop(
      this.update.bind(this),
      this.draw.bind(this)
    );
  }

  private calculateLayout() {
    // Fill the screen but ensure it's divisible by cellSize
    const maxGridWidth = this.canvas.width * 0.95;
    const maxGridHeight = this.canvas.height * 0.75; // Leave top for HUD
    
    this.gridCols = Math.floor(maxGridWidth / this.cellSize);
    this.gridRows = Math.floor(maxGridHeight / this.cellSize);
    
    const totalW = this.gridCols * this.cellSize;
    const totalH = this.gridRows * this.cellSize;
    
    this.gridX = (this.canvas.width - totalW) / 2;
    this.gridY = (this.canvas.height * 0.55) - (totalH / 2); 
  }

  private attachEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    
    // Simple swipe logic for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});
    this.canvas.addEventListener('touchend', (e) => {
      if (this.isGameOver) return;
      let touchEndX = e.changedTouches[0].screenX;
      let touchEndY = e.changedTouches[0].screenY;
      this.handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    }, {passive: true});
  }

  public destroy() {
    this.loop.stop();
    this.audio.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onResize = () => {
    // Only resize layout, don't restart game
    // A robust game might recalculate grid and snap snake to bounds, 
    // but for simplicity we assume canvas size is mostly static during play.
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isGameOver) return;
    switch(e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        if (this.dy === 0) { this.nextDx = 0; this.nextDy = -1; }
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        if (this.dy === 0) { this.nextDx = 0; this.nextDy = 1; }
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (this.dx === 0) { this.nextDx = -1; this.nextDy = 0; }
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (this.dx === 0) { this.nextDx = 1; this.nextDy = 0; }
        break;
    }
  }

  private handleSwipe(sx: number, sy: number, ex: number, ey: number) {
    const dx = ex - sx;
    const dy = ey - sy;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (dx > 0 && this.dx === 0) { this.nextDx = 1; this.nextDy = 0; }
      else if (dx < 0 && this.dx === 0) { this.nextDx = -1; this.nextDy = 0; }
    } else {
      // Vertical swipe
      if (dy > 0 && this.dy === 0) { this.nextDx = 0; this.nextDy = 1; }
      else if (dy < 0 && this.dy === 0) { this.nextDx = 0; this.nextDy = -1; }
    }
  }

  public start() {
    this.audio.unlock(); // Unlock audio context on user gesture
    this.reset();
    this.loop.start();
  }

  public reset() {
    this.calculateLayout();
    this.score = 0;
    this.isGameOver = false;
    this.particles = [];
    this.floatingTexts = [];
    this.shakeTime = 0;
    this.screenFlash = 0;
    this.milestoneFlash = null;
    this.moveInterval = this.baseMoveInterval;
    this.moveTimer = 0;
    this.isDigesting = false;
    this.stepsSinceLastEat = 0;

    // Start in middle
    const startX = Math.floor(this.gridCols / 2);
    const startY = Math.floor(this.gridRows / 2);
    
    this.snake = [
      {x: startX, y: startY},
      {x: startX - 1, y: startY},
      {x: startX - 2, y: startY}
    ];
    this.dx = 1;
    this.dy = 0;
    this.nextDx = 1;
    this.nextDy = 0;

    this.spawnFood();
    if (this.onScore) this.onScore(this.score);
  }

  private spawnFood() {
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 100) {
      const rx = Math.floor(Math.random() * this.gridCols);
      const ry = Math.floor(Math.random() * this.gridRows);
      
      // Check if it overlaps snake
      let overlap = this.snake.some(s => s.x === rx && s.y === ry);
      if (!overlap) {
        this.food = {x: rx, y: ry};
        this.foodColor = COLORS[Math.floor(Math.random() * COLORS.length)];
        valid = true;
      }
      attempts++;
    }
  }

  private triggerGameOver() {
    this.printDebugMap("SNAKE GAME OVER");
    this.isGameOver = true;
    this.screenFlash = 1.0;
    this.triggerScreenShake(20, 600);
    this.audio.playCrash();
    
    // Explode snake head
    const head = this.snake[0];
    const px = this.gridX + head.x * this.cellSize + this.cellSize/2;
    const py = this.gridY + head.y * this.cellSize + this.cellSize/2;
    for(let i=0; i<80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 15 + 2;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: '#ff007f', // Red/Pink death explosion
        size: Math.random() * 6 + 2
      });
    }

    if (this.onGameOver) {
      const best = parseInt(localStorage.getItem('snakeBest') || '0');
      if (this.score > best) {
        localStorage.setItem('snakeBest', this.score.toString());
      }
      this.onGameOver(this.score, Math.max(best, this.score));
    }
  }

  private triggerScreenShake(magnitude: number, duration: number) {
    this.shakeMag = magnitude;
    this.shakeTime = duration;
  }

  private spawnFloatingText(text: string, x: number, y: number, color: string, size: number = 24) {
    this.floatingTexts.push({
      text, x, y, color, life: 1.0, size
    });
  }

  private update(dt: number) {
    this.time += dt;

    if (this.screenFlash > 0) {
      this.screenFlash -= dt * 0.002;
      if (this.screenFlash < 0) this.screenFlash = 0;
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime < 0) this.shakeTime = 0;
    }

    if (this.milestoneFlash) {
      this.milestoneFlash.life -= dt * 0.001;
      this.milestoneFlash.scale += (1.5 - this.milestoneFlash.scale) * 0.1;
      if (this.milestoneFlash.life <= 0) {
        this.milestoneFlash = null;
      }
    }

    if (!this.isGameOver) {
      const multiplier = this.isAutoPlay ? this.autoPlaySpeed : 1;
      this.moveTimer += dt * multiplier;
      while (this.moveTimer >= this.moveInterval) {
        this.moveTimer -= this.moveInterval;
        if (this.isAutoPlay) this.calculateAutoMove();
        this.moveSnake();
        if (this.isGameOver) break;

        // Infinite loop check (only when autoplay is enabled)
        if (this.isAutoPlay && this.stepsSinceLastEat > this.gridCols * this.gridRows * 3) {
          this.printDebugMap();
          this.stepsSinceLastEat = 0; // reset to avoid spamming every single step
        }
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95; 
      p.vy *= 0.95;
      p.life -= dt * 0.0015;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      let ft = this.floatingTexts[i];
      ft.y -= dt * 0.05;
      ft.life -= dt * 0.0015;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private getPath(start: Point, target: Point, snakeBody: Point[]): Point[] | null {
     const queue: {x: number, y: number, time: number, path: Point[]}[] = [{x: start.x, y: start.y, time: 0, path: []}];
     const visited = new Map<string, number>(); // key: "x,y", value: minTime
     visited.set(`${start.x},${start.y}`, 0);
     
     const dirs = [ {dx:0,dy:-1}, {dx:0,dy:1}, {dx:-1,dy:0}, {dx:1,dy:0} ];
     const L = snakeBody.length;

     while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr.x === target.x && curr.y === target.y) return curr.path;

        for (let d of dirs) {
           const nx = curr.x + d.dx;
           const ny = curr.y + d.dy;
           const nextTime = curr.time + 1;
           const key = `${nx},${ny}`;
           
           if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
              const prevTime = visited.get(key);
              if (prevTime === undefined || nextTime < prevTime) {
                 // Check if the cell is occupied by the body at nextTime
                 let isOccupied = false;
                 for (let i = 0; i < L; i++) {
                    if (snakeBody[i].x === nx && snakeBody[i].y === ny) {
                       // It is occupied if nextTime < L - i
                       if (nextTime < L - i) {
                          isOccupied = true;
                          break;
                       }
                    }
                 }
                 
                 if (!isOccupied) {
                    visited.set(key, nextTime);
                    queue.push({ x: nx, y: ny, time: nextTime, path: [...curr.path, {x: nx, y: ny}] });
                 }
              }
           }
        }
     }
     return null;
  }

  private getReachableSpaceSize(start: Point, snakeBody: Point[]): number {
    const L = snakeBody.length;
    const clearTime = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill(0));
    for (let i = 0; i < L; i++) {
      const p = snakeBody[i];
      if (p.x >= 0 && p.x < this.gridCols && p.y >= 0 && p.y < this.gridRows) {
        clearTime[p.y][p.x] = Math.max(clearTime[p.y][p.x], L - i);
      }
    }

    const queue: {x: number, y: number, time: number}[] = [{x: start.x, y: start.y, time: 0}];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    let count = 0;
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      count++;

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const nextTime = curr.time + 1;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
          if (!visited.has(key)) {
             if (nextTime >= clearTime[ny][nx]) {
                visited.add(key);
                queue.push({ x: nx, y: ny, time: nextTime });
             }
          }
        }
      }
    }
    return count;
  }

  private rolloutForcedMoves(simSnake: Point[], dx: number, dy: number): Point[] | null {
    let currentSnake = [...simSnake];
    let currentDx = dx;
    let currentDy = dy;
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    // Limit rollout depth to prevent infinite loops (although normally bounded by grid space)
    for (let step = 0; step < 100; step++) {
      const head = currentSnake[0];
      const validMoves: { dx: number; dy: number; nx: number; ny: number }[] = [];

      for (const d of dirs) {
        // Don't reverse
        if (d.dx === -currentDx && d.dy === -currentDy && currentSnake.length > 1) continue;

        const nx = head.x + d.dx;
        const ny = head.y + d.dy;

        // Check bounds
        if (nx < 0 || nx >= this.gridCols || ny < 0 || ny >= this.gridRows) continue;

        // Check body collision (using time-space safety check)
        let hitSelf = false;
        const L = currentSnake.length;
        const nextTime = step + 1;
        for (let i = 0; i < L; i++) {
          if (currentSnake[i].x === nx && currentSnake[i].y === ny) {
            // It is occupied if nextTime < L - i
            if (nextTime < L - i) {
              hitSelf = true;
              break;
            }
          }
        }
        if (hitSelf) continue;

        validMoves.push({ dx: d.dx, dy: d.dy, nx, ny });
      }

      if (validMoves.length === 0) {
        // Leads directly to a crash (0 valid moves)
        return null;
      }

      if (validMoves.length > 1) {
        // Has choices, stop rollout here
        return currentSnake;
      }

      // Exactly 1 valid move - force it!
      const move = validMoves[0];
      currentDx = move.dx;
      currentDy = move.dy;

      // Simulate move
      const isEating = (this.food && move.nx === this.food.x && move.ny === this.food.y);
      currentSnake = isEating
        ? [{ x: move.nx, y: move.ny }, ...currentSnake]
        : [{ x: move.nx, y: move.ny }, ...currentSnake.slice(0, -1)];
    }

    return currentSnake;
  }

  private isFoodSafe(simSnake: Point[], pathToFood: Point[]): boolean {
    if (pathToFood.length === 0) return false;
    
    let currentSnake = [...simSnake];
    
    // Simulate each step along pathToFood
    for (let i = 0; i < pathToFood.length; i++) {
      const nextPoint = pathToFood[i];
      const isLastStep = (i === pathToFood.length - 1);
      
      if (isLastStep) {
        // This is the eating step! The snake grows, tail does not move.
        currentSnake = [nextPoint, ...currentSnake];
      } else {
        // Normal step, tail moves.
        currentSnake = [nextPoint, ...currentSnake.slice(0, -1)];
      }
    }
    
    // Now check if from this simulated state, the head can reach its tail
    const head = currentSnake[0];
    const tail = currentSnake[currentSnake.length - 1];
    
    const pathToTail = this.getPath(head, tail, currentSnake);
    return pathToTail !== null;
  }

  private getEmptyNeighborsCount(p: Point, body: Point[]): number {
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    let count = 0;
    
    for (const d of dirs) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
        let inBody = false;
        for (let i = 0; i < body.length; i++) {
          if (body[i].x === nx && body[i].y === ny) {
            inBody = true;
            break;
          }
        }
        if (!inBody) {
          count++;
        }
      }
    }
    return count;
  }

  private calculateAutoMove() {
    if (!this.food) return;

    const head = this.snake[0];
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    interface MoveEval {
      dx: number;
      dy: number;
      isSafe: boolean;
      canReachTail: boolean;
      isolatedHoles: number;
      isEatingMove: boolean;
      distToFood: number;
      distToTail: number;
      reachableSpace: number;
      emptyNeighbors: number;
    }

    const evaluations: MoveEval[] = [];

    for (const d of dirs) {
      // Don't reverse directly
      if (d.dx === -this.dx && d.dy === -this.dy && this.snake.length > 1) continue;

      const nx = head.x + d.dx;
      const ny = head.y + d.dy;

      // Check bounds
      if (nx < 0 || nx >= this.gridCols || ny < 0 || ny >= this.gridRows) continue;

      // Check collision with snake body (excluding tail, since tail will move)
      let hitSelf = false;
      for (let i = 0; i < this.snake.length - 1; i++) {
        if (this.snake[i].x === nx && this.snake[i].y === ny) {
          hitSelf = true;
          break;
        }
      }
      if (hitSelf) continue;

      // Simulate move
      const isEating = (nx === this.food.x && ny === this.food.y);
      const simSnake = isEating 
        ? [{ x: nx, y: ny }, ...this.snake] 
        : [{ x: nx, y: ny }, ...this.snake.slice(0, -1)];

      // Roll out forced moves to evaluate where the path actually leads
      const rolledSnake = this.rolloutForcedMoves(simSnake, d.dx, d.dy);

      let isSafe = false;
      let canReachTail = false;
      let reachableSpace = 0;
      let isolatedHoles = Infinity;
      let distToTail = Infinity;

      if (rolledSnake) {
        const newHead = rolledSnake[0];
        const newTail = rolledSnake[rolledSnake.length - 1];

        // 1. Can we reach tail from the new head?
        const pathToTail = this.getPath(newHead, newTail, rolledSnake);
        canReachTail = pathToTail !== null;
        if (pathToTail) {
          distToTail = pathToTail.length;
        }

        // 2. How much space is reachable?
        reachableSpace = this.getReachableSpaceSize(newHead, rolledSnake);
        const totalEmptyCells = (this.gridCols * this.gridRows) - (rolledSnake.length - 1);
        isolatedHoles = Math.max(0, totalEmptyCells - reachableSpace);

        // A move is safe if we can reach the tail
        isSafe = canReachTail;
      }

      // 3. Distance to food
      let distToFood = Infinity;
      if (isEating) {
        distToFood = 0;
      } else if (rolledSnake) {
        const newHead = rolledSnake[0];
        const isEatingFinal = (this.food && newHead.x === this.food.x && newHead.y === this.food.y);
        if (isEatingFinal) {
          distToFood = 0;
        } else {
          const pathToFood = this.getPath(newHead, this.food, rolledSnake);
          if (pathToFood && this.isFoodSafe(rolledSnake, pathToFood)) {
            distToFood = pathToFood.length;
          }
        }
      }

      let emptyNeighbors = 0;
      if (rolledSnake) {
        emptyNeighbors = this.getEmptyNeighborsCount(rolledSnake[0], rolledSnake);
      }

      evaluations.push({
        dx: d.dx,
        dy: d.dy,
        isSafe,
        canReachTail,
        isolatedHoles,
        isEatingMove: isEating,
        distToFood,
        distToTail,
        reachableSpace,
        emptyNeighbors
      });
    }

    if (evaluations.length === 0) {
      // Literally trapped, no valid moves, just keep moving in current dir or any dir
      return;
    }

    const isLooping = this.stepsSinceLastEat > Math.min(this.snake.length, 100);

    // Sort evaluations to find the best move
    evaluations.sort((a, b) => {
      // 1. Prioritize safe moves
      if (a.isSafe !== b.isSafe) {
        return a.isSafe ? -1 : 1;
      }
      // 2. Minimize isolated holes (prevent partitioning space)
      if (a.isolatedHoles !== b.isolatedHoles) {
        return a.isolatedHoles - b.isolatedHoles;
      }
      // 3. Prioritize eating if safe
      if (a.isEatingMove !== b.isEatingMove) {
        return a.isEatingMove ? -1 : 1;
      }
      
      // 4. Path prioritization: 
      // If we can reach the food, prioritize getting closer to it.
      // If food is unreachable, prioritize following the tail.
      const aCanReachFood = a.distToFood !== Infinity;
      const bCanReachFood = b.distToFood !== Infinity;
      if (aCanReachFood !== bCanReachFood) {
        return aCanReachFood ? -1 : 1;
      }

      if (aCanReachFood) {
        if (a.distToFood !== b.distToFood) {
          return a.distToFood - b.distToFood;
        }
      } else {
        if (isLooping) {
          // If we are looping and food is unreachable/unsafe, prioritize MAXIMIZING distance to tail to unwind
          if (a.distToTail !== b.distToTail) {
            return b.distToTail - a.distToTail;
          }
        } else {
          // Otherwise, minimize distance to tail to stay compact
          if (a.distToTail !== b.distToTail) {
            return a.distToTail - b.distToTail;
          }
        }
      }

      // 5. Prefer moves that can reach tail (as a tie-breaker)
      if (a.canReachTail !== b.canReachTail) {
        return a.canReachTail ? -1 : 1;
      }
      // 6. Prefer moves with more empty neighbors (prefer open spaces to avoid tunnels)
      if (a.emptyNeighbors !== b.emptyNeighbors) {
        return b.emptyNeighbors - a.emptyNeighbors;
      }
      // 7. Maximize reachable space
      if (a.reachableSpace !== b.reachableSpace) {
        return b.reachableSpace - a.reachableSpace;
      }
      return 0;
    });

    const bestMove = evaluations[0];
    this.nextDx = bestMove.dx;
    this.nextDy = bestMove.dy;
  }

  private moveSnake() {
    this.dx = this.nextDx;
    this.dy = this.nextDy;
    
    const head = this.snake[0];
    const newHead = { x: head.x + this.dx, y: head.y + this.dy };
    
    // Check wall collision
    if (newHead.x < 0 || newHead.x >= this.gridCols || newHead.y < 0 || newHead.y >= this.gridRows) {
      this.snake.unshift(newHead); // Add to render the crash at the wall
      this.triggerGameOver();
      return;
    }
    
    // Check self collision
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.snake.unshift(newHead); // Add to render the crash
        this.triggerGameOver();
        return;
      }
    }

    this.snake.unshift(newHead);

    // Check food collision
    if (this.food && newHead.x === this.food.x && newHead.y === this.food.y) {
      // Eat food
      const pts = 10;
      const oldScore = this.score;
      this.score += pts;
      if (this.onScore) this.onScore(this.score);
      
      const fx = this.gridX + this.food.x * this.cellSize + this.cellSize/2 + (Math.random() - 0.5) * 15;
      const fy = this.gridY + this.food.y * this.cellSize + this.cellSize/2 + (Math.random() - 0.5) * 15;
      
      this.audio.playEat();
      this.spawnFloatingText(`+${pts}`, fx, fy, this.foodColor);
      this.triggerScreenShake(3, 100);

      // Milestone check (every 100 points)
      if (Math.floor(this.score / 100) > Math.floor(oldScore / 100)) {
         this.audio.playMilestone();
         this.triggerScreenShake(15, 600); // Strong shake
         this.milestoneFlash = { text: 'SPEED UP!', life: 2.0, scale: 0.1 };
         this.screenFlash = 0.5; // Slight flash
      }
      
      // Burst some particles
      for(let i=0; i<15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        this.particles.push({
          x: fx, y: fy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          color: this.foodColor,
          size: Math.random() * 4 + 2
        });
      }

      this.spawnFood();
      
      // Speed up slightly
      if (this.moveInterval > 40) {
        this.moveInterval -= 2; // Increase speed
      }
      this.isDigesting = true;
      this.stepsSinceLastEat = 0;
    } else {
      // Not eating, remove tail
      this.snake.pop();
      this.isDigesting = false;
      this.stepsSinceLastEat++;
    }
  }

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    c.save();
    if (this.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMag;
      const sy = (Math.random() - 0.5) * this.shakeMag;
      c.translate(sx, sy);
    }

    // Background Grid
    c.save();
    c.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    c.lineWidth = 1;
    for (let r=0; r<=this.gridRows; r++) {
      c.beginPath();
      c.moveTo(this.gridX, this.gridY + r*this.cellSize);
      c.lineTo(this.gridX + this.gridCols*this.cellSize, this.gridY + r*this.cellSize);
      c.stroke();
    }
    for (let col=0; col<=this.gridCols; col++) {
      c.beginPath();
      c.moveTo(this.gridX + col*this.cellSize, this.gridY);
      c.lineTo(this.gridX + col*this.cellSize, this.gridY + this.gridRows*this.cellSize);
      c.stroke();
    }
    
    // Grid Border (Arena)
    c.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    c.lineWidth = 2;
    c.shadowColor = '#00f0ff';
    c.shadowBlur = 10;
    c.strokeRect(this.gridX, this.gridY, this.gridCols*this.cellSize, this.gridRows*this.cellSize);
    c.restore();

    // Draw Food
    if (this.food) {
      c.save();
      const fx = this.gridX + this.food.x * this.cellSize;
      const fy = this.gridY + this.food.y * this.cellSize;
      
      this.foodPulse += 0.1;
      const scale = (Math.sin(this.foodPulse) + 1) / 2 * 0.2 + 0.8; // 0.8 to 1.0
      
      c.translate(fx + this.cellSize/2, fy + this.cellSize/2);
      c.scale(scale, scale);
      
      c.fillStyle = this.foodColor;
      c.shadowColor = this.foodColor;
      c.shadowBlur = 15;
      
      // Diamond shape
      c.beginPath();
      c.moveTo(0, -this.cellSize/3);
      c.lineTo(this.cellSize/3, 0);
      c.lineTo(0, this.cellSize/3);
      c.lineTo(-this.cellSize/3, 0);
      c.fill();
      c.restore();
    }

    // Draw Snake
    c.save();
    if (this.snake.length > 1) {
      const progress = this.isGameOver ? 1.0 : (this.moveTimer / this.moveInterval);
      
      const head = this.snake[0];
      const neck = this.snake[1];
      const hx = neck.x + (head.x - neck.x) * progress;
      const hy = neck.y + (head.y - neck.y) * progress;
      
      const tailIndex = this.snake.length - 1;
      const tail = this.snake[tailIndex];
      const tailPrev = this.snake[tailIndex - 1];
      
      let tx = tail.x;
      let ty = tail.y;
      
      // Interpolate tail only if not digesting and not game over
      if (!this.isDigesting && !this.isGameOver && tailPrev) {
         tx = tail.x + (tailPrev.x - tail.x) * progress;
         ty = tail.y + (tailPrev.y - tail.y) * progress;
      }

      // Draw neon trail
      c.beginPath();
      c.strokeStyle = '#00f0ff'; // Neon Cyan
      c.lineWidth = this.cellSize * 0.6;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      
      c.moveTo(this.gridX + tx * this.cellSize + this.cellSize/2, this.gridY + ty * this.cellSize + this.cellSize/2);
      
      for (let i = tailIndex - 1; i >= 1; i--) {
        c.lineTo(this.gridX + this.snake[i].x * this.cellSize + this.cellSize/2, this.gridY + this.snake[i].y * this.cellSize + this.cellSize/2);
      }
      
      c.lineTo(this.gridX + hx * this.cellSize + this.cellSize/2, this.gridY + hy * this.cellSize + this.cellSize/2);
      
      c.shadowColor = '#00f0ff';
      c.shadowBlur = Math.sin(this.time * 0.01) * 5 + 15;
      c.stroke();

      // Draw Lightcycle Head (Triangle)
      c.save();
      c.fillStyle = '#fff';
      c.shadowColor = '#fff';
      c.shadowBlur = 20;
      
      c.translate(this.gridX + hx * this.cellSize + this.cellSize/2, this.gridY + hy * this.cellSize + this.cellSize/2);
      
      let angle = 0;
      if (head.x > neck.x) angle = 0;
      else if (head.x < neck.x) angle = Math.PI;
      else if (head.y > neck.y) angle = Math.PI / 2;
      else if (head.y < neck.y) angle = -Math.PI / 2;
      
      c.rotate(angle);
      
      c.beginPath();
      c.moveTo(this.cellSize * 0.5, 0);
      c.lineTo(-this.cellSize * 0.3, this.cellSize * 0.4);
      c.lineTo(-this.cellSize * 0.3, -this.cellSize * 0.4);
      c.closePath();
      c.fill();
      c.restore();
    }
    c.restore();

    // Draw Particles
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let p of this.particles) {
      c.fillStyle = p.color;
      c.globalAlpha = p.life;
      c.shadowColor = p.color;
      c.shadowBlur = 10;
      c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.restore();

    // Draw Floating Texts
    c.save();
    c.textAlign = 'center';
    for (let ft of this.floatingTexts) {
      c.font = `bold ${ft.size}px "Orbitron", sans-serif`;
      c.fillStyle = ft.color;
      c.globalAlpha = ft.life;
      c.shadowColor = ft.color;
      c.shadowBlur = 15;
      c.fillText(ft.text, ft.x, ft.y);
    }
    c.restore();

    // Draw Screen Flash
    if (this.screenFlash > 0) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to cover full screen
      c.fillStyle = `rgba(255, 255, 255, ${this.screenFlash * 0.5})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      c.restore();
    }

    // Draw Milestone Flash on top of everything
    if (this.milestoneFlash) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.translate(this.canvas.width / 2, this.canvas.height / 2);
      c.scale(this.milestoneFlash.scale, this.milestoneFlash.scale);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `bold 60px "Orbitron", sans-serif`;
      
      const alpha = Math.min(1, this.milestoneFlash.life * 2);
      c.globalAlpha = alpha;
      
      c.fillStyle = '#ff007f';
      c.shadowColor = '#ff007f';
      c.shadowBlur = 40;
      
      const pulse = Math.sin(this.time * 0.02) * 5;
      c.fillText(this.milestoneFlash.text, 0, pulse);
      
      c.fillStyle = '#fff';
      c.shadowBlur = 0;
      c.fillText(this.milestoneFlash.text, 0, pulse);
      c.restore();
    }

    c.restore();
  }

  private printDebugMap(header: string = "SNAKE AI LOOP DETECTED") {
    console.log(`=== ${header} ===`);
    console.log(`Grid Size: ${this.gridCols}x${this.gridRows}, Snake Length: ${this.snake.length}, Steps since eat: ${this.stepsSinceLastEat}`);
    
    const grid: string[][] = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill('.'));
    
    // Draw food
    if (this.food) {
      grid[this.food.y][this.food.x] = 'A';
    }
    
    // Draw snake body
    for (let i = 1; i < this.snake.length - 1; i++) {
      const p = this.snake[i];
      if (p.y >= 0 && p.y < this.gridRows && p.x >= 0 && p.x < this.gridCols) {
        grid[p.y][p.x] = 'S';
      }
    }
    
    // Draw tail
    if (this.snake.length > 1) {
      const t = this.snake[this.snake.length - 1];
      if (t.y >= 0 && t.y < this.gridRows && t.x >= 0 && t.x < this.gridCols) {
        grid[t.y][t.x] = 'T';
      }
    }
    
    // Draw head
    if (this.snake.length > 0) {
      const h = this.snake[0];
      if (h.y >= 0 && h.y < this.gridRows && h.x >= 0 && h.x < this.gridCols) {
        grid[h.y][h.x] = 'H';
      }
    }
    
    // Print grid
    for (let r = 0; r < this.gridRows; r++) {
      console.log(grid[r].join(' '));
    }
    console.log("===============================");
  }
}
