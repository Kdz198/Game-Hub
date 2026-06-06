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
let sharedGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new AC();
    sharedGain = sharedCtx.createGain();
    sharedGain.gain.value = 0.4;
    sharedGain.connect(sharedCtx.destination);
  }
  return sharedCtx;
}

function getGain(): GainNode {
  if (!sharedGain) getCtx();
  return sharedGain!;
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
    this.buffers.eat       = this.renderBuffer(ctx, 0.12, this.genEat);
    this.buffers.crash     = this.renderBuffer(ctx, 0.50, this.genCrash);
    this.buffers.milestone = this.renderBuffer(ctx, 0.30, this.genMilestone);

    console.log('[AUDIO] unlocked — sampleRate:', ctx.sampleRate, 'state:', ctx.state);
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
    if (!this.enabled) {
      console.warn('[AUDIO]', name, 'SKIP: disabled');
      return;
    }
    const buf = this.buffers[name];
    if (!buf) {
      console.warn('[AUDIO]', name, 'SKIP: no buffer (unlock not called?)');
      return;
    }

    const ctx = getCtx();
    const gain = getGain();

    // Always try to resume (no-op if already running)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(0);

    console.log('[AUDIO] ▶', name, '— ctxState:', ctx.state, 'ctxTime:', ctx.currentTime.toFixed(3));
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

  private genEat(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    const freq = 880 + 2000 * (t / dur);
    return Math.sin(2 * Math.PI * freq * t) * env * 0.7;
  }

  private genCrash(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    const freq = 150 * Math.pow(0.1, t / dur);
    const phase = freq * t;
    return (2 * (phase - Math.floor(phase)) - 1) * env * 0.8;
  }

  private genMilestone(t: number, dur: number): number {
    const env = Math.max(0, 1 - t / dur);
    const freq = 440 + 880 * (t / dur);
    return Math.sin(2 * Math.PI * freq * t) * env * 0.6;
  }
}
