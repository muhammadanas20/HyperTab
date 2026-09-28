/** Kinematics shared by drawing, web attachment and hit/aim calculations.
 * Transform hierarchy: screen × body × spine × shoulder; wrist × fingers.
 * A bend pole rotates through depth when changing sides, so projected bones
 * can foreshorten but can never stretch. No pose owns a different bone length.
 */
import { between, gaitFrame, type Pt } from "./anatomy";
import { clamp } from "../utils/helpers";
import {
  compose,
  translate,
  rotate,
  scale,
  transform,
  type Mat3,
} from "./matrix";
import type { RenderState } from "./rig";
export const BONES = {
  upperArm: 0.184,
  forearm: 0.165,
  thigh: 0.24,
  shin: 0.206,
  spine: 0.282,
  neckHead: 0.137,
} as const;
export interface Chain {
  root: Pt;
  joint: Pt;
  end: Pt;
  depth: number;
}
export function solveIK(
  root: Pt,
  target: Pt,
  l1: number,
  l2: number,
  pole: number,
): Chain {
  const dx = target[0] - root[0],
    dy = target[1] - root[1];
  const r = Math.hypot(dx, dy);
  const ux = r > 1e-8 ? dx / r : 0,
    uy = r > 1e-8 ? dy / r : 1;
  const d = clamp(r, Math.abs(l1 - l2) + 1e-6, l1 + l2 - 1e-6);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const phi = ((1 - clamp(pole, -1, 1)) * Math.PI) / 2;
  const side = h * Math.cos(phi);
  return {
    root,
    joint: [root[0] + ux * a - uy * side, root[1] + uy * a + ux * side],
    end: [root[0] + ux * d, root[1] + uy * d],
    depth: h * Math.sin(phi),
  };
}
/** Local +y follows a bone. */
export const boneFrame = (a: Pt, b: Pt): Mat3 =>
  compose(
    translate(...a),
    rotate(Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2),
  );
export function bodyMatrix(
  s: Pick<RenderState, "x" | "y" | "rotation" | "facing" | "size" | "squash">,
): Mat3 {
  const q = clamp(s.squash, 0.65, 1.25);
  return compose(
    translate(s.x, s.y),
    rotate(s.rotation),
    scale(s.facing * s.size * (1 + (1 - q) * 0.3), s.size * q),
  );
}
export function solveSkeleton(s: RenderState) {
  const p = s.pose;
  const g = s.walkPhase >= 0 ? gaitFrame(s.walkPhase, s.run ?? 0) : null;
  const breath = Math.sin(s.breathe * Math.PI * 0.56) * 0.0025;
  const pelvis: Pt = [p.pelvis[0], p.pelvis[1] + (g?.pelvisOff[1] ?? 0)];
  const desiredChest: Pt = [
    p.chest[0] + (g ? Math.sin(g.lean) * 0.12 : 0),
    p.chest[1] - breath,
  ];
  const spineAngle =
    Math.atan2(pelvis[1] - desiredChest[1], pelvis[0] - desiredChest[0]) -
    Math.PI / 2;
  const spine = compose(translate(...pelvis), rotate(spineAngle));
  const chest = transform(spine, [0, -BONES.spine]);
  const torso = compose(spine, translate(0, -BONES.spine));
  const desiredHead: Pt = [
    p.head[0] + (g ? Math.sin(g.lean) * 0.08 : 0),
    p.head[1],
  ];
  const hd = Math.atan2(desiredHead[1] - chest[1], desiredHead[0] - chest[0]);
  const head: Pt = [
    chest[0] + Math.cos(hd) * BONES.neckHead,
    chest[1] + Math.sin(hd) * BONES.neckHead,
  ];
  const headFrame = compose(
    translate(...head),
    rotate(s.headTilt + s.lookX * 0.065),
  );
  const armL = solveIK(
    transform(torso, [-0.104, 0.006]),
    g?.handL ?? p.handL,
    BONES.upperArm,
    BONES.forearm,
    -p.elbowBend,
  );
  const armR = solveIK(
    transform(torso, [0.104, 0.006]),
    g?.handR ?? p.handR,
    BONES.upperArm,
    BONES.forearm,
    p.elbowBend,
  );
  const footL = g?.footL ?? p.footL,
    footR = g?.footR ?? p.footR;
  const ankle = (f: Pt): Pt => [f[0], f[1] - 0.037];
  const legL = solveIK(
    transform(spine, [-0.06, 0]),
    ankle(footL),
    BONES.thigh,
    BONES.shin,
    g ? -1 : p.kneeBend,
  );
  const legR = solveIK(
    transform(spine, [0.06, 0]),
    ankle(footR),
    BONES.thigh,
    BONES.shin,
    g ? -1 : -p.kneeBend,
  );
  const world = bodyMatrix(s);
  const wristFrame = (a: Chain, offset: number): Mat3 =>
    compose(
      boneFrame(a.joint, a.end),
      translate(0, Math.hypot(a.end[0] - a.joint[0], a.end[1] - a.joint[1])),
      rotate(offset),
    );
  const wristL = wristFrame(armL, p.wristL ?? 0),
    wristR = wristFrame(armR, p.wristR ?? 0);
  return {
    world,
    torso,
    spine,
    headFrame,
    head,
    chest,
    pelvis,
    armL,
    armR,
    legL,
    legR,
    wristL,
    wristR,
    footAngL: g?.footAngL ?? 0,
    footAngR: g?.footAngR ?? 0,
    webHand: transform(compose(world, wristR), [0, 0.025]),
    webAnkle: transform(world, between(legL.end, legR.end, 0.5)),
  };
}
export type Skeleton = ReturnType<typeof solveSkeleton>;
