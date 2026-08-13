/**
 * Scene: Rainy Neon City
 * Layered skyline silhouettes over a deep indigo sky: a glowing moon,
 * three parallax building layers with twinkling windows, occasional
 * lightning, flying vehicle light-streaks and a wet-street reflection.
 */
import type { SceneFrame } from '../../types';
import { mixHex, rand, rgba, TAU } from '../../utils/helpers';
import { DustOverlay, PostOverlay, RainOverlay, SnowOverlay } from '../overlays';
import { makeOffscreen, mulberry32, SceneBase, skyGradient } from './common';

interface SkylineLayer {
  img: HTMLCanvasElement;
  parallax: number;
  /** a few live windows that flicker per-frame */
  flicker: Array<{ x: number; y: number; w: number; h: number; color: string; phase: number }>;
}

interface Streak {
  x: number; y: number; vx: number; hue: string; life: number; maxLife: number;
}

export class CityScene extends SceneBase {
  readonly id = 'cityRain' as const;

  private skyline: SkylineLayer[] = [];
  private stars: Array<{ x: number; y: number; r: number; phase: number }> = [];
  private rain = new RainOverlay();
  private snow = new SnowOverlay();
  private dust = new DustOverlay();
  private post = new PostOverlay();
  private moonX = 0;
  private moonY = 0;
  private moonR = 0;

  private flash = 0;            // lightning intensity 0..1
  private nextFlash = 8;
  private streaks: Streak[] = [];
  private nextStreak = 2;
  private horizon = 0;          // y where the street band begins

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    this.horizon = h * 0.86;
    this.moonX = w * 0.78;
    this.moonY = h * 0.2;
    this.moonR = Math.min(w, h) * 0.055;

    const rng = mulberry32(1337);
    this.stars = [];
    for (let i = 0; i < Math.floor(w / 14); i++) {
      this.stars.push({ x: rng() * w, y: rng() * h * 0.5, r: 0.3 + rng() * 1, phase: rng() * TAU });
    }

    this.skyline = [
      this.buildSkyline(w, h, rng, {
        base: h * 0.55, spread: h * 0.16, color: '#171b33', windowAlpha: 0.25,
        parallax: 0.035, windowChance: 0.10, wMin: 30, wMax: 80,
      }),
      this.buildSkyline(w, h, rng, {
        base: h * 0.66, spread: h * 0.24, color: '#12152a', windowAlpha: 0.5,
        parallax: 0.075, windowChance: 0.16, wMin: 40, wMax: 110,
      }),
      this.buildSkyline(w, h, rng, {
        base: h * 0.8, spread: h * 0.3, color: '#0b0d1f', windowAlpha: 0.85,
        parallax: 0.14, windowChance: 0.2, wMin: 60, wMax: 160, neonEdge: true,
      }),
    ];

    this.rain.resize(w, h);
    this.snow.resize(w, h);
    this.dust.resize(w, h);
    this.post.resize(w, h);
    this.streaks = [];
  }

  private buildSkyline(
    w: number,
    h: number,
    rng: () => number,
    o: {
      base: number; spread: number; color: string; windowAlpha: number;
      parallax: number; windowChance: number; wMin: number; wMax: number; neonEdge?: boolean;
    },
  ): SkylineLayer {
    const pad = Math.ceil(w * o.parallax + 40);
    const { c, x } = makeOffscreen(w + pad * 2, h);
    const flicker: SkylineLayer['flicker'] = [];
    let cursor = -pad + rng() * -30;

    const windowColors = ['#ffd9a0', '#a8d8ff', '#ffe9f2', '#c5ffe8'];

    while (cursor < w + pad) {
      const bw = o.wMin + rng() * (o.wMax - o.wMin);
      const bh = o.spread * (0.35 + rng() * 0.65);
      const top = o.base - bh;

      x.fillStyle = o.color;
      x.fillRect(cursor, top, bw, h - top);

      // rooftop details
      if (rng() > 0.6) {
        x.fillRect(cursor + bw * 0.2, top - 6, bw * 0.4, 6);
      }
      if (rng() > 0.7) {
        const ax = cursor + bw * (0.2 + rng() * 0.6);
        x.fillRect(ax, top - 14, 2, 14);
        x.fillStyle = '#ff5566';
        x.beginPath();
        x.arc(ax + 1, top - 14, 1.6, 0, TAU);
        x.fill();
        x.fillStyle = o.color;
      }
      // neon edge strip on the nearest layer
      if (o.neonEdge && rng() > 0.45) {
        const neon = rng() > 0.5 ? '#00e5ff' : '#ff2bd6';
        x.fillStyle = rgba(neon, 0.8);
        x.fillRect(cursor + rng() * (bw - 4), top, 2.5, bh * (0.3 + rng() * 0.5));
      }

      // windows grid
      const cols = Math.max(1, Math.floor(bw / 14));
      const rows = Math.max(2, Math.floor(bh / 20));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rng() > o.windowChance) continue;
          const wx = cursor + 4 + cx * ((bw - 8) / cols);
          const wy = top + 6 + cy * ((bh - 10) / rows);
          const col = windowColors[Math.floor(rng() * windowColors.length)];
          x.fillStyle = rgba(col, o.windowAlpha * (0.6 + rng() * 0.4));
          x.fillRect(wx, wy, 5, 7);
          if (rng() > 0.93 && flicker.length < 60) {
            flicker.push({ x: wx, y: wy, w: 5, h: 7, color: col, phase: rng() * TAU });
          }
        }
      }
      cursor += bw + 2 + rng() * 14;
    }
    return { img: c, parallax: o.parallax, flicker };
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    // sky
    skyGradient(ctx, w, h, [
      [0, '#05060f'],
      [0.35, '#0d1030'],
      [0.7, '#201a3e'],
      [1, '#120d24'],
    ]);

    // stars
    ctx.save();
    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(f.t * 1.7 + s.phase));
      ctx.fillStyle = '#cdd9ff';
      ctx.beginPath();
      ctx.arc(s.x - f.px * 6, s.y - f.py * 4, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // moon + glow
    const mx = this.moonX - f.px * 8;
    const my = this.moonY - f.py * 5;
    const glow = ctx.createRadialGradient(mx, my, this.moonR * 0.4, mx, my, this.moonR * 6);
    glow.addColorStop(0, rgba('#b8c7ff', 0.5));
    glow.addColorStop(1, 'rgba(184,199,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - this.moonR * 6, my - this.moonR * 6, this.moonR * 12, this.moonR * 12);
    ctx.fillStyle = '#e4ecff';
    ctx.beginPath();
    ctx.arc(mx, my, this.moonR, 0, TAU);
    ctx.fill();

    // skyline layers (far → near)
    for (const layer of this.skyline) {
      const off = -f.px * layer.parallax * w;
      ctx.drawImage(layer.img, off - (layer.img.width - w) / 2, 0, layer.img.width, h);

      // live window flicker
      if (f.quality > 0.6) {
        ctx.save();
        for (const win of layer.flicker) {
          const on = Math.sin(f.t * 0.8 + win.phase) > 0.4;
          if (!on) continue;
          ctx.fillStyle = rgba(win.color, 0.35 + 0.3 * Math.sin(f.t * 3 + win.phase));
          ctx.fillRect(win.x + off - (layer.img.width - w) / 2, win.y, win.w, win.h);
        }
        ctx.restore();
      }
    }

    // flying vehicles
    if (f.t > this.nextStreak) {
      this.nextStreak = f.t + rand(1.5, 5);
      if (this.streaks.length < 5) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        this.streaks.push({
          x: dir > 0 ? -60 : w + 60,
          y: rand(h * 0.25, this.horizon - 40),
          vx: dir * rand(180, 420),
          hue: Math.random() > 0.5 ? f.accent : '#ff2bd6',
          life: 0, maxLife: 8,
        });
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.life += f.sdt;
      s.x += s.vx * f.sdt;
      if (s.life > s.maxLife || s.x < -120 || s.x > w + 120) {
        this.streaks.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, 3 - s.life * 0.4);
      const trail = 46;
      const g = this.ctx.createLinearGradient(s.x, s.y, s.x - Math.sign(s.vx) * trail, s.y);
      g.addColorStop(0, rgba(s.hue, 0.9 * fade));
      g.addColorStop(1, rgba(s.hue, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - Math.sign(s.vx) * trail, s.y);
      ctx.stroke();
    }
    ctx.restore();

    // wet street reflection band
    const bandY = this.horizon;
    const refl = ctx.createLinearGradient(0, bandY, 0, h);
    refl.addColorStop(0, rgba(mixHex('#101430', f.accent, 0.25), 0.55));
    refl.addColorStop(1, 'rgba(4,5,12,0.9)');
    ctx.fillStyle = refl;
    ctx.fillRect(0, bandY, w, h - bandY);
    // light smears on the street
    if (f.quality > 0.55) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const sx = ((i * 267.3) % w) - f.px * 20;
        const col = i % 2 ? f.accent : '#ff2bd6';
        const smh = (h - bandY) * 0.75;
        const g = ctx.createLinearGradient(0, bandY, 0, bandY + smh);
        g.addColorStop(0, rgba(col, 0.10 + 0.05 * Math.sin(f.t + i)));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(sx, bandY, 26, smh);
      }
      ctx.restore();
    }

    // occasional lightning
    if (f.t > this.nextFlash) {
      this.nextFlash = f.t + rand(9, 26);
      this.flash = 1;
    }
    if (this.flash > 0.01) {
      this.flash *= Math.pow(0.02, f.dt);
      ctx.fillStyle = rgba('#9db4ff', this.flash * 0.12);
      ctx.fillRect(0, 0, w, h * 0.7);
    }

    // atmosphere overlays
    this.dust.render(ctx, f, '#9fb6ff');
    if (f.rain) this.rain.render(ctx, f);
    if (f.snow) this.snow.render(ctx, f);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.skyline = [];
    this.streaks = [];
  }
}
