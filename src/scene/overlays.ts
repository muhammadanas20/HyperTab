/**
 * Shared atmospheric overlays — rain, snow, floating dust, drifting fog,
 * vignette + film grain. Pooled and allocation-free on the hot path.
 */
import type { SceneFrame } from '../types';
import { rand, rgba, TAU } from '../utils/helpers';

/* ------------------------------------------------------------------ */
/* Rain                                                               */
/* ------------------------------------------------------------------ */

interface Drop { x: number; y: number; len: number; speed: number; drift: number; alpha: number }

export class RainOverlay {
  private drops: Drop[] = [];
  private wind = 0;
  private windTarget = 0;
  private nextGust = 0;

  resize(w: number, h: number): void {
    this.drops = [];
    const count = Math.floor((w * h) / 9000);
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: rand(w), y: rand(h),
        len: rand(10, 26),
        speed: rand(900, 1500),
        drift: rand(-40, 40),
        alpha: rand(0.08, 0.28),
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, f: SceneFrame): void {
    const { w, h } = f;
    if (f.t > this.nextGust) {
      this.nextGust = f.t + rand(3, 9);
      this.windTarget = rand(-80, 80);
    }
    this.wind += (this.windTarget - this.wind) * f.sdt * 0.4;

    const budget = Math.floor(this.drops.length * f.particles * f.quality);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < budget; i++) {
      const d = this.drops[i];
      d.y += d.speed * f.sdt;
      d.x += (d.drift + this.wind) * f.sdt;
      if (d.y > h + d.len) {
        d.y = -d.len;
        d.x = rand(-50, w + 50);
      }
      const slant = (d.drift + this.wind) * 0.014;
      ctx.strokeStyle = rgba('#a8c8ff', d.alpha);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - slant * d.len * 0.3, d.y - d.len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Snow                                                               */
/* ------------------------------------------------------------------ */

interface Flake { x: number; y: number; r: number; speed: number; phase: number; alpha: number }

export class SnowOverlay {
  private flakes: Flake[] = [];

  resize(w: number, h: number): void {
    this.flakes = [];
    const count = Math.floor((w * h) / 14000);
    for (let i = 0; i < count; i++) {
      this.flakes.push({
        x: rand(w), y: rand(h),
        r: rand(0.8, 2.6),
        speed: rand(24, 60),
        phase: rand(TAU),
        alpha: rand(0.3, 0.8),
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, f: SceneFrame): void {
    const { w, h } = f;
    const budget = Math.floor(this.flakes.length * Math.max(0.25, f.particles) * f.quality);
    ctx.save();
    ctx.fillStyle = '#e8f1ff';
    for (let i = 0; i < budget; i++) {
      const s = this.flakes[i];
      s.y += s.speed * f.sdt;
      s.x += Math.sin(f.t * 0.7 + s.phase) * 18 * f.sdt;
      if (s.y > h + 4) {
        s.y = -4;
        s.x = rand(w);
      }
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Floating dust / sparks — three parallax depth bands                */
/* ------------------------------------------------------------------ */

interface Mote { x: number; y: number; r: number; depth: number; phase: number; speed: number }

export class DustOverlay {
  private motes: Mote[] = [];

  resize(w: number, h: number): void {
    this.motes = [];
    const count = Math.floor((w * h) / 16000);
    for (let i = 0; i < count; i++) {
      const depth = [0.25, 0.5, 1][i % 3];
      this.motes.push({
        x: rand(w), y: rand(h),
        r: rand(0.6, 2.2) * depth,
        depth,
        phase: rand(TAU),
        speed: rand(4, 14) * depth,
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, f: SceneFrame, tint = '#cdd6ff'): void {
    const { w, h } = f;
    const budget = Math.floor(this.motes.length * f.particles * f.quality);
    ctx.save();
    for (let i = 0; i < budget; i++) {
      const m = this.motes[i];
      m.y -= m.speed * f.sdt;
      if (m.y < -6) {
        m.y = h + 6;
        m.x = rand(w);
      }
      const x = m.x - f.px * 26 * m.depth + Math.sin(f.t * 0.5 + m.phase) * 12 * m.depth;
      const y = m.y - f.py * 16 * m.depth;
      const twinkle = 0.35 + 0.3 * Math.sin(f.t * 1.4 + m.phase * 3);
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Fog — pre-rendered soft noise blobs drifting horizontally          */
/* ------------------------------------------------------------------ */

interface FogBlob { x: number; y: number; r: number; speed: number; alpha: number }

export class FogOverlay {
  private sprites: HTMLCanvasElement[] = [];
  private blobs: FogBlob[] = [];
  private tint: string;

  constructor(tint = '#8b9cc9') {
    this.tint = tint;
  }

  private makeSprite(): HTMLCanvasElement {
    const s = document.createElement('canvas');
    s.width = s.height = 256;
    const c = s.getContext('2d')!;
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, rgba(this.tint, 0.5));
    g.addColorStop(1, rgba(this.tint, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return s;
  }

  resize(w: number, h: number): void {
    if (!this.sprites.length) {
      for (let i = 0; i < 3; i++) this.sprites.push(this.makeSprite());
    }
    this.blobs = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      this.blobs.push({
        x: rand(-w * 0.3, w),
        y: rand(h * 0.35, h * 0.95),
        r: rand(w * 0.25, w * 0.55),
        speed: rand(6, 20) * (i % 2 ? 1 : -1),
        alpha: rand(0.05, 0.14),
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, f: SceneFrame): void {
    const { w, h } = f;
    ctx.save();
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      b.x += b.speed * f.sdt;
      if (b.speed > 0 && b.x - b.r > w) b.x = -b.r;
      if (b.speed < 0 && b.x + b.r < 0) b.x = w + b.r;
      const breathe = 0.8 + 0.2 * Math.sin(f.t * 0.2 + i * 1.7);
      ctx.globalAlpha = b.alpha * breathe * f.particles;
      const size = b.r * 2;
      ctx.drawImage(this.sprites[i % this.sprites.length], b.x - b.r - f.px * 18, b.y - b.r * 0.4 - f.py * 10, size, size * 0.8);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Vignette & grain — static, ultra cheap                             */
/* ------------------------------------------------------------------ */

export class PostOverlay {
  private vignette: HTMLCanvasElement | null = null;

  resize(w: number, h: number): void {
    const v = document.createElement('canvas');
    v.width = Math.max(2, Math.floor(w / 2));
    v.height = Math.max(2, Math.floor(h / 2));
    const c = v.getContext('2d')!;
    const g = c.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.35, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  render(ctx: CanvasRenderingContext2D, f: SceneFrame): void {
    if (this.vignette) {
      ctx.drawImage(this.vignette, 0, 0, f.w, f.h);
    }
  }
}
