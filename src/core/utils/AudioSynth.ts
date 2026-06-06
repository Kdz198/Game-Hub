/**
 * AudioSynth — Pre-created Audio element pool.
 *
 * Instead of creating a new Audio() every time (which Chrome throttles),
 * we pre-create a fixed pool of Audio elements for each sound and
 * round-robin through them.  This guarantees every play() call reuses
 * an existing, already-loaded element.
 */
export class AudioSynth {
  public enabled = true;
  private initialised = false;

  private eatPool: HTMLAudioElement[] = [];
  private crashPool: HTMLAudioElement[] = [];
  private milestonePool: HTMLAudioElement[] = [];

  private eatIndex = 0;
  private crashIndex = 0;
  private milestoneIndex = 0;

  private urls: string[] = [];

  private static POOL_SIZE = 6; // enough for rapid-fire eating

  constructor() {}

  public unlock() {
    if (this.initialised) return;
    this.initialised = true;

    const eatUrl       = this.makeWavUrl(4410,  (i, sr) => this.genEat(i, sr));
    const crashUrl     = this.makeWavUrl(22050, (i, sr) => this.genCrash(i, sr));
    const milestoneUrl = this.makeWavUrl(13230, (i, sr) => this.genMilestone(i, sr));

    this.urls = [eatUrl, crashUrl, milestoneUrl];

    this.eatPool       = this.buildPool(eatUrl, 0.4);
    this.crashPool     = this.buildPool(crashUrl, 0.6);
    this.milestonePool = this.buildPool(milestoneUrl, 0.5);
  }

  public destroy() {
    [...this.eatPool, ...this.crashPool, ...this.milestonePool].forEach(a => {
      a.pause();
      a.src = '';
    });
    this.eatPool = [];
    this.crashPool = [];
    this.milestonePool = [];
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.urls = [];
    this.initialised = false;
  }

  /* ── public API ───────────────────────────────────────────────── */

  public playEat() {
    if (!this.enabled || this.eatPool.length === 0) {
      console.warn('[AUDIO] playEat SKIPPED — enabled:', this.enabled, 'poolSize:', this.eatPool.length);
      return;
    }
    console.log('[AUDIO] playEat — index:', this.eatIndex, 'pool:', this.eatPool.length);
    this.playFromPool(this.eatPool, this.eatIndex);
    this.eatIndex = (this.eatIndex + 1) % this.eatPool.length;
  }

  public playCrash() {
    if (!this.enabled || this.crashPool.length === 0) return;
    this.playFromPool(this.crashPool, this.crashIndex);
    this.crashIndex = (this.crashIndex + 1) % this.crashPool.length;
  }

  public playMilestone() {
    if (!this.enabled || this.milestonePool.length === 0) return;
    this.playFromPool(this.milestonePool, this.milestoneIndex);
    this.milestoneIndex = (this.milestoneIndex + 1) % this.milestonePool.length;
  }

  /* ── pool helpers ─────────────────────────────────────────────── */

  private buildPool(url: string, volume: number): HTMLAudioElement[] {
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < AudioSynth.POOL_SIZE; i++) {
      const a = new Audio(url);
      a.volume = volume;
      a.preload = 'auto';
      // Force the browser to load/decode the audio data now
      a.load();
      pool.push(a);
    }
    return pool;
  }

  private playFromPool(pool: HTMLAudioElement[], index: number) {
    const a = pool[index];
    console.log('[AUDIO] playFromPool — readyState:', a.readyState, 'paused:', a.paused, 'currentTime:', a.currentTime, 'src:', a.src ? 'OK' : 'EMPTY');
    // Reset to start if it was already playing or finished
    a.currentTime = 0;
    a.play().then(() => {
      console.log('[AUDIO] ✅ play() succeeded');
    }).catch((err) => {
      console.error('[AUDIO] ❌ play() FAILED:', err.message);
    });
  }

  /* ── WAV generator ────────────────────────────────────────────── */

  private makeWavUrl(numSamples: number, fn: (i: number, sr: number) => number): string {
    const sr = 44100;
    const bitsPerSample = 16;
    const blockAlign = bitsPerSample / 8;
    const dataSize = numSamples * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);

    this.w(v, 0, 'RIFF');
    v.setUint32(4, 36 + dataSize, true);
    this.w(v, 8, 'WAVE');
    this.w(v, 12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * blockAlign, true);
    v.setUint16(32, blockAlign, true);
    v.setUint16(34, bitsPerSample, true);
    this.w(v, 36, 'data');
    v.setUint32(40, dataSize, true);

    for (let i = 0; i < numSamples; i++) {
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, fn(i, sr))) * 32767, true);
    }

    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  private w(v: DataView, o: number, s: string) {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
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
