/**
 * AudioSynth — Pre-rendered AudioBuffer approach.
 *
 * Instead of creating a new OscillatorNode every time we want a beep
 * (which Chrome throttles / drops under load), we render each sound
 * effect into an AudioBuffer once at init time.  Playing a sound is
 * then just "create a cheap BufferSource → start()" which the browser
 * never drops.
 */
export class AudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers: Record<string, AudioBuffer> = {};
  public enabled = true;

  constructor() {}

  /* ── lifecycle ────────────────────────────────────────────────── */

  /** Must be called inside a user-gesture handler (click / tap). */
  public unlock() {
    if (this.ctx) return;          // already initialised
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);

    // Pre-render every sound effect
    this.buffers.eat       = this.renderEat();
    this.buffers.crash     = this.renderCrash();
    this.buffers.milestone = this.renderMilestone();
  }

  public destroy() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.buffers = {};
  }

  /* ── public play methods ──────────────────────────────────────── */

  public playEat()       { this.play('eat'); }
  public playCrash()     { this.play('crash'); }
  public playMilestone() { this.play('milestone'); }

  /* ── internal helpers ─────────────────────────────────────────── */

  private play(name: string) {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const buf = this.buffers[name];
    if (!buf) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.masterGain);
    src.start();
  }

  /* ── sound rendering (offline) ────────────────────────────────── */

  /**
   * Build an AudioBuffer by filling raw PCM samples.
   * This runs synchronously — no network, no scheduling issues.
   */
  private makeBuffer(durationSec: number, fn: (i: number, len: number, sr: number) => number): AudioBuffer {
    if (!this.ctx) throw new Error('no ctx');
    const sr  = this.ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = fn(i, len, sr);
    }
    return buf;
  }

  /** Short rising square-wave beep */
  private renderEat(): AudioBuffer {
    return this.makeBuffer(0.1, (i, len, sr) => {
      const t = i / sr;                         // time in seconds
      const env = 1 - i / len;                  // linear fade-out
      const freq = 800 + (400 * t / 0.1);       // 800 → 1200 Hz
      const sample = Math.sign(Math.sin(2 * Math.PI * freq * t)); // square wave
      return sample * env * 0.5;
    });
  }

  /** Low sawtooth crash */
  private renderCrash(): AudioBuffer {
    return this.makeBuffer(0.45, (i, len, sr) => {
      const t = i / sr;
      const env = 1 - i / len;
      const freq = 150 * Math.pow(10 / 150, t / 0.45);  // exp sweep 150 → 10
      // sawtooth: 2*(freq*t mod 1) - 1
      const phase = freq * t;
      const sample = 2 * (phase - Math.floor(phase)) - 1;
      return sample * env * 0.6;
    });
  }

  /** Rising chime / power-up */
  private renderMilestone(): AudioBuffer {
    return this.makeBuffer(0.3, (i, len, sr) => {
      const t = i / sr;
      const env = 1 - i / len;
      const freq = 400 + (400 * t / 0.3);       // 400 → 800 Hz
      const sample = Math.sign(Math.sin(2 * Math.PI * freq * t));
      return sample * env * 0.45;
    });
  }
}
