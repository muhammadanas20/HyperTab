/** Deterministic headless controller exercise, no Canvas dependency. */
import assert from "node:assert/strict";
import { SpiderController } from "../src/spider/controller";
import { POSES } from "../src/spider/rig";
import { solveSkeleton } from "../src/spider/skeleton";
let seed = 8423;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const w = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  addEventListener: () => {},
  setTimeout: () => 0,
};
Object.assign(globalThis, {
  window: w,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
});
const calls: string[] = [];
const canvas = {
  width: 1440,
  height: 900,
  style: {},
  getContext: () => ({ setTransform: () => {} }),
};
// Private state is inspected only here, never exposed as a new production API.
const s = new SpiderController(canvas as any, {
  showBubble: () => {},
  sfx: (n) => calls.push(n),
  searchRect: () => null,
  accent: () => "#ffffff",
}) as any;
function ground() {
  s.rope.detach();
  s.mode = "ground";
  s.pos = { x: 700, y: 886 };
  s.vel = { x: 0, y: 0 };
  s.alpha = 1;
  s.pose = POSES.stand;
  s.poseName = "stand";
  s.rotation = 0;
  s.targetRotation = 0;
  s.squash = 1;
  s.behavior = null;
  s.poseTweak = null;
  s.walkPhase = -1;
  s.idleGap = 999;
  s.globalEggGap = 999;
  s.thwip = null;
  s.pointer.x = -999;
  s.lookX = s.lookY = 0;
  s.fleeCooldown = 999;
}
const steps = (n: number) => {
  for (let i = 0; i < n; i++) {
    s.update(1 / 60);
    assert.ok([s.pos.x, s.pos.y, s.rotation, s.alpha].every(Number.isFinite));
    if (s.mode === "swing" && s.rope.attached) {
      const hand = solveSkeleton(s.renderState()).webHand;
      assert.ok(
        Math.hypot(hand[0] - s.rope.x, hand[1] - s.rope.y) < 1e-6,
        "rope must meet hand",
      );
    }
    if (s.mode === "hang" && s.rope.attached && s.swingPump !== -1) {
      const ankle = solveSkeleton(s.renderState()).webAnkle;
      assert.ok(
        Math.hypot(ankle[0] - s.rope.x, ankle[1] - s.rope.y) < 1e-6,
        "hanging rope must meet ankles",
      );
    }
  }
};
for (const kind of [
  "walk",
  "run",
  "hop",
  "swing",
  "hang",
  "sitGround",
  "perch",
  "crouch",
  "crawlWall",
  "peek",
  "hide",
  "sleep",
  "hammock",
  "watch",
  "wave",
  "salute",
  "idle",
]) {
  ground();
  s.dispatch(kind);
  steps(450);
}
ground();
s.dispatch("hang");
steps(180);
const hanging = solveSkeleton(s.renderState());
const hangingHead =
  hanging.world[3] * hanging.head[0] +
  hanging.world[4] * hanging.head[1] +
  hanging.world[5];
assert.ok(
  hangingHead > hanging.webAnkle[1] + s.size * 0.5,
  "inverted head must hang below ankle anchor",
);
ground();
s.onDoubleClick(1000, 320);
steps(12);
assert.ok(s.thwip.fired);
assert.ok(calls.includes("thwip"));
steps(50);
assert.equal(s.thwip, null);
ground();
s.dispatch("crawlWall");
steps(60);
assert.equal(s.walkPhase, -1, "wall crawl must not use walking targets");
ground();
s.dispatch("wave");
steps(20);
assert.ok(s.pose.curlR[1] < 0.1);
assert.ok(s.pose.spreadR > 0.7);
ground();
s.dispatch("swing");
steps(80);
s.onSettingsOpen();
s.onSettingsClose();
steps(240);
assert.notEqual(s.mode, "hidden");
s.setEnabled(false);
steps(120);
assert.ok(s.alpha < 0.001);
assert.equal(s.mode, "hidden");
s.setEnabled(true);
steps(120);
assert.ok(s.alpha > 0.5);
for (const [width, height] of [
  [390, 700],
  [1920, 1080],
]) {
  w.innerWidth = width;
  w.innerHeight = height;
  s.resize();
  steps(30);
  assert.equal(canvas.width, width);
}
s.reducedMotion = true;
ground();
steps(60);
const position = { ...s.pos };
steps(60);
assert.deepEqual(s.pos, position);
assert.equal(s.walkPhase, -1);
s.onSettingsOpen();
assert.equal(s.mode, "hidden");
s.onSettingsClose();
steps(2);
assert.equal(s.mode, "ground");
assert.equal(s.alpha, 1);
console.log(
  "✓ 17 behaviors, web attachments, thwip/wave, settings, toggles, resize, reduced motion",
);
