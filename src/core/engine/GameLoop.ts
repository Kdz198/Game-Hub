export class GameLoop {
  private lastTime: number = 0;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  
  constructor(private update: (deltaTime: number) => void, private draw: () => void) {}

  private loop = (timestamp: number) => {
    if (!this.isRunning) return;

    if (!this.lastTime) {
      this.lastTime = timestamp;
    }

    let deltaTime = timestamp - this.lastTime;
    if (deltaTime > 100) deltaTime = 100; // Cap at 100ms
    this.lastTime = timestamp;

    this.update(deltaTime);
    this.draw();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  public start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = 0;
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
