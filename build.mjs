/**
 * HyprTab build script.
 * Bundles the TypeScript sources into plain JS bundles under ./js
 * (the directory Chrome loads from). No framework, no dev server —
 * the extension runs fully offline from these static files.
 */
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** Entry points → output bundles. All run as classic scripts (IIFE). */
const entries = {
  newtab: 'src/newtab/index.ts',
  popup: 'src/popup/popup.ts',
  background: 'src/background/background.ts',
  content: 'src/content/content.ts',
};

const config = {
  entryPoints: Object.fromEntries(
    Object.entries(entries).map(([name, file]) => [name, file]),
  ),
  outdir: 'js',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('[hypertab] watching for changes…');
} else {
  await build(config);
  console.log('[hypertab] build complete → ./js');
}
