/* Dev-only preview harness: renders the whole pose + gait grid into any 2D context. */
import { drawSpider, POSES, PALETTES } from '../../src/spider/rig';
import type { PoseName, RenderState } from '../../src/spider/rig';

export const GRID_W = 1500;
export const GRID_H = 1960;

const POSE_NAMES: PoseName[] = [
  'stand', 'crouch', 'sit', 'hang', 'swing', 'crawl', 'sleep', 'hammock',
  'watch', 'wave', 'curious', 'airborne', 'land', 'dodge', 'point',
];

export function render(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#12141f';
  ctx.fillRect(0, 0, GRID_W, GRID_H);

  const draw = (
    x: number, y: number, size: number, pose: PoseName,
    extra: Partial<RenderState> = {},
  ): void => {
    drawSpider(ctx, {
      x, y, rotation: 0, facing: 1, size, alpha: 1, squash: 1,
      pose: POSES[pose], headTilt: 0, lookX: 0.3, lookY: 0, blink: 0,
      expr: 'neutral', palette: PALETTES.classic, walkPhase: -1, breathe: 1,
      hidden: 'none', quality: 1, ...extra,
    } as RenderState);
  };

  /* pose grid */
  POSE_NAMES.forEach((name, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 130 + col * 290;
    const y = 40 + row * 330;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '16px monospace';
    ctx.fillText(name, x - 40, y + 300);
    if (name === 'hang') draw(x, y + 270, 250, name, { rotation: Math.PI });
    else if (name === 'hammock') draw(x + 100, y + 150, 250, name, { rotation: Math.PI / 2 });
    else draw(x, y + 20, 250, name);
  });

  /* gait strip: walk + run cycles */
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * Math.PI * 2;
    draw(120 + i * 180, 1060, 200, 'stand', { walkPhase: ph, run: 0.1 });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`walk ${i}`, 90 + i * 180, 1290);
  }
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * Math.PI * 2;
    draw(120 + i * 180, 1330, 200, 'stand', { walkPhase: ph, run: 1 });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`run ${i}`, 95 + i * 180, 1560);
  }
  /* facing flip + small-size legibility check */
  draw(200, 1620, 150, 'stand', { facing: -1 });
  draw(420, 1680, 96, 'stand');
  draw(560, 1710, 64, 'stand');
  draw(660, 1730, 44, 'stand');
  draw(900, 1620, 200, 'point', { facing: -1 });
  draw(1150, 1620, 200, 'crouch', { facing: -1 });
  /* palettes + degraded quality + squash */
  draw(1350, 1620, 200, 'stand', { palette: PALETTES.stealth });
  draw(240, 1800, 130, 'salute', { palette: PALETTES.ghost, rotation: 0.5 });
  draw(450, 1790, 120, 'stand', { quality: 0.5 });
  draw(650, 1790, 120, 'land', { squash: 0.74 });
  draw(850, 1790, 120, 'stand', { quality: 0.5, walkPhase: 2.2, run: 0.1 });
  draw(1050, 1910, 120, 'hang', { rotation: Math.PI, quality: 0.5 });
}

/** Big single-figure sheets for detail inspection. */
export function renderCloseup(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#161a26';
  ctx.fillRect(0, 0, 1500, 1000);
  const draw = (
    x: number, y: number, size: number, pose: PoseName,
    extra: Partial<RenderState> = {},
  ): void => {
    drawSpider(ctx, {
      x, y, rotation: 0, facing: 1, size, alpha: 1, squash: 1,
      pose: POSES[pose], headTilt: 0, lookX: 0.35, lookY: 0, blink: 0,
      expr: 'neutral', palette: PALETTES.classic, walkPhase: -1, breathe: 1,
      hidden: 'none', quality: 1, ...extra,
    } as RenderState);
  };
  draw(230, 65, 810, 'stand');
  draw(700, 65, 810, 'wave');
  draw(1090, 65, 810, 'point');
}

/* browser harness (optional) */
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('c') as HTMLCanvasElement | null;
  if (canvas) {
    render(canvas.getContext('2d')!);
    document.title = 'ready';
  }
}
