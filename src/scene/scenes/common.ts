/**
 * Shared building blocks for wallpaper scenes: seeded RNG, offscreen
 * canvases, starfields and gradient helpers.
 */
import type { Scene, SceneFrame, SceneId } from '../../types';
import { TAU } from '../../utils/helpers';

/** Deterministic PRNG so scenery stays stable between frames/resizes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeOffscreen(w: number, h: number): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  const x = c.getContext('2d');
  if (!x) throw new Error('[hypertab] offscreen context failed');
  return { c, x };
}

/** Fill a full rect with a vertical gradient. */
export function skyGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ */
/* Stars                                                              */
/* ------------------------------------------------------------------ */

export interface Star { x: number; y: number; r: number; depth: number; phase: number; speed: number }

export function genStars(rng: () => number, w: number, h: number, count: number, maxY = 1): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const depth = 0.3 + rng() * 0.7;
    stars.push({
      x: rng() * w,
      y: rng() * h * maxY,
      r: 0.4 + depth * 1.3,
      depth,
      phase: rng() * TAU,
      speed: 0.6 + rng() * 1.8,
    });
  }
  return stars;
}

export function drawStars(ctx: CanvasRenderingContext2D, f: SceneFrame, stars: Star[], brightness = 1): void {
  ctx.save();
  ctx.fillStyle = '#dfe9ff';
  for (const s of stars) {
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(f.t * s.speed + s.phase));
    ctx.globalAlpha = tw * brightness * s.depth;
    const x = s.x - f.px * 14 * s.depth;
    const y = s.y - f.py * 8 * s.depth;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Base class with shared bookkeeping                                 */
/* ------------------------------------------------------------------ */

export abstract class SceneBase implements Scene {
  abstract readonly id: SceneId;
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected w = 0;
  protected h = 0;
  protected dpr = 1;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  abstract resize(w: number, h: number, dpr: number): void;
  abstract render(f: SceneFrame): void;

  dispose(): void {
    /* scenes release offscreen buffers here */
  }

  /** Midpoint-displacement ridge line used by mountains/forest scenes. */
  protected ridge(
    rng: () => number,
    w: number,
    baseY: number,
    roughness: number,
    height: number,
  ): Array<[number, number]> {
    const segments = 8;
    let pts: Array<[number, number]> = [];
    for (let i = 0; i <= segments; i++) {
      pts.push([(i / segments) * w, baseY - (rng() - 0.2) * height]);
    }
    for (let iter = 0; iter < 4; iter++) {
      const next: Array<[number, number]> = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - (rng() - 0.5) * roughness;
        next.push([midX, midY], [x2, y2]);
      }
      pts = next;
      roughness *= 0.55;
    }
    return pts;
  }

  protected fillRidge(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, h: number, color: string): void {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1][0], h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
