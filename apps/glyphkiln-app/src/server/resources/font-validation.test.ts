import { createDevelopmentFont, RENDER_RESOURCE_LIMITS, sha256 } from "@glyphkiln/core";
import { describe, expect, it } from "vitest";

import { inspectFontEnvelope, validateFontBytes } from "./font-validation";
import type { FontMediaType } from "./types";

const TRUETYPE_TABLES = ["cmap", "head", "maxp", "name", "glyf", "loca"] as const;
const OPENTYPE_TABLES = ["cmap", "head", "maxp", "name", "CFF "] as const;

function sfntEnvelope(
  mediaType: FontMediaType,
  tags: readonly string[],
  signature: "standard" | "true" = "standard",
): Uint8Array {
  const directoryEnd = 12 + tags.length * 16;
  const bytes = new Uint8Array(directoryEnd);
  if (mediaType === "font/otf") {
    bytes.set(Buffer.from("OTTO"), 0);
  } else if (signature === "true") {
    bytes.set(Buffer.from("true"), 0);
  } else {
    bytes.set([0x00, 0x01, 0x00, 0x00], 0);
  }
  writeUint16(bytes, 4, tags.length);
  tags.forEach((tag, index) => {
    const offset = 12 + index * 16;
    bytes.set(Buffer.from(tag), offset);
    writeUint32(bytes, offset + 8, directoryEnd);
  });
  return bytes;
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

describe("font envelope inspection", () => {
  it("accepts complete TrueType and OpenType table directories", () => {
    expect(() => {
      inspectFontEnvelope(sfntEnvelope("font/ttf", TRUETYPE_TABLES), "font/ttf");
      inspectFontEnvelope(
        sfntEnvelope("font/ttf", TRUETYPE_TABLES, "true"),
        "font/ttf",
      );
      inspectFontEnvelope(sfntEnvelope("font/otf", OPENTYPE_TABLES), "font/otf");
      inspectFontEnvelope(
        sfntEnvelope("font/otf", [...OPENTYPE_TABLES.slice(0, -1), "CFF2"]),
        "font/otf",
      );
    }).not.toThrow();
  });

  it("rejects a font before parsing when its encoded bytes exceed the limit", () => {
    const bytes = new Uint8Array(RENDER_RESOURCE_LIMITS.maxFontBytes + 1);
    bytes.set([0x00, 0x01, 0x00, 0x00], 0);

    expect(() => {
      inspectFontEnvelope(bytes, "font/ttf");
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        details: {
          maximum: RENDER_RESOURCE_LIMITS.maxFontBytes,
          actual: bytes.byteLength,
        },
      }),
    );
  });

  it("rejects an incomplete SFNT header", () => {
    expect(() => {
      inspectFontEnvelope(new Uint8Array(11), "font/ttf");
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The font header is incomplete.",
      }),
    );
  });

  it.each([
    ["TrueType bytes declared as OpenType", "font/otf", "font/ttf"],
    ["OpenType bytes declared as TrueType", "font/ttf", "font/otf"],
  ] as const)("rejects %s", (_label, declaredMediaType, encodedMediaType) => {
    expect(() => {
      inspectFontEnvelope(
        sfntEnvelope(encodedMediaType, TRUETYPE_TABLES),
        declaredMediaType,
      );
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: `Font signature does not match ${declaredMediaType}.`,
      }),
    );
  });

  it.each([
    [
      "zero tables",
      (() => {
        const bytes = new Uint8Array(12);
        bytes.set([0x00, 0x01, 0x00, 0x00], 0);
        return bytes;
      })(),
    ],
    [
      "too many tables",
      (() => {
        const tableCount = 513;
        const bytes = new Uint8Array(12 + tableCount * 16);
        bytes.set([0x00, 0x01, 0x00, 0x00], 0);
        writeUint16(bytes, 4, tableCount);
        return bytes;
      })(),
    ],
    [
      "a truncated table directory",
      (() => {
        const bytes = new Uint8Array(12);
        bytes.set([0x00, 0x01, 0x00, 0x00], 0);
        writeUint16(bytes, 4, 1);
        return bytes;
      })(),
    ],
    [
      "a duplicate table",
      sfntEnvelope("font/ttf", [
        "cmap",
        "cmap",
        "head",
        "maxp",
        "name",
        "glyf",
        "loca",
      ]),
    ],
    [
      "a table offset past EOF",
      (() => {
        const bytes = sfntEnvelope("font/ttf", TRUETYPE_TABLES);
        writeUint32(bytes, 20, bytes.byteLength + 1);
        return bytes;
      })(),
    ],
    [
      "a table length past EOF",
      (() => {
        const bytes = sfntEnvelope("font/ttf", TRUETYPE_TABLES);
        writeUint32(bytes, 24, bytes.byteLength);
        writeUint32(bytes, 28, 1);
        return bytes;
      })(),
    ],
  ])("rejects a malformed directory with %s", (_label, bytes) => {
    expect(() => {
      inspectFontEnvelope(bytes, "font/ttf");
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The font table directory is malformed.",
      }),
    );
  });

  it("rejects missing required TrueType tables", () => {
    expect(() => {
      inspectFontEnvelope(
        sfntEnvelope("font/ttf", TRUETYPE_TABLES.slice(1)),
        "font/ttf",
      );
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The font is missing the required cmap table.",
      }),
    );
  });

  it("rejects OpenType fonts without a supported CFF outline table", () => {
    expect(() => {
      inspectFontEnvelope(
        sfntEnvelope("font/otf", ["cmap", "head", "maxp", "name"]),
        "font/otf",
      );
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The OpenType font has no supported CFF outline table.",
      }),
    );
  });
});

describe("complete font validation", () => {
  it("accepts a fully parsed font with finite metrics and pinned identity", () => {
    const font = createDevelopmentFont();

    expect(() => {
      validateFontBytes({
        bytes: font.bytes,
        contentHash: sha256(font.bytes),
        family: "Uploaded Inter",
        weight: 400,
        style: "normal",
      });
    }).not.toThrow();
  });

  it("preserves the Core validation code for a mismatched hash", () => {
    const font = createDevelopmentFont();

    expect(() => {
      validateFontBytes({
        bytes: font.bytes,
        contentHash: "0".repeat(64),
        family: "Uploaded Inter",
        weight: 400,
        style: "normal",
      });
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        details: { validationCode: "FONT_HASH_MISMATCH" },
      }),
    );
  });

  it("maps an unrecognized parser failure to a closed ingestion error", () => {
    const bytes = sfntEnvelope("font/ttf", TRUETYPE_TABLES);

    expect(() => {
      validateFontBytes({
        bytes,
        contentHash: sha256(bytes),
        family: "Malformed Fixture",
        weight: 400,
        style: "normal",
      });
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The font did not pass complete parser and metric validation.",
        details: { validationCode: "FONT_DECODE_FAILED" },
      }),
    );
  });
});
