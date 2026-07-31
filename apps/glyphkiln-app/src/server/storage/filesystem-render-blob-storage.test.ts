import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FileSystemRenderBlobStorage,
  RENDER_BLOB_LIMITS,
  RenderBlobStorageError,
} from "./index";

describe("FileSystemRenderBlobStorage", () => {
  let temporaryRoot: string;
  let storageRoot: string;
  let storage: FileSystemRenderBlobStorage;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-render-storage-"));
    storageRoot = join(temporaryRoot, "objects");
    storage = new FileSystemRenderBlobStorage(storageRoot);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("stores immutable content by hash and deduplicates within a workspace", async () => {
    const bytes = new TextEncoder().encode("<svg>inert</svg>");
    const first = await storage.put({
      workspaceId: "workspace-a",
      purpose: "render-output",
      mediaType: "image/svg+xml",
      bytes,
    });
    const duplicate = await storage.put({
      workspaceId: "workspace-a",
      purpose: "render-output",
      mediaType: "image/svg+xml",
      bytes: Uint8Array.from(bytes),
    });
    expect(duplicate).toEqual(first);
    await expect(storage.read(first)).resolves.toEqual(bytes);
    await expect(storage.head(first)).resolves.toMatchObject({
      key: first.key,
      byteSize: bytes.byteLength,
    });
  });

  it("derives traversal-safe workspace paths and prevents cross-workspace reads", async () => {
    const stored = await storage.put({
      workspaceId: "../workspace-a/../../outside",
      purpose: "render-manifest",
      mediaType: "application/vnd.glyphkiln.manifest+json",
      bytes: new TextEncoder().encode('{"ok":true}\n'),
    });
    expect(stored.key).toMatch(/^workspaces\/[A-Za-z0-9_-]+\//);
    expect(stored.key).not.toContain("..");
    await expect(
      storage.read({
        workspaceId: "workspace-b",
        purpose: stored.purpose,
        sha256: stored.sha256,
      }),
    ).rejects.toMatchObject({ code: "BLOB_NOT_FOUND" });
  });

  it("rejects hash mismatches and media types outside the fixed purpose", async () => {
    await expect(
      storage.put({
        workspaceId: "workspace-a",
        purpose: "render-output",
        mediaType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "BLOB_HASH_MISMATCH" });
    await expect(
      storage.put({
        workspaceId: "workspace-a",
        purpose: "render-manifest",
        mediaType: "image/png",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "INVALID_BLOB_MEDIA_TYPE" });
  });

  it("bounds reads before allocation when an immutable object is replaced", async () => {
    const stored = await storage.put({
      workspaceId: "workspace-a",
      purpose: "render-manifest",
      mediaType: "application/vnd.glyphkiln.manifest+json",
      bytes: new TextEncoder().encode('{"ok":true}\n'),
    });
    const path = join(storageRoot, ...stored.key.split("/"));
    await truncate(path, RENDER_BLOB_LIMITS.manifestBytes + 1);
    await expect(storage.read(stored)).rejects.toMatchObject({
      code: "BLOB_CORRUPTED",
    });
    await expect(
      storage.put({
        workspaceId: stored.workspaceId,
        purpose: stored.purpose,
        mediaType: stored.mediaType,
        bytes: new TextEncoder().encode('{"ok":true}\n'),
      }),
    ).rejects.toMatchObject({ code: "BLOB_CORRUPTED" });
  });

  it("does not follow a symbolic link substituted for an object", async () => {
    const stored = await storage.put({
      workspaceId: "workspace-a",
      purpose: "render-manifest",
      mediaType: "application/vnd.glyphkiln.manifest+json",
      bytes: new TextEncoder().encode('{"ok":true}\n'),
    });
    const target = join(storageRoot, ...stored.key.split("/"));
    const outside = join(temporaryRoot, "outside");
    await writeFile(outside, '{"ok":true}\n');
    await unlink(target);
    await symlink(outside, target);
    await expect(storage.read(stored)).rejects.toEqual(
      expect.objectContaining<Partial<RenderBlobStorageError>>({
        code: "BLOB_CORRUPTED",
      }),
    );
    await expect(storage.head(stored)).rejects.toMatchObject({
      code: "BLOB_CORRUPTED",
    });
  });

  it("rejects a symbolic link in an intermediate object directory", async () => {
    const outside = join(temporaryRoot, "outside-directory");
    await storage.ready();
    await mkdir(outside);
    await symlink(outside, join(storageRoot, "workspaces"));
    const bytes = new TextEncoder().encode('{"ok":true}\n');

    await expect(
      storage.put({
        workspaceId: "workspace-a",
        purpose: "render-manifest",
        mediaType: "application/vnd.glyphkiln.manifest+json",
        bytes,
      }),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });

    await expect(
      storage.read({
        workspaceId: "workspace-a",
        purpose: "render-manifest",
        sha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "BLOB_CORRUPTED" });
  });

  it("requires a bounded absolute storage root", () => {
    expect(() => new FileSystemRenderBlobStorage("relative/storage")).toThrow(
      "non-root absolute",
    );
    expect(() => new FileSystemRenderBlobStorage("/")).toThrow("non-root absolute");
  });
});
