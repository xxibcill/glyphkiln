import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishImmutableFile } from "./immutable-file-publication";

describe("publishImmutableFile", () => {
  let temporaryRoot: string;
  let target: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-publication-test-"));
    target = join(temporaryRoot, "objects", "immutable.bin");
    await mkdir(join(temporaryRoot, "objects"));
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("publishes once and verifies an existing immutable target", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const verifyExisting = vi.fn(() => Promise.resolve());

    await expect(
      publishImmutableFile({
        target,
        bytes,
        fileMode: 0o600,
        verifyExisting,
      }),
    ).resolves.toBe("stored");
    await expect(
      publishImmutableFile({
        target,
        bytes,
        fileMode: 0o600,
        verifyExisting,
      }),
    ).resolves.toBe("already-present");

    expect(verifyExisting).toHaveBeenCalledOnce();
    await expect(readFile(target)).resolves.toEqual(Buffer.from(bytes));
  });
});
