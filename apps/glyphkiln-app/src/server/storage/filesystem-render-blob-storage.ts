import { constants } from "node:fs";
import { access, link, lstat, open, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

import {
  assertRenderBlobAddress,
  assertStoredBlobIntegrity,
  maximumRenderBlobBytes,
  prepareRenderBlob,
  renderBlobKey,
  RenderBlobStorageError,
  type RenderBlobAddress,
  type RenderBlobMetadata,
  type RenderBlobStorage,
  type StoreRenderBlobInput,
  type StoredRenderBlob,
} from "./content-addressed-storage";
import {
  assertContainedDirectory,
  ensureContainedDirectory,
  isMissingStoragePathError,
  syncDirectory,
  UnsafeStoragePathError,
} from "./safe-filesystem-path";

export class FileSystemRenderBlobStorage implements RenderBlobStorage {
  readonly #root: string;

  constructor(rootDirectory: string) {
    const normalized = resolve(rootDirectory);
    if (
      rootDirectory.trim().length === 0 ||
      !isAbsolute(rootDirectory) ||
      normalized === parse(normalized).root
    ) {
      throw new RenderBlobStorageError(
        "STORAGE_UNAVAILABLE",
        "Render storage must use a non-root absolute directory.",
      );
    }
    this.#root = normalized;
  }

  async ready(): Promise<void> {
    try {
      await ensureContainedDirectory(this.#root, this.#root, 0o700);
      const information = await stat(this.#root);
      if (!information.isDirectory()) throw new Error("not a directory");
      await access(this.#root, constants.R_OK | constants.W_OK);
    } catch {
      throw new RenderBlobStorageError(
        "STORAGE_UNAVAILABLE",
        "The render storage directory is not readable and writable.",
      );
    }
  }

  async put(input: StoreRenderBlobInput): Promise<StoredRenderBlob> {
    const prepared = prepareRenderBlob(input);
    const target = this.#pathFor(prepared);
    const directory = resolve(target, "..");
    await this.ready();
    try {
      await ensureContainedDirectory(this.#root, directory, 0o700);
      const temporary = join(
        directory,
        `.${prepared.sha256}.${randomBytes(12).toString("hex")}.tmp`,
      );
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(input.bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, target);
      } catch (error) {
        if (!isErrno(error, "EEXIST")) throw error;
        await this.#verifyExisting(prepared, target);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
      await syncDirectory(directory);
      return prepared;
    } catch (error) {
      if (error instanceof RenderBlobStorageError) throw error;
      throw new RenderBlobStorageError(
        "STORAGE_UNAVAILABLE",
        "The content-addressed render blob could not be stored.",
      );
    }
  }

  async read(address: RenderBlobAddress): Promise<Uint8Array> {
    assertRenderBlobAddress(address);
    try {
      const target = this.#pathFor(address);
      await assertContainedDirectory(this.#root, resolve(target, ".."));
      const bytes = await readBoundedRegularFile(target, address);
      assertStoredBlobIntegrity(address, bytes);
      return Uint8Array.from(bytes);
    } catch (error) {
      if (error instanceof RenderBlobStorageError) throw error;
      if (isMissingStoragePathError(error)) {
        throw new RenderBlobStorageError(
          "BLOB_NOT_FOUND",
          "The requested render blob does not exist.",
        );
      }
      if (error instanceof UnsafeStoragePathError) {
        throw new RenderBlobStorageError(
          "BLOB_CORRUPTED",
          "The stored render object has an unsafe parent path.",
        );
      }
      if (isErrno(error, "ENOENT")) {
        throw new RenderBlobStorageError(
          "BLOB_NOT_FOUND",
          "The requested render blob does not exist.",
        );
      }
      throw new RenderBlobStorageError(
        "STORAGE_UNAVAILABLE",
        "The content-addressed render blob could not be read.",
      );
    }
  }

  async head(address: RenderBlobAddress): Promise<RenderBlobMetadata | undefined> {
    assertRenderBlobAddress(address);
    const key = renderBlobKey(address);
    try {
      const target = this.#pathFor(address);
      await assertContainedDirectory(this.#root, resolve(target, ".."));
      const information = await lstat(target);
      if (!information.isFile()) {
        throw new RenderBlobStorageError(
          "BLOB_CORRUPTED",
          "The stored render object is not a regular file.",
        );
      }
      if (
        information.size < 1 ||
        information.size > maximumRenderBlobBytes(address.purpose)
      ) {
        throw new RenderBlobStorageError(
          "BLOB_CORRUPTED",
          "The stored render object exceeds its immutable byte boundary.",
        );
      }
      return {
        ...address,
        byteSize: information.size,
        key,
      };
    } catch (error) {
      if (error instanceof RenderBlobStorageError) throw error;
      if (isMissingStoragePathError(error)) return undefined;
      if (error instanceof UnsafeStoragePathError) {
        throw new RenderBlobStorageError(
          "BLOB_CORRUPTED",
          "The stored render object has an unsafe parent path.",
        );
      }
      if (isErrno(error, "ENOENT")) return undefined;
      throw new RenderBlobStorageError(
        "STORAGE_UNAVAILABLE",
        "The content-addressed render blob metadata could not be read.",
      );
    }
  }

  #pathFor(address: RenderBlobAddress): string {
    const target = join(this.#root, ...renderBlobKey(address).split("/"));
    const location = relative(this.#root, target);
    if (location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)) {
      throw new RenderBlobStorageError(
        "INVALID_BLOB_ADDRESS",
        "The render-blob address escaped the configured storage root.",
      );
    }
    return target;
  }

  async #verifyExisting(address: RenderBlobAddress, target: string): Promise<void> {
    const bytes = await readBoundedRegularFile(target, address);
    assertStoredBlobIntegrity(address, bytes);
  }
}

async function readBoundedRegularFile(
  path: string,
  address: RenderBlobAddress,
): Promise<Uint8Array> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isErrno(error, "ELOOP")) {
      throw new RenderBlobStorageError(
        "BLOB_CORRUPTED",
        "The stored render object must not be a symbolic link.",
      );
    }
    throw error;
  }
  try {
    const information = await handle.stat();
    if (
      !information.isFile() ||
      information.size < 1 ||
      information.size > maximumRenderBlobBytes(address.purpose)
    ) {
      throw new RenderBlobStorageError(
        "BLOB_CORRUPTED",
        "The stored render object exceeds its immutable byte boundary.",
      );
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
