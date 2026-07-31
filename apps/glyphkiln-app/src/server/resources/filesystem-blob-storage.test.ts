import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { sha256 } from "@glyphkiln/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSystemResourceBlobStorage } from "./filesystem-blob-storage";

const KEY = `workspaces/${"a".repeat(64)}/resources/raster-asset/ab/${"b".repeat(64)}`;
const BYTES = Uint8Array.from([1, 2, 3, 4]);

describe("filesystem resource blob storage", () => {
  let temporaryRoot: string;
  let storageRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-resource-test-"));
    storageRoot = join(temporaryRoot, "store");
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("atomically stores immutable bytes and validates duplicates", async () => {
    const storage = new FileSystemResourceBlobStorage(storageRoot);
    const contentHash = sha256(BYTES);

    await expect(storage.putImmutable(KEY, contentHash, BYTES)).resolves.toBe("stored");
    await expect(storage.putImmutable(KEY, contentHash, BYTES)).resolves.toBe(
      "already-present",
    );
    await expect(storage.readBounded(KEY, BYTES.byteLength)).resolves.toEqual(BYTES);
    await expect(storage.readBounded(KEY, BYTES.byteLength - 1)).rejects.toMatchObject({
      code: "RESOURCE_STORAGE_INTEGRITY_ERROR",
    });
  });

  it("rejects traversal keys and symlinks without following them", async () => {
    const storage = new FileSystemResourceBlobStorage(storageRoot);
    await expect(
      storage.putImmutable("../outside", sha256(BYTES), BYTES),
    ).rejects.toMatchObject({ code: "RESOURCE_STORAGE_INTEGRITY_ERROR" });

    const target = join(storageRoot, ...KEY.split("/"));
    const outside = join(temporaryRoot, "outside.bin");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(outside, BYTES);
    await symlink(outside, target);

    await expect(storage.readBounded(KEY, BYTES.byteLength)).rejects.toMatchObject({
      code: "RESOURCE_STORAGE_INTEGRITY_ERROR",
    });
    await expect(storage.putImmutable(KEY, sha256(BYTES), BYTES)).rejects.toMatchObject(
      { code: "RESOURCE_STORAGE_INTEGRITY_ERROR" },
    );
  });

  it("rejects a symbolic link in an intermediate object directory", async () => {
    const storage = new FileSystemResourceBlobStorage(storageRoot);
    const outside = join(temporaryRoot, "outside-directory");
    await mkdir(storageRoot, { recursive: true });
    await mkdir(outside);
    await symlink(outside, join(storageRoot, "workspaces"));

    await expect(storage.putImmutable(KEY, sha256(BYTES), BYTES)).rejects.toMatchObject(
      { code: "RESOURCE_STORAGE_INTEGRITY_ERROR" },
    );
    await expect(storage.readBounded(KEY, BYTES.byteLength)).rejects.toMatchObject({
      code: "RESOURCE_STORAGE_INTEGRITY_ERROR",
    });
  });

  it("requires a non-root absolute storage directory", () => {
    expect(() => new FileSystemResourceBlobStorage("relative/store")).toThrow(
      "non-root absolute",
    );
    expect(() => new FileSystemResourceBlobStorage("/")).toThrow("non-root absolute");
  });
});
