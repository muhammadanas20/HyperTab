/**
 * SpiderController — the living webhead.
 *
 * Owns the character's physics (ground locomotion, ballistic hops,
 * verlet web-swings, ceiling hangs, wall crawls), runs the behavioural
 * state machine driven by Brain + moods, answers pointer interaction
 * (flee, dodge, thwip-back, search-bar curiosity, settings shyness) and
 * fires the rare easter eggs. Rendering goes through the procedural rig.
 *
 * Everything is time-stepped from a single update(dt) and drawn onto a
 * dedicated overlay canvas with pointer-events disabled.
 */
import { Brain, randomQuip, type BehaviorKind, type Mood } from './brain';
import {
  PALETTES, POSES, blendPose, drawSpider,
  type Expression, type PaletteId, type Pose, type PoseName, type RenderState,
} from './rig';
import { SwingRope, WebEffects, drawHammock, drawTinySpider, drawWebLogo } from './web';
import { clamp, damp, lerp, rand, chance } from '../utils/helpers';

const AIR_GRAVITY = 3400;      // px/s² for ballistic hops
const WALK_SPEED = 95;         // px/s
const RUN_SPEED = 420;

export interface SpiderHooks {
  /** DOM speech bubble: show at screen point, auto-hides */
  showBubble(text: string, x: number, y: number, holdMs?: number): void;
  /** thwip / land / step / whoosh sfx */
  sfx(name: 'thwip' | 'land' | 'step' | 'whoosh' | 'blink'): void;
  /** rect of the search bar (for curiosity + the hang-over-search egg) */
  searchRect(): DOMRect | null;
  /** current accent colour for web glow */
  accent(): string;
}

interface ActiveBehavior {
  kind: BehaviorKind | 'flee' | 'dodge' | 'landBeat';
  t: number;
  dur: number;
  /** generic target point (walk destination, hop landing, anchor…) */
  tx: number;
  ty: number;
  wall: -1 | 1;
  phase: number;
  /** swing bookkeeping */
  chained: boolean;
  released: boolean;
  /** flee/dodge bookkeeping */
  dir: number;
}

interface TinySpiderEgg { x: number; active: boolean }
interface LogoEgg { t: number; active: boolean }

export class SpiderController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: SpiderHooks;
  private brain = new Brain();
  private fx = new WebEffects();
  private rope = new SwingRope();

  enabled = true;
  frequency = 0.6;         // 0..1 — activity dial from settings
  speed = 1;               // animation speed dial
  reducedMotion = false;
  performanceMode = false;

  /* physics state */
  private pos = { x: 0, y: 0 };      // feet/bottom-centre in screen px
  private vel = { x: 0, y: 0 };
  private mode: 'ground' | 'air' | 'swing' | 'hang' | 'wall' | 'hidden' = 'hidden';
  private facing: 1 | -1 = 1;
  private w = 0;
  private h = 0;
  private groundY = 0;
  private margin = 26;

  /* render state */
  private size = 84;
  private rotation = 0;
  private targetRotation = 0;
  private squash = 1;
  private alpha = 0;
  private pose: Pose = POSES.stand;
  private poseName: PoseName = 'stand';
  private poseBlend = 9;
  private walkPhase = -1;
  private breathe = 0;
  private blink = 0;
  private nextBlink = 2;
  private expr: Expression = 'neutral';
  private exprHold = 0;
  private lookX = 0;
  private lookY = 0;
  private lookTX = 0;
  private lookTY = 0;
  private headTilt = 0;
  private headTiltTarget = 0;
  private hiddenEdge: 'none' | 'left' | 'right' | 'top' = 'none';
  private poseTweak: ((p: Pose, t: number) => Pose) | null = null;
  private paletteId: PaletteId = 'classic';
  private paletteTimer = 0;

  /* behaviour bookkeeping */
  private behavior: ActiveBehavior | null = null;
  private idleGap = 1.5;
  private stepSfxPhase = 0;

  /* pointer + reactions */
  private pointer = { x: -999, y: -999, vx: 0, vy: 0, lastT: 0 };
  private fleeCooldown = 0;
  private searchHover = false;
  private typingGlow = 0;
  /** Prevents a late settings-exit animation from marooning him off-screen. */
  private settingsOpen = false;

  /* swing physics */
  private swingPump = 0;

  /* eggs */
  private tiny: TinySpiderEgg = { x: 0, active: false };
  private logo: LogoEgg = { t: 0, active: false };
  private eggs = { tinySpider: 0, webLogo: 0, searchHang: 0, quip: 0, paletteSwap: 0 }; // cooldowns
  private globalEggGap = 20;
  private hammockAnchors = { ax: 0, bx: 0 };

  private running = false;
  private raf = 0;
  private lastT = 0;
  private frameDt = 1 / 60;

  constructor(canvas: HTMLCanvasElement, hooks: SpiderHooks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[hypertab] spider canvas unavailable');
    this.ctx = ctx;
    this.hooks = hooks;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  resize(): void {
    const oldW = this.w;
    const oldH = this.h;
    const oldGroundY = this.groundY;
    const dpr = this.performanceMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // Use the actual backing-store ratio after rounding. This keeps the
    // procedural linework pin-sharp on fractional-DPR/zoomed displays.
    this.ctx.setTransform(this.canvas.width / this.w, 0, 0, this.canvas.height / this.h, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.groundY = this.h - 14;
    this.size = clamp(Math.min(this.w, this.h) * 0.14, 76, 124);

    if (oldW > 0 && oldH > 0) {
      const sx = this.w / oldW;
      const sy = this.h / oldH;
      this.pos.x *= sx;
      this.pos.y = this.mode === 'ground' ? this.groundY : this.pos.y * sy;
      this.vel.x *= sx;
      this.vel.y *= sy;

      this.rope.scale(sx, sy);
      this.hammockAnchors.ax *= sx;
      this.hammockAnchors.bx *= sx;
      if (this.behavior) {
        this.behavior.tx *= sx;
        this.behavior.ty *= sy;
      }

      // A viewport resize must never leave the character permanently beyond
      // the new edge. Flee/hide/peek intentionally travel off-screen, so only
      // clamp ordinary active states.
      if (!this.isBusy('flee', 'hide', 'peek')) {
        this.pos.x = clamp(this.pos.x, this.margin - this.size * 0.25, this.w - this.margin + this.size * 0.25);
      }
      if (this.mode === 'ground' || Math.abs(this.pos.y - oldGroundY) < 2) this.pos.y = this.groundY;
    }

    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y)) {
      this.rope.detach();
      this.behavior = null;
      this.mode = 'ground';
      this.pos = { x: this.w / 2, y: this.groundY };
      this.vel = { x: 0, y: 0 };
      this.alpha = this.enabled ? 1 : 0;
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    if (this.mode === 'hidden' && this.alpha === 0) this.spawnEntrance();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = clamp((now - this.lastT) / 1000, 0.0001, 0.05);
      this.lastT = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.fadeAway();
      return;
    }

    // The controller is not started during boot when the saved setting is
    // disabled. Turning it on later must therefore wake the RAF loop too.
    if (this.mode === 'hidden') this.spawnEntrance();
    this.start();
  }

  /* ---------------------------------------------------------------- */
  /* Public interaction API (wired by newtab bootstrap)                */
  /* ---------------------------------------------------------------- */

  onPointerMove(x: number, y: number): void {
    const now = performance.now();
    const dt = Math.max(16, now - this.pointer.lastT) / 1000;
    this.pointer.vx = (x - this.pointer.x) / dt;
    this.pointer.vy = (y - this.pointer.y) / dt;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.lastT = now;
  }

  onPointerDown(x: number, y: number): void {
    if (!this.enabled || this.mode === 'hidden' || this.alpha < 0.5) return;
    const d = Math.hypot(x - this.pos.x, y - (this.pos.y - this.size * 0.5));
    if (d < 300 && !this.isBusy('dodge', 'flee')) {
      this.startDodge(x);
    }
  }

  onDoubleClick(x: number, y: number): void {
    if (!this.enabled || this.mode === 'hidden' || this.alpha < 0.5) return;
    // face the click, point, and thwip a web at it
    this.faceToward(x);
    this.setPose('point', 14);
    this.expr = 'wow';
    this.exprHold = 0.7;
    const hand = this.handWorld();
    const tx = clamp(x, 10, this.w - 10);
    this.fx.shot(hand.x, hand.y, tx, Math.max(8, y - 80));
    this.fx.splat(tx, Math.max(8, y - 80));
    this.hooks.sfx('thwip');
    // sometimes he follows the web up for a swing
    if (!this.reducedMotion && chance(0.45) && this.mode === 'ground') {
      this.startSwing(tx + rand(-60, 60));
    }
  }

  onSearchHover(hovering: boolean): void {
    this.searchHover = hovering;
  }

  onTyping(): void {
    // burning curiosity — quick reaction, then back to peering
    this.typingGlow = 1;
    if (this.behavior?.kind === 'idle' || !this.behavior) {
      this.expr = 'wow';
      this.exprHold = 0.5;
    }
  }

  onSettingsOpen(): void {
    this.settingsOpen = true;
    if (!this.enabled) return;
    if (this.mode !== 'hidden') {
      this.fleeOffscreen(1.4);
      this.hooks.showBubble('skedaddle!', this.pos.x, this.pos.y - this.size, 1200);
    }
  }

  onSettingsClose(): void {
    this.settingsOpen = false;
    if (!this.enabled) return;

    // Closing while the exit dash is still running used to let that stale
    // dash finish afterwards, leaving the character hidden until refresh.
    // Cancel the exit atomically and give every close a clean entrance.
    if (this.behavior?.kind === 'flee' || this.mode === 'hidden') {
      this.rope.detach();
      this.behavior = null;
      this.mode = 'hidden';
      this.alpha = 0;
      this.spawnEntrance();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Behaviour helpers                                                 */
  /* ---------------------------------------------------------------- */

  private isBusy(...kinds: string[]): boolean {
    return !!this.behavior && kinds.includes(this.behavior.kind);
  }

  private setPose(name: PoseName, blend = 9): void {
    this.poseName = name;
    this.poseBlend = blend;
  }

  private faceToward(x: number): void {
    if (Math.abs(x - this.pos.x) > 8) this.facing = x > this.pos.x ? 1 : -1;
  }

  /** translated top-left of the character box */
  private boxTop(): number {
    return this.pos.y - this.size;
  }

  /** world position of the "near hand" (used for web lines) */
  private handWorld(): { x: number; y: number } {
    const localX = 0.09 * this.facing;
    const localY = 0.05;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.pos.x + (cos * localX - sin * localY) * this.size,
      y: this.boxTop() + (sin * localX + cos * localY) * this.size,
    };
  }

  private endBehavior(): void {
    this.behavior = null;
    this.poseTweak = null;
    this.walkPhase = -1;
    this.headTiltTarget = 0;
    const freq = this.frequency;
    this.idleGap = lerp(7.5, 1.1, freq) * rand(0.75, 1.3) / this.speed;
  }

  private spawnEntrance(): void {
    if (!this.enabled || this.settingsOpen) return;

    if (this.reducedMotion) {
      // Quiet entrance: step in from the nearest side. Alpha is raised by
      // update(), so reduced-motion users no longer get an invisible spider.
      const fromLeft = chance(0.5);
      this.mode = 'ground';
      this.pos = { x: fromLeft ? this.margin + 18 : this.w - this.margin - 18, y: this.groundY };
      this.facing = fromLeft ? 1 : -1;
      this.alpha = 0;
      this.behavior = {
        kind: 'walk', t: 0, dur: 12,
        tx: clamp(this.w * rand(0.36, 0.64), this.margin, this.w - this.margin), ty: 0,
        wall: 1, phase: 0, chained: false, released: false, dir: 1,
      };
      return;
    }

    // Cinematic entrance: always aim across the viewport rather than picking
    // another anchor in the same corner. The old random corner-on-corner setup
    // could settle into a near-static pendulum at the top-right on first load.
    const fromLeft = chance(0.5);
    this.mode = 'air';
    this.pos = { x: fromLeft ? -this.size * 0.35 : this.w + this.size * 0.35, y: this.h * 0.28 };
    this.facing = fromLeft ? 1 : -1;
    this.vel = { x: (fromLeft ? 1 : -1) * rand(420, 560), y: -70 };
    this.alpha = 1;
    this.setPose('airborne', 12);
    this.startSwing(fromLeft ? this.w * 0.4 : this.w * 0.6, true);
  }

  private fadeAway(): void {
    this.rope.detach();
    this.behavior = null;
    this.walkPhase = -1;
    this.mode = 'hidden';
    // alpha eased to 0 in update()
  }

  private fleeOffscreen(speedScale = 1): void {
    if (this.mode === 'hidden') return;
    this.rope.detach();
    this.mode = 'ground';
    const toLeft = this.pos.x < this.w / 2;
    this.behavior = {
      kind: 'flee', t: 0, dur: 9, tx: toLeft ? -60 : this.w + 60, ty: 0,
      wall: 1, phase: 0, chained: false, released: false, dir: (toLeft ? -1 : 1) * speedScale,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Behavior starters                                                 */
  /* ---------------------------------------------------------------- */

  private startWalk(run: boolean, tx?: number): void {
    const dest = tx ?? rand(this.margin + 30, this.w - this.margin - 30);
    this.mode = 'ground';
    this.behavior = { kind: run ? 'run' : 'walk', t: 0, dur: 99, tx: dest, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 1 };
    this.setPose('stand', 10);
  }

  private startHop(tx?: number): void {
    const dest = clamp(tx ?? this.pos.x + this.facing * rand(120, 320), this.margin, this.w - this.margin);
    const dist = dest - this.pos.x;
    const T = clamp(Math.abs(dist) / 380, 0.35, 0.75);
    this.vel = { x: dist / T, y: -AIR_GRAVITY * T * 0.5 * 0.85 };
    this.mode = 'air';
    this.setPose('airborne', 14);
    this.hooks.sfx('whoosh');
    this.behavior = { kind: 'hop', t: 0, dur: 99, tx: dest, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 1 };
  }

  private pickAnchor(preferX?: number): { x: number; y: number } {
    const r = Math.random();
    if (r < 0.12) {
      // corner anchor
      return { x: chance(0.5) ? rand(4, 30) : this.w - rand(4, 30), y: rand(4, 40) };
    }
    if (r < 0.2) {
      // side-wall anchor for a sweeping sideways arc
      const left = preferX !== undefined ? preferX > this.w / 2 : chance(0.5);
      return { x: left ? rand(6, 26) : this.w - rand(6, 26), y: rand(this.h * 0.08, this.h * 0.3) };
    }
    const x = preferX !== undefined
      ? clamp(preferX + rand(-160, 160), 40, this.w - 40)
      : clamp(this.pos.x + this.facing * rand(140, 380) + rand(-120, 120), 40, this.w - 40);
    return { x, y: rand(4, 36) };
  }

  private startSwing(anchorX?: number, immediate = false): void {
    const anchor = immediate && anchorX !== undefined
      ? { x: clamp(anchorX, 40, this.w - 40), y: rand(8, Math.max(9, Math.min(36, this.h * 0.06))) }
      : this.pickAnchor(anchorX);
    const attach = (): void => {
      const hand = { x: this.pos.x, y: this.boxTop() + this.size * 0.1 };
      this.rope.attach(anchor.x, anchor.y, hand.x, hand.y, this.vel.x / 60, this.vel.y / 60);
      this.mode = 'swing';
      this.swingPump = 0;
      this.fx.splat(anchor.x, anchor.y);
      this.hooks.sfx('thwip');
    };
    if (this.mode === 'ground') {
      // little launch hop first; attach happens in update once airborne
      this.vel = { x: clamp((anchor.x - this.pos.x) * 2, -520, 520), y: -rand(420, 560) };
      this.mode = 'air';
    } else if (immediate) {
      attach();
    }
    this.setPose('swing', 8);
    this.behavior = {
      kind: 'swing', t: 0, dur: rand(1.4, 2.6) / this.speed, tx: anchor.x, ty: anchor.y,
      wall: 1, phase: 0, chained: false, released: false, dir: 1,
    };
  }

  private startHang(atX?: number): void {
    // keep clear of the widget cluster top-right / links top-left
    const x = clamp(atX ?? this.pos.x, this.w * 0.14, this.w * 0.72);
    this.rope.attach(x, rand(6, 20), this.pos.x, this.pos.y - this.size * 0.98, 0, 0);
    this.mode = 'hang';
    this.swingPump = 0;
    this.setPose('hang', 7);
    this.fx.splat(x, 12);
    this.hooks.sfx('thwip');
    this.behavior = { kind: 'hang', t: 0, dur: rand(4, 9) / this.speed, tx: x, ty: 12, wall: 1, phase: rand(3), chained: false, released: false, dir: 1 };
  }

  private startCrawl(): void {
    const wall: -1 | 1 = this.pos.x < this.w / 2 ? -1 : 1;
    this.mode = 'wall';
    this.pos.x = wall === -1 ? this.margin - 6 : this.w - this.margin + 6;
    this.pos.y = this.groundY;
    this.setPose('crawl', 8);
    const climbTo = rand(this.h * 0.25, this.h * 0.6);
    this.behavior = { kind: 'crawlWall', t: 0, dur: rand(4, 8) / this.speed, tx: 0, ty: climbTo, wall, phase: 0, chained: false, released: false, dir: 1 };
  }

  private startPeek(): void {
    const edgeLeft = chance(0.5);
    this.mode = 'ground';
    this.hiddenEdge = edgeLeft ? 'left' : 'right';
    this.pos.x = edgeLeft ? -this.size * 0.32 : this.w + this.size * 0.32;
    this.facing = edgeLeft ? 1 : -1;
    this.setPose('curious', 5);
    this.behavior = { kind: 'peek', t: 0, dur: rand(3.5, 7), tx: 0, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 1 };
  }

  private startHide(): void {
    this.behavior = { kind: 'hide', t: 0, dur: rand(6, 12), tx: 0, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: this.pos.x < this.w / 2 ? -1 : 1 };
  }

  private startHammock(): void {
    // Keep both anchors inside narrow/mobile viewports. Previously the clamp's
    // lower bound could exceed its upper bound, producing an off-screen net.
    const maxSpan = Math.max(64, Math.min(240, (this.w - this.margin * 2) * 0.28));
    const minSpan = Math.min(150, maxSpan);
    const span = rand(minSpan, maxSpan);
    const cx = clamp(
      this.pos.x + rand(-Math.min(200, this.w * 0.2), Math.min(200, this.w * 0.2)),
      this.margin + span,
      this.w - this.margin - span,
    );
    this.hammockAnchors = { ax: cx - span, bx: cx + span };
    // webs out to both anchors (slung below the top bar, not through it)
    this.fx.shot(this.pos.x, this.boxTop(), this.hammockAnchors.ax, 78);
    this.fx.shot(this.pos.x, this.boxTop(), this.hammockAnchors.bx, 78);
    this.fx.splat(this.hammockAnchors.ax, 78);
    this.fx.splat(this.hammockAnchors.bx, 78);
    this.hooks.sfx('thwip');
    this.mode = 'hang';
    this.swingPump = -1; // marker: hammock mode
    this.setPose('hammock', 6);
    this.behavior = { kind: 'hammock', t: 0, dur: rand(7, 13) / this.speed, tx: cx, ty: 0, wall: 1, phase: rand(6), chained: false, released: false, dir: 1 };
  }

  private startDodge(fromX: number): void {
    const dir = this.pos.x >= fromX ? 1 : -1;
    const dist = rand(130, 240);
    const T = 0.38;
    this.rope.detach();
    this.vel = { x: (dir * dist) / T, y: -AIR_GRAVITY * T * 0.42 };
    this.mode = 'air';
    this.setPose('dodge', 16);
    this.expr = 'wow';
    this.exprHold = 0.6;
    this.hooks.sfx('whoosh');
    this.behavior = { kind: 'dodge', t: 0, dur: 99, tx: 0, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir };
  }

  /** Main dispatcher — turn a policy choice into a running behaviour. */
  private dispatch(kind: BehaviorKind): void {
    switch (kind) {
      case 'walk': return this.startWalk(false);
      case 'run': return this.startWalk(true);
      case 'hop': return this.startHop();
      case 'swing': return this.reducedMotion ? this.startWalk(true) : this.startSwing();
      case 'hang': return this.startHang();
      case 'crawlWall': return this.startCrawl();
      case 'peek': return this.startPeek();
      case 'hide': return this.startHide();
      case 'hammock': return this.reducedMotion ? this.dispatch('sitGround') : this.startHammock();
      case 'sitGround':
      case 'perch':
      case 'crouch':
      case 'sleep':
      case 'watch':
      case 'wave':
      case 'idle': {
        const poseFor: Record<string, PoseName> = {
          sitGround: 'sit', perch: 'sit', crouch: 'crouch', sleep: 'sleep',
          watch: 'watch', wave: 'wave', idle: 'stand',
        };
        const durFor: Record<string, number> = {
          sitGround: rand(4, 9), perch: rand(5, 10), crouch: rand(2.5, 6), sleep: rand(6, 12),
          watch: 1.9, wave: 2.2, idle: rand(3, 7),
        };
        if (kind === 'wave' && !this.reducedMotion) {
          this.poseTweak = (p, t) => ({
            ...p,
            handR: [0.28 + Math.sin(t * 9) * 0.055, 0.12 + Math.cos(t * 9) * 0.03],
          });
        }
        if (kind === 'watch') {
          this.poseTweak = (p, t) => ({
            ...p,
            // quick shake of the wrist, then a slow disappointed head-shake
            head: [p.head[0], p.head[1] + (t > 0.7 ? Math.sin(t * 5) * 0.006 : 0)],
          });
        }
        if (kind === 'sleep') this.expr = 'sleepy';
        this.behavior = { kind, t: 0, dur: durFor[kind] / this.speed, tx: 0, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 1 };
        if (kind === 'perch') {
          // perch upside down beneath the "ceiling"
          this.startHang(this.pos.x + rand(-60, 60));
          if (this.behavior) this.behavior.kind = 'perch';
          this.setPose('sit', 6);
          return;
        }
        this.setPose(poseFor[kind], kind === 'crouch' ? 12 : 6);
        return;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Update                                                            */
  /* ---------------------------------------------------------------- */

  private update(dt: number): void {
    this.frameDt = dt;
    if (!this.enabled) {
      this.alpha = damp(this.alpha, 0, 6, dt);
      return;
    }

    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y)
      || !Number.isFinite(this.vel.x) || !Number.isFinite(this.vel.y)) {
      this.rope.detach();
      this.behavior = null;
      this.mode = 'ground';
      this.pos = { x: this.w / 2, y: this.groundY };
      this.vel = { x: 0, y: 0 };
      this.rotation = 0;
      this.targetRotation = 0;
    }

    if (this.mode !== 'hidden') this.alpha = damp(this.alpha, 1, 9, dt);

    this.brainTick(dt);
    this.eggTick(dt);

    /* ---------- ambient life ---------- */
    this.breathe += dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.nextBlink = rand(2.4, 5.5);
      this.blink = 1;
      this.hooks.sfx('blink');
    }
    this.blink = damp(this.blink, 0, 14, dt);
    if (this.exprHold > 0) {
      this.exprHold -= dt;
      if (this.exprHold <= 0) this.expr = 'neutral';
    }
    this.headTilt = damp(this.headTilt, this.headTiltTarget, 6, dt);
    this.squash = damp(this.squash, 1, 9, dt);
    this.rotation = damp(this.rotation, this.targetRotation, 8, dt);
    if (this.paletteTimer > 0) {
      this.paletteTimer -= dt;
      if (this.paletteTimer <= 0) this.paletteId = 'classic';
    }

    /* pointer look — eyes follow the cursor when it's around */
    const headWorldY = this.boxTop() + this.size * 0.2;
    const pd = Math.hypot(this.pointer.x - this.pos.x, this.pointer.y - headWorldY);
    if (pd < 620 && this.pointer.x > 0) {
      this.lookTX = clamp((this.pointer.x - this.pos.x) / 180, -1, 1);
      this.lookTY = clamp((this.pointer.y - headWorldY) / 220, -1, 1);
    } else if (this.searchHover) {
      const r = this.hooks.searchRect();
      if (r) {
        this.lookTX = clamp((r.x + r.width / 2 - this.pos.x) / 180, -1, 1);
        this.lookTY = clamp((r.y - headWorldY) / 220, -1, 1);
      }
    } else {
      this.lookTX = Math.sin(this.breathe * 0.5) * 0.35;
      this.lookTY = 0;
    }
    this.lookX = damp(this.lookX, this.lookTX, 7, dt);
    this.lookY = damp(this.lookY, this.lookTY, 7, dt);

    /* ---------- reactions ---------- */
    this.fleeCooldown = Math.max(0, this.fleeCooldown - dt);
    this.typingGlow = Math.max(0, this.typingGlow - dt * 1.4);
    this.reactions();

    /* ---------- behaviour ---------- */
    if (this.behavior) this.updateBehavior(dt);
    else {
      this.idleGap -= dt;
      if (this.idleGap <= 0 && this.mode === 'ground') {
        this.dispatch(this.brain.pick('ground'));
      }
    }

    /* ---------- physics by mode ---------- */
    switch (this.mode) {
      case 'air': {
        this.vel.y += AIR_GRAVITY * dt;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.targetRotation = clamp(this.vel.x / 2600, -0.22, 0.22);
        if (this.vel.y > 120 && this.poseName !== 'airborne') this.setPose('airborne', 12);
        // wall clamp
        this.pos.x = clamp(this.pos.x, this.margin - 4, this.w - this.margin + 4);
        if (this.pos.y >= this.groundY) this.land();
        break;
      }
      case 'swing': {
        // pump: gain energy like a real swinger
        const vel = this.rope.velocity(dt);
        this.swingPump = vel.y < 0 ? clamp(Math.abs(vel.x) / 480, 0.2, 1) : -0.35;
        this.rope.step(dt, this.swingPump * 0.6);
        // gentle forward push so arcs keep travelling
        const push = clamp((vel.x || 1), -1, 1) * 30;
        this.rope.x += push * dt;
        const bob = { x: this.rope.x, y: this.rope.y };
        const angle = Math.atan2(this.rope.anchor.x - bob.x, -(this.rope.anchor.y - bob.y));
        this.targetRotation = clamp(angle, -1.05, 1.05);
        this.rotation = this.targetRotation;
        // translate back from the hand-hold point
        const handLocalX = 0.09 * this.facing;
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        this.pos.x = bob.x - (cos * handLocalX - sin * 0.05) * this.size;
        this.pos.y = bob.y - (sin * handLocalX + cos * 0.05) * this.size + this.size;
        this.faceToward(this.pos.x + vel.x);
        /* swinging into the floor? bail out gracefully */
        if (this.pos.y >= this.groundY - this.size * 0.2) {
          this.rope.detach();
          const v2 = this.rope.velocity(dt);
          this.vel = { x: v2.x, y: Math.min(v2.y, 0) };
          this.mode = 'air';
          this.setPose('airborne', 12);
          this.endBehavior();
        }
        break;
      }
      case 'hang': {
        if (this.swingPump === -1) break; // hammock handled by behavior
        this.behavior && (this.behavior.phase += dt * 2.4);
        const sway = Math.sin((this.behavior?.phase ?? 0)) * 0.08 * Math.max(0.3, 1 - (this.behavior?.t ?? 0) * 0.04);
        this.targetRotation = Math.PI + sway;
        const anchor = this.rope.anchor;
        const len = clamp(Math.hypot(this.pos.x - anchor.x, (this.pos.y - this.size) - anchor.y), this.size * 0.8, this.size * 2.4);
        const sx = anchor.x + Math.sin(sway * 2.2) * len * 0.12;
        const sy = anchor.y + len;
        this.pos.x = damp(this.pos.x, sx, 5, dt);
        this.pos.y = damp(this.pos.y, sy + this.size * 0.98, 5, dt);
        break;
      }
      case 'ground':
        this.pos.y = this.groundY;
        this.targetRotation = 0;
        break;
      case 'wall':
        this.targetRotation = -((this.behavior?.wall ?? 1) as number) * 0.12;
        break;
      default:
        break;
    }

    /* ---------- pose blending ---------- */
    let target = POSES[this.poseName];
    if (this.poseTweak) target = this.poseTweak(target, this.behavior?.t ?? this.breathe);
    this.pose = blendPose(this.pose, target, Math.min(1, dt * this.poseBlend));
  }

  private brainTick(dt: number): void {
    // forward to mood machine
    (this.brain as Brain).tick(dt);
  }

  private updateBehavior(dt: number): void {
    const b = this.behavior!;
    b.t += dt;

    switch (b.kind) {
      case 'walk':
      case 'run': {
        const run = b.kind === 'run';
        const speed = (run ? RUN_SPEED : WALK_SPEED) * this.speed;
        const dx = b.tx - this.pos.x;
        const step = speed * dt;
        if (Math.abs(dx) <= Math.max(8, step) || b.t > 14 / Math.max(0.25, this.speed)) {
          this.pos.x = clamp(b.tx, this.margin, this.w - this.margin);
          return this.endBehavior();
        }
        this.faceToward(b.tx);
        this.pos.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
        const freqScale = run ? 14 : 9;
        this.walkPhase = (this.behavior!.phase += dt * freqScale);
        this.setPose('stand', 12);
        // footsteps
        this.stepSfxPhase += dt * freqScale;
        if (this.stepSfxPhase > Math.PI) {
          this.stepSfxPhase = 0;
          this.hooks.sfx('step');
        }
        break;
      }

      case 'flee': {
        this.faceToward(b.tx);
        const dashOffscreen = Math.abs(b.dir) >= 0.5;
        const sp = RUN_SPEED * (dashOffscreen ? 1.35 : 1.15) * this.speed;
        if (dashOffscreen) {
          this.pos.x += Math.sign(b.tx - this.pos.x) * sp * dt;
          if ((b.dir < 0 && this.pos.x <= -30) || (b.dir > 0 && this.pos.x >= this.w + 30)) {
            this.mode = 'hidden';
            this.alpha = damp(this.alpha, 0, 8, dt);
            if (this.alpha < 0.03) {
              this.alpha = 0;
              return this.endBehavior();
            }
          }
        } else {
          const dx = b.tx - this.pos.x;
          const step = sp * dt;
          if (Math.abs(dx) <= Math.max(10, step)) {
            this.pos.x = b.tx;
            return this.endBehavior();
          }
          this.pos.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
        }
        this.walkPhase = (b.phase += dt * 16);
        this.setPose('stand', 12);
        break;
      }

      case 'hop':
      case 'dodge': {
        // completion happens in land()
        if (this.mode === 'ground') return this.endBehavior();
        break;
      }

      case 'swing': {
        if (!this.rope.attached && this.mode === 'air') {
          // still in the launch hop — attach when we rise a bit
          if (this.vel.y < -60 || this.pos.y < this.groundY - this.size * 1.6) {
            const hand = { x: this.pos.x, y: this.boxTop() + this.size * 0.1 };
            this.rope.attach(b.tx, b.ty, hand.x, hand.y, this.vel.x / 60, this.vel.y / 60);
            this.mode = 'swing';
            this.fx.splat(b.tx, b.ty);
            this.hooks.sfx('thwip');
          }
          break;
        }
        if (this.mode !== 'swing') break;
        const vel = this.rope.velocity(dt);
        const overApex = vel.y < 0 && Math.sign(vel.x || this.facing) === this.facing;
        const hardTimeout = b.t > b.dur + 2.4;
        if ((b.t > b.dur && overApex) || hardTimeout) {
          // Release at the apex, but always release after a short grace period.
          // A perfectly settled rope has no next apex and previously remained
          // attached forever, most visibly at the top-right after refresh.
          const v = this.rope.velocity(dt);
          this.rope.detach();
          this.mode = 'air';
          this.vel = {
            x: clamp(Number.isFinite(v.x) ? v.x * 1.02 : 0, -900, 900),
            y: clamp(Number.isFinite(v.y) ? v.y - 120 : 80, -1000, 700),
          };
          this.setPose('airborne', 10);
          this.hooks.sfx('whoosh');
          // Chain into another swing sometimes. A watchdog-triggered release
          // deliberately lands instead of constructing another stale rope.
          if (!hardTimeout && !b.chained && !this.reducedMotion && chance(0.4)) {
            b.chained = true;
            b.t = 0;
            b.dur = rand(1.2, 2.2) / this.speed;
            const anchor = this.pickAnchor(this.pos.x + this.facing * rand(200, 380));
            b.tx = anchor.x; b.ty = anchor.y;
            // brief free-flight then attach (handled above)
            window.setTimeout(() => {
              if (this.behavior === b && this.mode === 'air' && !this.settingsOpen) {
                const anchor2 = this.pickAnchor(this.pos.x + this.facing * rand(150, 320));
                b.tx = anchor2.x; b.ty = anchor2.y;
                this.rope.attach(anchor2.x, anchor2.y, this.pos.x, this.boxTop() + this.size * 0.1, this.vel.x / 60, this.vel.y / 60);
                this.mode = 'swing';
                this.hooks.sfx('thwip');
              }
            }, 260);
          } else {
            return this.endBehavior(); // the land() call will close out
          }
        }
        break;
      }

      case 'hang': {
        if (b.t > b.dur) {
          // let go — drop and land
          this.rope.detach();
          this.mode = 'air';
          this.vel = { x: rand(-40, 40), y: 60 };
          this.targetRotation = 0;
          this.setPose('airborne', 8);
          return this.endBehavior();
        }
        break;
      }

      case 'perch': {
        if (b.t > b.dur + 2) {
          this.rope.detach();
          this.mode = 'air';
          this.vel = { x: rand(-60, 60), y: 80 };
          this.targetRotation = 0;
          this.setPose('airborne', 8);
          return this.endBehavior();
        }
        break;
      }

      case 'hammock': {
        b.phase += dt;
        const sway = Math.sin(b.phase * 1.6);
        // position on the hammock curve (web itself is drawn in draw())
        const a = this.hammockAnchors.ax;
        const bx = this.hammockAnchors.bx;
        const midX = (a + bx) / 2 + sway * 8;
        const sag = Math.abs(bx - a) * 0.18;
        this.pos.x = damp(this.pos.x, midX, 4, dt);
        this.pos.y = damp(this.pos.y, 78 + sag, 4, dt);
        this.targetRotation = Math.PI / 2 + sway * 0.1;
        if (this.expr !== 'sleepy') this.expr = 'sleepy';
        this.exprHold = 99;
        if (b.t > b.dur) {
          this.exprHold = 0.3;
          this.mode = 'air';
          this.vel = { x: rand(-30, 30), y: 60 };
          this.targetRotation = 0;
          this.setPose('airborne', 7);
          this.swingPump = 0;
          return this.endBehavior();
        }
        if (chance(dt * 0.25)) {
          this.hooks.showBubble('z z z …', this.pos.x + 20, this.pos.y - this.size * 0.7, 1800);
        }
        break;
      }

      case 'crawlWall': {
        const speed = 70 * this.speed;
        const dy = b.ty - this.pos.y;
        if (Math.abs(dy) > 10) {
          this.pos.y += Math.sign(dy) * speed * dt;
          this.walkPhase = (b.phase += dt * 8);
        } else if (b.t > b.dur * 0.55 || chance(dt * 0.3)) {
          // reached the target height: pause, look around
          this.walkPhase = -1;
          if (b.t > b.dur) {
            // scramble back down and hop off
            this.mode = 'ground';
            this.pos.x += -b.wall * 30;
            this.facing = (-b.wall) as 1 | -1;
            this.hiddenEdge = 'none';
            this.setPose('stand', 8);
            return this.endBehavior();
          }
        }
        this.targetRotation = -b.wall * 0.12;
        break;
      }

      case 'peek': {
        this.headTiltTarget = Math.sin(b.t * 1.4) * 0.5 + 0.2;
        if (b.t > b.dur) {
          // slide back into view from whichever edge we were hiding behind
          const cameFromLeft = this.hiddenEdge === 'left';
          this.hiddenEdge = 'none';
          this.pos.x = cameFromLeft ? this.margin + 10 : this.w - this.margin - 10;
          this.facing = cameFromLeft ? 1 : -1;
          this.setPose('stand', 8);
          return this.endBehavior();
        }
        break;
      }

      case 'hide': {
        if (b.t < 1.1) {
          // dash to the edge
          this.pos.x += b.dir * RUN_SPEED * 1.5 * this.speed * dt;
          this.walkPhase = (b.phase += dt * 16);
          this.setPose('stand', 12);
        } else {
          this.mode = 'hidden';
          this.alpha = damp(this.alpha, 0, 8, dt);
        }
        if (b.t > b.dur) {
          // cameo roll: sometimes he returns dressed differently…
          const r = Math.random();
          if (r < 0.09) {
            this.paletteId = chance(0.5) ? 'stealth' : 'ghost';
            this.paletteTimer = rand(25, 60);
            this.hooks.showBubble('new suit, who dis?', this.w / 2, this.h * 0.3, 1800);
          }
          this.alpha = 1;
          this.endBehavior();
          this.spawnEntrance();
        }
        break;
      }

      case 'sitGround':
      case 'crouch':
      case 'sleep':
      case 'watch':
      case 'wave':
      case 'idle': {
        if (b.kind === 'sleep' || b.kind === 'sitGround' || b.kind === 'idle') {
          this.headTiltTarget = b.kind === 'idle' ? Math.sin(b.t * 0.8) * 0.14 : 0;
        }
        if (b.kind === 'sleep') {
          this.expr = 'sleepy';
          if (chance(dt * 0.3)) {
            this.hooks.showBubble('z z z', this.pos.x + 26, this.boxTop() - 6, 1600);
          }
        }
        if (b.t > b.dur) {
          return this.endBehavior();
        }
        break;
      }

      case 'landBeat': {
        if (b.t > b.dur) return this.endBehavior();
        break;
      }

      default:
        return this.endBehavior();
    }
  }

  private land(): void {
    this.pos.y = this.groundY;
    this.mode = 'ground';
    this.vel = { x: 0, y: 0 };
    this.targetRotation = 0;
    this.rotation = 0;
    this.squash = 0.72;
    this.setPose('land', 18);
    this.hooks.sfx('land');
    // brief "stick the landing" beat, then the brain picks again
    this.behavior = {
      kind: 'landBeat', t: 0, dur: 0.34, tx: 0, ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 1,
    };
    window.setTimeout(() => {
      if (!this.behavior || this.behavior.kind === 'landBeat') this.setPose('stand', 7);
    }, 320);
  }

  /* ---------------------------------------------------------------- */
  /* Reactions                                                         */
  /* ---------------------------------------------------------------- */

  private reactions(): void {
    if (this.mode === 'hidden' || this.alpha < 0.5) return;
    if (this.fleeCooldown > 0) return;
    if (this.isBusy('flee', 'dodge', 'hop', 'swing', 'hide', 'hammock')) return;

    const headY = this.boxTop() + this.size * 0.4;
    const d = Math.hypot(this.pointer.x - this.pos.x, this.pointer.y - headY);
    const cursorSpeed = Math.hypot(this.pointer.vx, this.pointer.vy);
    const sensitivity = lerp(60, 150, this.frequency);

    // cursor closing in fast & close → make an exit
    if (d < sensitivity && cursorSpeed > 260) {
      this.fleeCooldown = 1.4;
      if (chance(0.3) && !this.reducedMotion) {
        this.startSwing(this.pos.x + (this.pos.x > this.pointer.x ? 1 : -1) * rand(200, 340));
      } else {
        this.behavior = {
          kind: 'flee', t: 0, dur: 0.8,
          tx: clamp(this.pos.x + (this.pos.x > this.pointer.x ? 1 : -1) * rand(180, 320), this.margin, this.w - this.margin),
          ty: 0, wall: 1, phase: 0, chained: false, released: false, dir: 0.001, // dir reused as "stay on screen" flag
        };
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Easter eggs                                                       */
  /* ---------------------------------------------------------------- */

  private eggTick(dt: number): void {
    this.globalEggGap = Math.max(0, this.globalEggGap - dt);
    (Object.keys(this.eggs) as Array<keyof typeof this.eggs>).forEach((k) => {
      this.eggs[k] = Math.max(0, this.eggs[k] - dt);
    });

    if (this.tiny.active) {
      this.tiny.x += dt * (this.w + 60) / 14;
      if (this.tiny.x > this.w + 40) this.tiny.active = false;
    }
    if (this.logo.active) {
      this.logo.t += dt;
      if (this.logo.t > 6) this.logo.active = false;
    }

    if (this.globalEggGap > 0 || this.mode === 'hidden' || !chance(dt * 0.02)) return;

    const ready = (Object.keys(this.eggs) as Array<keyof typeof this.eggs>).filter((k) => this.eggs[k] <= 0);
    if (!ready.length) return;
    const kind = ready[Math.floor(Math.random() * ready.length)];

    switch (kind) {
      case 'tinySpider':
        this.tiny = { x: -40, active: true };
        this.eggs.tinySpider = rand(160, 420);
        break;
      case 'webLogo':
        this.logo = { t: 0, active: true };
        this.eggs.webLogo = rand(220, 520);
        break;
      case 'quip':
        if (this.alpha > 0.6) {
          this.hooks.showBubble(randomQuip(), this.pos.x, this.boxTop() - 14, 2600);
          this.eggs.quip = rand(70, 160);
        }
        break;
      case 'searchHang': {
        const r = this.hooks.searchRect();
        if (r && this.mode === 'ground' && !this.reducedMotion) {
          this.startHang(r.x + r.width / 2 + rand(-40, 40));
          this.hooks.showBubble('mind if I hang here?', r.x + r.width / 2, r.y + r.height + 60, 2400);
          this.eggs.searchHang = rand(180, 460);
        }
        break;
      }
      case 'paletteSwap':
        // rolled at hide-time; nothing to do here directly
        this.eggs.paletteSwap = rand(200, 500);
        break;
    }
    this.globalEggGap = rand(50, 100);
  }

  /* ---------------------------------------------------------------- */
  /* Draw                                                              */
  /* ---------------------------------------------------------------- */

  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    const quality = this.performanceMode ? 0.5 : 1;

    this.fx.update(this.frameDt);
    this.fx.render(ctx);

    /* webs behind / around the character */
    if (this.behavior?.kind === 'hammock') {
      const a = { x: this.hammockAnchors.ax, y: 78 };
      const b2 = { x: this.hammockAnchors.bx, y: 78 };
      drawHammock(ctx, a, b2, this.behavior.phase * 1.6, this.alpha);
    } else if (this.mode === 'swing' && this.rope.attached) {
      this.rope.render(ctx, this.hooks.accent());
    } else if (this.mode === 'hang' && this.rope.attached) {
      // a simple taut strand while hanging / perching
      ctx.save();
      ctx.strokeStyle = 'rgba(240,244,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.rope.anchor.x, this.rope.anchor.y);
      ctx.lineTo(this.pos.x, this.boxTop() + this.size * 0.04);
      ctx.stroke();
      ctx.restore();
    }

    /* the webhead */
    if (this.alpha > 0.01) {
      const bk = this.behavior?.kind;
      const state: RenderState = {
        x: this.pos.x,
        y: this.boxTop(),
        rotation: this.rotation,
        facing: this.facing,
        size: this.size,
        alpha: this.alpha,
        squash: this.squash,
        pose: this.pose,
        headTilt: this.headTilt,
        lookX: this.lookX,
        lookY: this.lookY,
        blink: this.blink,
        expr: this.expr,
        palette: PALETTES[this.paletteId],
        walkPhase: this.walkPhase,
        run: bk === 'run' || bk === 'flee' ? 1 : bk === 'walk' ? 0.12 : bk === 'hide' ? 0.9 : 0,
        breathe: this.breathe,
        hidden: this.hiddenEdge,
        quality,
      };
      drawSpider(ctx, state);
    }

    /* eggs */
    if (this.tiny.active) {
      drawTinySpider(ctx, this.tiny.x, 12, this.tiny.x / 40, 1.1);
    }
    if (this.logo.active) {
      const t = this.logo.t;
      const alpha = t < 0.4 ? t / 0.4 : t > 4.6 ? Math.max(0, 1 - (t - 4.6) / 1.4) : 1;
      const progress = Math.min(1, t / 1.8);
      drawWebLogo(ctx, this.w - 110, this.h - 110, 52, progress, alpha);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Moods surface (for debugging / status line in popup)              */
  /* ---------------------------------------------------------------- */

  currentMood(): Mood {
    return (this.brain as Brain).mood;
  }

  isActive(): boolean {
    return this.mode !== 'hidden' && this.alpha > 0.1;
  }
}
