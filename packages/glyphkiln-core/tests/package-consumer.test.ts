import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { expectProcessFailureStderr } from "./helpers.js";

const execFileAsync = promisify(execFile);
const packageConsumer = resolve("scripts/test-package-consumer.mjs");

it("rejects an empty package spec before creating consumer files", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-package-consumer-test-"),
  );

  try {
    await expect(
      packageConsumerFailure({
        ...process.env,
        GLYPHKILN_PACKAGE_SPEC: "   ",
        TEMP: temporaryRoot,
        TMP: temporaryRoot,
        TMPDIR: temporaryRoot,
      }),
    ).resolves.toContain("GLYPHKILN_PACKAGE_SPEC must not be empty when provided.");
    await expect(readdir(temporaryRoot)).resolves.toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

it("installs a selected archive relative to the invocation directory", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "glyphkiln-selected-package-test-"),
  );

  try {
    const { stdout: packOutput } = await execFileAsync(
      "npm",
      ["pack", "--pack-destination", temporaryRoot, "--silent"],
      { cwd: resolve(".") },
    );
    const archiveName = packOutput.trim().split(/\r?\n/).at(-1);
    if (archiveName === undefined || archiveName.length === 0) {
      throw new Error("npm pack did not report an archive name.");
    }

    const { stdout } = await execFileAsync(process.execPath, [packageConsumer], {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        GLYPHKILN_PACKAGE_SPEC: `./${archiveName}`,
      },
    });
    expect(stdout).toContain(
      "Fresh published-package JavaScript, TypeScript, schema-subpath, installed-bin, and isolated consumers passed.",
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);

async function packageConsumerFailure(env: NodeJS.ProcessEnv): Promise<string> {
  return expectProcessFailureStderr(
    () => execFileAsync(process.execPath, [packageConsumer], { env }),
    "Expected package consumer to fail.",
  );
}
