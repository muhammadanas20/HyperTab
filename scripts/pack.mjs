/**
 * Pack the extension for Chrome Web Store upload:
 * builds, then zips exactly the files Chrome needs (no sources, no node_modules).
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const INCLUDE = [
  'manifest.json',
  'newtab.html',
  'popup.html',
  'js',
  'lib',
  'styles',
  'assets/icons',
  'assets/links',
  'assets/wallpapers',
];

console.log('[pack] building…');
execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });

const outDir = join(ROOT, 'release');
await mkdir(outDir, { recursive: true });
const zipPath = join(outDir, 'hypertab.zip');

const files = [];
async function walk(rel) {
  const abs = join(ROOT, rel);
  const st = await stat(abs);
  if (st.isDirectory()) {
    for (const entry of await readdir(abs)) await walk(join(rel, entry));
  } else if (!rel.endsWith('.map')) {
    files.push(rel);
  }
}
for (const item of INCLUDE) {
  if (existsSync(join(ROOT, item))) await walk(item);
}

/* minimal zip writer via system `zip` (available on mac/linux); falls back to a folder copy */
try {
  execFileSync('zip', ['-q', '-r', relative(ROOT, zipPath), ...INCLUDE], { cwd: ROOT, stdio: 'inherit' });
  console.log(`[pack] wrote ${zipPath}`);
} catch {
  console.log('[pack] `zip` binary not found — file list staged instead:');
  files.forEach((f) => console.log('  ', f));
  console.log('[pack] write these into any zip to upload.');
}
