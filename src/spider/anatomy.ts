/**
 * Stature-normalized artistic anatomy for the cinematic rig.
 * 7.2-head athletic silhouette, tapered muscle profiles and gait targets.
 * These are art-directed proportions, not a medical anthropometric model.
 * Coordinates: crown = 0, sole = 1, +y down.
 */
import { clamp, lerp, TAU } from '../utils/helpers';

export type Pt = [number, number];

/* ------------------------------------------------------------------ */
/* Proportion canon                                                   */
/* ------------------------------------------------------------------ */

/** A smaller mask and longer torso replace the old 5.4-head caricature. */
export const HEADS = 7.2;
export const HEAD_H = 1 / HEADS;

/** Vertical landmarks, fraction of stature from the crown (y down). */
export const LANDMARK = {
  crown: 0,
  chin: HEAD_H,                       // head unit
  brow: HEAD_H * 0.52,
  c7: HEAD_H + 0.048,                 // base of neck (Winter: neck ≈ 0.818 H from ground)
  acromion: 0.228,           // shoulder joint line ≈ 0.25 H from crown
  nipple: 0.352,                      // canon head-2 line
  navel: 0.452,                       // canon head-3 line / waist
  crotch: 0.528,                      // canon head-4 line = body midpoint
  hip: 0.51,                         // greater trochanter (≈ 0.53 H from ground − shoe)
  knee: 0.75,                        // joint line ≈ 0.285 H from ground
  calf: 0.842,                        // calf belly (widest point of the shank)
  ankle: 0.956,                       // lateral malleolus ≈ 0.04 H from ground
  sole: 1,
  /** arm chain hanging at rest (canon: elbow at navel, wrist at pubis) */
  elbow: 0.412,
  wrist: 0.577,
  fingertip: 0.694,                   // canon head-5 line = mid-thigh
} as const;

/** Half-widths (x), fraction of stature. */
export const WIDTH = {
  head: 0.055,                       // head width ≈ 0.76 × head height
  neck: 0.030,
  acromion: 0.108,                    // biacromial ≈ 0.196 H (joint centres)
  deltoid: 0.126,                     // outer shoulder mass ≈ 0.25 H
  chest: 0.116,
  waist: 0.072,
  trochanter: 0.068,                  // hip joint centres
  hipMass: 0.088,                     // outer glute/hip mass
} as const;

/** Head box (the mask lives in it). */
export const HEAD = {
  cx: 0,
  cy: HEAD_H * 0.5,
  rx: WIDTH.head,
  ry: HEAD_H * 0.5,
} as const;

/* ------------------------------------------------------------------ */
/* Girth profiles — radius (half thickness) at t along each bone      */
/* ------------------------------------------------------------------ */

export interface GirthStop { t: number; r: number }

/** Arm: deltoid cap → biceps belly → elbow → forearm belly → wrist. */
export const ARM_GIRTH: GirthStop[] = [
  { t: 0.0, r: 0.036 },
  { t: 0.2, r: 0.034 },   // deltoid
  { t: 0.42, r: 0.03 },  // biceps belly
  { t: 0.78, r: 0.0225 },
  { t: 1.0, r: 0.0205 },   // elbow
];
export const FOREARM_GIRTH: GirthStop[] = [
  { t: 0.0, r: 0.0215 },
  { t: 0.22, r: 0.0235 },  // flexor mass just below the elbow
  { t: 0.6, r: 0.0175 },
  { t: 1.0, r: 0.0128 },   // wrist
];
/** Leg: glute/quad sweep → knee → calf belly → ankle. */
export const THIGH_GIRTH: GirthStop[] = [
  { t: 0.0, r: 0.047 },
  { t: 0.35, r: 0.045 },  // quadriceps
  { t: 0.7, r: 0.0325 },
  { t: 1.0, r: 0.0262 },   // knee
];
export const SHANK_GIRTH: GirthStop[] = [
  { t: 0.0, r: 0.03 },
  { t: 0.24, r: 0.0302 },  // gastrocnemius belly
  { t: 0.62, r: 0.0205 },
  { t: 1.0, r: 0.0138 },   // ankle
];

export function sampleGirth(stops: GirthStop[], t: number): number {
  const x = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      const u = (x - a.t) / (b.t - a.t || 1);
      // smooth (cosine) interpolation so muscle bellies read as volumes
      return lerp(a.r, b.r, 0.5 - 0.5 * Math.cos(Math.PI * u));
    }
  }
  return stops[stops.length - 1].r;
}

/* ------------------------------------------------------------------ */
/* Gait — procedural locomotion targets from walk/run kinematics      */
/* ------------------------------------------------------------------ */

export interface GaitFrame {
  footL: Pt;
  footR: Pt;
  /** foot pitch, rad, + = plantarflexed (toe down) */
  footAngL: number;
  footAngR: number;
  handL: Pt;
  handR: Pt;
  /** additive offsets applied on top of the pose */
  pelvisOff: Pt;
  chestOff: Pt;
  headOff: Pt;
  /** forward trunk lean, rad */
  lean: number;
  /** 0..1 how much of the cycle is flight (both feet off) */
  flight: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * One foot's cycle. `u` ∈ [0,1): stance 0→0.6 (planted, sweeps backwards
 * under the body), swing 0.6→1 (lifts, advances, reaches for heel strike).
 * Returns position in body space plus the ankle pitch curve.
 */
function footCycle(u: number, stride: number, lift: number, run: number): { p: Pt; ang: number } {
  const s = stride * 0.5;
  if (u < 0.6) {
    /* stance: foot locked to the ground → travels backwards linearly,
       with a heel-roll at contact and a plantarflexing push-off. The sweep
       is biased behind the hip so the leg never exceeds its reach. */
    const k = u / 0.6;
    const x = lerp(s * 0.75, -s * 1.05, k);
    // heel rocker (0–8%) then flat, then heel rise from 40%
    const y = 0.994 - Math.max(0, 0.02 - k * 0.1) * 0.35 - (k > 0.42 ? (k - 0.42) * 0.055 * run + (k - 0.42) * 0.02 : 0);
    let ang: number;
    if (k < 0.1) ang = lerp(-0.22, 0, smooth(k / 0.1));                 // heel strike → foot flat
    else if (k < 0.42) ang = lerp(0, 0.06, (k - 0.1) / 0.32);           // ankle rocker
    else ang = lerp(0.06, 0.34 + 0.2 * run, smooth((k - 0.42) / 0.58)); // push-off
    return { p: [x, y], ang };
  }
  /* swing: toe-off → heel kick (run) → knee-forward reach → heel strike */
  const w = (u - 0.6) / 0.4;
  const back = -s * 1.05;
  const fwd = s * 0.75;
  // asymmetric advance: foot lingers behind early (heel kick), then whips forward
  const x = lerp(back, fwd, smooth(clamp((w - 0.18) / 0.78, 0, 1)));
  const kick = run * 0.055 * Math.sin(Math.PI * clamp(w / 0.55, 0, 1));  // heel kicks up behind
  const clear = lift * Math.sin(Math.PI * clamp(w, 0, 1)) ** 1.25;
  const y = 0.994 - clear - kick;
  let ang: number;
  if (w < 0.3) ang = lerp(0.34 + 0.2 * run, -0.05, smooth(w / 0.3));     // release plantarflexion
  else ang = lerp(-0.05, -0.2, smooth((w - 0.3) / 0.7));                // reach with the heel
  return { p: [x, y], ang };
}

/**
 * Full-body gait frame for a stride phase (radians; one TAU = one stride,
 * i.e. two steps). `run` blends walk → sprint kinematics.
 */
export function gaitFrame(phase: number, run: number): GaitFrame {
  const r = clamp(run, 0, 1);
  const u = ((phase / TAU) % 1 + 1) % 1;

  const stride = lerp(0.3, 0.46, r);
  const lift = lerp(0.052, 0.105, r);

  const L = footCycle(u, stride, lift, r);
  const R = footCycle((u + 0.5) % 1, stride, lift, r);

  /* vertical bounce: CoM peaks at mid-stance of each leg (2× per stride) */
  const bobAmp = lerp(0.0085, 0.016, r);
  const bob = -bobAmp * Math.cos(TAU * 2 * (u - 0.3)) * 0.5 + bobAmp * 0.25;
  /* flight phase for runs: both feet off the ground around u≈0.1 & 0.6 */
  const flight = r > 0.35 ? Math.max(0, Math.sin(TAU * 2 * (u - 0.02))) * r * 0.5 : 0;

  const lean = lerp(0.055, 0.3, r) + flight * 0.05;

  /* trunk: pelvis carries the bounce, chest leans, head stays level
     (vestibular stabilisation — the head bounces ~40% less than the pelvis) */
  const pelvisOff: Pt = [0, bob - flight * 0.02];
  const chestOff: Pt = [Math.sin(lean) * 0.055, -Math.cos(lean) * 0.02 + bob * 0.28];
  const headOff: Pt = [Math.sin(lean) * 0.085, bob * 0.42 - 0.004];

  /* contralateral arm swing; elbow flexes more as the hand trails */
  const swingA = lerp(0.105, 0.17, r);
  const armY = lerp(0.575, 0.505, r);
  const aL = Math.sin(TAU * (u + 0.5));
  const aR = Math.sin(TAU * u);
  const flexL = Math.max(0, -aL) * lerp(0.02, 0.075, r);   // trailing hand curls up
  const flexR = Math.max(0, -aR) * lerp(0.02, 0.075, r);
  const handL: Pt = [-0.02 + aL * swingA, armY - flexL - Math.abs(aL) * 0.012 * r];
  const handR: Pt = [0.05 + aR * swingA, armY - flexR - Math.abs(aR) * 0.012 * r];

  return {
    footL: L.p, footR: R.p, footAngL: L.ang, footAngR: R.ang,
    handL, handR, pelvisOff, chestOff, headOff, lean, flight,
  };
}

/* ------------------------------------------------------------------ */
/* Misc shared math                                                    */
/* ------------------------------------------------------------------ */

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const between = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

/** Angle of the segment a→b. */
export const angOf = (a: Pt, b: Pt): number => Math.atan2(b[1] - a[1], b[0] - a[0]);
