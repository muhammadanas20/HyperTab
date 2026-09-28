/**
 * The Webhead rig — a fully procedural, original stylised spider-hero.
 *
 * Nothing is a sprite. The body is a skeleton-driven vector mesh:
 *
 *  • Proportions, joint heights, limb lengths and girth profiles come from
 *    `anatomy.ts`, which encodes open anthropometric data (Drillis & Contini
 *    via Winter's *Biomechanics and Motor Control*, the 8-head figure canon,
 *    femur:tibia 1.26–1.28, biacromial ≈ 0.2 H …) restyled to a compact
 *    5.4-head athletic companion.
 *  • Limbs are *tapered capsule meshes*: radius profiles sampled along each
 *    bone (deltoid/biceps/calf/quadriceps bellies included), outlined with a
 *    constant ink line and shaded with a cross-axis gradient — the classic
 *    2D trick for making a tube read as a lit cylinder (core highlight,
 *    terminator, reflected light on the shadow edge).
 *  • One world-space key light (upper-left on screen) drives every gradient,
 *    the mask's form shadow and the rim light, so shading stays consistent
 *    through flips, hangs and swings.
 *  • Locomotion targets come from `gaitFrame()` — stance/swing foot planting,
 *    heel-strike → toe-off ankle pitch, twice-per-stride pelvic bob, trunk
 *    lean ∝ speed, contralateral arm swing and a stabilised head.
 *  • Poses are landmark targets in unit space (0 = crown, 1 = sole); limbs
 *    solve with analytic two-bone IK, so everything stays blendable.
 */
import { clamp, lerp, TAU } from '../utils/helpers';
import {
  ARM_GIRTH, FOREARM_GIRTH, SHANK_GIRTH, THIGH_GIRTH, HEAD, LANDMARK, WIDTH,
  angOf, between, dist, gaitFrame, sampleGirth,
  type GirthStop, type Pt,
} from './anatomy';

/* ------------------------------------------------------------------ */
/* Pose description                                                   */
/* ------------------------------------------------------------------ */

export interface Pose {
  /** pelvis/chest/head centres plus hand & foot targets, unit space */
  pelvis: [number, number];
  chest: [number, number];
  head: [number, number];
  handL: [number, number];
  handR: [number, number];
  footL: [number, number];
  footR: [number, number];
  /** which way knees/elbows fold: 1 = forwards(+x), -1 = backwards */
  kneeBend: number;
  elbowBend: number;
  /** 0..1 — how "low ready to pounce" the silhouette is (adds crouch sway) */
  tension?: number;
}

export type PoseName =
  | 'stand' | 'crouch' | 'sit' | 'hang' | 'swing' | 'crawl'
  | 'sleep' | 'hammock' | 'watch' | 'wave' | 'curious'
  | 'airborne' | 'land' | 'dodge' | 'point';

/* Poses are keyed off the anatomical landmarks (hip 0.505, chest ≈ 0.27,
   head centre ≈ 0.10, wrist ≈ 0.59, sole ≈ 1.0) so every target the IK
   receives is reachable by the real bone lengths. */
export const POSES: Record<PoseName, Pose> = {
  stand: {
    pelvis: [0, 0.505], chest: [0.012, 0.27], head: [0.045, 0.105],
    handL: [-0.12, 0.585], handR: [0.15, 0.585],
    footL: [-0.055, 0.995], footR: [0.085, 0.993],
    kneeBend: 1, elbowBend: -1,
  },
  crouch: {
    pelvis: [0, 0.62], chest: [0.075, 0.415], head: [0.115, 0.295],
    handL: [-0.11, 0.585], handR: [0.215, 0.935],          // one fist to the floor
    footL: [-0.145, 0.99], footR: [0.155, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 1,
  },
  sit: {
    pelvis: [0, 0.795], chest: [0.0, 0.575], head: [0.035, 0.455],
    handL: [-0.11, 0.86], handR: [0.13, 0.87],
    footL: [0.16, 0.985], footR: [0.245, 0.955],           // one knee up, one leg out
    kneeBend: 1, elbowBend: -1,
  },
  hang: {   // rendered with a π body-rotation → hangs upside down
    pelvis: [0, 0.40], chest: [-0.02, 0.22], head: [-0.03, 0.10],
    handL: [-0.12, 0.40], handR: [0.11, 0.42],
    footL: [-0.035, 0.03], footR: [0.05, 0.035],           // legs hooked over the web
    kneeBend: 1, elbowBend: -1,
  },
  swing: {  // body arched, both arms up gripping the web
    pelvis: [0, 0.48], chest: [-0.06, 0.285], head: [-0.05, 0.155],
    handL: [0.02, 0.02], handR: [0.15, 0.012],
    footL: [-0.24, 0.68], footR: [-0.09, 0.82],
    kneeBend: -1, elbowBend: 1,
  },
  crawl: {  // spread wall-crawl silhouette (used with ±π/2 rotation)
    pelvis: [0, 0.48], chest: [0.02, 0.28], head: [0.05, 0.155],
    handL: [-0.21, 0.28], handR: [0.25, 0.32],
    footL: [-0.19, 0.84], footR: [0.19, 0.88],
    kneeBend: -1, elbowBend: 1, tension: 0.6,
  },
  sleep: {  // curled up on the floor
    pelvis: [0, 0.80], chest: [0.09, 0.715], head: [0.155, 0.65],
    handL: [0.15, 0.86], handR: [0.04, 0.90],
    footL: [-0.09, 0.99], footR: [0.06, 0.995],
    kneeBend: 1, elbowBend: -1,
  },
  hammock: { // relaxed, hands behind head — drawn while rotated to lie flat
    pelvis: [0, 0.53], chest: [0.0, 0.29], head: [0.02, 0.15],
    handL: [0.09, 0.11], handR: [0.18, 0.09],
    footL: [-0.15, 0.95], footR: [0.10, 0.99],
    kneeBend: 1, elbowBend: 1,
  },
  watch: {  // checks an imaginary watch
    pelvis: [0, 0.505], chest: [0.02, 0.27], head: [0.075, 0.155],
    handL: [0.15, 0.24], handR: [0.16, 0.58],              // left wrist raised to face
    footL: [-0.055, 0.995], footR: [0.085, 0.993],
    kneeBend: 1, elbowBend: 1,
  },
  wave: {
    pelvis: [0, 0.505], chest: [0.012, 0.27], head: [0.045, 0.105],
    handL: [-0.115, 0.595], handR: [0.285, 0.10],          // right arm up
    footL: [-0.055, 0.995], footR: [0.085, 0.993],
    kneeBend: 1, elbowBend: -1,
  },
  curious: { // leaning in, head tilted towards something interesting
    pelvis: [0, 0.525], chest: [0.07, 0.305], head: [0.13, 0.19],
    handL: [-0.11, 0.60], handR: [0.15, 0.28],             // hand up at chin
    footL: [-0.06, 0.995], footR: [0.11, 0.993],
    kneeBend: 1, elbowBend: 1,
  },
  airborne: { // free fall / jump — limbs spread
    pelvis: [0, 0.48], chest: [0, 0.265], head: [0.04, 0.135],
    handL: [-0.22, 0.18], handR: [0.24, 0.16],
    footL: [-0.12, 0.78], footR: [0.12, 0.83],
    kneeBend: 1, elbowBend: -1,
  },
  land: {   // three-point landing
    pelvis: [0, 0.66], chest: [0.08, 0.475], head: [0.12, 0.355],
    handL: [-0.13, 0.63], handR: [0.205, 0.93],
    footL: [-0.17, 0.99], footR: [0.17, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 1,
  },
  dodge: {
    pelvis: [0, 0.545], chest: [-0.055, 0.32], head: [-0.095, 0.19],
    handL: [-0.26, 0.38], handR: [0.19, 0.48],
    footL: [-0.13, 0.99], footR: [0.13, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 0.8,
  },
  point: {  // double-click response: arm out, "thwip"
    pelvis: [0, 0.505], chest: [0.012, 0.27], head: [0.045, 0.105],
    handL: [-0.115, 0.595], handR: [0.32, 0.275],
    footL: [-0.055, 0.995], footR: [0.085, 0.993],
    kneeBend: 1, elbowBend: -1, tension: 0.4,
  },
};

/* ------------------------------------------------------------------ */
/* Two-bone IK                                                        */
/* ------------------------------------------------------------------ */

const UPPER_ARM = LANDMARK.elbow - LANDMARK.acromion;   // 0.193 H (Winter 0.186)
const FOREARM = LANDMARK.wrist - LANDMARK.elbow;        // 0.146 H
const THIGH = LANDMARK.knee - LANDMARK.hip;             // 0.257 H
const SHIN = LANDMARK.ankle - LANDMARK.knee;            // 0.194 H
const ANKLE_TO_SOLE = LANDMARK.sole - LANDMARK.ankle;   // 0.044 H

function twoBone(
  ax: number, ay: number,
  tx: number, ty: number,
  l1: number, l2: number,
  bend: number,
): [number, number] {
  let dx = tx - ax;
  let dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const min = Math.abs(l1 - l2) + 1e-4;
  const max = l1 + l2 - 1e-4;
  d = clamp(d, min, max);
  // re-target onto the clamped circle so hands/feet never stretch limbs
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  dx = ux * d;
  dy = uy * d;
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a1 * bend;
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
}

/* ------------------------------------------------------------------ */
/* Palettes — every variant is an original stylised colourway         */
/* ------------------------------------------------------------------ */

export type PaletteId = 'classic' | 'stealth' | 'ghost';

export interface SuitPalette {
  red: string;      // mask / torso / gloves / boots
  blue: string;     // limbs / sides
  web: string;      // web-line detail
  lens: string;     // eye lenses
  trim: string;     // emblem / lens rim
}

export const PALETTES: Record<PaletteId, SuitPalette> = {
  classic: { red: '#d43a50', blue: '#2e3b8f', web: 'rgba(60,12,20,0.5)', lens: '#eef4ff', trim: '#10131f' },
  stealth: { red: '#e0243c', blue: '#15151c', web: 'rgba(224,36,60,0.35)', lens: '#ff4d4d', trim: '#050507' },
  ghost: { red: '#e8e6f2', blue: '#3a3f66', web: 'rgba(90,90,140,0.4)', lens: '#3d2b66', trim: '#ff5ca8' },
};

/* ------------------------------------------------------------------ */
/* Render state                                                       */
/* ------------------------------------------------------------------ */

export type Expression = 'neutral' | 'happy' | 'suspicious' | 'sleepy' | 'wow';

export interface RenderState {
  x: number;             // screen px (pelvis)
  y: number;
  rotation: number;      // whole-body rotation (rad), 0 = upright
  facing: 1 | -1;
  size: number;          // character height in px
  alpha: number;
  squash: number;        // 1 = normal, <1 squashed (landings)
  pose: Pose;
  headTilt: number;      // extra head lean
  lookX: number;         // where the eyes point (unit, -1..1)
  lookY: number;
  blink: number;         // 0 open .. 1 shut
  expr: Expression;
  palette: SuitPalette;
  walkPhase: number;     // >-1 while walking: procedural gait cycle
  /** 0 = stroll … 1 = sprint; blends walk → run kinematics */
  run?: number;
  breathe: number;       // breathing phase seconds
  hidden: 'none' | 'left' | 'right' | 'top'; // peek-from-edge clipping
  quality: number;
}

/** Blend two poses point-for-point. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const P = (ka: [number, number], kb: [number, number]): [number, number] => [
    lerp(ka[0], kb[0], t), lerp(ka[1], kb[1], t),
  ];
  return {
    pelvis: P(a.pelvis, b.pelvis),
    chest: P(a.chest, b.chest),
    head: P(a.head, b.head),
    handL: P(a.handL, b.handL),
    handR: P(a.handR, b.handR),
    footL: P(a.footL, b.footL),
    footR: P(a.footR, b.footR),
    kneeBend: t < 0.5 ? a.kneeBend : b.kneeBend,
    elbowBend: t < 0.5 ? a.elbowBend : b.elbowBend,
    tension: lerp(a.tension ?? 0, b.tension ?? 0, t),
  };
}

/* ------------------------------------------------------------------ */
/* Colour helpers                                                     */
/* ------------------------------------------------------------------ */

function rgbOf(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2]];
  }
  return [128, 128, 128];
}

/** Cheap colour shade: multiply rgb by k (for far-side parts). */
function shade(hex: string, k: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

/** Mix towards white (k>0) or black (k<0). */
function tint(hex: string, k: number): string {
  const [r, g, b] = rgbOf(hex);
  const t = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  return `rgb(${Math.round(lerp(r, t, a))},${Math.round(lerp(g, t, a))},${Math.round(lerp(b, t, a))})`;
}

/* ------------------------------------------------------------------ */
/* The draw routine                                                   */
/* ------------------------------------------------------------------ */

export function drawSpider(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const sz = s.size;
  const pal = s.palette;
  const pose = s.pose;
  const hi = s.quality > 0.5;
  const ink = shade(pal.blue, 0.22);

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);
  // Preserve apparent volume during squash-and-stretch without making a
  // landing comically wide. All geometry remains vector sharp at any DPR.
  const stretchX = 1 + (1 - s.squash) * 0.72;
  ctx.scale(s.facing * sz * stretchX, sz * s.squash);
  ctx.globalAlpha = s.alpha;

  /* hopping off behind an edge? draw only the visible slice */
  if (s.hidden !== 'none') {
    ctx.beginPath();
    if (s.hidden === 'left') ctx.rect(-0.2, -0.6, 0.75, 2);
    else if (s.hidden === 'right') ctx.rect(-0.55, -0.6, 0.75, 2);
    else ctx.rect(-0.6, -0.25, 1.6, 0.7);
    ctx.clip();
  }

  /* ---- world key light, mapped into character space ----
     The light lives in screen space (upper-left). Undo rotation + facing so
     every gradient below agrees on where "lit" is, whichever way he faces
     or hangs. */
  const lx0 = -0.52, ly0 = -0.85;
  const cr = Math.cos(-s.rotation), sr = Math.sin(-s.rotation);
  const rlx = lx0 * cr - ly0 * sr;
  const rly = lx0 * sr + ly0 * cr;
  const light: Pt = [rlx / (s.facing * stretchX), rly / s.squash];
  const lightLen = Math.hypot(light[0], light[1]) || 1;
  light[0] /= lightLen; light[1] /= lightLen;

  /* ---- breathing + procedural gait (stance/swing, bob, lean) ---- */
  const breathe = Math.sin(s.breathe * TAU * 0.28) * 0.006;
  let chestOff = breathe;
  let bodyBob = 0;
  let feet: { L: Pt; R: Pt } = { L: pose.footL, R: pose.footR };
  let hands: { L: Pt; R: Pt } = { L: pose.handL, R: pose.handR };
  let footAng = { L: 0, R: 0 };
  let lean = 0;

  if (s.walkPhase >= 0) {
    const g = gaitFrame(s.walkPhase, s.run ?? 0);
    feet = { L: g.footL, R: g.footR };
    hands = { L: g.handL, R: g.handR };
    footAng = { L: g.footAngL, R: g.footAngR };
    bodyBob = g.pelvisOff[1];
    chestOff += g.chestOff[1];
    lean = g.lean;
  }

  const pelvis: Pt = [pose.pelvis[0] + (lean ? Math.sin(lean) * 0.012 : 0), pose.pelvis[1] + bodyBob];
  const chest: Pt = [
    pose.chest[0] + Math.sin(lean) * 0.075,
    pose.chest[1] - chestOff + bodyBob * 0.72,
  ];
  const head: Pt = [
    pose.head[0] + Math.sin(s.headTilt) * 0.022 + Math.sin(lean) * 0.05,
    // a touch below the anatomical crown: sinks the mask into the traps
    // so the neck reads short and heroic instead of columnar
    pose.head[1] + 0.011 - chestOff * 1.25 + bodyBob * 0.48,
  ];

  /* ---- solve limbs with mirrored bends for a readable silhouette ---- */
  const shoulder: Pt = [chest[0] + 0.004, chest[1] - 0.004];
  const shoulderL: Pt = [shoulder[0] - WIDTH.acromion * 0.78, shoulder[1]];
  const shoulderR: Pt = [shoulder[0] + WIDTH.acromion * 0.78, shoulder[1]];
  const hipL: Pt = [pelvis[0] - WIDTH.trochanter * 0.82, pelvis[1] + 0.008];
  const hipR: Pt = [pelvis[0] + WIDTH.trochanter * 0.82, pelvis[1] + 0.008];
  // feet targets are sole contacts; the IK solves to the ankle joint
  const ankleL: Pt = [feet.L[0] - Math.sin(footAng.L) * ANKLE_TO_SOLE * 0.5, feet.L[1] - Math.cos(footAng.L) * ANKLE_TO_SOLE];
  const ankleR: Pt = [feet.R[0] - Math.sin(footAng.R) * ANKLE_TO_SOLE * 0.5, feet.R[1] - Math.cos(footAng.R) * ANKLE_TO_SOLE];
  const elbowL = twoBone(shoulderL[0], shoulderL[1], hands.L[0], hands.L[1], UPPER_ARM, FOREARM, -pose.elbowBend);
  const elbowR = twoBone(shoulderR[0], shoulderR[1], hands.R[0], hands.R[1], UPPER_ARM, FOREARM, pose.elbowBend);
  const kneeL = twoBone(hipL[0], hipL[1], ankleL[0], ankleL[1], THIGH, SHIN, pose.kneeBend);
  const kneeR = twoBone(hipR[0], hipR[1], ankleR[0], ankleR[1], THIGH, SHIN, -pose.kneeBend);

  /* ---------------------------------------------------------------- */
  /* mesh + shading toolkit                                           */
  /* ---------------------------------------------------------------- */

  /** Sample a bone chain into centre points + radii. */
  const sampleChain = (
    chain: Pt[], girths: GirthStop[][], per = 10,
  ): { pts: Pt[]; rad: number[] } => {
    const pts: Pt[] = [];
    const rad: number[] = [];
    for (let seg = 0; seg < chain.length - 1; seg++) {
      const a = chain[seg];
      const b = chain[seg + 1];
      const g = girths[seg] ?? girths[girths.length - 1];
      for (let i = 0; i < per; i++) {
        const t = i / per;
        pts.push(between(a, b, t));
        rad.push(sampleGirth(g, t));
      }
    }
    pts.push(chain[chain.length - 1]);
    rad.push(sampleGirth(girths[girths.length - 1], 1));
    return { pts, rad };
  };

  /** Closed outline around a sampled chain (offset both sides + round caps). */
  const traceMesh = (pts: Pt[], rad: number[]): void => {
    const n = pts.length;
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      left.push([pts[i][0] + nx * rad[i], pts[i][1] + ny * rad[i]]);
      right.push([pts[i][0] - nx * rad[i], pts[i][1] - ny * rad[i]]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
    // round distal cap (bulges away from the limb)
    ctx.arc(pts[n - 1][0], pts[n - 1][1], rad[n - 1], Math.atan2(left[n - 1][1] - pts[n - 1][1], left[n - 1][0] - pts[n - 1][0]), Math.atan2(right[n - 1][1] - pts[n - 1][1], right[n - 1][0] - pts[n - 1][0]), true);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    // round proximal cap
    ctx.arc(pts[0][0], pts[0][1], rad[0], Math.atan2(right[0][1] - pts[0][1], right[0][0] - pts[0][0]), Math.atan2(left[0][1] - pts[0][1], left[0][0] - pts[0][0]), true);
    ctx.closePath();
  };

  /**
   * Cylindrical shading: a gradient across the limb axis. Lit side gets a
   * core highlight, the terminator falls mid-width, and a little reflected
   * light keeps the shadow edge from going dead — the standard 2D "tube"
   * recipe that makes flat vectors read as volumes.
   */
  const tubeGradient = (a: Pt, b: Pt, w: number, base: string): CanvasGradient => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l;
    let ny = dx / l;
    // orient the normal towards the light so stop order is stable
    if (nx * light[0] + ny * light[1] < 0) { nx = -nx; ny = -ny; }
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const g = ctx.createLinearGradient(mx + nx * w, my + ny * w, mx - nx * w, my - ny * w);
    g.addColorStop(0, tint(base, 0.34));      // core highlight on lit side
    g.addColorStop(0.22, tint(base, 0.12));
    g.addColorStop(0.5, base);
    g.addColorStop(0.78, shade(base, 0.66));  // terminator
    g.addColorStop(0.94, shade(base, 0.5));
    g.addColorStop(1, shade(base, 0.62));     // reflected light at the edge
    return g;
  };

  const strokeInk = (w: number, color = ink): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  /**
   * Draw one limb as a shaded tapered mesh. `far` limbs are pre-darkened
   * (aerial perspective) and lose their fine detail.
   */
  const drawLimb = (
    chain: Pt[], girths: GirthStop[][], base: string, far: boolean,
    opts?: { rings?: boolean; ringColor?: string },
  ): void => {
    const col = far ? shade(base, 0.55) : base;
    const { pts, rad } = sampleChain(chain, girths);
    traceMesh(pts, rad);
    if (hi && !far) {
      /* Sphere-stacked shading: every cross-section gets a radial gradient
         offset towards the key light, so bent limbs stay correctly lit
         around the joint (a single cross-gradient would break at elbows).
         Clipped to the mesh outline, the stack reads as one smooth tube. */
      ctx.save();
      ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(-1, -1, 2, 3);
      for (let i = 0; i < pts.length; i++) {
        const r = rad[i];
        const gx = pts[i][0] + light[0] * r * 0.34;
        const gy = pts[i][1] + light[1] * r * 0.34;
        const g = ctx.createRadialGradient(gx, gy, r * 0.05, pts[i][0], pts[i][1], r * 1.62);
        g.addColorStop(0, tint(base, 0.3));
        g.addColorStop(0.34, tint(base, 0.12));
        g.addColorStop(0.52, base);
        g.addColorStop(0.74, shade(base, 0.74));
        g.addColorStop(1, shade(base, 0.58));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], r * 1.65, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = col;
      ctx.fill();
    }
    traceMesh(pts, rad);
    strokeInk(far ? 0.014 : 0.016, far ? 'rgba(4,6,14,0.9)' : ink);
    /* suit webbing: transverse rings following the limb cylinder */
    if (hi && opts?.rings && !far && sz > 70) {
      ctx.save();
      traceMesh(pts, rad);
      ctx.clip();
      ctx.globalAlpha = s.alpha * 0.28;
      ctx.strokeStyle = opts.ringColor ?? pal.web;
      ctx.lineWidth = 0.0032;
      const a = chain[0];
      const b = chain[chain.length - 1];
      const total = dist(a, b);
      const step = 0.07;
      for (let d = step; d < total; d += step) {
        const t = d / total;
        const c = between(a, b, t);
        const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const aa = pts[Math.max(0, i - 1)];
        const bb = pts[Math.min(pts.length - 1, i + 1)];
        const dx = bb[0] - aa[0];
        const dy = bb[1] - aa[1];
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l;
        const ny = dx / l;
        const r = rad[i];
        // slight bow so the ring wraps the cylinder instead of cutting it
        ctx.beginPath();
        ctx.moveTo(c[0] + nx * r, c[1] + ny * r);
        ctx.quadraticCurveTo(
          c[0] + (dx / l) * r * 0.55, c[1] + (dy / l) * r * 0.55,
          c[0] - nx * r, c[1] - ny * r,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  /** Soft contact shadow / ambient occlusion blob (painted atop the body). */
  const aoBlob = (p: Pt, r: number, strength = 0.3): void => {
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    g.addColorStop(0, `rgba(5,7,16,${strength})`);
    g.addColorStop(1, 'rgba(5,7,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.fill();
  };

  /* ---------------------------------------------------------------- */
  /* contact shadows on the floor                                     */
  /* ---------------------------------------------------------------- */

  const grounded = Math.abs(s.rotation) < 0.2 && s.squash > 0.9;
  if (hi && grounded) {
    for (const f of [feet.L, feet.R]) {
      const h = clamp(1 - f[1], 0, 0.3);
      const k = 1 - h / 0.3;
      if (k <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = s.alpha * 0.3 * k * k;
      ctx.translate(f[0], 1.002);
      ctx.scale(1, 0.22);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.11);
      g.addColorStop(0, 'rgba(3,4,10,0.9)');
      g.addColorStop(1, 'rgba(3,4,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 0.11, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = s.alpha;
    }
  }

  /* ---------------------------------------------------------------- */
  /* far limbs                                                        */
  /* ---------------------------------------------------------------- */

  const drawDeltoid = (sp: Pt, far: boolean): void => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sp[0], sp[1] + 0.006, 0.032, 0.037, 0, 0, TAU);
    if (hi && !far) ctx.fillStyle = tubeGradient([sp[0] - 0.03, sp[1]], [sp[0] + 0.03, sp[1]], 0.04, pal.red);
    else ctx.fillStyle = far ? shade(pal.red, 0.55) : pal.red;
    ctx.fill();
    if (far) {           // the near cap stays unstroked: the arm covers it
      ctx.strokeStyle = 'rgba(4,6,14,0.9)';
      ctx.lineWidth = 0.014;
      ctx.stroke();
    }
    ctx.restore();
  };

  drawLimb([hipL, kneeL, ankleL], [THIGH_GIRTH, SHANK_GIRTH], pal.blue, true);
  drawBoot(hipL, kneeL, ankleL, footAng.L, true);
  drawLimb([shoulderL, elbowL, hands.L], [ARM_GIRTH, FOREARM_GIRTH], pal.red, true);
  drawHand(hands.L, elbowL, true);
  drawDeltoid(shoulderL, true);

  /* ---------------------------------------------------------------- */
  /* torso — a width-profile mesh from neck to hip                    */
  /* ---------------------------------------------------------------- */

  const torsoDx = pelvis[0] - chest[0];
  const torsoDy = pelvis[1] - chest[1];
  const torsoLen = Math.max(0.14, Math.hypot(torsoDx, torsoDy));
  const torsoAngle = Math.atan2(torsoDy, torsoDx) - Math.PI / 2;
  ctx.save();
  ctx.translate(chest[0], chest[1]);
  ctx.rotate(torsoAngle);

  /* width profile in torso-local space (y: 0 = shoulder line → torsoLen = hip) */
  const torsoProfile: Array<[number, number]> = [
    [-0.05, WIDTH.neck + 0.026],        // trapezius / neck root
    [0.0, WIDTH.acromion * 0.92],       // shoulder line
    [0.085, WIDTH.chest],               // ribcage
    [torsoLen * 0.45, WIDTH.chest * 0.9],
    [torsoLen * 0.62, WIDTH.waist + 0.004],   // waist cinch
    [torsoLen * 0.88, WIDTH.hipMass * 0.9],   // hip flare
    [torsoLen + 0.01, WIDTH.trochanter * 0.98],
  ];
  const torsoPath = (): void => {
    ctx.beginPath();
    const left: Pt[] = torsoProfile.map(([y, w]) => [-w, y]);
    const right: Pt[] = torsoProfile.map(([y, w]) => [w, y]);
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) {
      const [py, pw] = torsoProfile[i];
      const [py0] = torsoProfile[i - 1];
      ctx.quadraticCurveTo(-pw, (py + py0) / 2, left[i][0], left[i][1]);
    }
    ctx.quadraticCurveTo(-WIDTH.trochanter * 0.9, torsoLen + 0.05, 0, torsoLen + 0.058);
    ctx.quadraticCurveTo(WIDTH.trochanter * 0.9, torsoLen + 0.05, right[right.length - 1][0], right[right.length - 1][1]);
    for (let i = right.length - 2; i >= 0; i--) {
      const [py, pw] = torsoProfile[i];
      const [py0] = torsoProfile[i + 1];
      ctx.quadraticCurveTo(pw, (py + py0) / 2, right[i][0], right[i][1]);
    }
    ctx.quadraticCurveTo(WIDTH.neck * 0.7, -0.052, 0, -0.05);
    ctx.quadraticCurveTo(-WIDTH.neck * 0.7, -0.052, left[0][0], left[0][1]);
    ctx.closePath();
  };

  torsoPath();
  if (hi) {
    const g = ctx.createLinearGradient(-WIDTH.chest, 0, WIDTH.chest, 0);
    // which flank faces the world key light?
    const litRight = light[0] * Math.cos(torsoAngle) + light[1] * Math.sin(torsoAngle) > 0;
    if (litRight) {
      g.addColorStop(0, shade(pal.red, 0.6));
      g.addColorStop(0.38, pal.red);
      g.addColorStop(0.68, tint(pal.red, 0.08));
      g.addColorStop(1, tint(pal.red, 0.26));
    } else {
      g.addColorStop(0, tint(pal.red, 0.26));
      g.addColorStop(0.32, tint(pal.red, 0.08));
      g.addColorStop(0.62, pal.red);
      g.addColorStop(1, shade(pal.red, 0.6));
    }
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = pal.red;
  }
  ctx.fill();
  torsoPath();
  strokeInk(0.018);

  ctx.save();
  torsoPath();
  ctx.clip();

  /* deep-blue flank panels that wrap the ribcage (classic colour block) */
  const flank = (side: 1 | -1): void => {
    ctx.beginPath();
    ctx.moveTo(side * WIDTH.chest * 1.02, torsoLen * 0.02);
    ctx.bezierCurveTo(
      side * WIDTH.chest * 0.86, torsoLen * 0.22,
      side * (WIDTH.waist + 0.028), torsoLen * 0.46,
      side * (WIDTH.waist + 0.014), torsoLen * 0.66,
    );
    ctx.bezierCurveTo(
      side * (WIDTH.hipMass * 0.9), torsoLen * 0.86,
      side * WIDTH.trochanter * 1.05, torsoLen + 0.03,
      side * WIDTH.trochanter * 1.1, torsoLen + 0.09,
    );
    ctx.lineTo(side * WIDTH.chest * 1.25, torsoLen + 0.09);
    ctx.lineTo(side * WIDTH.chest * 1.25, torsoLen * 0.0);
    ctx.closePath();
    if (hi) {
      const g = ctx.createLinearGradient(side * WIDTH.waist, 0, side * WIDTH.chest * 1.2, 0);
      g.addColorStop(0, tint(pal.blue, 0.1));
      g.addColorStop(1, shade(pal.blue, 0.62));
      ctx.fillStyle = g;
    } else ctx.fillStyle = pal.blue;
    ctx.fill();
  };
  flank(-1);
  flank(1);

  if (hi) {
    /* contour-following suit webbing over the red centre panel */
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.0048;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.1);
    ctx.lineTo(0, torsoLen * 0.8);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const y0 = -0.075 + i * 0.045;
        ctx.moveTo(0, y0);
        ctx.quadraticCurveTo(side * 0.05, y0 + 0.012, side * (WIDTH.chest - 0.012 - i * 0.008), y0 + 0.052);
      }
    }
    for (let i = 0; i < 4; i++) {
      const y = -0.03 + i * 0.052;
      const w = WIDTH.chest - 0.02 - Math.abs(i - 1.5) * 0.012;
      ctx.moveTo(-w, y);
      ctx.quadraticCurveTo(0, y + 0.026, w, y);
    }
    ctx.stroke();

    /* pectoral + sternum modelling */
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.006;
    ctx.beginPath();
    ctx.moveTo(0, torsoLen * 0.1);
    ctx.lineTo(0, torsoLen * 0.34);
    ctx.moveTo(-WIDTH.chest * 0.62, torsoLen * 0.16);
    ctx.quadraticCurveTo(-WIDTH.chest * 0.2, torsoLen * 0.3, 0, torsoLen * 0.28);
    ctx.quadraticCurveTo(WIDTH.chest * 0.2, torsoLen * 0.3, WIDTH.chest * 0.62, torsoLen * 0.16);
    ctx.stroke();
    /* clavicle highlight */
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.005;
    ctx.beginPath();
    ctx.moveTo(-WIDTH.acromion * 0.7, torsoLen * 0.02);
    ctx.quadraticCurveTo(0, torsoLen * 0.075, WIDTH.acromion * 0.7, torsoLen * 0.02);
    ctx.stroke();
  }

  /* chest emblem — crisp, legible geometric spider */
  if (sz > 58) {
    const ey = torsoLen * 0.3;
    ctx.save();
    ctx.translate(0, ey);
    ctx.scale(0.92, 0.92);
    ctx.strokeStyle = pal.trim;
    ctx.fillStyle = pal.trim;
    ctx.lineWidth = 0.0062;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, -0.012, 0.0085, 0.014, 0, 0, TAU);
    ctx.ellipse(0, 0.014, 0.0115, 0.021, 0, 0, TAU);
    ctx.fill();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const y = -0.02 + i * 0.0135;
        const reach = 0.036 + (i === 1 || i === 2 ? 0.013 : 0);
        ctx.beginPath();
        ctx.moveTo(side * 0.008, y);
        ctx.quadraticCurveTo(side * 0.02, y + (i < 2 ? -0.012 : 0.008), side * 0.026, y + (i < 2 ? -0.014 : 0.012));
        ctx.lineTo(side * reach, y + (i < 2 ? -0.004 : 0.026));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore(); // clip
  ctx.restore(); // torso transform

  /* ---------------------------------------------------------------- */
  /* near limbs                                                       */
  /* ---------------------------------------------------------------- */

  drawLimb([hipR, kneeR, ankleR], [THIGH_GIRTH, SHANK_GIRTH], pal.blue, false, { rings: false });
  drawBoot(hipR, kneeR, ankleR, footAng.R, false);
  drawDeltoid(shoulderR, false);
  drawLimb([shoulderR, elbowR, hands.R], [ARM_GIRTH, FOREARM_GIRTH], pal.red, false, { rings: true });
  drawHand(hands.R, elbowR, false);

  /* ---------------------------------------------------------------- */
  /* neck + head                                                      */
  /* ---------------------------------------------------------------- */

  const neckTop: Pt = [head[0] - 0.006, head[1] + HEAD.ry * 0.78];
  drawLimb([[chest[0], chest[1] - 0.028], [neckTop[0], neckTop[1]]], [[{ t: 0, r: WIDTH.neck * 1.05 }, { t: 1, r: WIDTH.neck * 0.92 }]], pal.red, false);

  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(s.headTilt * 0.9);

  const headPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, -HEAD.ry);
    ctx.bezierCurveTo(HEAD.rx * 0.72, -HEAD.ry * 0.98, HEAD.rx, -HEAD.ry * 0.42, HEAD.rx * 0.98, HEAD.ry * 0.06);
    ctx.bezierCurveTo(HEAD.rx * 0.96, HEAD.ry * 0.62, HEAD.rx * 0.55, HEAD.ry * 0.98, 0, HEAD.ry);
    ctx.bezierCurveTo(-HEAD.rx * 0.55, HEAD.ry * 0.98, -HEAD.rx * 0.96, HEAD.ry * 0.62, -HEAD.rx * 0.98, HEAD.ry * 0.06);
    ctx.bezierCurveTo(-HEAD.rx, -HEAD.ry * 0.42, -HEAD.rx * 0.72, -HEAD.ry * 0.98, 0, -HEAD.ry);
    ctx.closePath();
  };

  headPath();
  ctx.fillStyle = pal.red;
  ctx.fill();

  ctx.save();
  headPath();
  ctx.clip();
  if (hi) {
    /* spherical form shadow: the mask is a ball — shade it like one */
    const hx = light[0] * HEAD.rx * 0.55;
    const hy = light[1] * HEAD.ry * 0.55;
    const g = ctx.createRadialGradient(hx, hy, HEAD.rx * 0.15, hx, hy, HEAD.rx * 2.1);
    g.addColorStop(0, tint(pal.red, 0.3));
    g.addColorStop(0.42, pal.red);
    g.addColorStop(0.8, shade(pal.red, 0.66));
    g.addColorStop(1, shade(pal.red, 0.48));
    ctx.fillStyle = g;
    ctx.fillRect(-HEAD.rx * 1.2, -HEAD.ry * 1.2, HEAD.rx * 2.4, HEAD.ry * 2.4);

    /* mask webbing projected onto the sphere: radial rays from a centre
       above the brow + concentric rings that crowd towards the silhouette */
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.0042;
    ctx.lineCap = 'round';
    const cxw = 0, cyw = -HEAD.ry * 0.12;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(cxw + Math.cos(a) * 0.012, cyw + Math.sin(a) * 0.012);
      // bend each ray around the skull so it hugs the surface
      ctx.quadraticCurveTo(
        cxw + Math.cos(a) * HEAD.rx * 0.72, cyw + Math.sin(a) * HEAD.ry * 0.72,
        cxw + Math.cos(a) * HEAD.rx * 1.25, cyw + Math.sin(a) * HEAD.ry * 1.25,
      );
      ctx.stroke();
    }
    for (const rr of [0.3, 0.52, 0.74, 0.96]) {
      ctx.beginPath();
      ctx.ellipse(cxw, cyw, HEAD.rx * rr, HEAD.ry * rr * 0.94, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  headPath();
  strokeInk(0.017);

  /* expressive almond lenses — fixed to the mask, subtly morphed to look */
  let eyeHeight = Math.max(0.07, 1 - s.blink);
  let eyeWidth = 1;
  let lidShift = 0;
  switch (s.expr) {
    case 'happy': eyeHeight *= 0.7; lidShift = -0.004; break;
    case 'suspicious': eyeHeight *= 0.78; lidShift = 0.008; break;
    case 'sleepy': eyeHeight = Math.min(eyeHeight, 0.34); lidShift = 0.01; break;
    case 'wow': eyeHeight = Math.min(1.16, eyeHeight * 1.12); eyeWidth = 1.08; break;
    case 'neutral': default: break;
  }
  const lookNudgeX = clamp(s.lookX, -1, 1) * 0.0032;
  const lookNudgeY = clamp(s.lookY, -1, 1) * 0.0024;
  const lensScale = HEAD.ry / 0.11;   // lenses authored at the old head size

  for (const side of [-1, 1]) {
    const innerX = side * (0.014 * eyeWidth) + lookNudgeX;
    const outerX = side * (0.075 * eyeWidth) + lookNudgeX;
    const topY = (-0.04 + lidShift + lookNudgeY) * eyeHeight * lensScale;
    const bottomY = (0.041 + lidShift + lookNudgeY) * eyeHeight * lensScale;
    ctx.beginPath();
    ctx.moveTo(innerX * lensScale, topY);
    ctx.bezierCurveTo(
      (side * 0.035 * eyeWidth + lookNudgeX) * lensScale, topY * 1.28,
      (side * 0.066 * eyeWidth + lookNudgeX) * lensScale, topY * 1.12,
      outerX * lensScale, topY * 0.3,
    );
    ctx.bezierCurveTo(
      (side * 0.076 * eyeWidth + lookNudgeX) * lensScale, bottomY * 0.42,
      (side * 0.048 * eyeWidth + lookNudgeX) * lensScale, bottomY * 1.08,
      innerX * lensScale, bottomY * 0.76,
    );
    ctx.closePath();
    if (hi) {
      const g = ctx.createLinearGradient(0, topY, 0, bottomY);
      g.addColorStop(0, tint(pal.lens, 0.25));
      g.addColorStop(0.55, pal.lens);
      g.addColorStop(1, shade(pal.lens, 0.82));
      ctx.fillStyle = g;
    } else ctx.fillStyle = pal.lens;
    ctx.fill();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 0.011;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (hi && eyeHeight > 0.25) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.0036;
      ctx.beginPath();
      ctx.moveTo((innerX + side * 0.006) * lensScale, topY * 0.75);
      ctx.quadraticCurveTo(side * 0.046 * lensScale, topY * 1.08, (outerX - side * 0.01) * lensScale, topY * 0.56);
      ctx.stroke();
    }
  }
  ctx.restore(); // head

  /* ---------------------------------------------------------------- */
  /* ambient occlusion where limbs meet the trunk                     */
  /* ---------------------------------------------------------------- */

  if (hi) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    aoBlob([chest[0], chest[1] + 0.045], 0.075, 0.24);   // under the chest
    aoBlob([pelvis[0], pelvis[1] + 0.01], 0.085, 0.22);  // groin
    aoBlob(shoulderL, 0.05, 0.2);
    aoBlob(hipL, 0.055, 0.2);
    ctx.restore();
  }

  ctx.restore(); // body

  /* ---------------------------------------------------------------- */
  /* limb part drawers (hoisted: used before definition order above)  */
  /* ---------------------------------------------------------------- */

  function drawBoot(hip: Pt, knee: Pt, ankle: Pt, fAng: number, far: boolean): void {
    /* boot starts mid-shank and continues into a heel-toe wedge */
    const bootTop = between(knee, ankle, 0.42);
    const col = far ? shade(pal.red, 0.58) : pal.red;

    /* foot: heel → ankle → ball → toe as its own little tapered mesh,
       pitched by the gait ankle curve (plantar-/dorsiflexion) */
    const fa = fAng + angOf(knee, ankle) * 0.18;
    const ca = Math.cos(fa);
    const sa = Math.sin(fa);
    const rot = (px: number, py: number): Pt => [ankle[0] + px * ca - py * sa, ankle[1] + px * sa + py * ca];
    const heel = rot(-0.03, 0.026);
    const ball = rot(0.06, 0.032);
    const toe = rot(0.106, 0.024);
    const footChain: Pt[] = [heel, [ankle[0], ankle[1] + 0.004], ball, toe];
    const footGirths: GirthStop[][] = [
      [{ t: 0, r: 0.019 }, { t: 1, r: 0.024 }],
      [{ t: 0, r: 0.024 }, { t: 1, r: 0.021 }],
      [{ t: 0, r: 0.021 }, { t: 1, r: 0.011 }],
    ];
    const fm = sampleChain(footChain, footGirths, 6);
    traceMesh(fm.pts, fm.rad);
    if (hi && !far) ctx.fillStyle = tubeGradient(heel, toe, 0.026, col);
    else ctx.fillStyle = col;
    ctx.fill();
    traceMesh(fm.pts, fm.rad);
    ctx.strokeStyle = far ? 'rgba(4,6,14,0.9)' : ink;
    ctx.lineWidth = far ? 0.014 : 0.016;
    ctx.lineJoin = 'round';
    ctx.stroke();

    /* shank of the boot drawn over the ankle so the joint reads seamless */
    const sm = sampleChain([bootTop, [ankle[0], ankle[1] + 0.006]], [[{ t: 0, r: 0.028 }, { t: 0.5, r: 0.021 }, { t: 1, r: 0.019 }]]);
    traceMesh(sm.pts, sm.rad);
    ctx.fillStyle = hi && !far ? tubeGradient(bootTop, ankle, 0.026, col) : col;
    ctx.fill();
    traceMesh(sm.pts, sm.rad);
    strokeInk(far ? 0.014 : 0.016, far ? 'rgba(4,6,14,0.9)' : ink);

    if (hi && !far && sz > 70) {
      // boot-top seam
      ctx.strokeStyle = pal.web;
      ctx.lineWidth = 0.0045;
      ctx.beginPath();
      const nx = -(ankle[1] - bootTop[1]);
      const ny = ankle[0] - bootTop[0];
      const nl = Math.hypot(nx, ny) || 1;
      ctx.moveTo(bootTop[0] + (nx / nl) * 0.026, bootTop[1] + (ny / nl) * 0.026);
      ctx.quadraticCurveTo(bootTop[0] + (ankle[0] - bootTop[0]) * 0.12, bootTop[1] + (ankle[1] - bootTop[1]) * 0.12, bootTop[0] - (nx / nl) * 0.026, bootTop[1] - (ny / nl) * 0.026);
      ctx.stroke();
    }
  }

  function drawHand(hand: Pt, elbow: Pt, far: boolean): void {
    /* mitten with a thumb: palm mass along the wrist direction */
    const wrist = between(elbow, hand, 0.86);
    const a = angOf(elbow, hand);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const col = far ? shade(pal.red, 0.55) : pal.red;
    const palmC: Pt = [hand[0] + ca * 0.018, hand[1] + sa * 0.018];
    ctx.save();
    ctx.translate(palmC[0], palmC[1]);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0.006, 0, 0.036, 0.0165, 0, 0, TAU);
    if (hi && !far) {
      const g = ctx.createLinearGradient(0, -0.017, 0, 0.017);
      g.addColorStop(0, tint(col, 0.24));
      g.addColorStop(0.55, col);
      g.addColorStop(1, shade(col, 0.62));
      ctx.fillStyle = g;
    } else ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = far ? 'rgba(4,6,14,0.9)' : ink;
    ctx.lineWidth = far ? 0.013 : 0.015;
    ctx.stroke();
    /* thumb on the inner (body) side */
    ctx.beginPath();
    ctx.ellipse(-0.004, -0.014, 0.016, 0.0085, -0.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    /* finger seam */
    if (hi && !far && sz > 70) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.0038;
      ctx.beginPath();
      ctx.moveTo(0.02, -0.012);
      ctx.quadraticCurveTo(0.03, 0, 0.02, 0.012);
      ctx.stroke();
    }
    ctx.restore();
    // wrist cuff
    if (hi && !far && sz > 62) {
      ctx.strokeStyle = pal.web;
      ctx.lineWidth = 0.0045;
      ctx.beginPath();
      const nx = -sa;
      const ny = ca;
      ctx.moveTo(wrist[0] + nx * 0.014, wrist[1] + ny * 0.014);
      ctx.lineTo(wrist[0] - nx * 0.014, wrist[1] - ny * 0.014);
      ctx.stroke();
    }
  }
}
