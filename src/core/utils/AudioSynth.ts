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

  /** Retro blip: two-tone square wave beep */
  private genEat(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    // Two-tone: 1000Hz for first half, 1400Hz for second half
    const freq = t < dur * 0.5 ? 1000 : 1400;
    const square = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
    return square * env * 0.8;
  }

  private genCrash(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    const freq = 200 * Math.pow(0.05, t / dur);
    const phase = freq * t;
    return (2 * (phase - Math.floor(phase)) - 1) * env * 0.9;
  }

  private genMilestone(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    // Three rising tones
    let freq = 600;
    if (t > dur * 0.33) freq = 900;
    if (t > dur * 0.66) freq = 1200;
    const square = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
    return square * env * 0.7;
  }
}
