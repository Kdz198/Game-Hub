export class AudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public enabled: boolean = true;

  constructor() {}

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Master volume
        this.masterGain.connect(this.ctx.destination);
      }
    }
  }

  public destroy() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
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
      gain.connect(this.masterGain!);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.001);
    }
  }

  private scheduleSound(type: OscillatorType, freq1: number, freq2: number, duration: number, vol: number) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const play = () => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime; 
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq1, t);
      if (freq1 !== freq2) {
         osc.frequency.exponentialRampToValueAtTime(freq2, t + duration);
      }
      
      gain.gain.value = vol; // Start exactly at vol
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration); // Exp ramp to 0.001 is smoother than linear to 0
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
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
    this.scheduleSound('square', 800, 1200, 0.1, 0.5);
  }

  public playCrash() {
    this.scheduleSound('sawtooth', 150, 10, 0.5, 0.8);
  }

  public playMilestone() {
    this.scheduleSound('square', 400, 800, 0.3, 0.6);
  }
}
