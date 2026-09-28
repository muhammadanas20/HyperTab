/** Cinematic vector character. No sprites or remote model dependencies.
 * Local anatomical meshes are lit, layered and posed by the matrix skeleton.
 * This is an illustrated, movie-inspired suit, not a photorealistic 3D model.
 */
import { clamp, lerp, TAU } from "../utils/helpers";
import {
  ARM_GIRTH,
  FOREARM_GIRTH,
  THIGH_GIRTH,
  SHANK_GIRTH,
  HEAD,
  between,
  sampleGirth,
  type Pt,
  type GirthStop,
} from "./anatomy";
import {
  apply,
  compose,
  rotate,
  translate,
  scale,
  transform,
  inverse,
  type Mat3,
} from "./matrix";
import {
  solveSkeleton,
  boneFrame,
  type Chain,
  type Skeleton,
} from "./skeleton";
import { HANDS, type Pose, type Fingers } from "./poses";
export { POSES, blendPose } from "./poses";
export type { Pose, PoseName } from "./poses";
export type PaletteId = "classic" | "stealth" | "ghost";
export interface SuitPalette {
  red: string;
  blue: string;
  web: string;
  lens: string;
  trim: string;
}
export const PALETTES: Record<PaletteId, SuitPalette> = {
  classic: {
    red: "#c92436",
    blue: "#203c69",
    web: "#420e1b",
    lens: "#eef6fa",
    trim: "#080e19",
  },
  stealth: {
    red: "#af2038",
    blue: "#141e2e",
    web: "#3b0b1e",
    lens: "#fff0ef",
    trim: "#060912",
  },
  ghost: {
    red: "#d8e2ec",
    blue: "#313854",
    web: "#65718b",
    lens: "#daeaff",
    trim: "#182339",
  },
};
export type Expression = "neutral" | "happy" | "suspicious" | "sleepy" | "wow";
export interface RenderState {
  x: number;
  y: number;
  rotation: number;
  facing: 1 | -1;
  size: number;
  alpha: number;
  squash: number;
  pose: Pose;
  headTilt: number;
  lookX: number;
  lookY: number;
  blink: number;
  expr: Expression;
  palette: SuitPalette;
  walkPhase: number;
  run?: number;
  breathe: number;
  hidden: "none" | "left" | "right" | "top";
  quality: number;
}
const color = (hex: string, factor: number, white = 0): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(clamp(v * factor + (255 - v) * white, 0, 255))).join(",")})`;
};
const INK = "#09101c";
const PATHS = new Map<string, Path2D>();

export function drawSpider(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  solved?: Skeleton,
): void {
  if (s.alpha <= 0 || s.size <= 0) return;
  const k = solved ?? solveSkeleton(s),
    pal = s.palette;
  const detail = s.quality > 0.5,
    micro = detail && s.size > 180;
  ctx.save();
  apply(ctx, k.world);
  ctx.globalAlpha *= s.alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.hidden !== "none") {
    ctx.beginPath();
    if (s.hidden === "left") ctx.rect(-0.2, -1, 1, 3);
    else if (s.hidden === "right") ctx.rect(-0.8, -1, 1, 3);
    else ctx.rect(-1, -0.25, 2, 1.5);
    ctx.clip();
  }
  const lit = (
    base: string,
    frame: Mat3,
    radius: number,
    far = false,
  ): string | CanvasGradient => {
    if (!detail) return color(base, far ? 0.76 : 1);
    // Transform the screen-space key light into each part's local basis.
    const inv = inverse(compose(k.world, frame));
    const o = transform(inv, [0, 0]),
      l = transform(inv, [-0.65, -0.76]);
    const side = l[0] - o[0] > 0 ? 1 : -1;
    const g = ctx.createLinearGradient(-radius * side, 0, radius * side, 0);
    g.addColorStop(0, color(base, far ? 0.35 : 0.42));
    g.addColorStop(0.2, color(base, far ? 0.55 : 0.7));
    g.addColorStop(0.52, color(base, far ? 0.74 : 1));
    g.addColorStop(0.8, color(base, far ? 0.84 : 1, far ? 0.02 : 0.18));
    g.addColorStop(1, color(base, far ? 0.65 : 0.85));
    return g;
  };
  const stroke = (width = 0.0025, c = INK): void => {
    ctx.lineWidth = width;
    ctx.strokeStyle = c;
    ctx.stroke();
  };
  const path = (d: string): Path2D => {
    let p = PATHS.get(d);
    if (!p) {
      p = new Path2D(d);
      PATHS.set(d, p);
    }
    return p;
  };
  const fillPath = (
    d: string,
    fill: string | CanvasGradient,
    outline = 0,
  ): void => {
    const p = path(d);
    ctx.fillStyle = fill;
    ctx.fill(p);
    if (outline) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = outline;
      ctx.stroke(p);
    }
  };
  /** Projected lattice, scalloped between meridians instead of concentric circles. */
  const lattice = (width: number, height: number, step = 0.035): void => {
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.0017;
    ctx.beginPath();
    for (let j = -2; j <= 2; j++) {
      const x = (j * width) / 2.4;
      ctx.moveTo(x, -0.06);
      ctx.quadraticCurveTo(x * 0.65, height * 0.4, x * 0.82, height + 0.04);
    }
    for (let y = -0.04; y < height + 0.04; y += step) {
      ctx.moveTo(-width, y);
      for (let j = 0; j < 4; j++)
        ctx.quadraticCurveTo(
          -width + ((j + 0.5) * width) / 2,
          y + 0.013,
          -width + ((j + 1) * width) / 2,
          y,
        );
    }
    ctx.stroke();
  };
  /** One smooth muscle envelope, with joint caps under the next segment. */
  const segment = (
    a: Pt,
    b: Pt,
    profile: GirthStop[],
    base: string,
    far: boolean,
    web = false,
  ): void => {
    const frame = boneFrame(a, b),
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-5) return;
    ctx.save();
    apply(ctx, frame);
    const steps = 12;
    const mesh = (): void => {
      ctx.beginPath();
      ctx.moveTo(-profile[0].r, 0);
      for (let i = 1; i <= steps; i++)
        ctx.lineTo(-sampleGirth(profile, i / steps), (i / steps) * len);
      const end = sampleGirth(profile, 1);
      ctx.quadraticCurveTo(0, len + end * 0.7, end, len);
      for (let i = steps - 1; i >= 0; i--)
        ctx.lineTo(sampleGirth(profile, i / steps), (i / steps) * len);
      ctx.quadraticCurveTo(0, -profile[0].r * 1.9, -profile[0].r, 0);
      ctx.closePath();
    };
    mesh();
    ctx.fillStyle = lit(base, frame, Math.max(...profile.map((p) => p.r)), far);
    ctx.fill();
    // Thin silhouettes, not thick black outlines around every joint.
    stroke(far ? 0.002 : 0.0015, color(base, 0.35));
    if (detail) {
      ctx.save();
      mesh();
      ctx.clip();
      if (web) lattice(Math.max(...profile.map((p) => p.r)) * 1.15, len, 0.03);
      if (micro) {
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        for (let y = 0; y < len; y += 0.006)
          for (let x = -0.04; x < 0.04; x += 0.006)
            ctx.fillRect(x, y, 0.0012, 0.0012);
      }
      // Long anatomical highlight, no sphere-stack banding.
      ctx.strokeStyle = far
        ? "rgba(143,175,208,0.08)"
        : "rgba(177,211,245,0.12)";
      ctx.lineWidth = 0.003;
      ctx.beginPath();
      ctx.moveTo(-profile[0].r * 0.55, len * 0.07);
      ctx.quadraticCurveTo(
        -profile[1].r * 0.9,
        len * 0.4,
        -sampleGirth(profile, 1) * 0.5,
        len * 0.9,
      );
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };
  const boot = (leg: Chain, angle: number, far: boolean): void => {
    const calf = between(leg.joint, leg.end, 0.34);
    segment(
      calf,
      leg.end,
      [
        { t: 0, r: 0.025 },
        { t: 0.45, r: 0.022 },
        { t: 1, r: 0.016 },
      ],
      pal.red,
      far,
      true,
    );
    const frame = compose(translate(...leg.end), rotate(angle));
    ctx.save();
    apply(ctx, frame);
    const foot =
      "M -0.016 -0.007 Q -0.022 0.009 -0.023 0.028 Q -0.024 0.039 -0.005 0.04 L 0.067 0.039 Q 0.08 0.038 0.08 0.030 Q 0.077 0.020 0.048 0.016 Q 0.022 0.008 0.016 -0.008 Z";
    fillPath(foot, lit(pal.red, frame, 0.035, far), 0.0025);
    if (detail) {
      ctx.save();
      ctx.clip(path(foot));
      lattice(0.085, 0.04, 0.018);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-0.017, 0.037);
    ctx.quadraticCurveTo(0.03, 0.043, 0.075, 0.036);
    stroke(0.004, color(pal.blue, 0.8));
    ctx.restore();
  };
  const leg = (chain: Chain, angle: number, far: boolean): void => {
    segment(chain.root, chain.joint, THIGH_GIRTH, pal.blue, far);
    segment(chain.joint, chain.end, SHANK_GIRTH, pal.blue, far);
    boot(chain, angle, far);
  };
  const hand = (
    frame: Mat3,
    curls: Fingers,
    spread: number,
    far: boolean,
  ): void => {
    ctx.save();
    apply(ctx, frame);
    const palm =
      "M -0.013 -0.006 Q -0.017 0.012 -0.018 0.026 Q -0.016 0.04 0 0.039 Q 0.018 0.039 0.018 0.026 L 0.013 -0.006 Z";
    fillPath(palm, lit(pal.red, frame, 0.021, far), 0.0015);
    // Four fingers, three articulated phalanges each. Curl is projected from
    // a hinge in depth, while spread/wrist use actual parent × local matrices.
    for (let i = 0; i < 4; i++) {
      const curl = clamp(curls[i + 1], 0, 1),
        x = -0.013 + i * 0.0085;
      const length = [0.034, 0.038, 0.035, 0.028][i];
      let joint = compose(
        translate(x, 0.03 - Math.abs(i - 1.4) * 0.001),
        rotate((i - 1.5) * spread * 0.23),
      );
      for (let ph = 0; ph < 3; ph++) {
        const bend = curl * (ph + 1) * 0.95;
        const len = length * [0.45, 0.32, 0.23][ph];
        const projected = len * Math.cos(bend);
        const end = transform(joint, [0, projected]);
        const start = transform(joint, [0, 0]);
        ctx.beginPath();
        ctx.moveTo(...start);
        ctx.lineTo(...end);
        stroke(0.0075, far ? color(pal.red, 0.5) : color(pal.red, 0.68));
        stroke(0.0048, far ? color(pal.red, 0.72) : color(pal.red, 1, 0.15));
        joint = compose(joint, translate(0, projected), rotate(curl * 0.13));
      }
    }
    // Opposable thumb: a separate two-joint branch off the palm.
    const tc = curls[0];
    const thumb = compose(
      translate(-0.012, 0.011),
      rotate(lerp(0.95, -0.3, tc)),
    );
    const a = transform(thumb, [0, 0]),
      b = transform(thumb, [0, 0.018]);
    const c = transform(
      compose(thumb, translate(0, 0.018), rotate(-tc * 1.1)),
      [0, 0.013],
    );
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.lineTo(...c);
    stroke(0.009, color(pal.red, far ? 0.5 : 0.75));
    stroke(0.0055, color(pal.red, far ? 0.7 : 1, 0.1));
    if (detail) {
      ctx.beginPath();
      ctx.moveTo(-0.012, 0.005);
      ctx.lineTo(0.012, 0.005);
      stroke(0.0018, pal.web);
    }
    ctx.restore();
  };
  const arm = (
    chain: Chain,
    wrist: Mat3,
    curls: Fingers,
    spread: number,
    far: boolean,
  ): void => {
    segment(chain.root, chain.joint, ARM_GIRTH, pal.blue, far);
    // Red shoulder saddle and long red gauntlet over the blue undersuit.
    segment(
      chain.root,
      between(chain.root, chain.joint, 0.32),
      [
        { t: 0, r: 0.038 },
        { t: 0.6, r: 0.035 },
        { t: 1, r: 0.032 },
      ],
      pal.red,
      far,
      true,
    );
    segment(chain.joint, chain.end, FOREARM_GIRTH, pal.blue, far);
    segment(
      between(chain.joint, chain.end, 0.25),
      chain.end,
      [
        { t: 0, r: 0.024 },
        { t: 0.4, r: 0.02 },
        { t: 1, r: 0.013 },
      ],
      pal.red,
      far,
      true,
    );
    hand(wrist, curls, spread, far);
  };
  const p = s.pose;
  // Far side is shaded, never solid black. Both thighs tuck behind the pelvis.
  leg(k.legL, k.footAngL, true);
  arm(k.armL, k.wristL, p.curlL ?? HANDS.relaxed, p.spreadL ?? 0.2, true);
  leg(k.legR, k.footAngR, false);

  ctx.save();
  apply(ctx, k.torso);
  const body =
    "M -0.032 -0.053 Q -0.062 -0.026 -0.105 -0.014 Q -0.125 0.006 -0.112 0.054 L -0.089 0.135 Q -0.065 0.215 -0.081 0.282 Q -0.076 0.314 -0.034 0.330 Q 0 0.335 0.034 0.330 Q 0.076 0.314 0.081 0.282 Q 0.065 0.215 0.089 0.135 L 0.112 0.054 Q 0.125 0.006 0.105 -0.014 Q 0.062 -0.026 0.032 -0.053 Z";
  fillPath(body, lit(pal.blue, k.torso, 0.12), 0.003);
  ctx.save();
  ctx.clip(path(body));
  const red =
    "M -0.035 -0.06 L -0.125 -0.018 L -0.111 0.065 Q -0.088 0.083 -0.076 0.099 L -0.042 0.227 L 0 0.288 L 0.042 0.227 L 0.076 0.099 Q 0.088 0.083 0.111 0.065 L 0.125 -0.018 L 0.035 -0.06 Z";
  fillPath(red, lit(pal.red, k.torso, 0.11));
  // Pectoral planes and abdominal masses are subtle specular/shadow shapes.
  for (const side of [-1, 1]) {
    ctx.save();
    apply(ctx, scale(side, 1));
    fillPath(
      "M 0.008 0.021 Q 0.064 -0.008 0.101 0.024 Q 0.099 0.057 0.066 0.072 L 0.008 0.062 Z",
      "rgba(255,177,167,0.12)",
    );
    fillPath(
      "M 0.009 0.059 Q 0.055 0.080 0.088 0.058 Q 0.062 0.086 0.013 0.079 Z",
      "rgba(32,1,16,0.26)",
    );
    for (let i = 0; i < 4; i++) {
      const y = 0.09 + i * 0.033,
        w = 0.054 - i * 0.007;
      ctx.beginPath();
      ctx.moveTo(0.004, y);
      ctx.quadraticCurveTo(w * 0.6, y - 0.006, w, y + 0.002);
      ctx.lineTo(w * 0.87, y + 0.024);
      ctx.lineTo(0.005, y + 0.021);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, y, 0, y + 0.028);
      grad.addColorStop(0, "rgba(255,188,175,0.12)");
      grad.addColorStop(0.7, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(20,0,14,0.27)");
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0.092, 0.091);
    ctx.quadraticCurveTo(0.075, 0.17, 0.065, 0.215);
    stroke(0.004, "rgba(133,173,222,0.18)");
    fillPath(
      "M 0.046 0.238 L 0.079 0.215 L 0.084 0.249 L 0.035 0.273 Z",
      color(pal.red, 0.83),
    );
    ctx.restore();
  }
  if (detail) {
    ctx.save();
    ctx.clip(path(red));
    lattice(0.115, 0.29, 0.034);
    ctx.restore();
  }
  // Raised black chest emblem with eight angular legs.
  ctx.save();
  apply(ctx, translate(0, 0.058));
  ctx.fillStyle = pal.trim;
  ctx.beginPath();
  ctx.ellipse(0, -0.015, 0.007, 0.012, 0, 0, TAU);
  ctx.ellipse(0, 0.007, 0.01, 0.019, 0, 0, TAU);
  ctx.fill();
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const y = -0.023 + i * 0.014,
        direction = i < 2 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(side * 0.007, y);
      ctx.lineTo(side * (0.02 + (i % 2) * 0.008), y + direction * 0.012);
      ctx.lineTo(side * (0.027 + (i % 2) * 0.01), y + direction * 0.038);
      stroke(0.0038, pal.trim);
    }
  ctx.restore();
  ctx.restore();
  ctx.restore();

  arm(k.armR, k.wristR, p.curlR ?? HANDS.relaxed, p.spreadR ?? 0.2, false);
  // A short neck, seated into the trapezius, rather than a floating mask.
  segment(
    transform(k.torso, [0, -0.045]),
    [k.head[0], k.head[1] + HEAD.ry * 0.66],
    [
      { t: 0, r: 0.03 },
      { t: 1, r: 0.026 },
    ],
    pal.red,
    false,
    true,
  );

  ctx.save();
  apply(ctx, k.headFrame);
  const skull =
    "M 0 -0.073 C 0.035 -0.075 0.055 -0.050 0.055 -0.020 C 0.055 0.018 0.041 0.049 0.024 0.064 Q 0 0.082 -0.024 0.064 C -0.041 0.049 -0.055 0.018 -0.055 -0.020 C -0.055 -0.050 -0.035 -0.075 0 -0.073 Z";
  fillPath(skull, lit(pal.red, k.headFrame, 0.059), 0.0026);
  ctx.save();
  ctx.clip(path(skull));
  if (detail) {
    const yaw = clamp(s.lookX, -1, 1) * 0.006,
      cy = 0.02;
    ctx.strokeStyle = pal.web;
    ctx.lineWidth = 0.0017;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(yaw, cy);
      ctx.quadraticCurveTo(
        yaw + Math.cos(a) * 0.03,
        cy + Math.sin(a) * 0.045,
        Math.cos(a) * 0.095,
        cy + Math.sin(a) * 0.13,
      );
      ctx.stroke();
    }
    for (const r of [0.23, 0.45, 0.67, 0.88, 1.1]) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * TAU,
          x = yaw + Math.cos(a) * 0.071 * r,
          y = cy + Math.sin(a) * 0.105 * r;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const mid = a - TAU / 24;
          ctx.quadraticCurveTo(
            yaw + Math.cos(mid) * 0.062 * r,
            cy + Math.sin(mid) * 0.092 * r,
            x,
            y,
          );
        }
      }
      ctx.stroke();
    }
    fillPath(
      "M -0.044 -0.041 Q -0.036 -0.063 -0.017 -0.066 Q -0.032 -0.036 -0.039 -0.019 Z",
      "rgba(255,211,191,0.23)",
    );
    fillPath(
      "M 0.004 0.014 Q 0.002 0.038 0.016 0.041 L 0.007 0.050 L -0.004 0.043 Z",
      "rgba(43,2,13,0.22)",
    );
  }
  // Angular swept lenses: high outer corner, narrow nasal bridge, black bezel.
  const expression =
    s.expr === "sleepy"
      ? 0.35
      : s.expr === "suspicious"
        ? 0.72
        : s.expr === "happy"
          ? 0.8
          : s.expr === "wow"
            ? 1.1
            : 1;
  const eyeOpen = Math.max(0.09, (1 - s.blink) * expression);
  for (const side of [-1, 1]) {
    ctx.save();
    apply(
      ctx,
      compose(
        translate(clamp(s.lookX, -1, 1) * 0.002, clamp(s.lookY, -1, 1) * 0.002),
        scale(side, eyeOpen),
      ),
    );
    const lens =
      "M 0.007 0.012 Q 0.022 -0.014 0.049 -0.039 C 0.055 -0.009 0.045 0.023 0.027 0.031 Q 0.017 0.036 0.007 0.012 Z";
    const glass = ctx.createLinearGradient(0, -0.04, 0, 0.036);
    glass.addColorStop(0, "#ffffff");
    glass.addColorStop(0.55, pal.lens);
    glass.addColorStop(1, "#94b3c8");
    fillPath(lens, detail ? glass : pal.lens, 0.006);
    if (detail) {
      ctx.beginPath();
      ctx.moveTo(0.02, 0.003);
      ctx.quadraticCurveTo(0.034, -0.018, 0.045, -0.026);
      stroke(0.0022, "rgba(255,255,255,0.9)");
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
