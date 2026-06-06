/**
 * AudioSynth — Module-level singleton AudioContext + AudioBuffer.
 *
 * Root cause of previous failures:
 * - OscillatorNode approach: Chrome throttles rapid oscillator creation
 * - HTMLAudioElement approach: play() succeeds but OS audio mixer drops
 *   output when too many separate media streams compete
 *
 * Fix: ONE AudioContext (singleton, survives React re-renders) with
 * pre-rendered AudioBuffers.  BufferSourceNode is the cheapest node
 * to create and all sounds share the same audio thread.
 */

// ── Module-level singleton ──────────────────────────────────────
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new AC();
  }
  return sharedCtx;
}

// ── Class ───────────────────────────────────────────────────────
export class AudioSynth {
  public enabled = true;
  private buffers: Record<string, AudioBuffer | null> = {};
  private initialised = false;

  constructor() {}

  /** Must be called inside a user-gesture (click/tap) handler. */
  public unlock() {
    if (this.initialised) return;
    this.initialised = true;

    const ctx = getCtx();

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Pre-render sound buffers
    this.buffers.eat       = this.renderBuffer(ctx, 0.20, this.genEat);
    this.buffers.crash     = this.renderBuffer(ctx, 0.50, this.genCrash);
    this.buffers.milestone = this.renderBuffer(ctx, 0.35, this.genMilestone);
  }

  public destroy() {
    // Don't close sharedCtx — it's a singleton, keep it alive
    this.buffers = {};
    this.initialised = false;
  }

  /* ── public API ───────────────────────────────────────────────── */

  public playEat() { this.play('eat'); }
  public playCrash() { this.play('crash'); }
  public playMilestone() { this.play('milestone'); }

  /* ── internal ─────────────────────────────────────────────────── */

  private play(name: string) {
    if (!this.enabled) return;
    const buf = this.buffers[name];
    if (!buf) return;

    const ctx = getCtx();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }

  /* ── buffer rendering ─────────────────────────────────────────── */

  private renderBuffer(
    ctx: AudioContext,
    durationSec: number,
    gen: (t: number, dur: number) => number
  ): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      data[i] = gen(t, durationSec);
    }
    return buf;
  }

  /* ── waveform generators (pure functions, t in seconds) ────── */

  /** Retro blip: two-tone sine wave beep */
  private genEat(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    // Two-tone: 700Hz to 950Hz, sine wave (much softer than square)
    const freq = t < dur * 0.45 ? 700 : 950;
    const sine = Math.sin(2 * Math.PI * freq * t);
    return sine * env * 0.22;
  }

  /** Deep retro explosion: triangle sweep mixed with soft noise */
  private genCrash(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    // Low frequency triangle sweep (180Hz -> ~1.8Hz)
    const freq = 180 * Math.pow(0.01, t / dur);
    const phase = freq * t;
    const x = phase % 1;
    const tri = x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
    
    // Soft noise for crunchy texture
    const noise = Math.random() * 2 - 1;
    
    // Mix 60% triangle sweep + 40% noise, low volume (0.28)
    return (tri * 0.6 + noise * 0.4) * env * 0.28;
  }

  /** Sweet level-up chime: rising major triad sine wave */
  private genMilestone(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    // C major chord arpeggio: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
    let freq = 523.25;
    if (t > dur * 0.33) freq = 659.25;
    if (t > dur * 0.66) freq = 783.99;
    
    const sine = Math.sin(2 * Math.PI * freq * t);
    return sine * env * 0.22;
  }
}
