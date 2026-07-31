import { Buffer } from "node:buffer";

import { sha256 } from "@glyphkiln/core";

export const RENDER_BLOB_LIMITS = {
  manifestBytes: 1 * 1024 * 1024,
  outputBytes: 64 * 1024 * 1024,
} as const;

const RENDER_BLOB_PURPOSES = new Set<string>(["render-manifest", "render-output"]);

export type RenderBlobPurpose = "render-manifest" | "render-output";

export type RenderBlobMediaType =
  "application/vnd.glyphkiln.manifest+json" | "image/png" | "image/svg+xml";

export type RenderBlobAddress = {
  readonly workspaceId: string;
  readonly purpose: RenderBlobPurpose;
  readonly sha256: string;
};

export type StoredRenderBlob = RenderBlobAddress & {
  readonly byteSize: number;
  readonly key: string;
  readonly mediaType: RenderBlobMediaType;
};

export type StoreRenderBlobInput = {
  readonly workspaceId: string;
  readonly purpose: RenderBlobPurpose;
  readonly mediaType: RenderBlobMediaType;
  readonly bytes: Uint8Array;
  readonly expectedSha256?: string;
};

export type RenderBlobMetadata = RenderBlobAddress & {
  readonly byteSize: number;
  readonly key: string;
};

export type RenderBlobStorage = {
  put(input: StoreRenderBlobInput): Promise<StoredRenderBlob>;
  read(address: RenderBlobAddress): Promise<Uint8Array>;
  head(address: RenderBlobAddress): Promise<RenderBlobMetadata | undefined>;
  ready(): Promise<void>;
};

export type RenderBlobStorageErrorCode =
  | "BLOB_CORRUPTED"
  | "BLOB_HASH_MISMATCH"
  | "BLOB_NOT_FOUND"
  | "BLOB_TOO_LARGE"
  | "INVALID_BLOB_ADDRESS"
  | "INVALID_BLOB_MEDIA_TYPE"
  | "STORAGE_UNAVAILABLE";

export class RenderBlobStorageError extends Error {
  constructor(
    public readonly code: RenderBlobStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RenderBlobStorageError";
  }
}

export function prepareRenderBlob(input: StoreRenderBlobInput): StoredRenderBlob {
  assertWorkspaceId(input.workspaceId);
  assertMediaType(input.purpose, input.mediaType);
  assertByteSize(input.purpose, input.bytes.byteLength);
  const digest = sha256(input.bytes);
  if (
    input.expectedSha256 !== undefined &&
    input.expectedSha256.toLowerCase() !== digest
  ) {
    throw new RenderBlobStorageError(
      "BLOB_HASH_MISMATCH",
      "The stored bytes do not match the expected SHA-256 digest.",
    );
  }
  return {
    workspaceId: input.workspaceId,
    purpose: input.purpose,
    mediaType: input.mediaType,
    sha256: digest,
    byteSize: input.bytes.byteLength,
    key: renderBlobKey({
      workspaceId: input.workspaceId,
      purpose: input.purpose,
      sha256: digest,
    }),
  };
}

export function renderBlobKey(address: RenderBlobAddress): string {
  assertRenderBlobAddress(address);
  const encodedWorkspace = Buffer.from(address.workspaceId, "utf8").toString(
    "base64url",
  );
  return [
    "workspaces",
    encodedWorkspace,
    address.purpose,
    "sha256",
    address.sha256.slice(0, 2),
    address.sha256,
  ].join("/");
}

export function assertRenderBlobAddress(address: RenderBlobAddress): void {
  assertWorkspaceId(address.workspaceId);
  if (!RENDER_BLOB_PURPOSES.has(address.purpose)) {
    throw new RenderBlobStorageError(
      "INVALID_BLOB_ADDRESS",
      "The render-blob purpose is not supported.",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(address.sha256)) {
    throw new RenderBlobStorageError(
      "INVALID_BLOB_ADDRESS",
      "The render-blob digest must be a lowercase SHA-256 value.",
    );
  }
}

export function assertStoredBlobIntegrity(
  address: RenderBlobAddress,
  bytes: Uint8Array,
): void {
  assertRenderBlobAddress(address);
  assertByteSize(address.purpose, bytes.byteLength);
  if (sha256(bytes) !== address.sha256) {
    throw new RenderBlobStorageError(
      "BLOB_CORRUPTED",
      "Stored render bytes failed their content-address integrity check.",
    );
  }
}

export function maximumRenderBlobBytes(purpose: RenderBlobPurpose): number {
  return purpose === "render-manifest"
    ? RENDER_BLOB_LIMITS.manifestBytes
    : RENDER_BLOB_LIMITS.outputBytes;
}

function assertWorkspaceId(workspaceId: string): void {
  if (
    workspaceId.length < 1 ||
    workspaceId.length > 128 ||
    !isWellFormed(workspaceId)
  ) {
    throw new RenderBlobStorageError(
      "INVALID_BLOB_ADDRESS",
      "A valid workspace identity is required for every stored render blob.",
    );
  }
}

function assertByteSize(purpose: RenderBlobPurpose, byteSize: number): void {
  const maximum = maximumRenderBlobBytes(purpose);
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maximum) {
    throw new RenderBlobStorageError(
      "BLOB_TOO_LARGE",
      `The ${purpose} bytes must contain between 1 and ${String(maximum)} bytes.`,
    );
  }
}

function assertMediaType(
  purpose: RenderBlobPurpose,
  mediaType: RenderBlobMediaType,
): void {
  const valid =
    purpose === "render-manifest"
      ? mediaType === "application/vnd.glyphkiln.manifest+json"
      : mediaType === "image/png" || mediaType === "image/svg+xml";
  if (!valid) {
    throw new RenderBlobStorageError(
      "INVALID_BLOB_MEDIA_TYPE",
      "The media type does not match the render-blob purpose.",
    );
  }
}

function isWellFormed(input: string): boolean {
  return typeof input.isWellFormed !== "function" || input.isWellFormed();
}
