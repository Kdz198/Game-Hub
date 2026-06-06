/**
 * AudioSynth — WAV Blob + pooled HTMLAudioElement approach.
 *
 * Key insight: `new Audio(url).play()` fails silently when the Audio
 * object gets garbage-collected before it finishes playing.  We fix
 * this by keeping a strong reference to every active Audio element
 * and only releasing it after it ends.
 */
export class AudioSynth {
  public enabled = true;

  private eatUrl = '';
  private crashUrl = '';
  private milestoneUrl = '';
  private initialised = false;

  /** Strong references so GC doesn't kill playing Audio elements */
  private playing: Set<HTMLAudioElement> = new Set();

  constructor() {}

  public unlock() {
    if (this.initialised) return;
    this.initialised = true;

    this.eatUrl       = this.makeWavUrl(4410,  (i, sr) => this.genEat(i, sr));
    this.crashUrl     = this.makeWavUrl(22050, (i, sr) => this.genCrash(i, sr));
    this.milestoneUrl = this.makeWavUrl(13230, (i, sr) => this.genMilestone(i, sr));
  }

  public destroy() {
    this.playing.forEach(a => { a.pause(); a.src = ''; });
    this.playing.clear();
    if (this.eatUrl)       URL.revokeObjectURL(this.eatUrl);
    if (this.crashUrl)     URL.revokeObjectURL(this.crashUrl);
    if (this.milestoneUrl) URL.revokeObjectURL(this.milestoneUrl);
    this.eatUrl = '';
    this.crashUrl = '';
    this.milestoneUrl = '';
    this.initialised = false;
  }

  /* ── public API ───────────────────────────────────────────────── */

  public playEat()       { this.playUrl(this.eatUrl, 0.4); }
  public playCrash()     { this.playUrl(this.crashUrl, 0.6); }
  public playMilestone() { this.playUrl(this.milestoneUrl, 0.5); }

  /* ── play with GC protection ──────────────────────────────────── */

  private playUrl(url: string, volume: number) {
    if (!this.enabled || !url) return;
    try {
      const a = new Audio(url);
      a.volume = volume;

      // Hold a strong reference until it finishes
      this.playing.add(a);
      a.addEventListener('ended', () => {
        this.playing.delete(a);
      }, { once: true });

      // Safety: release after 2 seconds even if 'ended' never fires
      setTimeout(() => {
        this.playing.delete(a);
      }, 2000);

      a.play().catch(() => {
        this.playing.delete(a);
      });
    } catch (_) { /* swallow */ }
  }

  /* ── WAV generator ────────────────────────────────────────────── */

  private makeWavUrl(numSamples: number, fn: (i: number, sr: number) => number): string {
    const sr = 44100;
    const bitsPerSample = 16;
    const numChannels = 1;
    const byteRate = sr * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const buf = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buf);

    this.writeStr(view, 0,  'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeStr(view, 8,  'WAVE');
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeStr(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < numSamples; i++) {
      const sample = Math.max(-1, Math.min(1, fn(i, sr)));
      view.setInt16(headerSize + i * 2, sample * 32767, true);
    }

    const blob = new Blob([buf], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private writeStr(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /* ── waveform functions ───────────────────────────────────────── */

  private genEat(i: number, sr: number): number {
    const t = i / sr;
    const env = 1 - t / 0.1;
    const freq = 800 + 4000 * t;
    return Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.6;
  }

  private genCrash(i: number, sr: number): number {
    const t = i / sr;
    const dur = 0.5;
    const env = 1 - t / dur;
    const freq = 150 * Math.pow(10 / 150, t / dur);
    const phase = freq * t;
    return (2 * (phase - Math.floor(phase)) - 1) * env * 0.7;
  }

  private genMilestone(i: number, sr: number): number {
    const t = i / sr;
    const env = 1 - t / 0.3;
    const freq = 400 + 1300 * t;
    return Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.5;
  }
}
