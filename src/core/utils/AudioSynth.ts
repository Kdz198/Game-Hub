export class AudioSynth {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {
    // AudioContext is initialized lazily to comply with browser autoplay policies
  }

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public unlock() {
    if (!this.enabled) return;
    this.init();
    if (this.ctx) {
      // Play a silent note immediately to unlock audio engine on mobile/desktop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.001);
    }
  }

  public playEat() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.linearRampToValueAtTime(1200, t + 0.1);
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playCrash() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(10, t + 0.5);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.5);
  }

  public playMilestone() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(800, t + 0.3);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }
}
