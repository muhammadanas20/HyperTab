/**
 * Scene: Particle Field
 * Abstract plexus — drifting nodes joined by thin accent-tinted lines,
 * gently attracted toward the cursor. Uses a spatial hash so the
 * neighbour search stays O(n).
 */
import type { SceneFrame } from '../../types';
import { rand, rgba, TAU } from '../../utils/helpers';
import { DustOverlay, PostOverlay } from '../overlays';
import { SceneBase, skyGradient } from './common';

interface Node {
  x: number; y: number; vx: number; vy: number; r: number;
}

export class ParticlesScene extends SceneBase {
  readonly id = 'particles' as const;

  private nodes: Node[] = [];
  private dust = new DustOverlay();
  private post = new PostOverlay();
  private linkDist = 130;

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    this.linkDist = Math.max(90, Math.min(160, (w * h) ** 0.5 / 9));
    const count = Math.floor((w * h) / 16000);
    this.nodes = [];
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const sp = rand(8, 26);
      this.nodes.push({
        x: rand(w), y: rand(h),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rand(0.8, 2.4),
      });
    }
    this.dust.resize(w, h);
    this.post.resize(w, h);
  }

  render(f: SceneFrame): void {
    const { ctx } = this;
    const { w, h } = f;

    skyGradient(ctx, w, h, [
      [0, '#04050d'],
      [0.6, '#0a0c1d'],
      [1, '#05060f'],
    ]);

    const budget = Math.floor(this.nodes.length * Math.max(0.15, f.particles) * f.quality);
    const cell = this.linkDist;
    const grid = new Map<number, number[]>();
    const key = (gx: number, gy: number): number => gx * 100000 + gy;

    /* integrate + hash */
    for (let i = 0; i < budget; i++) {
      const n = this.nodes[i];
      // cursor attraction
      if (f.mx >= 0) {
        const dx = f.mx - n.x;
        const dy = f.my - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 460 * 460 && d2 > 60 * 60) {
          const d = Math.sqrt(d2);
          const pull = 14 * f.sdt;
          n.vx += (dx / d) * pull;
          n.vy += (dy / d) * pull;
        }
      }
      n.x += n.vx * f.sdt;
      n.y += n.vy * f.sdt;
      // soft speed cap
      const sp = Math.hypot(n.vx, n.vy);
      const cap = 40;
      if (sp > cap) {
        n.vx = (n.vx / sp) * cap;
        n.vy = (n.vy / sp) * cap;
      }
      if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
      if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;

      const gx = Math.floor(n.x / cell);
      const gy = Math.floor(n.y / cell);
      const k = key(gx, gy);
      let bucket = grid.get(k);
      if (!bucket) {
        bucket = [];
        grid.set(k, bucket);
      }
      bucket.push(i);
    }

    /* links */
    ctx.save();
    ctx.lineWidth = 0.8;
    for (let i = 0; i < budget; i++) {
      const n = this.nodes[i];
      const gx = Math.floor(n.x / cell);
      const gy = Math.floor(n.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(key(gx + ox, gy + oy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const m = this.nodes[j];
            const dx = m.x - n.x;
            const dy = m.y - n.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > this.linkDist * this.linkDist) continue;
            const alpha = (1 - Math.sqrt(d2) / this.linkDist) * 0.34;
            ctx.strokeStyle = rgba(f.accent, alpha);
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }
    }

    /* nodes */
    for (let i = 0; i < budget; i++) {
      const n = this.nodes[i];
      ctx.fillStyle = rgba('#dfe9ff', 0.85);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, TAU);
      ctx.fill();
      if (n.r > 1.8) {
        ctx.fillStyle = rgba(f.accent, 0.16);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    this.dust.render(ctx, f, f.accent);
    this.post.render(ctx, f);
  }

  override dispose(): void {
    this.nodes = [];
  }
}
