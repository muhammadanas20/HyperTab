/**
 * Scenes: Midnight Mountains & Misty Forest
 * Quiet, OLED-friendly landscapes: layered silhouettes with heavy depth
 * fog, twinkling stars, a soft moon, drifting mist — and fireflies in
 * the forest variant. Optional snow.
 */
import type { SceneFrame } from '../../types';
import { rand, rgba, TAU } from '../../utils/helpers';
import { FogOverlay, PostOverlay, RainOverlay, SnowOverlay } from '../overlays';
import { drawStars, genStars, makeOffscreen, mulberry32, SceneBase, skyGradient, type Star } from './common';

interface Ridge {
  img: HTMLCanvasElement;
  parallax: number;
}

export class MountainsScene extends SceneBase {
  readonly id = 'mountains' as const;

  private ridges: Ridge[] = [];
  private stars: Star[] = [];
  private fog = new FogOverlay('#7f94c4');
  private snow = new SnowOverlay();
  private rain = new RainOverlay();
  private post = new PostOverlay();

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    const rng = mulberry32(9001);
    this.stars = genStars(rng, w, h * 0.7, Math.floor(w / 9), 1);
    this.ridges = [];

    const layers: Array<{ base: number; height: number; rough: number; colorA: string; colorB: string; parallax: number }> = [
      { base: h * 0.62, height: h * 0.34, rough: h * 0.16, colorA: '#233052', colorB: '#1a2440', parallax: 0.03 },
      { base: h * 0.72, height: h * 0.28, rough: h * 0.12, colorA: '#18223c', colorB: '#121a30', parallax: 0.06 },
      { base: h * 0.84, height: h * 0.22, rough: h * 0.09, colorA: '#101828', colorB: '#0b1120', parallax: 0.11 },
      { base: h * 0.95, height: h * 0.16, rough: h * 0.06, colorA: '#0a0f1c', colorB: '#070b14', parallax: 0.17 },
    ];

    for (const L of layers) {
      const pad = Math.ceil(w * L.parallax + 40);
      const { c, x } = makeOffscreen(w + pad * 2, h);
      const pts = this.ridge(rng, w + pad * 2, L.base, L.rough, L.height);
      const g = x.createLinearGradient(0, L.base - L.height, 0, h);
      g.addColorStop(0, L.colorA);
      g.addColorStop(1, L.colorB);
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (const [px2, py2] of pts) x.lineTo(px2, py2);
      x.lineTo(w + pad * 2, h);
      x.lineTo(0, h);
      x.closePath();
      x.fillStyle = g;
      x.fill();
      // snow caps on the farthest ridge
      if (L.parallax < 0.05) {
        x.save();
        x.globalAlpha = 0.5;
        x.strokeStyle = 'rgba(214,228,255,0.35)';
        x.lineWidth = 2;
        x.beginPath();
        let started = false;
        for (const [px2, py2] of pts) {
          if (py2 < L.base - L.height * 0.4) {
            if (!started) { x.moveTo(px2, py2); started = true; } else x.lineTo(px2, py2);
          } else started = false;
        }
        x.stroke();
        x.restore();
      }
      this.ridges.push({ img: c, parallax: L.parallax });
    }

    this.fog.resize(w, h);
    this.snow.resize(w, h);
    this.rain.resize(w, h);
    this.post.resize(w, h);
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    skyGradient(ctx, w, h, [
      [0, '#03040c'],
      [0.5, '#0a1024'],
      [0.8, '#141c38'],
      [1, '#0a0d1c'],
    ]);

    drawStars(ctx, f, this.stars);

    // moon
    const mx = w * 0.24 - f.px * 6;
    const my = h * 0.2 - f.py * 4;
    const mr = Math.min(w, h) * 0.045;
    const mg = ctx.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 7);
    mg.addColorStop(0, 'rgba(200,214,255,0.5)');
    mg.addColorStop(1, 'rgba(200,214,255,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
    ctx.fillStyle = '#e9f0ff';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,175,215,0.35)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, TAU); ctx.fill();

    for (const r of this.ridges) {
      const off = -(r.img.width - w) / 2 - f.px * r.parallax * w;
      ctx.drawImage(r.img, off, -f.py * r.parallax * 40, r.img.width, h);
    }

    this.fog.render(ctx, f);
    if (f.rain) this.rain.render(ctx, f);
    if (f.snow) this.snow.render(ctx, f);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.ridges = [];
  }
}

/* ================================================================== */
/* Forest                                                              */
/* ================================================================== */

export class ForestScene extends SceneBase {
  readonly id = 'forest' as const;

  private layers: Ridge[] = [];
  private fog = new FogOverlay('#87b0a0');
  private snow = new SnowOverlay();
  private rain = new RainOverlay();
  private post = new PostOverlay();
  private fireflies: Array<{ x: number; y: number; phase: number; speed: number; r: number }> = [];

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    const rng = mulberry32(20770);
    this.layers = [];

    const rows: Array<{ base: number; color: string; parallax: number; treeH: [number, number]; gap: [number, number] }> = [
      { base: h * 0.66, color: '#0f1a18', parallax: 0.03, treeH: [0.10, 0.22], gap: [26, 60] },
      { base: h * 0.78, color: '#0a1312', parallax: 0.07, treeH: [0.14, 0.3], gap: [30, 70] },
      { base: h * 0.92, color: '#050b0a', parallax: 0.14, treeH: [0.2, 0.42], gap: [40, 90] },
    ];

    for (const L of rows) {
      const pad = Math.ceil(w * L.parallax + 60);
      const width = w + pad * 2;
      const { c, x } = makeOffscreen(width, h);
      x.fillStyle = L.color;
      let cx = -pad;
      while (cx < width + pad) {
        const th = h * (L.treeH[0] + rng() * (L.treeH[1] - L.treeH[0]));
        const tw = th * (0.4 + rng() * 0.2);
        const ty = L.base + rng() * h * 0.02;
        // pine: stacked triangles from top
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const tierW = tw * (0.4 + (i / tiers) * 0.8);
          const tierY = ty - th + (i / tiers) * th * 0.85;
          const tierH = th * 0.5;
          x.beginPath();
          x.moveTo(cx, tierY);
          x.lineTo(cx - tierW / 2, tierY + tierH);
          x.lineTo(cx + tierW / 2, tierY + tierH);
          x.closePath();
          x.fill();
        }
        x.fillRect(cx - tw * 0.045, ty - th * 0.1, tw * 0.09, th * 0.14);
        cx += tw * L.gap[0] * 0.02 + L.gap[0] + rng() * (L.gap[1] - L.gap[0]);
      }
      // ground line
      x.fillRect(0, L.base, width, h - L.base);
      this.layers.push({ img: c, parallax: L.parallax });
    }

    this.fireflies = [];
    const count = Math.floor(w / 34);
    for (let i = 0; i < count; i++) {
      this.fireflies.push({
        x: rand(w), y: rand(h * 0.35, h * 0.85),
        phase: rand(TAU), speed: rand(0.4, 1.2), r: rand(1, 2.2),
      });
    }

    this.fog.resize(w, h);
    this.snow.resize(w, h);
    this.rain.resize(w, h);
    this.post.resize(w, h);
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    skyGradient(ctx, w, h, [
      [0, '#020807'],
      [0.5, '#061412'],
      [0.85, '#0c201c'],
      [1, '#050b0a'],
    ]);

    // moonlight shaft
    const beamX = w * 0.7 - f.px * 10;
    const beam = ctx.createLinearGradient(beamX, 0, beamX - w * 0.18, h);
    beam.addColorStop(0, 'rgba(190,255,225,0.07)');
    beam.addColorStop(1, 'rgba(190,255,225,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(beamX - w * 0.05, 0);
    ctx.lineTo(beamX + w * 0.08, 0);
    ctx.lineTo(beamX - w * 0.12, h);
    ctx.lineTo(beamX - w * 0.3, h);
    ctx.closePath();
    ctx.fill();

    for (const L of this.layers) {
      const off = -(L.img.width - w) / 2 - f.px * L.parallax * w;
      ctx.drawImage(L.img, off, -f.py * L.parallax * 30, L.img.width, h);
    }

    // fireflies — warm drifting pulses
    const budget = Math.floor(this.fireflies.length * Math.max(0.2, f.particles) * f.quality);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < budget; i++) {
      const fl = this.fireflies[i];
      const px = fl.x + Math.sin(f.t * fl.speed + fl.phase) * 34 + Math.sin(f.t * 0.4 + fl.phase * 2) * 18;
      const py = fl.y + Math.cos(f.t * fl.speed * 0.8 + fl.phase) * 22;
      const pulse = Math.max(0, Math.sin(f.t * 1.6 + fl.phase * 3));
      const glow = ctx.createRadialGradient(px, py, 0, px, py, fl.r * 6);
      glow.addColorStop(0, rgba('#eaffb0', 0.55 * pulse));
      glow.addColorStop(1, 'rgba(234,255,176,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(px - fl.r * 6, py - fl.r * 6, fl.r * 12, fl.r * 12);
      ctx.fillStyle = rgba('#f6ffd2', 0.9 * pulse);
      ctx.beginPath();
      ctx.arc(px, py, fl.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    this.fog.render(ctx, f);
    if (f.rain) this.rain.render(ctx, f);
    if (f.snow) this.snow.render(ctx, f);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.layers = [];
    this.fireflies = [];
  }
}
