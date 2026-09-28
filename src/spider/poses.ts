/** Pose targets in stature units. The spine/head are FK; contacts use IK.
 * Hand curls are thumb → little finger. Every channel is blendable.
 */
import { clamp, lerp } from "../utils/helpers";
import type { Pt } from "./anatomy";
export type Fingers = [number, number, number, number, number];
export interface Pose {
  pelvis: Pt;
  chest: Pt;
  head: Pt;
  handL: Pt;
  handR: Pt;
  footL: Pt;
  footR: Pt;
  kneeBend: number;
  elbowBend: number;
  tension?: number;
  curlL?: Fingers;
  curlR?: Fingers;
  spreadL?: number;
  spreadR?: number;
  wristL?: number;
  wristR?: number;
}
export type PoseName =
  | "stand"
  | "crouch"
  | "sit"
  | "hang"
  | "swing"
  | "crawl"
  | "sleep"
  | "hammock"
  | "watch"
  | "wave"
  | "curious"
  | "airborne"
  | "land"
  | "dodge"
  | "point"
  | "salute";
export const HANDS: Record<
  "relaxed" | "fist" | "open" | "grip" | "thwip",
  Fingers
> = {
  relaxed: [0.45, 0.4, 0.5, 0.55, 0.6],
  fist: [0.95, 1, 1, 1, 1],
  open: [0.05, 0, 0.05, 0.08, 0.12],
  grip: [0.65, 0.75, 0.8, 0.85, 0.85],
  thwip: [0.15, 0, 1, 1, 0.05],
};
const base: Pose = {
  pelvis: [0, 0.51],
  chest: [0.008, 0.228],
  head: [0.02, 0.08],
  handL: [-0.155, 0.55],
  handR: [0.18, 0.54],
  footL: [-0.095, 0.995],
  footR: [0.12, 0.995],
  kneeBend: 1,
  elbowBend: -1,
  curlL: HANDS.relaxed,
  curlR: HANDS.relaxed,
};
const pose = (p: Partial<Pose>): Pose => ({ ...base, ...p });
export const POSES: Record<PoseName, Pose> = {
  stand: pose({}),
  crouch: pose({
    pelvis: [-0.025, 0.69],
    chest: [0.13, 0.456],
    head: [0.17, 0.32],
    handL: [-0.21, 0.57],
    handR: [0.24, 0.935],
    footL: [-0.22, 0.99],
    footR: [0.21, 0.99],
    tension: 1,
    curlL: HANDS.fist,
    curlR: HANDS.open,
    spreadR: 0.8,
  }),
  land: pose({
    pelvis: [-0.04, 0.72],
    chest: [0.14, 0.505],
    head: [0.2, 0.37],
    handL: [-0.26, 0.52],
    handR: [0.26, 0.935],
    footL: [-0.25, 0.99],
    footR: [0.19, 0.99],
    tension: 1,
    curlL: HANDS.fist,
    curlR: HANDS.open,
    spreadR: 1,
  }),
  sit: pose({
    pelvis: [-0.06, 0.8],
    chest: [-0.04, 0.52],
    head: [-0.02, 0.37],
    handL: [-0.17, 0.82],
    handR: [0.22, 0.72],
    footL: [0.12, 0.98],
    footR: [0.34, 0.96],
  }),
  // Whole-body rotation inverts an upright skeleton: ankles ABOVE head in world space.
  hang: pose({
    pelvis: [0, 0.51],
    chest: [-0.01, 0.228],
    head: [-0.01, 0.08],
    handL: [-0.16, 0.43],
    handR: [0.15, 0.41],
    footL: [-0.022, 0.965],
    footR: [0.022, 0.965],
    kneeBend: -1,
    curlL: HANDS.grip,
    curlR: HANDS.grip,
  }),
  swing: pose({
    pelvis: [0.035, 0.5],
    chest: [-0.045, 0.23],
    head: [-0.05, 0.085],
    handL: [0.06, -0.005],
    handR: [0.08, -0.065],
    footL: [-0.27, 0.73],
    footR: [-0.04, 0.91],
    kneeBend: -1,
    elbowBend: 1,
    curlL: HANDS.grip,
    curlR: HANDS.grip,
    wristL: -0.35,
    wristR: 0.1,
  }),
  crawl: pose({
    pelvis: [0, 0.54],
    chest: [0.03, 0.26],
    head: [0.04, 0.11],
    handL: [-0.31, 0.13],
    handR: [0.34, 0.4],
    footL: [-0.3, 0.78],
    footR: [0.31, 0.85],
    kneeBend: -1,
    elbowBend: 1,
    tension: 0.7,
    curlL: HANDS.open,
    curlR: HANDS.open,
    spreadL: 1,
    spreadR: 1,
  }),
  sleep: pose({
    pelvis: [-0.13, 0.83],
    chest: [0.1, 0.67],
    head: [0.2, 0.6],
    handL: [0.24, 0.75],
    handR: [0.22, 0.7],
    footL: [-0.11, 0.99],
    footR: [0.09, 0.98],
  }),
  hammock: pose({
    pelvis: [0, 0.51],
    chest: [0, 0.228],
    head: [0.01, 0.08],
    handL: [-0.055, 0.055],
    handR: [0.08, 0.06],
    footL: [-0.15, 0.94],
    footR: [0.13, 0.96],
    elbowBend: 1,
  }),
  watch: pose({
    head: [0.065, 0.085],
    handL: [0.1, 0.37],
    handR: [0.14, 0.38],
    elbowBend: 1,
    curlL: HANDS.fist,
    curlR: HANDS.thwip,
  }),
  wave: pose({
    handR: [0.3, 0.055],
    elbowBend: 1,
    curlR: HANDS.open,
    spreadR: 1,
    wristR: -0.25,
  }),
  curious: pose({
    pelvis: [-0.015, 0.52],
    chest: [0.05, 0.246],
    head: [0.12, 0.115],
    handR: [0.1, 0.21],
    elbowBend: 1,
    curlR: HANDS.grip,
  }),
  airborne: pose({
    pelvis: [0, 0.5],
    chest: [0.03, 0.22],
    head: [0.04, 0.075],
    handL: [-0.3, 0.22],
    handR: [0.34, 0.15],
    footL: [-0.25, 0.77],
    footR: [0.23, 0.84],
    curlL: HANDS.open,
    curlR: HANDS.thwip,
    spreadL: 0.7,
  }),
  dodge: pose({
    pelvis: [0, 0.59],
    chest: [-0.12, 0.335],
    head: [-0.14, 0.19],
    handL: [-0.32, 0.39],
    handR: [0.29, 0.44],
    footL: [-0.18, 0.99],
    footR: [0.19, 0.99],
    tension: 0.8,
    curlL: HANDS.open,
    curlR: HANDS.open,
  }),
  point: pose({
    chest: [0.035, 0.23],
    head: [0.075, 0.09],
    handL: [-0.16, 0.48],
    handR: [0.43, 0.25],
    footL: [-0.13, 0.99],
    footR: [0.17, 0.99],
    curlL: HANDS.fist,
    curlR: HANDS.thwip,
    spreadR: 0.8,
    wristR: -0.12,
    elbowBend: 1,
  }),
  salute: pose({
    handR: [0.08, 0.055],
    elbowBend: 1,
    curlR: HANDS.open,
    wristR: -0.65,
  }),
};
export function blendPose(a: Pose, b: Pose, amount: number): Pose {
  const t = clamp(amount, 0, 1);
  const p = (x: Pt, y: Pt): Pt => [lerp(x[0], y[0], t), lerp(x[1], y[1], t)];
  const fingers = (x = HANDS.relaxed, y = HANDS.relaxed): Fingers =>
    x.map((v, i) => lerp(v, y[i], t)) as Fingers;
  return {
    pelvis: p(a.pelvis, b.pelvis),
    chest: p(a.chest, b.chest),
    head: p(a.head, b.head),
    handL: p(a.handL, b.handL),
    handR: p(a.handR, b.handR),
    footL: p(a.footL, b.footL),
    footR: p(a.footR, b.footR),
    // Continuous poles pass through extension, rather than snapping branches
    // or permanently keeping the old sign during exponential interpolation.
    kneeBend: lerp(a.kneeBend, b.kneeBend, t),
    elbowBend: lerp(a.elbowBend, b.elbowBend, t),
    tension: lerp(a.tension ?? 0, b.tension ?? 0, t),
    curlL: fingers(a.curlL, b.curlL),
    curlR: fingers(a.curlR, b.curlR),
    spreadL: lerp(a.spreadL ?? 0.2, b.spreadL ?? 0.2, t),
    spreadR: lerp(a.spreadR ?? 0.2, b.spreadR ?? 0.2, t),
    wristL: lerp(a.wristL ?? 0, b.wristL ?? 0, t),
    wristR: lerp(a.wristR ?? 0, b.wristR ?? 0, t),
  };
}
