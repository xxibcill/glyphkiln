import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = await readFile(join(root, "README.md"), "utf8");
const match = /```ts\n([\s\S]*?)\n```/.exec(readme);
assert.notEqual(match, null, "README.md must contain a TypeScript SDK example.");

const temporaryDirectory = await mkdtemp(join(root, ".glyphkiln-readme-"));
try {
  await writeFile(join(temporaryDirectory, "example.ts"), match[1]);
  await writeFile(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify({
      extends: "../tsconfig.json",
      compilerOptions: {
        noEmit: true,
        rootDir: ".",
      },
      include: ["example.ts"],
      exclude: [],
    })}\n`,
  );
  await execFileAsync(
    process.execPath,
    [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: temporaryDirectory },
  );
  process.stdout.write("README TypeScript SDK example passed.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
