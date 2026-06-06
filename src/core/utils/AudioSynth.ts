/**
 * AudioSynth — generates tiny WAV blobs at init time, plays them with
 * HTMLAudioElement.  This is the most reliable cross-browser approach
 * because it completely bypasses AudioContext scheduling quirks.
 */
export class AudioSynth {
  public enabled = true;

  private eatUrl: string = '';
  private crashUrl: string = '';
  private milestoneUrl: string = '';
  private initialised = false;

  constructor() {}

  /** Call inside a user-gesture handler (click). */
  public unlock() {
    if (this.initialised) return;
    this.initialised = true;

    this.eatUrl       = this.makeWavUrl(4410,  (i, sr) => this.genEat(i, sr));
    this.crashUrl     = this.makeWavUrl(22050, (i, sr) => this.genCrash(i, sr));
    this.milestoneUrl = this.makeWavUrl(13230, (i, sr) => this.genMilestone(i, sr));
  }

  public destroy() {
    if (this.eatUrl)       URL.revokeObjectURL(this.eatUrl);
    if (this.crashUrl)     URL.revokeObjectURL(this.crashUrl);
    if (this.milestoneUrl) URL.revokeObjectURL(this.milestoneUrl);
    this.eatUrl = '';
    this.crashUrl = '';
    this.milestoneUrl = '';
    this.initialised = false;
  }

  /* ── public API ───────────────────────────────────────────────── */

  public playEat() {
    this.playUrl(this.eatUrl);
  }

  public playCrash() {
    this.playUrl(this.crashUrl);
  }

  public playMilestone() {
    this.playUrl(this.milestoneUrl);
  }

  /* ── internals ────────────────────────────────────────────────── */

  private playUrl(url: string) {
    if (!this.enabled || !url) return;
    try {
      const a = new Audio(url);
      a.volume = 0.5;
      a.play().catch(() => {});
    } catch (_) { /* swallow */ }
  }

  /* ── WAV generator ────────────────────────────────────────────── */

  /**
   * Build a 16-bit mono WAV blob URL.
   * `numSamples` = total sample count at 44100 Hz.
   * `fn(sampleIndex, sampleRate)` returns a float in [-1, 1].
   */
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

    // RIFF header
    this.writeStr(view, 0,  'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeStr(view, 8,  'WAVE');

    // fmt sub-chunk
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);           // sub-chunk size
    view.setUint16(20, 1, true);            // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
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

  /** Rising square beep  0.1 s */
  private genEat(i: number, sr: number): number {
    const t = i / sr;
    const dur = 0.1;
    const env = 1 - t / dur;
    const freq = 800 + 4000 * t;
    return Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.6;
  }

  /** Low sawtooth crash  0.5 s */
  private genCrash(i: number, sr: number): number {
    const t = i / sr;
    const dur = 0.5;
    const env = 1 - t / dur;
    const freq = 150 * Math.pow(10 / 150, t / dur);
    const phase = freq * t;
    return (2 * (phase - Math.floor(phase)) - 1) * env * 0.7;
  }

  /** Rising chime  0.3 s */
  private genMilestone(i: number, sr: number): number {
    const t = i / sr;
    const dur = 0.3;
    const env = 1 - t / dur;
    const freq = 400 + 1300 * t;
    return Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.5;
  }
}
