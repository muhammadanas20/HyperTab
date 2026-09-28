/**
 * Web physics & rendering.
 *
 * SwingRope is a verlet pendulum: the character is the bob, the anchor is
 * any point the brain picks (ceiling, corners, invisible sky points).
 * Includes rope pumping (energy gain), stretch shading, release recoil,
 * cosmetic "thwip" shots, impact splats and the hammock net. All lines
 * are drawn with a slight shine so they read as silk, not rope.
 */
import { clamp, rand, rgba, TAU } from '../utils/helpers';

export interface Vec { x: number; y: number }

const GRAVITY = 2600;          // px/s² web-swing gravity
const DAMPING = 0.996;

export class SwingRope {
  anchor: Vec = { x: 0, y: 0 };
  length = 200;
  /** rope length set at attach — pumping oscillates around it */
  private naturalLength = 200;
  attached = false;

  /** verlet state of the bob */
  x = 0; y = 0; px = 0; py = 0;

  /** 0..1 how far the freshly-shot line has travelled (for the thwip animation) */
  shootT = 1;
  /** snapshot of the last released rope for the recoil snap-back */
  private recoil: { ax: number; ay: number; bx: number; by: number; t: number } | null = null;

  attach(ax: number, ay: number, bx: number, by: number, velX: number, velY: number): void {
    this.anchor = { x: ax, y: ay };
    this.length = Math.max(60, Math.hypot(bx - ax, by - ay));
    this.naturalLength = this.length;
    this.x = bx; this.y = by;
    this.px = bx - velX;
    this.py = by - velY;
    this.attached = true;
    this.shootT = 0;
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.recoil = { ax: this.anchor.x, ay: this.anchor.y, bx: this.x, by: this.y, t: 0 };
  }

  /** Keep an attached/recoiling rope coherent when the viewport changes. */
  scale(sx: number, sy: number): void {
    this.anchor.x *= sx;
    this.anchor.y *= sy;
    this.x *= sx;
    this.px *= sx;
    this.y *= sy;
    this.py *= sy;
    const lengthScale = Math.sqrt(Math.abs(sx * sy));
    this.length *= lengthScale;
    this.naturalLength *= lengthScale;
    if (this.recoil) {
      this.recoil.ax *= sx;
      this.recoil.ay *= sy;
      this.recoil.bx *= sx;
      this.recoil.by *= sy;
    }
  }

  /** current bob velocity (px/s) */
  velocity(dt: number): Vec {
    return { x: (this.x - this.px) / Math.max(dt, 1e-4), y: (this.y - this.py) / Math.max(dt, 1e-4) };
  }

  /**
   * One physics step. `pump` in -1..1 shortens the rope while it swings
   * (how real swingers gain height) then lets it back out.
   */
  step(dt: number, pump: number): void {
    this.shootT = Math.min(1, this.shootT + dt * 3.2);
    if (this.recoil) this.recoil.t += dt;
    if (!this.attached) return;

    if (pump !== 0) {
      const min = this.naturalLength * 0.55;
      this.length = clamp(this.length - pump * 200 * dt, min, this.naturalLength);
    } else {
      // relax back toward natural length
      this.length += (this.naturalLength - this.length) * Math.min(1, dt * 2.5);
    }

    const nx = this.x + (this.x - this.px) * DAMPING;
    const ny = this.y + (this.y - this.py) * DAMPING + GRAVITY * dt * dt;
    this.px = this.x; this.py = this.y;
    this.x = nx; this.y = ny;

    // distance constraint → pendulum
    const dx = this.x - this.anchor.x;
    const dy = this.y - this.anchor.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    const diff = (d - this.length) / d;
    this.x -= dx * diff;
    this.y -= dy * diff;
  }

  /** Draw the active rope (with stretch glow) and any recoiling line. */
  render(ctx: CanvasRenderingContext2D, accent: string): void {
    ctx.save();
    ctx.lineCap = 'round';

    if (this.recoil && this.recoil.t < 0.35) {
      const r = this.recoil;
      const t = r.t / 0.35;
      // the free end snaps back to the anchor
      const bx = r.bx + (r.ax - r.bx) * t * t * (3 - 2 * t);
      const by = r.by + (r.ay - r.by) * t * t * (3 - 2 * t) + Math.sin(t * Math.PI) * 18;
      ctx.strokeStyle = rgba('#e8ecff', 0.7 * (1 - t));
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(r.ax, r.ay);
      ctx.quadraticCurveTo((r.ax + bx) / 2, (r.ay + by) / 2 + 14 * (1 - t), bx, by);
      ctx.stroke();
    } else {
      this.recoil = null;
    }

    if (this.attached && this.shootT > 0) {
      const ex = this.anchor.x + (this.x - this.anchor.x) * this.shootT;
      const ey = this.anchor.y + (this.y - this.anchor.y) * this.shootT;
      /* Silk mechanics (dragline: ~10 GPa initial modulus, yield at ~2–5%
         strain): a loaded strand is effectively inextensible and thins as
         tension rises, while a slack strand sags into a catenary. */
      const cur = Math.hypot(this.x - this.anchor.x, this.y - this.anchor.y);
      const slack = clamp((this.naturalLength - cur) / this.naturalLength, 0, 1);
      const strain = clamp((cur - this.naturalLength) / this.naturalLength, 0, 0.3);
      const sag = (8 + slack * 110) * (1 - this.shootT * 0.5);
      const core = 1.7 - strain * 2.2;
      // bright core + soft glow
      ctx.strokeStyle = rgba(accent, 0.22);
      ctx.lineWidth = core + 2.1;
      ctx.beginPath();
      ctx.moveTo(this.anchor.x, this.anchor.y);
      ctx.quadraticCurveTo((this.anchor.x + ex) / 2, (this.anchor.y + ey) / 2 + sag, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,244,255,0.95)';
      ctx.lineWidth = Math.max(0.8, core);
      ctx.beginPath();
      ctx.moveTo(this.anchor.x, this.anchor.y);
      ctx.quadraticCurveTo((this.anchor.x + ex) / 2, (this.anchor.y + ey) / 2 + sag, ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Cosmetic web shots & splats (pooled effects)                        */
/* ------------------------------------------------------------------ */

interface Splat { x: number; y: number; t: number; spokes: number }
interface Shot { x1: number; y1: number; x2: number; y2: number; t: number }

export class WebEffects {
  private splats: Splat[] = [];
  private shots: Shot[] = [];

  /** impact starburst where a web lands */
  splat(x: number, y: number): void {
    if (this.splats.length > 6) this.splats.shift();
    this.splats.push({ x, y, t: 0, spokes: 6 + Math.floor(rand(3)) });
  }

  /** a fast cosmetic line (e.g. double-click web) that doesn't attach */
  shot(x1: number, y1: number, x2: number, y2: number): void {
    if (this.shots.length > 4) this.shots.shift();
    this.shots.push({ x1, y1, x2, y2, t: 0 });
  }

  update(dt: number): void {
    for (const s of this.splats) s.t += dt;
    for (const s of this.shots) s.t += dt;
    this.splats = this.splats.filter((s) => s.t < 4);
    this.shots = this.shots.filter((s) => s.t < 0.5);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.shots) {
      const p = Math.min(1, s.t / 0.12);
      const ex = s.x1 + (s.x2 - s.x1) * p;
      const ey = s.y1 + (s.y2 - s.y1) * p;
      const fade = s.t < 0.2 ? 1 : 1 - (s.t - 0.2) / 0.3;
      ctx.strokeStyle = `rgba(240,244,255,${0.9 * fade})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    for (const s of this.splats) {
      const grow = Math.min(1, s.t / 0.15);
      const fade = s.t < 2.4 ? 1 : 1 - (s.t - 2.4) / 1.6;
      const r = 12 * grow;
      ctx.strokeStyle = `rgba(235,240,255,${0.75 * fade})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < s.spokes; i++) {
        const a = (i / s.spokes) * TAU + s.spokes;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(235,240,255,${0.9 * fade})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Hammock net + web-logo (easter eggs)                                */
/* ------------------------------------------------------------------ */

/** A sagging two-anchor web the spider naps in. */
export function drawHammock(
  ctx: CanvasRenderingContext2D,
  a: Vec, b: Vec, swayPhase: number, alpha: number,
): { cx: number; cy: number; angle: number } {
  const midX = (a.x + b.x) / 2 + Math.sin(swayPhase) * 8;
  const sag = Math.hypot(b.x - a.x, b.y - a.y) * 0.18;
  const midY = Math.max(a.y, b.y) + sag;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(240,244,255,0.85)';
  ctx.lineWidth = 1.4;
  // main catenary
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(midX, midY + sag * 0.8, b.x, b.y);
  ctx.stroke();
  // woven cross strands
  ctx.strokeStyle = 'rgba(240,244,255,0.4)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const x1 = a.x + (b.x - a.x) * t;
    const y1 = a.y + (b.y - a.y) * t;
    const cx = midX;
    const cy = midY - sag * 0.35;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + cx) / 2, (y1 + cy) / 2 + 6, cx, cy);
    ctx.stroke();
  }
  ctx.restore();
  const swingAngle = Math.sin(swayPhase) * 0.1 + (b.y - a.y) / Math.max(1, Math.abs(b.x - a.x)) * 0.4;
  return { cx: midX, cy: midY - sag * 0.42, angle: Math.PI / 2 + swingAngle };
}

/** Easter egg: a spider emblem drawn briefly out of web silk. */
export function drawWebLogo(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, progress: number, alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(240,244,255,0.85)';
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  // radial spokes
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const p = clamp(progress * 2 - i * 0.05, 0, 1);
    if (p <= 0) continue;
    const a = (i / spokes) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * p, Math.sin(a) * r * p);
    ctx.stroke();
  }
  // spiral rings
  const rings = 4;
  for (let ringI = 1; ringI <= rings; ringI++) {
    const p = clamp(progress * 2 - 0.5 - ringI * 0.12, 0, 1);
    if (p <= 0) continue;
    const rr = (ringI / rings) * r;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a1 = (i / spokes) * TAU;
      const a2 = ((i + 1) / spokes) * TAU;
      const seg = clamp(p * spokes - i, 0, 1);
      if (seg <= 0) continue;
      ctx.moveTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
      ctx.quadraticCurveTo(
        Math.cos((a1 + a2) / 2) * rr * 0.82,
        Math.sin((a1 + a2) / 2) * rr * 0.82,
        Math.cos(a1 + (a2 - a1) * seg) * rr,
        Math.sin(a1 + (a2 - a1) * seg) * rr,
      );
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Tiny crawling spider (easter egg)                                   */
/* ------------------------------------------------------------------ */

export function drawTinySpider(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(10,10,16,0.95)';
  ctx.strokeStyle = 'rgba(10,10,16,0.95)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  // legs
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const wig = Math.sin(phase * 14 + i * 1.4) * 1.6;
      const a = (-0.5 + i * 0.42) * side;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 5 + side * 4, Math.sin(a) * 4 + wig);
      ctx.stroke();
    }
  }
  // body
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 2.4, 3, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -2.4, 1.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}
