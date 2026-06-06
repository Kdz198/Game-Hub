export class InputManager {
  private keys: Set<string> = new Set();
  private element: HTMLElement | Window;
  private pointerDown: boolean = false;
  private actionTriggered: boolean = false;

  constructor(element: HTMLElement | Window = window) {
    this.element = element;
    this.init();
  }

  private init() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    
    // For mobile/mouse
    if (this.element instanceof HTMLElement) {
      this.element.addEventListener('pointerdown', this.handlePointerDown);
      this.element.addEventListener('pointerup', this.handlePointerUp);
    } else {
      window.addEventListener('pointerdown', this.handlePointerDown);
      window.addEventListener('pointerup', this.handlePointerUp);
    }
  }

  public destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    
    if (this.element instanceof HTMLElement) {
      this.element.removeEventListener('pointerdown', this.handlePointerDown as EventListener);
      this.element.removeEventListener('pointerup', this.handlePointerUp as EventListener);
    } else {
      window.removeEventListener('pointerdown', this.handlePointerDown);
      window.removeEventListener('pointerup', this.handlePointerUp);
    }
  }

  private handleKeyDown = (e: Event) => {
    const keyEvent = e as KeyboardEvent;
    this.keys.add(keyEvent.code);
    if (keyEvent.code === 'Space') {
      e.preventDefault(); // Prevent page scroll
      this.actionTriggered = true;
    }
  };

  private handleKeyUp = (e: Event) => {
    const keyEvent = e as KeyboardEvent;
    this.keys.delete(keyEvent.code);
  };

  private handlePointerDown = (e: Event) => {
    e.preventDefault();
    this.pointerDown = true;
    this.actionTriggered = true;
  };

  private handlePointerUp = () => {
    this.pointerDown = false;
  };

  public isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  public isPointerDown(): boolean {
    return this.pointerDown;
  }

  public consumeAction(): boolean {
    if (this.actionTriggered) {
      this.actionTriggered = false;
      return true;
    }
    return false;
  }
}
