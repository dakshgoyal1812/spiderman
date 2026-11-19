/**
 * Procedural Web Audio synthesizer for Spider-Man 3D.
 * Zero external MP3/WAV fetches; generates crisp tactile superhero SFX,
 * dynamic speed-reactive wind rush, and rain ambience.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private muted = false;
  private paused = false;

  public get isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.setupAmbienceLoops();
    } catch {
      this.ctx = null;
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.syncLoopGains(0, false);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.syncLoopGains(0, false);
    }
  }

  public updateAmbience(speedMps: number, raining: boolean): void {
    this.syncLoopGains(speedMps, raining);
  }

  private syncLoopGains(speedMps: number, raining: boolean): void {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.rainGain) return;
    const now = this.ctx.currentTime;
    if (this.muted || this.paused) {
      this.windGain.gain.setTargetAtTime(0, now, 0.08);
      this.rainGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }
    const windLevel = Math.min(0.22, Math.max(0, (speedMps - 8) / 42) * 0.22);
    const windFreq = 260 + Math.min(1800, speedMps * 36);
    this.windGain.gain.setTargetAtTime(windLevel, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.12);

    this.rainGain.gain.setTargetAtTime(raining ? 0.09 : 0, now, 0.25);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private setupAmbienceLoops(): void {
    if (!this.ctx || !this.noiseBuffer) return;

    // Wind rush loop
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 1.4;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.ctx.destination);
    windSrc.start();

    // Rain loop
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1600;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.ctx.destination);
    rainSrc.start();
  }

  private canPlay(): boolean {
    return Boolean(this.ctx && !this.muted && !this.paused && this.ctx.state === 'running');
  }

  /** Iconic web-shooter THWIP! */
  public playThwip(): void {
    if (!this.canPlay() || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const pitchVar = 0.92 + Math.random() * 0.16;

    // Crisp pressurized noise snap
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3400 * pitchVar, now);
    filter.frequency.exponentialRampToValueAtTime(920 * pitchVar, now + 0.11);
    filter.Q.value = 3.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.14);

    // Subtle harmonic whistle
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1250 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(310 * pitchVar, now + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.11, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(og).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playWebZip(): void {
    if (!this.canPlay() || !this.ctx) return;
    this.playThwip();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playJump(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(390, now + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playLand(intensity = 0.6): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.24, 0.08 + intensity * 0.14), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playPunch(heavy: boolean): void {
    if (!this.canPlay() || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const pv = 0.92 + Math.random() * 0.16;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((heavy ? 185 : 145) * pv, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + (heavy ? 0.18 : 0.1));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.3 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.2 : 0.12));
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.21 : 0.13));

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = heavy ? 1600 : 1100;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(heavy ? 0.22 : 0.12, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    noise.connect(filter).connect(ng).connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  public playWebbed(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    [520, 740, 1040].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.08, now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.12);
      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + i * 0.03 + 0.13);
    });
  }

  public playSpiderSense(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.setValueAtTime(1760, now + 0.045);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playDodge(perfect: boolean): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(perfect ? 660 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(perfect ? 1320 : 180, now + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(perfect ? 0.16 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playPlayerHurt(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playMissionComplete(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.085);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.001, now + idx * 0.085);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.085 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.085 + 0.42);
      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(now + idx * 0.085);
      osc.stop(now + idx * 0.085 + 0.44);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
