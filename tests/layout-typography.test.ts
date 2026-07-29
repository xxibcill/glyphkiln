import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FontRegistry,
  contrastRatio,
  fitText,
  isInside,
  wrapText,
} from "../src/index.js";

const registry = new FontRegistry();
const baseStyle = {
  family: "Inter",
  weight: 400,
  style: "normal" as const,
  fontSize: 30,
  lineHeight: 1.2,
};

describe("layout helpers", () => {
  it("checks nested bounds", () => {
    expect(
      isInside(
        { x: 10, y: 10, width: 100, height: 100 },
        { x: 20, y: 20, width: 40, height: 40 },
      ),
    ).toBe(true);
    expect(
      isInside(
        { x: 10, y: 10, width: 100, height: 100 },
        { x: 0, y: 20, width: 40, height: 40 },
      ),
    ).toBe(false);
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});

describe("typography", () => {
  it("wraps words within a measured width", () => {
    const wrapped = wrapText(
      "Deterministic graphics stay reproducible",
      260,
      baseStyle,
      registry,
    );
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.width).toBeLessThanOrEqual(260);
  });

  it("preserves explicit line breaks", () => {
    const wrapped = wrapText("First line\nSecond line", 800, baseStyle, registry);
    expect(wrapped.lines).toEqual(["First line", "Second line"]);
  });

  it("breaks a very long token and reports it", async () => {
    const token = (
      await readFile(resolve("fixtures/text/very-long-word.txt"), "utf8")
    ).trim();
    const wrapped = wrapText(token, 180, baseStyle, registry);
    expect(wrapped.brokeLongWord).toBe(true);
    expect(wrapped.lines.length).toBeGreaterThan(2);
    expect(wrapped.width).toBeLessThanOrEqual(180);
  });

  it("reduces font size to meet line and height limits", () => {
    const result = fitText({
      text: "A long headline that needs a smaller size",
      registry,
      style: {
        family: "Inter",
        weight: 700,
        style: "normal",
        lineHeight: 1.1,
      },
      box: { x: 0, y: 0, width: 300, height: 110 },
      preferredFontSize: 60,
      minimumFontSize: 20,
      maximumLines: 2,
      layerId: "headline",
    });
    expect(result.fontSize).toBeLessThan(60);
    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
  });

  it("returns an error issue when text cannot fit", () => {
    const result = fitText({
      text: "One two three four five six seven eight nine ten eleven twelve",
      registry,
      style: {
        family: "Inter",
        weight: 400,
        style: "normal",
        lineHeight: 1.2,
      },
      box: { x: 0, y: 0, width: 50, height: 20 },
      preferredFontSize: 24,
      minimumFontSize: 20,
      maximumLines: 1,
      layerId: "overflow",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TEXT_OVERFLOW",
          severity: "error",
        }),
      ]),
    );
  });

  it("rejects unsupported fonts instead of substituting", () => {
    expect(() => registry.get("Not Installed", 400, "normal")).toThrow(
      /Unsupported font/,
    );
  });
});
