/**
 * Scenes: Deep Space & Aurora Borealis.
 */
import type { SceneFrame } from '../../types';
import { rand, rgba, TAU } from '../../utils/helpers';
import { PostOverlay, SnowOverlay } from '../overlays';
import { drawStars, genStars, makeOffscreen, mulberry32, SceneBase, skyGradient, type Star } from './common';

interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

export class SpaceScene extends SceneBase {
  readonly id = 'space' as const;

  private stars: Star[] = [];
  private nebula: HTMLCanvasElement | null = null;
  private meteors: Meteor[] = [];
  private nextMeteor = 3;
  private planetR = 0;
  private planetX = 0;
  private planetY = 0;
  private post = new PostOverlay();

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    const rng = mulberry32(555);
    this.stars = genStars(rng, w, h, Math.floor(w / 5));

    // pre-render nebula blobs
    const { c, x } = makeOffscreen(w, h);
    x.globalCompositeOperation = 'lighter';
    const blobs: Array<[number, number, number, string, number]> = [
      [0.3, 0.35, 0.5, '#3b1d6e', 0.55],
      [0.65, 0.3, 0.42, '#14386e', 0.5],
      [0.5, 0.62, 0.46, '#5e1d50', 0.42],
      [0.8, 0.6, 0.3, '#0e4d5c', 0.4],
    ];
    for (const [bx, by, br, col, alpha] of blobs) {
      const R = br * Math.min(w, h) * 1.6;
      const g = x.createRadialGradient(w * bx, h * by, 0, w * bx, h * by, R);
      g.addColorStop(0, rgba(col, alpha));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.fillRect(w * bx - R, h * by - R, R * 2, R * 2);
    }
    this.nebula = c;

    this.planetR = Math.min(w, h) * 0.09;
    this.planetX = w * 0.76;
    this.planetY = h * 0.3;
    this.meteors = [];
    this.post.resize(w, h);
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    skyGradient(ctx, w, h, [
      [0, '#010108'],
      [0.6, '#050514'],
      [1, '#030310'],
    ]);

    if (this.nebula) {
      ctx.save();
      const nx = -f.px * 12;
      const ny = -f.py * 8;
      ctx.globalAlpha = 0.9 + 0.1 * Math.sin(f.t * 0.1);
      ctx.drawImage(this.nebula, nx, ny, w, h);
      ctx.restore();
    }

    drawStars(ctx, f, this.stars);

    // ringed planet with rim light
    const px = this.planetX - f.px * 16;
    const py = this.planetY - f.py * 10;
    const r = this.planetR;
    const halo = ctx.createRadialGradient(px, py, r * 0.6, px, py, r * 3);
    halo.addColorStop(0, rgba('#7f9fff', 0.25));
    halo.addColorStop(1, 'rgba(127,159,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);

    const body = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.1, px, py, r * 1.05);
    body.addColorStop(0, '#5e74c9');
    body.addColorStop(0.55, '#2c3a78');
    body.addColorStop(1, '#0d1230');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,255,0.35)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.ellipse(px, py + r * 0.1, r * 1.7, r * 0.42, -0.35, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // meteors
    if (f.t > this.nextMeteor) {
      this.nextMeteor = f.t + rand(2.5, 8);
      const dirX = Math.random() > 0.5 ? 1 : -1;
      this.meteors.push({
        x: rand(w * 0.2, w * 0.9),
        y: rand(-20, h * 0.25),
        vx: dirX * rand(500, 900),
        vy: rand(260, 420),
        life: 0,
      });
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.life += f.sdt;
      m.x += m.vx * f.sdt;
      m.y += m.vy * f.sdt;
      if (m.life > 1.4 || m.y > h) {
        this.meteors.splice(i, 1);
        continue;
      }
      const fade = 1 - m.life / 1.4;
      const tx = m.x - m.vx * 0.09;
      const ty = m.y - m.vy * 0.09;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, rgba('#ffffff', 0.95 * fade));
      g.addColorStop(1, 'rgba(160,190,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();

    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.nebula = null;
    this.meteors = [];
  }
}

/* ================================================================== */
/* Aurora                                                              */
/* ================================================================== */

interface Ribbon {
  hue: [string, string];
  baseY: number;      // fraction of height
  amp: number;
  thickness: number;
  phase: number;
  speed: number;
  waveLen: number;
}

export class AuroraScene extends SceneBase {
  readonly id = 'aurora' as const;

  private stars: Star[] = [];
  private mountains: HTMLCanvasElement | null = null;
  private ribbons: Ribbon[] = [];
  private snow = new SnowOverlay();
  private post = new PostOverlay();

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    const rng = mulberry32(31337);
    this.stars = genStars(rng, w, h * 0.8, Math.floor(w / 7));

    // distant mountain silhouette
    const pad = 60;
    const { c, x } = makeOffscreen(w + pad * 2, h);
    const pts = this.ridge(rng, w + pad * 2, h * 0.82, h * 0.08, h * 0.22);
    const g = x.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, '#0c1424');
    g.addColorStop(1, '#04070f');
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const [px2, py2] of pts) x.lineTo(px2, py2);
    x.lineTo(w + pad * 2, h);
    x.lineTo(0, h);
    x.closePath();
    x.fillStyle = g;
    x.fill();
    this.mountains = c;

    this.ribbons = [
      { hue: ['#52ffa8', '#1d8f6e'], baseY: 0.3, amp: 60, thickness: 90, phase: 0, speed: 0.25, waveLen: 1.6 },
      { hue: ['#64d8ff', '#26629b'], baseY: 0.38, amp: 80, thickness: 110, phase: 2.1, speed: 0.18, waveLen: 1.2 },
      { hue: ['#c476ff', '#5c2b8f'], baseY: 0.27, amp: 50, thickness: 70, phase: 4.4, speed: 0.32, waveLen: 2.2 },
    ];

    this.snow.resize(w, h);
    this.post.resize(w, h);
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    skyGradient(ctx, w, h, [
      [0, '#010409'],
      [0.55, '#061018'],
      [1, '#020409'],
    ]);

    drawStars(ctx, f, this.stars);

    // aurora: layered glowing waves
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const R of this.ribbons) {
      const colPulse = 0.75 + 0.25 * Math.sin(f.t * 0.3 + R.phase);
      const step = Math.max(10, w / 90);
      ctx.beginPath();
      const baseY = R.baseY * h - f.py * 12;
      for (let x = -step; x <= w + step; x += step) {
        const u = x / w;
        const y =
          baseY +
          Math.sin(u * Math.PI * R.waveLen * 2 + f.t * R.speed + R.phase) * R.amp +
          Math.sin(u * Math.PI * R.waveLen * 5.3 + f.t * R.speed * 1.7 + R.phase * 2) * R.amp * 0.3 -
          f.px * 16;
        if (x === -step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // close the band downwards for a filled ribbon look
      const g = ctx.createLinearGradient(0, baseY - R.thickness, 0, baseY + R.thickness * 2);
      g.addColorStop(0, rgba(R.hue[0], 0));
      g.addColorStop(0.35, rgba(R.hue[0], 0.22 * colPulse));
      g.addColorStop(1, rgba(R.hue[1], 0));
      ctx.lineTo(w + step, baseY + R.thickness * 2);
      ctx.lineTo(-step, baseY + R.thickness * 2);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      // bright rib lines inside the band (curtain folds)
      if (f.quality > 0.6) {
        ctx.strokeStyle = rgba(R.hue[0], 0.12 * colPulse);
        ctx.lineWidth = 1.4;
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          for (let x = -step; x <= w + step; x += step) {
            const u = x / w;
            const y =
              baseY +
              k * R.thickness * 0.4 +
              Math.sin(u * Math.PI * R.waveLen * 2 + f.t * R.speed + R.phase + k * 0.7) * R.amp * (1 - k * 0.18) -
              f.px * 16;
            if (x === -step) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    if (this.mountains) {
      ctx.drawImage(this.mountains, -(this.mountains.width - w) / 2 - f.px * 20, 0, this.mountains.width, h);
    }

    if (f.snow) this.snow.render(ctx, f);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.mountains = null;
  }
}
