/**
 * Procedural sound engine — every effect is synthesized with WebAudio,
 * so the extension ships zero audio files and works fully offline.
 *
 * Sounds are intentionally subtle: short web "thwips", a soft landing
 * thud, quiet footsteps, a swing whoosh and an ambient rain loop.
 */
import { clamp } from '../utils/helpers';

export type SoundName = 'thwip' | 'land' | 'step' | 'whoosh' | 'pop' | 'blink';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private enabled = false;
  private volume = 0.5;
  private lastPlay = new Map<SoundName, number>();

  /** Audio contexts must be created after a user gesture — call lazily. */
  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.6; // keep everything quiet
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopRain();
      if (this.ctx) void this.ctx.suspend();
    }
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.6, this.ctx.currentTime, 0.05);
    }
  }

  /** Rate-limit identical effects so rapid actions don't get loud. */
  private allowed(name: SoundName, minGapMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < minGapMs) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  /** Shared noise buffer (1s of white noise, reused by every effect). */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const cached = (this as unknown as { _nb?: AudioBuffer })._nb;
    if (cached && cached.sampleRate === ctx.sampleRate) return cached;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    (this as unknown as { _nb?: AudioBuffer })._nb = buf;
    return buf;
  }

  play(name: SoundName): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    switch (name) {
      case 'thwip': {
        if (!this.allowed(name, 120)) return;
        // quick band-passed noise burst with downward pitch sweep
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3200, t);
        bp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        src.connect(bp).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 0.16);
        break;
      }
      case 'land': {
        if (!this.allowed(name, 200)) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.13);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.18);
        break;
      }
      case 'step': {
        if (!this.allowed(name, 90)) return;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(lp).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 0.06);
        break;
      }
      case 'whoosh': {
        if (!this.allowed(name, 300)) return;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx);
        src.playbackRate.value = 0.8;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 2;
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        src.connect(bp).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 0.45);
        break;
      }
      case 'pop': {
        if (!this.allowed(name, 100)) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.12);
        break;
      }
      case 'blink': {
        if (!this.allowed(name, 400)) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1900, t);
        osc.frequency.exponentialRampToValueAtTime(1400, t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.08);
        break;
      }
    }
  }

  /** Gentle looping rain ambience built from filtered noise. */
  startRain(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.rainNodes) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.14, ctx.currentTime, 1.2); // slow fade in
    src.connect(hp).connect(lp).connect(gain).connect(this.master);
    src.start();
    this.rainNodes = { src, gain };
  }

  stopRain(): void {
    if (!this.rainNodes || !this.ctx) return;
    const { src, gain } = this.rainNodes;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    const stopAt = this.ctx.currentTime + 2;
    try {
      src.stop(stopAt);
    } catch {
      /* already stopped */
    }
    this.rainNodes = null;
  }
}

export const sound = new SoundEngine();
