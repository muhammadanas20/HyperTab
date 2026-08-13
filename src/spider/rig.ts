/**
 * The Webhead rig — a fully procedural, original stylised spider-hero.
 *
 * Nothing is a sprite: the character is described as a handful of
 * target points (hands / feet / pelvis / chest / head) in a unit
 * space (character ≈ 1 unit tall, facing +x, y points *down*), limbs
 * are solved with analytic two-bone IK, and the body is drawn with
 * capsules + expressive mask lenses. That makes every pose blendable
 * and every motion smooth at any size.
 */
import { clamp, lerp, TAU } from '../utils/helpers';

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

export const POSES: Record<PoseName, Pose> = {
  stand: {
    pelvis: [0, 0.52], chest: [0.02, 0.30], head: [0.06, 0.16],
    handL: [-0.15, 0.56], handR: [0.17, 0.57],
    footL: [-0.07, 0.985], footR: [0.11, 0.99],
    kneeBend: 1, elbowBend: -1,
  },
  crouch: {
    pelvis: [0, 0.66], chest: [0.08, 0.48], head: [0.13, 0.36],
    handL: [-0.12, 0.62], handR: [0.24, 0.88],          // one fist to the floor
    footL: [-0.16, 0.985], footR: [0.17, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 1,
  },
  sit: {
    pelvis: [0, 0.78], chest: [0.0, 0.56], head: [0.04, 0.43],
    handL: [-0.1, 0.82], handR: [0.13, 0.83],
    footL: [0.19, 0.965], footR: [0.12, 0.99],          // legs dangle / cross
    kneeBend: 1, elbowBend: -1,
  },
  hang: {   // rendered with a π body-rotation → hangs upside down
    pelvis: [0, 0.42], chest: [-0.02, 0.24], head: [-0.03, 0.11],
    handL: [-0.13, 0.42], handR: [0.12, 0.44],
    footL: [-0.04, 0.03], footR: [0.05, 0.035],          // legs hooked over the web
    kneeBend: 1, elbowBend: -1,
  },
  swing: {  // body arched, both arms up gripping the web
    pelvis: [0, 0.5], chest: [-0.07, 0.31], head: [-0.06, 0.17],
    handL: [0.02, 0.03], handR: [0.16, 0.015],
    footL: [-0.26, 0.72], footR: [-0.1, 0.86],
    kneeBend: -1, elbowBend: 1,
  },
  crawl: {  // spread wall-crawl silhouette (used with ±π/2 rotation)
    pelvis: [0, 0.5], chest: [0.02, 0.3], head: [0.05, 0.17],
    handL: [-0.22, 0.3], handR: [0.26, 0.34],
    footL: [-0.2, 0.86], footR: [0.2, 0.9],
    kneeBend: -1, elbowBend: 1, tension: 0.6,
  },
  sleep: {  // curled up on the floor
    pelvis: [0, 0.8], chest: [0.1, 0.72], head: [0.17, 0.66],
    handL: [0.16, 0.86], handR: [0.04, 0.9],
    footL: [-0.1, 0.99], footR: [0.06, 0.995],
    kneeBend: 1, elbowBend: -1,
  },
  hammock: { // relaxed, hands behind head — drawn while rotated to lie flat
    pelvis: [0, 0.55], chest: [0.0, 0.3], head: [0.02, 0.16],
    handL: [0.1, 0.12], handR: [0.2, 0.1],
    footL: [-0.16, 0.95], footR: [0.1, 0.99],
    kneeBend: 1, elbowBend: 1,
  },
  watch: {  // checks an imaginary watch
    pelvis: [0, 0.52], chest: [0.02, 0.3], head: [0.08, 0.17],
    handL: [0.16, 0.26], handR: [0.17, 0.57],           // left wrist raised to face
    footL: [-0.07, 0.985], footR: [0.11, 0.99],
    kneeBend: 1, elbowBend: 1,
  },
  wave: {
    pelvis: [0, 0.52], chest: [0.02, 0.3], head: [0.06, 0.16],
    handL: [-0.15, 0.56], handR: [0.3, 0.12],           // right arm up
    footL: [-0.07, 0.985], footR: [0.11, 0.99],
    kneeBend: 1, elbowBend: -1,
  },
  curious: { // leaning in, head tilted towards something interesting
    pelvis: [0, 0.55], chest: [0.08, 0.33], head: [0.14, 0.21],
    handL: [-0.13, 0.58], handR: [0.16, 0.3],           // hand up at chin
    footL: [-0.08, 0.985], footR: [0.12, 0.99],
    kneeBend: 1, elbowBend: 1,
  },
  airborne: { // free fall / jump — limbs spread
    pelvis: [0, 0.5], chest: [0, 0.29], head: [0.04, 0.15],
    handL: [-0.24, 0.2], handR: [0.26, 0.18],
    footL: [-0.13, 0.8], footR: [0.13, 0.85],
    kneeBend: 1, elbowBend: -1,
  },
  land: {   // three-point landing
    pelvis: [0, 0.7], chest: [0.09, 0.52], head: [0.13, 0.4],
    handL: [-0.14, 0.66], handR: [0.22, 0.94],
    footL: [-0.18, 0.985], footR: [0.18, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 1,
  },
  dodge: {
    pelvis: [0, 0.56], chest: [-0.06, 0.34], head: [-0.1, 0.2],
    handL: [-0.28, 0.4], handR: [0.2, 0.5],
    footL: [-0.14, 0.985], footR: [0.14, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 0.8,
  },
  point: {  // double-click response: arm out, "thwip"
    pelvis: [0, 0.52], chest: [0.02, 0.3], head: [0.06, 0.16],
    handL: [-0.15, 0.56], handR: [0.34, 0.3],
    footL: [-0.07, 0.985], footR: [0.11, 0.99],
    kneeBend: 1, elbowBend: -1, tension: 0.4,
  },
};

/* ------------------------------------------------------------------ */
/* Two-bone IK                                                        */
/* ------------------------------------------------------------------ */

const UPPER_ARM = 0.17;
const FOREARM = 0.17;
const THIGH = 0.21;
const SHIN = 0.22;

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
  walkPhase: number;     // >-1 while walking: procedural leg/arm cycle
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
/* The draw routine                                                   */
/* ------------------------------------------------------------------ */

export function drawSpider(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const sz = s.size;
  const pal = s.palette;
  const pose = s.pose;
  const ink = shade(pal.blue, 0.24);

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

  /* ---- breathing + walk-cycle target offsets (procedural life) ---- */
  const breathe = Math.sin(s.breathe * TAU * 0.28) * 0.008;
  let chestOff = breathe;
  let bodyBob = 0;
  let feet: { L: [number, number]; R: [number, number] } = { L: pose.footL, R: pose.footR };
  let hands: { L: [number, number]; R: [number, number] } = { L: pose.handL, R: pose.handR };

  if (s.walkPhase >= 0) {
    const ph = s.walkPhase;
    const stride = 0.155;
    const lift = 0.075;
    const stepY = (p: number): number => Math.max(0, Math.sin(p)) * lift;
    feet = {
      L: [-0.035 + Math.sin(ph) * stride, 0.99 - stepY(ph)],
      R: [-0.035 + Math.sin(ph + Math.PI) * stride, 0.99 - stepY(ph + Math.PI)],
    };
    hands = {
      L: [-0.14 + Math.sin(ph + Math.PI) * 0.105, 0.56],
      R: [0.15 + Math.sin(ph) * 0.105, 0.56],
    };
    bodyBob = -Math.abs(Math.sin(ph)) * 0.012;
    chestOff += Math.abs(Math.sin(ph * 2)) * 0.008;
  }

  const pelvis: [number, number] = [pose.pelvis[0], pose.pelvis[1] + bodyBob];
  const chest: [number, number] = [pose.chest[0], pose.chest[1] - chestOff + bodyBob * 0.72];
  const head: [number, number] = [
    pose.head[0] + Math.sin(s.headTilt) * 0.025,
    pose.head[1] - chestOff * 1.25 + bodyBob * 0.48,
  ];

  /* ---- solve limbs with mirrored bends for a readable silhouette ---- */
  const shoulder: [number, number] = [chest[0] + 0.006, chest[1] + 0.036];
  const shoulderL: [number, number] = [shoulder[0] - 0.075, shoulder[1]];
  const shoulderR: [number, number] = [shoulder[0] + 0.075, shoulder[1]];
  const hipL: [number, number] = [pelvis[0] - 0.052, pelvis[1] + 0.012];
  const hipR: [number, number] = [pelvis[0] + 0.052, pelvis[1] + 0.012];
  const elbowL = twoBone(shoulderL[0], shoulderL[1], hands.L[0], hands.L[1], UPPER_ARM, FOREARM, -pose.elbowBend);
  const elbowR = twoBone(shoulderR[0], shoulderR[1], hands.R[0], hands.R[1], UPPER_ARM, FOREARM, pose.elbowBend);
  const kneeL = twoBone(hipL[0], hipL[1], feet.L[0], feet.L[1], THIGH, SHIN, pose.kneeBend);
  const kneeR = twoBone(hipR[0], hipR[1], feet.R[0], feet.R[1], THIGH, SHIN, -pose.kneeBend);

  type Point = [number, number];
  const strokePath = (points: Point[], color: string, width: number, shadow = false): void => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = shadow ? 'rgba(4,6,14,0.92)' : ink;
    ctx.lineWidth = width + 0.028;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    if (!shadow && s.quality > 0.5) {
      ctx.globalAlpha = s.alpha * 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.007, width * 0.12);
      ctx.stroke();
      ctx.globalAlpha = s.alpha;
    }
  };

  const segment = (a: Point, b: Point, color: string, width: number, shadow = false): void =>
    strokePath([a, b], color, width, shadow);

  const between = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  const terminal = (
    p: Point, rx: number, ry: number, color: string, angle: number, shadow = false,
  ): void => {
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(angle);
    ctx.fillStyle = shadow ? shade(color, 0.58) : color;
    ctx.strokeStyle = shadow ? 'rgba(4,6,14,0.92)' : ink;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.ellipse(rx * 0.15, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (!shadow && s.quality > 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.006;
      ctx.beginPath();
      ctx.arc(rx * 0.05, -ry * 0.05, Math.max(rx, ry) * 0.62, Math.PI * 1.08, Math.PI * 1.66);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawLeg = (hip: Point, knee: Point, foot: Point, shadow: boolean): void => {
    const blue = shadow ? shade(pal.blue, 0.56) : pal.blue;
    const red = shadow ? shade(pal.red, 0.58) : pal.red;
    strokePath([hip, knee, foot], blue, 0.073, shadow);
    const bootTop = between(knee, foot, 0.5);
    segment(bootTop, foot, red, 0.068, shadow);
    // A horizontal, tapered boot reads much better than the old circular dot.
    const footAngle = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) * 0.12 - 0.08;
    terminal(foot, 0.052, 0.026, red, footAngle, shadow);
    if (s.quality > 0.5 && sz > 74) {
      ctx.save();
      ctx.strokeStyle = pal.web;
      ctx.lineWidth = 0.006;
      ctx.beginPath();
      ctx.moveTo(lerp(bootTop[0], foot[0], 0.28) - 0.027, lerp(bootTop[1], foot[1], 0.28));
      ctx.lineTo(lerp(bootTop[0], foot[0], 0.28) + 0.027, lerp(bootTop[1], foot[1], 0.28));
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawArm = (top: Point, elbow: Point, hand: Point, shadow: boolean): void => {
    const red = shadow ? shade(pal.red, 0.55) : pal.red;
    strokePath([top, elbow, hand], red, 0.055, shadow);
    const cuff = between(elbow, hand, 0.62);
    segment(cuff, hand, red, 0.061, shadow);
    const angle = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
    terminal(hand, 0.039, 0.032, red, angle, shadow);
  };

  /* far limbs establish depth */
  drawLeg(hipL, kneeL, feet.L, true);
  drawArm(shoulderL, elbowL, hands.L, true);

  /* ---- athletic torso: broad shoulders, narrow waist, blue side panels ---- */
  const torsoDx = pelvis[0] - chest[0];
  const torsoDy = pelvis[1] - chest[1];
  const torsoLen = Math.max(0.14, Math.hypot(torsoDx, torsoDy));
  const torsoAngle = Math.atan2(torsoDy, torsoDx) - Math.PI / 2;
  ctx.save();
  ctx.translate(chest[0], chest[1]);
  ctx.rotate(torsoAngle);

  const torsoPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(-0.047, -0.052);
    ctx.bezierCurveTo(-0.086, -0.052, -0.143, -0.016, -0.148, 0.042);
    ctx.bezierCurveTo(-0.145, 0.1, -0.108, torsoLen * 0.62, -0.097, torsoLen - 0.008);
    ctx.bezierCurveTo(-0.066, torsoLen + 0.032, 0.066, torsoLen + 0.032, 0.097, torsoLen - 0.008);
    ctx.bezierCurveTo(0.108, torsoLen * 0.62, 0.145, 0.1, 0.148, 0.042);
    ctx.bezierCurveTo(0.143, -0.016, 0.086, -0.052, 0.047, -0.052);
    ctx.quadraticCurveTo(0, -0.026, -0.047, -0.052);
    ctx.closePath();
  };

  torsoPath();
  ctx.fillStyle = pal.red;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.022;
  ctx.stroke();

  // Classic tapered red centre with deep-blue flank panels.
  ctx.fillStyle = pal.blue;
  ctx.beginPath();
  ctx.moveTo(-0.147, 0.035);
  ctx.bezierCurveTo(-0.121, 0.074, -0.086, torsoLen * 0.36, -0.055, torsoLen * 0.62);
  ctx.lineTo(-0.038, torsoLen + 0.018);
  ctx.lineTo(-0.099, torsoLen - 0.004);
  ctx.bezierCurveTo(-0.11, torsoLen * 0.6, -0.145, 0.098, -0.147, 0.035);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.147, 0.035);
  ctx.bezierCurveTo(0.121, 0.074, 0.086, torsoLen * 0.36, 0.055, torsoLen * 0.62);
  ctx.lineTo(0.038, torsoLen + 0.018);
  ctx.lineTo(0.099, torsoLen - 0.004);
  ctx.bezierCurveTo(0.11, torsoLen * 0.6, 0.145, 0.098, 0.147, 0.035);
  ctx.closePath();
  ctx.fill();

  if (s.quality > 0.5) {
    // Contour-following suit webbing, restrained so it survives at icon size.
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.006;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.036);
    ctx.lineTo(0, torsoLen * 0.72);
    ctx.moveTo(-0.036, -0.032);
    ctx.quadraticCurveTo(-0.076, 0.005, -0.106, 0.055);
    ctx.moveTo(0.036, -0.032);
    ctx.quadraticCurveTo(0.076, 0.005, 0.106, 0.055);
    ctx.moveTo(-0.098, 0.058);
    ctx.quadraticCurveTo(0, 0.09, 0.098, 0.058);
    ctx.moveTo(-0.076, Math.min(torsoLen * 0.52, 0.125));
    ctx.quadraticCurveTo(0, Math.min(torsoLen * 0.65, 0.15), 0.076, Math.min(torsoLen * 0.52, 0.125));
    ctx.stroke();
  }

  /* chest emblem — crisp, legible geometric spider */
  if (sz > 58) {
    const ey = Math.min(torsoLen * 0.47, 0.105);
    ctx.save();
    ctx.translate(0, ey);
    ctx.strokeStyle = pal.trim;
    ctx.fillStyle = pal.trim;
    ctx.lineWidth = 0.008;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, -0.008, 0.012, 0.018, 0, 0, TAU);
    ctx.ellipse(0, 0.018, 0.016, 0.025, 0, 0, TAU);
    ctx.fill();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const y = -0.018 + i * 0.014;
        const reach = 0.04 + (i === 1 || i === 2 ? 0.012 : 0);
        ctx.beginPath();
        ctx.moveTo(side * 0.01, y);
        ctx.lineTo(side * 0.027, y + (i < 2 ? -0.012 : 0.01));
        ctx.lineTo(side * reach, y + (i < 2 ? -0.002 : 0.022));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // A soft edge-light separates the little figure from dark wallpapers.
  if (s.quality > 0.5) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 0.007;
    ctx.beginPath();
    ctx.moveTo(-0.118, 0.005);
    ctx.quadraticCurveTo(-0.143, 0.06, -0.1, torsoLen * 0.76);
    ctx.stroke();
  }
  ctx.restore(); // torso

  /* neck, then near limbs */
  const neckEnd: Point = between(chest, head, 0.57);
  segment([chest[0], chest[1] - 0.018], neckEnd, pal.red, 0.073);
  drawLeg(hipR, kneeR, feet.R, false);
  drawArm(shoulderR, elbowR, hands.R, false);

  /* ---- mask: tapered heroic profile, radial webbing, almond lenses ---- */
  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(s.headTilt);

  const headPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, -0.108);
    ctx.bezierCurveTo(0.064, -0.106, 0.094, -0.065, 0.092, -0.008);
    ctx.bezierCurveTo(0.091, 0.055, 0.052, 0.099, 0, 0.112);
    ctx.bezierCurveTo(-0.052, 0.099, -0.091, 0.055, -0.092, -0.008);
    ctx.bezierCurveTo(-0.094, -0.065, -0.064, -0.106, 0, -0.108);
    ctx.closePath();
  };

  headPath();
  ctx.fillStyle = pal.red;
  ctx.fill();

  // Dim the far temple and brighten the brow for molded, modern depth.
  ctx.save();
  headPath();
  ctx.clip();
  const maskShade = ctx.createLinearGradient(-0.1, -0.1, 0.11, 0.1);
  maskShade.addColorStop(0, 'rgba(255,255,255,0.16)');
  maskShade.addColorStop(0.48, 'rgba(255,255,255,0)');
  maskShade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = maskShade;
  ctx.fillRect(-0.11, -0.12, 0.22, 0.25);

  if (sz > 48 && s.quality > 0.5) {
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.006;
    ctx.lineCap = 'round';
    const rays: Point[] = [
      [0, -0.112], [0.059, -0.092], [0.093, -0.03], [0.08, 0.07],
      [0.035, 0.108], [-0.035, 0.108], [-0.08, 0.07], [-0.093, -0.03], [-0.059, -0.092],
    ];
    for (const p of rays) {
      ctx.beginPath();
      ctx.moveTo(0, 0.006);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    for (const [rx, ry] of [[0.035, 0.04], [0.064, 0.073], [0.093, 0.105]] as Array<[number, number]>) {
      ctx.beginPath();
      ctx.ellipse(0, 0.006, rx, ry, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  headPath();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.02;
  ctx.stroke();

  /* expressive almond lenses — fixed to the mask, subtly morphed to look */
  let eyeHeight = Math.max(0.07, 1 - s.blink);
  let eyeWidth = 1;
  let lidShift = 0;
  switch (s.expr) {
    case 'happy': eyeHeight *= 0.7; lidShift = -0.005; break;
    case 'suspicious': eyeHeight *= 0.78; lidShift = 0.009; break;
    case 'sleepy': eyeHeight = Math.min(eyeHeight, 0.34); lidShift = 0.012; break;
    case 'wow': eyeHeight = Math.min(1.16, eyeHeight * 1.12); eyeWidth = 1.08; break;
    case 'neutral': default: break;
  }
  const lookNudgeX = clamp(s.lookX, -1, 1) * 0.0035;
  const lookNudgeY = clamp(s.lookY, -1, 1) * 0.0025;

  for (const side of [-1, 1]) {
    const innerX = side * (0.014 * eyeWidth) + lookNudgeX;
    const outerX = side * (0.078 * eyeWidth) + lookNudgeX;
    const topY = (-0.042 + lidShift + lookNudgeY) * eyeHeight;
    const bottomY = (0.043 + lidShift + lookNudgeY) * eyeHeight;
    ctx.beginPath();
    // Pointed inner brow + fuller outer cheek: the unmistakable swept almond
    // profile reads cleanly even when the whole character is only ~80px tall.
    ctx.moveTo(innerX, topY);
    ctx.bezierCurveTo(
      side * 0.036 * eyeWidth + lookNudgeX, topY * 1.28,
      side * 0.068 * eyeWidth + lookNudgeX, topY * 1.12,
      outerX, topY * 0.3,
    );
    ctx.bezierCurveTo(
      side * 0.078 * eyeWidth + lookNudgeX, bottomY * 0.42,
      side * 0.049 * eyeWidth + lookNudgeX, bottomY * 1.08,
      innerX, bottomY * 0.76,
    );
    ctx.closePath();
    ctx.fillStyle = pal.lens;
    ctx.fill();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 0.012;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (s.quality > 0.5 && eyeHeight > 0.25) {
      ctx.strokeStyle = 'rgba(255,255,255,0.52)';
      ctx.lineWidth = 0.004;
      ctx.beginPath();
      ctx.moveTo(innerX + side * 0.006, topY * 0.75);
      ctx.quadraticCurveTo(side * 0.047, topY * 1.08, outerX - side * 0.01, topY * 0.56);
      ctx.stroke();
    }
  }
  ctx.restore(); // head
  ctx.restore(); // body
}

/** Cheap colour shade: multiply rgb by k (for far-side parts). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
