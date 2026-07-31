import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { build } from "esbuild";

import { appRoot } from "./standalone-paths.mjs";

const outputRoot = join(appRoot, ".worker");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await build({
  absWorkingDir: appRoot,
  bundle: true,
  entryPoints: ["src/server/render-worker/worker-entry.ts"],
  external: ["@glyphkiln/core"],
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  outfile: join(outputRoot, "worker.mjs"),
  platform: "node",
  sourcemap: false,
  target: "node22",
});
await cp(
  join(appRoot, "src/server/persistence/migrations"),
  join(outputRoot, "migrations"),
  { recursive: true },
);
