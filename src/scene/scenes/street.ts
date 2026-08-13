/**
 * Scene: Neon Alley
 * A stylised Japanese backstreet at night: perspective walls of glowing
 * signs, hanging lanterns with gentle sway, a mirror-wet footpath and
 * drifting steam. Signs flicker with live neon pulses.
 */
import type { SceneFrame } from '../../types';
import { rand, rgba, TAU } from '../../utils/helpers';
import { FogOverlay, PostOverlay, RainOverlay, SnowOverlay } from '../overlays';
import { makeOffscreen, mulberry32, SceneBase, skyGradient } from './common';

interface Sign {
  x: number; y: number; w: number; h: number;
  color: string; side: -1 | 1;
  phase: number; speed: number;
  glyphSeed: number;
}

interface Lantern { x: number; y: number; r: number; phase: number; color: string }

export class StreetScene extends SceneBase {
  readonly id = 'neonStreet' as const;

  private wallLayer: HTMLCanvasElement | null = null;
  private groundLayer: HTMLCanvasElement | null = null;
  private signs: Sign[] = [];
  private lanterns: Lantern[] = [];
  private rain = new RainOverlay();
  private snow = new SnowOverlay();
  private fog = new FogOverlay('#6f86b8');
  private post = new PostOverlay();
  private vpX = 0;
  private vpY = 0;

  private static NEON = ['#00e5ff', '#ff2bd6', '#ffe94a', '#7cff6b', '#ff8a3d'];

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    this.vpX = w * 0.5;
    this.vpY = h * 0.42;

    const rng = mulberry32(4242);
    this.signs = [];
    this.lanterns = [];

    /* -------- pre-render static walls & ground -------- */
    const wall = makeOffscreen(w, h);
    const ground = makeOffscreen(w, h);

    // side walls as converging trapezoids
    wall.x.fillStyle = '#0a0c1c';
    wall.x.beginPath();                 // left wall
    wall.x.moveTo(0, 0);
    wall.x.lineTo(this.vpX - w * 0.09, this.vpY - h * 0.26);
    wall.x.lineTo(this.vpX - w * 0.09, h);
    wall.x.lineTo(0, h);
    wall.x.closePath();
    wall.x.fill();
    wall.x.fillStyle = '#0c0f22';       // right wall
    wall.x.beginPath();
    wall.x.moveTo(w, 0);
    wall.x.lineTo(this.vpX + w * 0.09, this.vpY - h * 0.26);
    wall.x.lineTo(this.vpX + w * 0.09, h);
    wall.x.lineTo(w, h);
    wall.x.closePath();
    wall.x.fill();

    // subtle wall paneling
    wall.x.strokeStyle = 'rgba(130,150,210,0.05)';
    wall.x.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      const y = this.vpY - h * 0.26 + t * (h - (this.vpY - h * 0.26));
      wall.x.beginPath();
      wall.x.moveTo(0, y + t * h * 0.2);
      wall.x.lineTo(this.vpX - w * 0.09, y);
      wall.x.stroke();
      wall.x.beginPath();
      wall.x.moveTo(w, y + t * h * 0.2);
      wall.x.lineTo(this.vpX + w * 0.09, y);
      wall.x.stroke();
    }

    // signs along both walls — perspective scale by height
    const rows = 7;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < rows; i++) {
        const depth = i / rows;                       // 0 near → 1 far
        const scale = 1 - depth * 0.82;
        const sx = side === -1
          ? w * 0.02 + depth * (this.vpX - w * 0.09 - w * 0.02) * 0.9
          : w * 0.98 - depth * (w * 0.98 - this.vpX - w * 0.09) * 0.9;
        const sy = h * (0.16 + 0.55 * depth * 0.5);   // rise toward vanishing point
        const vertical = rng() > 0.45;                // hanging "totem" signs are vertical
        const sw = (vertical ? 34 : 90) * scale;
        const sh = (vertical ? 130 : 40) * scale;
        const s: Sign = {
          x: sx - (side === 1 ? sw : 0),
          y: sy + rng() * h * 0.1,
          w: sw, h: sh,
          color: StreetScene.NEON[Math.floor(rng() * StreetScene.NEON.length)],
          side: side as -1 | 1,
          phase: rng() * TAU,
          speed: 0.5 + rng() * 1.4,
          glyphSeed: Math.floor(rng() * 1e6),
        };
        this.signs.push(s);

        // static dark sign backing
        wall.x.fillStyle = 'rgba(5,6,16,0.9)';
        wall.x.fillRect(s.x, s.y, s.w, s.h);
      }
    }

    // air-con boxes / wires
    wall.x.strokeStyle = 'rgba(90,110,170,0.25)';
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.15;
      wall.x.beginPath();
      wall.x.moveTo(0, h * t * 0.5);
      wall.x.quadraticCurveTo(this.vpX, this.vpY - h * 0.05 + i * 8, w, h * t * 0.5);
      wall.x.stroke();
    }

    /* -------- wet ground with light smears -------- */
    skyGradient(ground.x, w, h, [
      [0.42, 'rgba(8,9,20,0)'],
      [0.55, 'rgba(14,16,36,0.9)'],
      [1, '#05060f'],
    ]);
    // elongated reflections under each sign
    for (const s of this.signs) {
      const cx = s.x + s.w / 2;
      const gTop = this.vpY + h * 0.16;
      const g = ground.x.createLinearGradient(0, gTop, 0, h);
      g.addColorStop(0, rgba(s.color, 0.16));
      g.addColorStop(1, rgba(s.color, 0));
      ground.x.fillStyle = g;
      ground.x.save();
      ground.x.translate(cx, gTop);
      ground.x.transform(1, 0, 0, 1.9, 0, 0);
      ground.x.fillRect(-s.w * 0.7, 0, s.w * 1.4, (h - gTop) / 1.9);
      ground.x.restore();
    }

    // hanging lantern strings across the alley
    for (let stringI = 0; stringI < 3; stringI++) {
      const y = h * (0.18 + stringI * 0.08);
      const count = 5 - stringI;
      for (let i = 0; i <= count; i++) {
        if (i === 0 || i === count) continue;
        const t = i / count;
        const lx = this.vpX + (t - 0.5) * w * (0.5 - stringI * 0.08);
        const sag = Math.sin(t * Math.PI) * 22 * (1 - stringI * 0.25);
        this.lanterns.push({
          x: lx,
          y: y + sag,
          r: 12 - stringI * 2.4,
          phase: rng() * TAU,
          color: rng() > 0.35 ? '#ff9d5c' : '#ff5c7a',
        });
      }
    }

    this.wallLayer = wall.c;
    this.groundLayer = ground.c;

    this.rain.resize(w, h);
    this.snow.resize(w, h);
    this.fog.resize(w, h);
    this.post.resize(w, h);
  }

  /** Abstract neon glyphs — short strokes suggesting katakana signage. */
  private drawGlyphs(ctx: CanvasRenderingContext2D, s: Sign, alpha: number): void {
    const rng = mulberry32(s.glyphSeed);
    ctx.save();
    ctx.translate(s.x, s.y);
    const vertical = s.h > s.w;
    ctx.strokeStyle = rgba('#ffffff', alpha * 0.9);
    ctx.lineWidth = Math.max(1, s.w * 0.045);
    ctx.lineCap = 'round';
    const glyphs = vertical ? Math.floor(s.h / (s.w * 0.8)) : Math.floor(s.w / (s.h * 0.8));
    const cell = vertical ? s.h / glyphs : s.w / glyphs;
    for (let i = 0; i < glyphs; i++) {
      const cx = vertical ? s.w / 2 : cell * (i + 0.5);
      const cy = vertical ? cell * (i + 0.5) : s.h / 2;
      const strokes = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < strokes; k++) {
        const a = rng() * TAU;
        const len = cell * (0.15 + rng() * 0.3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * len * 0.3, cy + Math.sin(a) * len * 0.3);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    // hazy sky slot above rooftops
    skyGradient(ctx, w, h, [
      [0, '#070818'],
      [0.4, '#101536'],
      [1, '#05060f'],
    ]);

    const px = f.px * 10;
    const py = f.py * 6;

    if (this.groundLayer) ctx.drawImage(this.groundLayer, -px * 0.3, -py * 0.3, w, h);
    if (this.wallLayer) ctx.drawImage(this.wallLayer, -px, -py, w, h);

    // live signs: glow fill + halo + glyphs
    ctx.save();
    for (const s of this.signs) {
      // classic neon: mostly on, occasional flutter
      const flick = 0.75 + 0.25 * Math.sin(f.t * s.speed + s.phase);
      const flutter = Math.sin(f.t * 13 + s.phase * 7) > 0.92 ? 0.35 : 1;
      const a = flick * flutter;
      const x = s.x - px;
      const y = s.y - py;

      const halo = ctx.createRadialGradient(x + s.w / 2, y + s.h / 2, 2, x + s.w / 2, y + s.h / 2, Math.max(s.w, s.h) * 1.15);
      halo.addColorStop(0, rgba(s.color, 0.30 * a));
      halo.addColorStop(1, rgba(s.color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(x - s.w, y - s.h, s.w * 3, s.h * 3);

      ctx.fillStyle = rgba(s.color, 0.85 * a);
      ctx.fillRect(x, y, s.w, s.h);
      this.drawGlyphs(ctx, { ...s, x, y }, a);
    }
    ctx.restore();

    // lanterns sway + warm glow
    for (const L of this.lanterns) {
      const sway = Math.sin(f.t * 0.9 + L.phase) * 6;
      const x = L.x - px + sway;
      const y = L.y - py + Math.cos(f.t * 0.7 + L.phase) * 2;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, L.r * 3.4);
      glow.addColorStop(0, rgba(L.color, 0.5));
      glow.addColorStop(1, rgba(L.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - L.r * 3.4, y - L.r * 3.4, L.r * 6.8, L.r * 6.8);
      ctx.fillStyle = rgba(L.color, 0.92);
      ctx.beginPath();
      ctx.ellipse(x, y, L.r * 0.82, L.r, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,8,0.6)';
      ctx.lineWidth = 1;
      for (let rib = -1; rib <= 1; rib++) {
        ctx.beginPath();
        ctx.ellipse(x, y, L.r * 0.82 * Math.abs(Math.cos(rib * 0.6)), L.r, 0, 0, TAU);
        ctx.stroke();
      }
    }

    this.fog.render(ctx, f);
    if (f.rain) this.rain.render(ctx, f);
    if (f.snow) this.snow.render(ctx, f);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.wallLayer = null;
    this.groundLayer = null;
    this.signs = [];
    this.lanterns = [];
  }
}
