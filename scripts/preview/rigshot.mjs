/**
 * rigshot — headless screenshot of the rig preview grid (no browser needed:
 * renders through @napi-rs/canvas in Node).
 * usage: node scripts/preview/rigshot.mjs [outfile]
 */
import { createCanvas } from '@napi-rs/canvas';
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, '../../.work');
const out = process.argv[2] ?? path.join(work, 'rig.png');
mkdirSync(work, { recursive: true });

await build({
  entryPoints: [path.join(here, 'entry.ts')],
  outfile: path.join(work, 'rig.cjs'),
  bundle: true,
  format: 'cjs',
  target: 'node18',
  logLevel: 'warning',
});

const mod = require(path.join(work, 'rig.cjs'));
const mode = process.argv[3] ?? 'grid';
const W = mode === 'closeup' ? 1500 : mod.GRID_W;
const H = mode === 'closeup' ? 1000 : mod.GRID_H;
const canvas = createCanvas(W, H);
(mode === 'closeup' ? mod.renderCloseup : mod.render)(canvas.getContext('2d'));
writeFileSync(out, canvas.toBuffer('image/png'));
console.log('shot →', out);
