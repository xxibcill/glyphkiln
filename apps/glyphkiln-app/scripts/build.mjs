import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { appRoot } from "./standalone-paths.mjs";
import { removeCorePackageStage, stageCorePackage } from "./stage-core-package.mjs";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");

try {
  await stageCorePackage();
  await runNode(nextCli, ["build"]);
  await runNode(join(appRoot, "scripts/package-standalone.mjs"));
} finally {
  await removeCorePackageStage();
}

async function runNode(script, arguments_ = []) {
  const child = spawn(process.execPath, [script, ...arguments_], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`${script} exited with code ${String(exitCode)}.`);
  }
}
