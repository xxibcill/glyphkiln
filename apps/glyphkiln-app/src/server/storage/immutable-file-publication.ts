import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, open, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { syncDirectory } from "./safe-filesystem-path";

export type ImmutableFilePublicationResult = "already-present" | "stored";

export async function publishImmutableFile(input: {
  readonly target: string;
  readonly bytes: Uint8Array;
  readonly fileMode: number;
  readonly verifyExisting: (target: string) => Promise<void>;
}): Promise<ImmutableFilePublicationResult> {
  const directory = dirname(input.target);
  const temporary = join(
    directory,
    `.${basename(input.target)}.${randomBytes(12).toString("hex")}.tmp`,
  );
  let temporaryCreated = false;
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      input.fileMode,
    );
    temporaryCreated = true;
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    let result: ImmutableFilePublicationResult = "stored";
    try {
      await link(temporary, input.target);
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      await input.verifyExisting(input.target);
      result = "already-present";
    }
    await syncDirectory(directory);
    return result;
  } finally {
    if (temporaryCreated) {
      await unlink(temporary).catch(() => undefined);
    }
  }
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
