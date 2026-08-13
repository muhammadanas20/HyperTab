/**
 * Wallpaper engine — owns the background canvas, the render loop and the
 * active scene. Handles DPR scaling, visibility pausing, an FPS watchdog
 * that steps quality down before anything ever feels janky, and the
 * cursor-parallax input smoothing.
 */
import type { SceneFrame } from '../types';
import { clamp, damp } from '../utils/helpers';
import { getScene } from './scenes';
import type { SceneId } from '../types';

export class WallpaperEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene = getScene('cityRain');
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;

  private dpr = 1;
  private w = 0;
  private h = 0;

  /** smoothed parallax target (-1..1) */
  private tx = 0;
  private ty = 0;
  private px = 0;
  private py = 0;
  /** raw cursor position in CSS pixels */
  private mx = -1;
  private my = -1;

  /* fps watchdog */
  private frameCost = 16;
  private quality = 1;

  private frameCtx: SceneFrame;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('[hypertab] wallpaper: 2d context unavailable');
    this.ctx = ctx;

    this.frameCtx = {
      t: 0, dt: 0, sdt: 0, px: 0, py: 0, mx: -1, my: -1,
      particles: 0.7, accent: '#89b4fa', quality: 1,
      rain: true, snow: false, w: 0, h: 0,
    };

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.ty = (e.clientY / window.innerHeight) * 2 - 1;
      this.mx = e.clientX;
      this.my = e.clientY;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });

    this.resize();
  }

  /** Public hooks wired to settings each frame. */
  speed = 1;
  particleAmount = 0.7;
  accent = '#89b4fa';
  rain = true;
  snow = false;
  performanceMode = false;

  setScene(id: SceneId): void {
    if (this.scene.id === id) return;
    this.scene.dispose();
    this.scene = getScene(id);
    this.scene.init(this.canvas, this.ctx);
    this.scene.resize(this.w, this.h, this.dpr);
  }

  resize(): void {
    const targetDpr = this.performanceMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.6);
    this.dpr = targetDpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * targetDpr);
    this.canvas.height = Math.round(this.h * targetDpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.scene.init(this.canvas, this.ctx);
    this.scene.resize(this.w, this.h, targetDpr);
  }

  setPerformanceMode(on: boolean): void {
    if (this.performanceMode === on) return;
    // Set the flag before resize so resize() chooses the new DPR. The old
    // order rebuilt at the previous quality and made this toggle a no-op.
    this.performanceMode = on;
    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const rawDt = clamp((now - this.last) / 1000, 0.0001, 0.05);
      this.last = now;
      this.tick(rawDt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number): void {
    /* fps watchdog — exponential average of frame cost */
    this.frameCost = this.frameCost * 0.95 + dt * 1000 * 0.05;
    const targetQuality = this.performanceMode ? 0.5 : this.frameCost > 26 ? 0.65 : this.frameCost > 20 ? 0.85 : 1;
    this.quality = damp(this.quality, targetQuality, 0.5, dt);

    this.px = damp(this.px, this.tx, 4, dt);
    this.py = damp(this.py, this.ty, 4, dt);

    this.time += dt * this.speed;

    const f = this.frameCtx;
    f.t = this.time;
    f.dt = dt;
    f.sdt = dt * this.speed;
    f.px = this.px;
    f.py = this.py;
    f.mx = this.mx;
    f.my = this.my;
    f.particles = this.particleAmount;
    f.accent = this.accent;
    f.quality = this.quality;
    f.rain = this.rain;
    f.snow = this.snow;
    f.w = this.w;
    f.h = this.h;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene.render(f);
  }
}
