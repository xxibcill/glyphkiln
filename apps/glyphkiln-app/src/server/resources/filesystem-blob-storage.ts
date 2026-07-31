import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";

import { sha256 } from "@glyphkiln/core";

import {
  assertContainedDirectory,
  ensureContainedDirectory,
  isMissingStoragePathError,
} from "../storage/safe-filesystem-path";
import { publishImmutableFile } from "../storage/immutable-file-publication";
import type { ImmutableBlobWriteResult, ResourceBlobStorage } from "./blob-storage";
import { ResourceIngestionError } from "./errors";

const OBJECT_KEY_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9-]+)*$/u;
const NO_FOLLOW_FLAG = constants.O_NOFOLLOW;

function assertObjectKey(key: string): void {
  if (!OBJECT_KEY_PATTERN.test(key) || key.includes("..")) {
    throw new ResourceIngestionError(
      "The application generated an invalid resource object key.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
}

async function readHandleBounded(
  file: Awaited<ReturnType<typeof open>>,
  maximumBytes: number,
): Promise<Uint8Array> {
  const output = Buffer.alloc(maximumBytes + 1);
  let offset = 0;
  while (offset < output.byteLength) {
    const result = await file.read(output, offset, output.byteLength - offset, offset);
    if (result.bytesRead === 0) {
      break;
    }
    offset += result.bytesRead;
  }
  if (offset > maximumBytes) {
    throw new ResourceIngestionError(
      "An immutable resource blob exceeds its admitted byte size.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  return Uint8Array.from(output.subarray(0, offset));
}

export class FileSystemResourceBlobStorage implements ResourceBlobStorage {
  readonly #root: string;

  public constructor(rootDirectory: string) {
    const normalized = resolve(rootDirectory);
    if (
      rootDirectory.trim().length === 0 ||
      !isAbsolute(rootDirectory) ||
      normalized === parse(normalized).root
    ) {
      throw new Error("A non-root absolute resource storage directory is required.");
    }
    this.#root = normalized;
  }

  public async putImmutable(
    key: string,
    contentHash: string,
    bytes: Uint8Array,
  ): Promise<ImmutableBlobWriteResult> {
    assertObjectKey(key);
    if (sha256(bytes) !== contentHash) {
      throw new ResourceIngestionError(
        "Resource bytes do not match their immutable content hash.",
        "RESOURCE_STORAGE_INTEGRITY_ERROR",
      );
    }

    const target = this.#pathFor(key);
    const directory = dirname(target);
    try {
      await ensureContainedDirectory(this.#root, directory, 0o750);
    } catch (cause) {
      throw storageIntegrityError(cause);
    }
    try {
      return await publishImmutableFile({
        target,
        bytes,
        fileMode: 0o640,
        verifyExisting: async () => {
          const existing = await this.readBounded(key, bytes.byteLength);
          if (
            existing?.byteLength !== bytes.byteLength ||
            sha256(existing) !== contentHash
          ) {
            throw new ResourceIngestionError(
              "An immutable resource object conflicts with admitted bytes.",
              "RESOURCE_STORAGE_INTEGRITY_ERROR",
            );
          }
        },
      });
    } catch (cause) {
      if (cause instanceof ResourceIngestionError) throw cause;
      throw storageIntegrityError(cause);
    }
  }

  public async readBounded(
    key: string,
    maximumBytes: number,
  ): Promise<Uint8Array | null> {
    assertObjectKey(key);
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
      throw new Error("maximumBytes must be a non-negative safe integer.");
    }

    let file: Awaited<ReturnType<typeof open>>;
    try {
      const target = this.#pathFor(key);
      await assertContainedDirectory(this.#root, dirname(target));
      file = await open(target, constants.O_RDONLY | NO_FOLLOW_FLAG);
    } catch (cause) {
      if (isNotFoundError(cause) || isMissingStoragePathError(cause)) {
        return null;
      }
      throw new ResourceIngestionError(
        "An immutable resource object is not a readable regular file.",
        "RESOURCE_STORAGE_INTEGRITY_ERROR",
        undefined,
        { cause },
      );
    }
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > maximumBytes) {
        throw new ResourceIngestionError(
          "An immutable resource object is not a bounded regular file.",
          "RESOURCE_STORAGE_INTEGRITY_ERROR",
        );
      }
      return await readHandleBounded(file, maximumBytes);
    } finally {
      await file.close();
    }
  }

  #pathFor(key: string): string {
    const target = resolve(this.#root, ...key.split("/"));
    if (!target.startsWith(`${this.#root}${sep}`)) {
      throw new ResourceIngestionError(
        "The application generated an invalid resource object key.",
        "RESOURCE_STORAGE_INTEGRITY_ERROR",
      );
    }
    return target;
  }
}

function isNotFoundError(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

function storageIntegrityError(cause: unknown): ResourceIngestionError {
  return new ResourceIngestionError(
    "An immutable resource object has an unsafe storage path.",
    "RESOURCE_STORAGE_INTEGRITY_ERROR",
    undefined,
    { cause },
  );
}
