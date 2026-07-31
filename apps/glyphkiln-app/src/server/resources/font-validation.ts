import { FontRegistry, GlyphkilnError, RENDER_RESOURCE_LIMITS } from "@glyphkiln/core";

import { ResourceIngestionError } from "./errors";
import type { FontMediaType, FontStyle } from "./types";

const MAX_SFNT_TABLES = 512;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function invalidFont(
  message: string,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown,
): ResourceIngestionError {
  return new ResourceIngestionError(
    message,
    "RESOURCE_BYTES_INVALID",
    details,
    cause === undefined ? undefined : { cause },
  );
}

function hasTrueTypeSignature(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0x00 &&
      bytes[1] === 0x01 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x00) ||
    ascii(bytes, 0, 4) === "true"
  );
}

function assertFontSignature(bytes: Uint8Array, mediaType: FontMediaType): void {
  const matches =
    mediaType === "font/ttf"
      ? hasTrueTypeSignature(bytes)
      : ascii(bytes, 0, 4) === "OTTO";
  if (!matches) {
    throw invalidFont(`Font signature does not match ${mediaType}.`);
  }
}

function requiredTables(mediaType: FontMediaType): ReadonlySet<string> {
  const common = ["cmap", "head", "maxp", "name"];
  return new Set(mediaType === "font/ttf" ? [...common, "glyf", "loca"] : common);
}

export function inspectFontEnvelope(bytes: Uint8Array, mediaType: FontMediaType): void {
  if (bytes.byteLength > RENDER_RESOURCE_LIMITS.maxFontBytes) {
    throw invalidFont("The font exceeds the per-file byte limit.", {
      maximum: RENDER_RESOURCE_LIMITS.maxFontBytes,
      actual: bytes.byteLength,
    });
  }
  if (bytes.byteLength < 12) {
    throw invalidFont("The font header is incomplete.");
  }
  assertFontSignature(bytes, mediaType);

  const tableCount = readUint16(bytes, 4);
  const directoryEnd = 12 + tableCount * 16;
  if (
    tableCount < 1 ||
    tableCount > MAX_SFNT_TABLES ||
    directoryEnd > bytes.byteLength
  ) {
    throw invalidFont("The font table directory is malformed.");
  }

  const seenTables = new Set<string>();
  for (let index = 0; index < tableCount; index += 1) {
    const entryOffset = 12 + index * 16;
    const tag = ascii(bytes, entryOffset, 4);
    const tableOffset = readUint32(bytes, entryOffset + 8);
    const tableLength = readUint32(bytes, entryOffset + 12);
    if (
      seenTables.has(tag) ||
      tableOffset > bytes.byteLength ||
      tableLength > bytes.byteLength - tableOffset
    ) {
      throw invalidFont("The font table directory is malformed.");
    }
    seenTables.add(tag);
  }

  for (const table of requiredTables(mediaType)) {
    if (!seenTables.has(table)) {
      throw invalidFont(`The font is missing the required ${table} table.`);
    }
  }
  if (mediaType === "font/otf" && !seenTables.has("CFF ") && !seenTables.has("CFF2")) {
    throw invalidFont("The OpenType font has no supported CFF outline table.");
  }
}

export function validateFontBytes(input: {
  bytes: Uint8Array;
  contentHash: string;
  family: string;
  weight: number;
  style: FontStyle;
}): void {
  try {
    const registry = new FontRegistry([
      {
        family: input.family,
        weight: input.weight,
        style: input.style,
        sha256: input.contentHash,
        bytes: input.bytes,
      },
    ]);
    const width = registry.measure(
      "Glyphkiln 0123",
      input.family,
      input.weight,
      input.style,
      16,
    );
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("Decoded font produced invalid metrics.");
    }
  } catch (cause) {
    throw invalidFont(
      "The font did not pass complete parser and metric validation.",
      {
        validationCode:
          cause instanceof GlyphkilnError ? cause.code : "FONT_DECODE_FAILED",
      },
      cause,
    );
  }
}
