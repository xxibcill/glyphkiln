import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BUNDLED_FONT_FAMILIES,
  BUNDLED_FONT_FILES,
  BUNDLED_FONT_SOURCE,
  FontRegistry,
  GlyphkilnError,
  bundledFontFile,
  createDevelopmentFont,
  resolveBundledFont,
} from "../src/index.js";

const APPROVED_THAI_LATIN = [
  "IBM Plex Sans Thai",
  "Noto Sans Thai",
  "Sarabun",
  "Kanit",
  "Trirong",
  "Noto Serif Thai",
];
const APPROVED_LATIN = [
  "IBM Plex Sans",
  "Schibsted Grotesk",
  "Barlow Condensed",
  "Instrument Serif",
  "Source Serif 4",
  "IBM Plex Mono",
];

/** Hashes published in the two research READMEs (owner decision D3). */
function researchHashes(): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const path of [
    "../../../docs/research/thai-latin-fonts-2026-11/README.md",
    "../../../docs/research/latin-fonts-2026-11/README.md",
  ]) {
    const text = readFileSync(new URL(path, import.meta.url), "utf8");
    for (const match of text.matchAll(/\| `([^`]+\.ttf)`\s*\| `([0-9a-f]{64})` \|/g)) {
      hashes.set(match[1]!, match[2]!);
    }
  }
  return hashes;
}

describe("bundled OFL font library", () => {
  it("admits exactly the twelve approved families from the pinned commit", () => {
    expect(BUNDLED_FONT_SOURCE).toBe(
      "https://github.com/google/fonts@2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/",
    );
    expect(BUNDLED_FONT_FAMILIES.map((family) => family.family)).toEqual([
      ...APPROVED_THAI_LATIN,
      ...APPROVED_LATIN,
    ]);
    expect(new Set(BUNDLED_FONT_FAMILIES.map((family) => family.license))).toEqual(
      new Set(["OFL-1.1"]),
    );
    expect(BUNDLED_FONT_FILES).toHaveLength(101);
    for (const family of BUNDLED_FONT_FAMILIES) {
      expect(
        readFileSync(
          new URL(`../assets/fonts/${family.licenseFile}`, import.meta.url),
          "utf8",
        ),
      ).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("matches every hash the research READMEs list", () => {
    const research = researchHashes();
    let matched = 0;
    for (const file of BUNDLED_FONT_FILES) {
      const name = file.file.split("/").at(-1)!;
      const expected = research.get(name);
      if (expected === undefined) continue;
      expect(file.sha256, name).toBe(expected);
      matched += 1;
    }
    expect(matched).toBe(17);
  });

  it("serves declarable weights from static and variable files", () => {
    expect(bundledFontFile("Kanit", 900, "italic")?.file).toBe(
      "kanit/Kanit-BlackItalic.ttf",
    );
    expect(bundledFontFile("sarabun", 900, "normal")).toBeUndefined();
    expect(bundledFontFile("Schibsted Grotesk", 300, "normal")).toBeUndefined();
    expect(bundledFontFile("Schibsted Grotesk", 900, "normal")?.file).toBe(
      "schibstedgrotesk/SchibstedGrotesk[wght].ttf",
    );
    expect(bundledFontFile("Noto Sans Thai", 100, "italic")).toBeUndefined();
    expect(bundledFontFile("Inter", 400, "normal")).toBeUndefined();
  });

  it("covers Thai and Latin as the research recorded", () => {
    const registry = new FontRegistry();
    const thai: string[] = [];
    for (let codePoint = 0x0e01; codePoint <= 0x0e5b; codePoint += 1) {
      if ((codePoint >= 0x0e3b && codePoint <= 0x0e3e) || codePoint === 0x0e5c)
        continue;
      thai.push(String.fromCodePoint(codePoint));
    }
    const latin =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?“”‘’…–—€£";
    for (const file of BUNDLED_FONT_FILES) {
      const weight = file.weights[0]!;
      expect(
        registry.missingCodePoints(latin, file.family, weight, file.style),
        file.file,
      ).toEqual([]);
      if (APPROVED_THAI_LATIN.includes(file.family)) {
        expect(
          registry.missingCodePoints(thai.join(""), file.family, weight, file.style),
          file.file,
        ).toEqual([]);
      }
    }
  }, 120_000);

  it("resolves bundled faces lazily and lets supplied bytes win", () => {
    const resolved = resolveBundledFont("IBM Plex Sans Thai", 700, "normal");
    expect(resolved?.sha256).toBe(
      "f88fbe0a3717c93deddf4b13e50a05c9adcd38f58d675d9d5d0b869961851667",
    );
    const registry = new FontRegistry();
    expect(registry.list()).toHaveLength(9);
    expect(registry.has("IBM Plex Sans Thai", 700, "normal")).toBe(true);
    expect(registry.get("ibm plex sans thai", 700, "normal").sha256).toBe(
      resolved?.sha256,
    );
    expect(
      registry.measure("สวัสดี", "IBM Plex Sans Thai", 700, "normal", 40),
    ).toBeGreaterThan(0);

    const inter = createDevelopmentFont();
    const supplied = new FontRegistry([{ ...inter, family: "Kanit", weight: 400 }]);
    expect(supplied.get("Kanit", 400, "normal").sha256).toBe(inter.sha256);
  });

  it("still refuses families Core does not ship", () => {
    const registry = new FontRegistry();
    expect(() => registry.get("Unavailable Fixture Font", 400, "normal")).toThrow(
      GlyphkilnError,
    );
    expect(registry.has("Unavailable Fixture Font", 400, "normal")).toBe(false);
  });
});
