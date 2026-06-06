import { GameLoop } from "../../engine/GameLoop";

export type Block = {
  x: number;
  y: number;
};

export type ShapeDef = {
  blocks: Block[]; // Relative coordinates, usually from 0,0
  color: string;
};

// Colors for the Neon aesthetic
const COLORS = [
  '#00f0ff', // Cyan
  '#ff007f', // Pink
  '#39ff14', // Green
  '#fff01f', // Yellow
  '#9d00ff', // Purple
  '#ff4500', // Orange
];

// Define common shapes
const SHAPE_DEFINITIONS: ShapeDef[] = [
  // 1x1
  { blocks: [{x:0, y:0}], color: COLORS[0] },
  // 2x2
  { blocks: [{x:0,y:0}, {x:1,y:0}, {x:0,y:1}, {x:1,y:1}], color: COLORS[1] },
  // 1x2, 2x1
  { blocks: [{x:0,y:0}, {x:0,y:1}], color: COLORS[2] },
  { blocks: [{x:0,y:0}, {x:1,y:0}], color: COLORS[2] },
  // 1x3, 3x1
  { blocks: [{x:0,y:0}, {x:0,y:1}, {x:0,y:2}], color: COLORS[3] },
  { blocks: [{x:0,y:0}, {x:1,y:0}, {x:2,y:0}], color: COLORS[3] },
  // 1x4, 4x1
  { blocks: [{x:0,y:0}, {x:0,y:1}, {x:0,y:2}, {x:0,y:3}], color: COLORS[4] },
  { blocks: [{x:0,y:0}, {x:1,y:0}, {x:2,y:0}, {x:3,y:0}], color: COLORS[4] },
  // L shapes
  { blocks: [{x:0,y:0}, {x:0,y:1}, {x:0,y:2}, {x:1,y:2}], color: COLORS[5] },
  { blocks: [{x:0,y:0}, {x:1,y:0}, {x:2,y:0}, {x:0,y:1}], color: COLORS[5] },
  // T shape
  { blocks: [{x:1,y:0}, {x:0,y:1}, {x:1,y:1}, {x:2,y:1}], color: COLORS[0] },
];

export class BlockBlastGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  
  public grid: (string | null)[][]; // 8x8 grid of colors
  public availableShapes: (ShapeDef | null)[] = [null, null, null];
  
  public score = 0;
  public isGameOver = false;
  
  // Layout params
  private gridCols = 8;
  private gridRows = 8;
  private cellSize = 0;
  private gridX = 0;
  private gridY = 0;
  
  // Interaction
  private draggedShapeIndex: number = -1;
  private mouseX = 0;
  private mouseY = 0;
  private dragStartX = 0;
  private dragStartY = 0;

  // Callbacks
  public onScore?: (score: number) => void;
  public onGameOver?: (score: number, bestScore: number) => void;

  private particles: any[] = [];
  private floatingTexts: any[] = [];
  
  // Screen shake
  private shakeTime = 0;
  private shakeMag = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    this.ctx = ctx;

    this.grid = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill(null));

    this.loop = new GameLoop(this.update.bind(this), this.draw.bind(this));
    
    this.attachEvents();
    this.refillShapes();
  }

  public resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.calculateLayout();
  }

  private calculateLayout() {
    // Leave room at top for HUD, bottom for shapes dock
    const availableWidth = this.canvas.width * 0.95;
    const availableHeight = this.canvas.height * 0.65;
    
    this.cellSize = Math.floor(Math.min(availableWidth / this.gridCols, availableHeight / this.gridRows));
    
    // Center grid
    this.gridX = (this.canvas.width - (this.cellSize * this.gridCols)) / 2;
    // Push it down slightly to clear HUD
    this.gridY = (this.canvas.height * 0.48) - ((this.cellSize * this.gridRows) / 2); 
  }

  private attachEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp); // catch up anywhere
  }

  public destroy() {
    this.loop.stop();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  public start() {
    this.reset();
    this.loop.start();
  }

  public reset() {
    this.grid = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill(null));
    this.score = 0;
    this.isGameOver = false;
    this.particles = [];
    this.floatingTexts = [];
    this.refillShapes();
    if (this.onScore) this.onScore(this.score);
  }

  private getRandomShape(): ShapeDef {
    return SHAPE_DEFINITIONS[Math.floor(Math.random() * SHAPE_DEFINITIONS.length)];
  }

  private refillShapes() {
    let emptyCount = 0;
    for (let i=0; i<3; i++) {
      if (!this.availableShapes[i]) emptyCount++;
    }
    
    if (emptyCount === 3) {
      this.availableShapes = [this.getRandomShape(), this.getRandomShape(), this.getRandomShape()];
      this.checkGameOver();
    }
  }

  private checkGameOver() {
    // Game over if none of the available shapes can be placed
    let canPlaceAny = false;
    for (let shape of this.availableShapes) {
      if (shape) {
        if (this.canPlaceShapeAnywhere(shape)) {
          canPlaceAny = true;
          break;
        }
      }
    }
    if (!canPlaceAny) {
      this.isGameOver = true;
      const best = Math.max(this.score, parseInt(localStorage.getItem('bb_best') || '0'));
      localStorage.setItem('bb_best', best.toString());
      if (this.onGameOver) this.onGameOver(this.score, best);
    }
  }

  private canPlaceShapeAnywhere(shape: ShapeDef): boolean {
    for (let r=0; r<this.gridRows; r++) {
      for (let c=0; c<this.gridCols; c++) {
        if (this.isValidPlacement(shape, c, r)) return true;
      }
    }
    return false;
  }

  private getDockPosition(index: number) {
    const dockY = this.canvas.height - 120;
    const spacing = this.canvas.width / 3;
    const dockX = (index * spacing) + (spacing / 2);
    return { x: dockX, y: dockY };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.isGameOver) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on a shape in the dock
    for (let i=0; i<3; i++) {
      const shape = this.availableShapes[i];
      if (!shape) continue;

      const pos = this.getDockPosition(i);
      // Rough bounding box for the docked shape
      const dockCellSize = this.cellSize * 0.6; // drawn smaller in dock
      
      let minX=99, maxX=-99, minY=99, maxY=-99;
      shape.blocks.forEach(b => {
        if (b.x < minX) minX = b.x;
        if (b.x > maxX) maxX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.y > maxY) maxY = b.y;
      });

      const w = ((maxX - minX + 1) * dockCellSize);
      const h = ((maxY - minY + 1) * dockCellSize);
      
      const sX = pos.x - w/2;
      const sY = pos.y - h/2;

      // Add padding for easier grab
      if (x >= sX - 20 && x <= sX + w + 20 && y >= sY - 20 && y <= sY + h + 20) {
        this.draggedShapeIndex = i;
        this.dragStartX = x;
        this.dragStartY = y;
        this.mouseX = x;
        this.mouseY = y;
        break;
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.draggedShapeIndex !== -1) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.draggedShapeIndex !== -1) {
      // Try to place the shape
      const shape = this.availableShapes[this.draggedShapeIndex];
      if (shape) {
        const gridPos = this.getGridPositionFromMouse(shape, this.mouseX, this.mouseY);
        
        if (gridPos && this.isValidPlacement(shape, gridPos.col, gridPos.row)) {
          this.placeShape(shape, gridPos.col, gridPos.row);
          this.availableShapes[this.draggedShapeIndex] = null;
          this.refillShapes();
          this.checkGameOver();
        }
      }
      this.draggedShapeIndex = -1;
    }
  };

  private getGridPositionFromMouse(shape: ShapeDef, mx: number, my: number) {
    // When dragging, we center the shape around the mouse or slightly above
    // Assuming the mouse holds the center of the shape
    let minX=99, maxX=-99, minY=99, maxY=-99;
    shape.blocks.forEach(b => {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    });

    const shapeW = (maxX - minX + 1) * this.cellSize;
    const shapeH = (maxY - minY + 1) * this.cellSize;

    // Top-left of the shape in canvas coords
    // Subtract an offset so the user can see what they are placing under their finger
    const fingerOffset = 60; 
    const sx = mx - shapeW/2;
    const sy = my - shapeH/2 - fingerOffset; 

    // Find closest grid cell
    const col = Math.round((sx - this.gridX) / this.cellSize);
    const row = Math.round((sy - this.gridY) / this.cellSize);

    return { col, row };
  }

  private isValidPlacement(shape: ShapeDef, startCol: number, startRow: number): boolean {
    for (let b of shape.blocks) {
      const c = startCol + b.x;
      const r = startRow + b.y;
      
      if (c < 0 || c >= this.gridCols || r < 0 || r >= this.gridRows) return false;
      if (this.grid[r][c] !== null) return false;
    }
    return true;
  }

  private placeShape(shape: ShapeDef, startCol: number, startRow: number) {
    // Place blocks
    for (let b of shape.blocks) {
      const c = startCol + b.x;
      const r = startRow + b.y;
      this.grid[r][c] = shape.color;
    }

    // Score for placement
    const placeScore = shape.blocks.length * 10;
    this.score += placeScore;
    this.spawnFloatingText(`+${placeScore}`, this.mouseX, this.mouseY, shape.color);

    this.checkLines();
  }

  private checkLines() {
    let linesCleared = 0;
    const rowsToClear: number[] = [];
    const colsToClear: number[] = [];

    // Check rows
    for (let r=0; r<this.gridRows; r++) {
      let full = true;
      for (let c=0; c<this.gridCols; c++) {
        if (this.grid[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) rowsToClear.push(r);
    }

    // Check columns
    for (let c=0; c<this.gridCols; c++) {
      let full = true;
      for (let r=0; r<this.gridRows; r++) {
        if (this.grid[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) colsToClear.push(c);
    }

    linesCleared = rowsToClear.length + colsToClear.length;

    if (linesCleared > 0) {
      // Clear them and spawn particles
      rowsToClear.forEach(r => {
        for(let c=0; c<this.gridCols; c++) {
          if (this.grid[r][c]) {
            this.spawnParticles(this.gridX + c*this.cellSize + this.cellSize/2, this.gridY + r*this.cellSize + this.cellSize/2, this.grid[r][c]!);
            this.grid[r][c] = null;
          }
        }
      });

      colsToClear.forEach(c => {
        for(let r=0; r<this.gridRows; r++) {
          if (this.grid[r][c]) {
            this.spawnParticles(this.gridX + c*this.cellSize + this.cellSize/2, this.gridY + r*this.cellSize + this.cellSize/2, this.grid[r][c]!);
            this.grid[r][c] = null;
          }
        }
      });

      // Score multiplier for multiple lines
      const lineScore = linesCleared * 100 * linesCleared;
      this.score += lineScore;
      
      this.triggerScreenShake(linesCleared * 3, 200); // 3px shake per line cleared
      this.spawnFloatingText(`${linesCleared} LINE${linesCleared>1?'S':''}! +${lineScore}`, this.canvas.width/2, this.gridY + this.gridRows*this.cellSize/2, '#fff');

      if (this.onScore) this.onScore(this.score);
    }
  }

  private getClearedLinesSimulation(shape: ShapeDef, startCol: number, startRow: number) {
    const rowsToClear: number[] = [];
    const colsToClear: number[] = [];

    // Temporarily place shape
    for (let b of shape.blocks) {
      this.grid[startRow + b.y][startCol + b.x] = shape.color;
    }

    // Check rows
    for (let r=0; r<this.gridRows; r++) {
      let full = true;
      for (let c=0; c<this.gridCols; c++) {
        if (this.grid[r][c] === null) { full = false; break; }
      }
      if (full) rowsToClear.push(r);
    }

    // Check columns
    for (let c=0; c<this.gridCols; c++) {
      let full = true;
      for (let r=0; r<this.gridRows; r++) {
        if (this.grid[r][c] === null) { full = false; break; }
      }
      if (full) colsToClear.push(c);
    }

    // Remove temporary shape
    for (let b of shape.blocks) {
      this.grid[startRow + b.y][startCol + b.x] = null;
    }

    return { rowsToClear, colsToClear };
  }

  private spawnParticles(x: number, y: number, color: string) {
    // Advanced Explosion Particles
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: Math.random() * 6 + 4
      });
    }
  }

  private triggerScreenShake(magnitude: number, duration: number) {
    this.shakeMag = magnitude;
    this.shakeTime = duration;
  }

  private spawnFloatingText(text: string, x: number, y: number, color: string) {
    this.floatingTexts.push({
      text, x, y, life: 1.0, color
    });
  }

  private update(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime < 0) this.shakeTime = 0;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92; // Friction
      p.vy *= 0.92;
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

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    c.save();
    if (this.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMag;
      const sy = (Math.random() - 0.5) * this.shakeMag;
      c.translate(sx, sy);
    }

    // Draw Grid Background
    c.save();
    c.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    c.lineWidth = 1;
    for (let r=0; r<this.gridRows; r++) {
      for (let col=0; col<this.gridCols; col++) {
        c.strokeRect(this.gridX + col*this.cellSize, this.gridY + r*this.cellSize, this.cellSize, this.cellSize);
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.fillRect(this.gridX + col*this.cellSize, this.gridY + r*this.cellSize, this.cellSize, this.cellSize);
      }
    }
    c.restore();

    // Draw Placed Blocks
    for (let r=0; r<this.gridRows; r++) {
      for (let col=0; col<this.gridCols; col++) {
        if (this.grid[r][col]) {
          this.drawBlock(c, this.gridX + col*this.cellSize, this.gridY + r*this.cellSize, this.cellSize, this.grid[r][col]!);
        }
      }
    }

    // Draw Docked Shapes
    for (let i=0; i<3; i++) {
      if (i === this.draggedShapeIndex) continue; // don't draw dragged one in dock
      const shape = this.availableShapes[i];
      if (shape) {
        const pos = this.getDockPosition(i);
        this.drawShapeCentered(c, shape, pos.x, pos.y, this.cellSize * 0.5); // scale down
      }
    }

    // Draw Dragged Shape
    if (this.draggedShapeIndex !== -1) {
      const shape = this.availableShapes[this.draggedShapeIndex];
      if (shape) {
        const fingerOffset = 60; 
        this.drawShapeCentered(c, shape, this.mouseX, this.mouseY - fingerOffset, this.cellSize);

        // Draw shadow/preview
        const gridPos = this.getGridPositionFromMouse(shape, this.mouseX, this.mouseY);
        if (this.isValidPlacement(shape, gridPos.col, gridPos.row)) {
           // Simulate cleared lines for predictive hover
           const { rowsToClear, colsToClear } = this.getClearedLinesSimulation(shape, gridPos.col, gridPos.row);

           c.save();
           // Highlight rows
           rowsToClear.forEach(r => {
             c.fillStyle = 'rgba(255, 255, 255, 0.2)';
             c.fillRect(this.gridX, this.gridY + r*this.cellSize, this.cellSize * this.gridCols, this.cellSize);
           });
           // Highlight cols
           colsToClear.forEach(col => {
             c.fillStyle = 'rgba(255, 255, 255, 0.2)';
             c.fillRect(this.gridX + col*this.cellSize, this.gridY, this.cellSize, this.cellSize * this.gridRows);
           });
           
           c.globalAlpha = 0.4;
           for (let b of shape.blocks) {
              const px = this.gridX + (gridPos.col + b.x) * this.cellSize;
              const py = this.gridY + (gridPos.row + b.y) * this.cellSize;
              this.drawBlock(c, px, py, this.cellSize, shape.color);
              
              // Extra glow if part of a cleared line
              if (rowsToClear.includes(gridPos.row + b.y) || colsToClear.includes(gridPos.col + b.x)) {
                 c.shadowBlur = 20;
                 c.shadowColor = '#fff';
                 c.fillStyle = '#fff';
                 c.fillRect(px, py, this.cellSize, this.cellSize);
              }
           }
           c.restore();
        }
      }
    }

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
    c.font = 'bold 28px "Orbitron", sans-serif';
    for (let ft of this.floatingTexts) {
      c.fillStyle = ft.color;
      c.globalAlpha = ft.life;
      c.shadowColor = ft.color;
      c.shadowBlur = 15;
      c.fillText(ft.text, ft.x, ft.y);
    }
    c.restore();

    // Restore shake translation
    c.restore();
  }

  private drawBlock(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const pad = 1;
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 10;
    c.fillRect(x + pad, y + pad, size - pad*2, size - pad*2);
    
    // Highlight inner
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(x + pad + 2, y + pad + 2, size - pad*2 - 4, size - pad*2 - 4);
  }

  private drawShapeCentered(c: CanvasRenderingContext2D, shape: ShapeDef, cx: number, cy: number, cellSize: number) {
    let minX=99, maxX=-99, minY=99, maxY=-99;
    shape.blocks.forEach(b => {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    });

    const w = (maxX - minX + 1) * cellSize;
    const h = (maxY - minY + 1) * cellSize;
    const startX = cx - w/2;
    const startY = cy - h/2;

    for (let b of shape.blocks) {
      this.drawBlock(c, startX + (b.x - minX)*cellSize, startY + (b.y - minY)*cellSize, cellSize, shape.color);
    }
  }
}
