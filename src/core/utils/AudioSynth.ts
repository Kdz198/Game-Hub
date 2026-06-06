export class AudioSynth {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  public enabled: boolean = true;

  constructor() {}

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-15, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.1, this.ctx.currentTime);
        this.compressor.connect(this.ctx.destination);
      }
    }
  }

  public unlock() {
    if (!this.enabled) return;
    this.init();
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      if (this.compressor) gain.connect(this.compressor);
      else gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.001);
    }
  }

  private scheduleSound(type: OscillatorType, freq1: number, freq2: number, duration: number, vol: number) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const play = () => {
      if (!this.ctx) return;
      // Schedule slightly in the future (20ms) to ensure the audio engine doesn't drop the frame
      const t = this.ctx.currentTime + 0.02; 
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq1, t);
      if (freq1 !== freq2) {
         osc.frequency.linearRampToValueAtTime(freq2, t + duration);
      }
      
      gain.gain.setValueAtTime(vol, t);
      gain.gain.linearRampToValueAtTime(0, t + duration);
      
      osc.connect(gain);
      if (this.compressor) gain.connect(this.compressor);
      else gain.connect(this.ctx.destination);
      
      osc.start(t);
      osc.stop(t + duration);
    };

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }

  public playEat() {
    // A slightly louder and longer square wave for retro beep
    this.scheduleSound('square', 800, 1200, 0.15, 0.15);
  }

  public playCrash() {
    // Distorted drop
    this.scheduleSound('sawtooth', 150, 10, 0.5, 0.4);
  }

  public playMilestone() {
    // Chime
    this.scheduleSound('square', 400, 800, 0.3, 0.15);
  }
}
