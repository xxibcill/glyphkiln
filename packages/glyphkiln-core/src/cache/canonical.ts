import { createHash } from "node:crypto";

import { canonicalJson as canonicalJsonWithoutBytes } from "./canonical-json.js";

export function canonicalJson(value: unknown): string {
  return canonicalJsonWithBytes(value);
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256(canonicalJsonWithBytes(value));
}

function canonicalJsonWithBytes(value: unknown): string {
  return canonicalJsonWithoutBytes(replaceBytesWithHashes(value));
}

function replaceBytesWithHashes(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { $bytesSha256: sha256(value) };
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceBytesWithHashes(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceBytesWithHashes(child)]),
    );
  }
  return value;
}
