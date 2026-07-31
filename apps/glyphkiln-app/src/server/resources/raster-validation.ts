import {
  AssetRegistry,
  GlyphkilnError,
  RENDER_RESOURCE_LIMITS,
  type AssetOrigin,
} from "@glyphkiln/core";

import { ResourceIngestionError } from "./errors";
import type { RasterMediaType } from "./types";

export type RasterInspection = {
  width: number;
  height: number;
};

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function bytesStartWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.byteLength >= prefix.byteLength &&
    prefix.every((value, index) => bytes[index] === value)
  );
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

function invalidRaster(
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

function inspectPngEnvelope(bytes: Uint8Array): RasterInspection {
  if (!bytesStartWith(bytes, PNG_SIGNATURE)) {
    throw invalidRaster("Raster signature does not match image/png.");
  }
  if (
    bytes.byteLength < 33 ||
    readUint32(bytes, 8) !== 13 ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  ) {
    throw invalidRaster("The PNG header is incomplete or malformed.");
  }
  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
  };
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function inspectJpegEnvelope(bytes: Uint8Array): RasterInspection {
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw invalidRaster("Raster signature does not match image/jpeg.");
  }

  let offset = 2;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      throw invalidRaster("The JPEG marker structure is malformed.");
    }
    while (bytes.at(offset) === 0xff) {
      offset += 1;
    }
    const marker = bytes.at(offset);
    offset += 1;
    if (marker === undefined || marker === 0x00 || marker === 0xd9) {
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.byteLength) {
      break;
    }
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      break;
    }
    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) {
        break;
      }
      return {
        width: readUint16(bytes, offset + 5),
        height: readUint16(bytes, offset + 3),
      };
    }
    offset += segmentLength;
  }
  throw invalidRaster("The JPEG header has no valid frame dimensions.");
}

function assertRasterLimits(bytes: Uint8Array, dimensions: RasterInspection): void {
  if (bytes.byteLength > RENDER_RESOURCE_LIMITS.maxAssetBytes) {
    throw invalidRaster("The raster exceeds the per-file byte limit.", {
      maximum: RENDER_RESOURCE_LIMITS.maxAssetBytes,
      actual: bytes.byteLength,
    });
  }
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > RENDER_RESOURCE_LIMITS.maxAssetDimension ||
    dimensions.height > RENDER_RESOURCE_LIMITS.maxAssetDimension
  ) {
    throw invalidRaster("The raster exceeds the decoded-dimension limit.", {
      maximum: RENDER_RESOURCE_LIMITS.maxAssetDimension,
      actual: dimensions,
    });
  }
  const pixels = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixels) || pixels > RENDER_RESOURCE_LIMITS.maxAssetPixels) {
    throw invalidRaster("The raster exceeds the decoded-pixel limit.", {
      maximum: RENDER_RESOURCE_LIMITS.maxAssetPixels,
      actual: pixels,
    });
  }
}

export function inspectRasterEnvelope(
  bytes: Uint8Array,
  mediaType: RasterMediaType,
): RasterInspection {
  if (bytes.byteLength > RENDER_RESOURCE_LIMITS.maxAssetBytes) {
    throw invalidRaster("The raster exceeds the per-file byte limit.", {
      maximum: RENDER_RESOURCE_LIMITS.maxAssetBytes,
      actual: bytes.byteLength,
    });
  }
  const dimensions =
    mediaType === "image/png" ? inspectPngEnvelope(bytes) : inspectJpegEnvelope(bytes);
  assertRasterLimits(bytes, dimensions);
  return dimensions;
}

export function validateRasterBytes(input: {
  bytes: Uint8Array;
  contentHash: string;
  mediaType: RasterMediaType;
  origin: AssetOrigin;
  width: number;
  height: number;
}): void {
  const resolved = {
    id: "ingestion-validation",
    mimeType: input.mediaType,
    sha256: input.contentHash,
    width: input.width,
    height: input.height,
    origin: input.origin,
    bytes: input.bytes,
  } as const;

  try {
    new AssetRegistry(
      [
        {
          id: resolved.id,
          mimeType: resolved.mimeType,
          sha256: resolved.sha256,
          width: resolved.width,
          height: resolved.height,
          origin: resolved.origin,
        },
      ],
      [resolved],
    );
  } catch (cause) {
    throw invalidRaster(
      "The raster did not pass complete structural and decode validation.",
      {
        validationCode:
          cause instanceof GlyphkilnError ? cause.code : "RASTER_DECODE_FAILED",
      },
      cause,
    );
  }
}
