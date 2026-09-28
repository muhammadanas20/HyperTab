import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "hypertab-tests-"));
try {
  for (const name of ["rig", "controller"]) {
    const out = join(dir, `${name}.cjs`);
    await build({
      entryPoints: [`tests/${name}.test.ts`],
      outfile: out,
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      logLevel: "warning",
    });
    execFileSync(process.execPath, [out], { stdio: "inherit" });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
