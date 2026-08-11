import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

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

async function packageConsumerFailure(env: NodeJS.ProcessEnv): Promise<string> {
  try {
    await execFileAsync(process.execPath, [packageConsumer], { env });
    throw new Error("Expected package consumer to fail.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return error.stderr;
    }
    throw error;
  }
}
