import assert from "node:assert/strict";
import {
  compose,
  translate,
  rotate,
  scale,
  transform,
  inverse,
  multiply,
  IDENTITY,
} from "../src/spider/matrix";
import { solveIK, solveSkeleton, BONES } from "../src/spider/skeleton";
import {
  POSES,
  blendPose,
  PALETTES,
  type RenderState,
} from "../src/spider/rig";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  referencePreset,
} from "../src/settings/schema";
const near = (a: number, b: number, eps = 1e-8) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const length = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const M = compose(translate(25, -60), rotate(1.3), scale(-120, 95));
const P: [number, number] = [0.2, -0.8];
transform(inverse(M), transform(M, P)).forEach((v, i) => near(v, P[i]));
multiply(M, inverse(M)).forEach((v, i) => near(v, IDENTITY[i]));
assert.throws(() => inverse(scale(0, 1)), RangeError);
assert.deepEqual(
  transform(multiply(translate(10, 20), scale(2)), [3, 4]),
  [16, 28],
);
// Coincident, unreachable, normal and in-depth bend poles all preserve 3D lengths.
for (const target of [
  [0, 0],
  [0.1, 0.12],
  [10, -5],
  [-0.001, 0],
  [0, 0.3],
] as [number, number][]) {
  for (const bend of [-1, -0.5, 0, 0.5, 1]) {
    const c = solveIK([0, 0], target, 0.18, 0.16, bend);
    near(Math.hypot(length(c.root, c.joint), c.depth), 0.18);
    near(Math.hypot(length(c.joint, c.end), c.depth), 0.16);
    assert.ok(length(c.root, c.end) <= 0.34);
  }
}
const state = (pose = POSES.stand): RenderState => ({
  x: 600,
  y: 300,
  rotation: 0,
  facing: 1,
  size: 144,
  alpha: 1,
  squash: 1,
  pose,
  headTilt: 0.1,
  lookX: 0.5,
  lookY: 0,
  blink: 0,
  expr: "neutral",
  palette: PALETTES.classic,
  walkPhase: -1,
  breathe: 0,
  hidden: "none",
  quality: 1,
});
let count = 0;
for (const a of Object.values(POSES))
  for (const b of Object.values(POSES)) {
    let p = a;
    for (let i = 0; i < 24; i++) {
      p = blendPose(p, b, 1 - Math.exp(-9 / 60));
      const k = solveSkeleton({
        ...state(p),
        rotation: (i / 12) * Math.PI,
        facing: i % 2 ? 1 : -1,
        squash: 0.74,
      });
      for (const [chain, upper, lower] of [
        [k.armL, BONES.upperArm, BONES.forearm],
        [k.armR, BONES.upperArm, BONES.forearm],
        [k.legL, BONES.thigh, BONES.shin],
        [k.legR, BONES.thigh, BONES.shin],
      ] as const) {
        near(Math.hypot(length(chain.root, chain.joint), chain.depth), upper);
        near(Math.hypot(length(chain.joint, chain.end), chain.depth), lower);
      }
      near(length(k.chest, k.pelvis), BONES.spine);
      near(length(k.head, k.chest), BONES.neckHead);
      assert.ok(k.webHand.every(Number.isFinite));
      count++;
    }
    near(p.elbowBend, b.elbowBend, 0.06);
  }
// Finger channels and bend poles reach targets with repeated small blends.
let blended = POSES.stand;
for (let i = 0; i < 180; i++) blended = blendPose(blended, POSES.point, 0.1);
blended.curlR!.forEach((v, i) => near(v, POSES.point.curlR![i], 1e-6));
near(blended.elbowBend, POSES.point.elbowBend, 1e-6);
for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
  const k = solveSkeleton({ ...state(), walkPhase: phase, run: 1 });
  assert.ok(k.legR.end.every(Number.isFinite));
}
assert.equal(DEFAULT_SETTINGS.wallpaper, "particles");
assert.equal(DEFAULT_SETTINGS.spiderEnabled, true);
assert.equal(DEFAULT_SETTINGS.rain, false);
assert.equal(DEFAULT_SETTINGS.importBookmarks, false);
assert.equal(DEFAULT_SETTINGS.sortByUsage, false);
assert.equal(DEFAULT_SETTINGS.shortcuts.length, 11);
assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
const saved = normalizeSettings({
  wallpaper: "forest",
  spiderEnabled: false,
  shortcuts: [],
  userName: "Anas",
});
assert.equal(saved.wallpaper, "forest");
assert.equal(saved.spiderEnabled, false);
assert.deepEqual(saved.shortcuts, []);
const applied = normalizeSettings({ ...saved, ...referencePreset() });
assert.equal(applied.wallpaper, "particles");
assert.equal(applied.userName, "Anas");
assert.equal(applied.spiderEnabled, false);
assert.notEqual(referencePreset().shortcuts, DEFAULT_SETTINGS.shortcuts);
console.log(
  `✓ Matrices, IK limits, ${count} pose-transition frames, fingers, gait, and defaults`,
);
