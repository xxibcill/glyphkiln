import { afterEach, describe, expect, it, vi } from "vitest";

import { GlyphkilnError } from "../src/domain/types.js";
import { FontRegistry } from "../src/fonts/index.js";

/**
 * Regression tests for the stable error codes typography M1 introduced.
 * Each scenario that needs a fresh module graph (engine not yet loaded, a
 * tampered wasm or bundled file) resets modules and imports Core again.
 */

async function expectCode(action: () => unknown, code: string): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${code}`).toBeInstanceOf(Error);
  expect((caught as GlyphkilnError).code).toBe(code);
}

/** Flip one byte of every file `readFileSync` returns whose path matches. */
function mockTamperedReads(matches: (path: string) => boolean): void {
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
      const bytes = actual.readFileSync(...args);
      if (!Buffer.isBuffer(bytes) || !matches(String(args[0]))) return bytes;
      const tampered = Buffer.from(bytes);
      tampered[0] = tampered[0]! ^ 0xff;
      return tampered;
    }) as typeof actual.readFileSync;
    return { ...actual, readFileSync, default: { ...actual, readFileSync } };
  });
}

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.doUnmock("harfbuzzjs");
  vi.resetModules();
});

describe("typography M1 stable error codes", () => {
  it("TYPOGRAPHY_ENGINE_NOT_LOADED before loadTypographyEngine()", async () => {
    vi.resetModules();
    const harfbuzz = await import("../src/fonts/harfbuzz.js");
    const engine = await import("../src/typography/engine.js");
    await expectCode(
      () => harfbuzz.loadedHarfBuzzShaper(),
      "TYPOGRAPHY_ENGINE_NOT_LOADED",
    );
    await expectCode(
      () =>
        engine.createTypesetter({
          registry: new FontRegistry(),
          model: { family: "Inter", weight: 400, style: "normal" },
          shortSidePx: 1080,
          layerId: "headline",
        }),
      "TYPOGRAPHY_ENGINE_NOT_LOADED",
    );
  });

  it("SHAPER_INTEGRITY_MISMATCH when the installed wasm bytes differ", async () => {
    vi.resetModules();
    mockTamperedReads((path) => path.endsWith("harfbuzz.wasm"));
    const harfbuzz = await import("../src/fonts/harfbuzz.js");
    await expectCode(() => harfbuzz.loadHarfBuzzShaper(), "SHAPER_INTEGRITY_MISMATCH");
  });

  it("SHAPER_INTEGRITY_MISMATCH when harfbuzzjs embeds another HarfBuzz", async () => {
    vi.resetModules();
    vi.doMock("harfbuzzjs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("harfbuzzjs")>();
      return { ...actual, versionString: () => "0.0.0" };
    });
    const harfbuzz = await import("../src/fonts/harfbuzz.js");
    await expectCode(() => harfbuzz.loadHarfBuzzShaper(), "SHAPER_INTEGRITY_MISMATCH");
  });

  it("FONT_HASH_MISMATCH when a bundled font file was modified", async () => {
    vi.resetModules();
    mockTamperedReads((path) => path.includes("/assets/fonts/"));
    const bundled = await import("../src/fonts/bundled.js");
    await expectCode(
      () => bundled.resolveBundledFont("Kanit", 400, "normal"),
      "FONT_HASH_MISMATCH",
    );
  });

  it("FONT_PARSE_FAILED for bytes that are not an OpenType face", async () => {
    const { loadHarfBuzzShaper } = await import("../src/fonts/harfbuzz.js");
    const shaper = await loadHarfBuzzShaper();
    await expectCode(
      () => shaper.loadFace(new Uint8Array([0, 1, 2, 3])),
      "FONT_PARSE_FAILED",
    );
    await expectCode(() => shaper.loadFace(new Uint8Array(0)), "FONT_PARSE_FAILED");
  });

  it("GLYPH_OUTLINE_INVALID for an outline segment HarfBuzz does not define", async () => {
    const { dropClosingLines } = await import("../src/fonts/harfbuzz.js");
    expect(
      dropClosingLines([
        { type: "M", values: [0, 0] },
        { type: "L", values: [10, 0] },
        { type: "L", values: [0, 0] },
        { type: "Z", values: [] },
      ]),
    ).toEqual([
      { command: "moveTo", args: [0, 0] },
      { command: "lineTo", args: [10, 0] },
      { command: "closePath", args: [] },
    ]);
    await expectCode(
      () => dropClosingLines([{ type: "A", values: [1, 2] }]),
      "GLYPH_OUTLINE_INVALID",
    );
  });

  it("FONT_STACK_TOO_LARGE past six faces", async () => {
    const { createTypesetter, loadTypographyEngine } =
      await import("../src/typography/engine.js");
    await loadTypographyEngine();
    await expectCode(
      () =>
        createTypesetter({
          registry: new FontRegistry(),
          model: {
            family: "Inter",
            weight: 400,
            style: "normal",
            fallback: [
              { family: "Kanit" },
              { family: "Sarabun" },
              { family: "Trirong" },
              { family: "Noto Sans Thai" },
            ],
            scriptFaces: {
              latn: { family: "IBM Plex Sans" },
              thai: { family: "IBM Plex Sans Thai" },
            },
          },
          shortSidePx: 1080,
          layerId: "headline",
        }),
      "FONT_STACK_TOO_LARGE",
    );
  });
});
