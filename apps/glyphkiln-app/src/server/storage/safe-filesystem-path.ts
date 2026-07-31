import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export class UnsafeStoragePathError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnsafeStoragePathError";
  }
}

export function isMissingStoragePathError(
  error: unknown,
): error is UnsafeStoragePathError {
  return error instanceof UnsafeStoragePathError && isErrno(error.cause, "ENOENT");
}

export async function ensureContainedDirectory(
  rootDirectory: string,
  targetDirectory: string,
  mode: number,
): Promise<void> {
  const { root, segments } = containedSegments(rootDirectory, targetDirectory);
  await mkdir(root, { recursive: true, mode });
  await assertDirectory(root);

  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      await mkdir(current, { mode });
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
    }
    await assertDirectory(current);
  }
}

export async function assertContainedDirectory(
  rootDirectory: string,
  targetDirectory: string,
): Promise<void> {
  const { root, segments } = containedSegments(rootDirectory, targetDirectory);
  await assertDirectory(root);

  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    await assertDirectory(current);
  }
}

export async function syncDirectory(directory: string): Promise<void> {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY;
  const handle = await open(directory, flags);
  try {
    const information = await handle.stat();
    if (!information.isDirectory()) {
      throw new UnsafeStoragePathError("A storage path component is not a directory.");
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function containedSegments(
  rootDirectory: string,
  targetDirectory: string,
): { readonly root: string; readonly segments: readonly string[] } {
  const root = resolve(rootDirectory);
  const target = resolve(targetDirectory);
  if (!isAbsolute(rootDirectory)) {
    throw new UnsafeStoragePathError("The storage root must be an absolute directory.");
  }
  const location = relative(root, target);
  if (location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new UnsafeStoragePathError("A storage path escaped the configured root.");
  }
  return {
    root,
    segments: location === "" ? [] : location.split(sep),
  };
}

async function assertDirectory(path: string): Promise<void> {
  let information: Awaited<ReturnType<typeof lstat>>;
  try {
    information = await lstat(path);
  } catch (error) {
    throw new UnsafeStoragePathError("A storage directory could not be inspected.", {
      cause: error,
    });
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new UnsafeStoragePathError(
      "Storage path components must be non-symbolic-link directories.",
    );
  }
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
