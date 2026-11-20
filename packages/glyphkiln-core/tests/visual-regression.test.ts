import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import prettier from "prettier";
import { describe, expect, it } from "vitest";

import { renderGraphic, sha256, type DesignDocument } from "../src/index.js";
import { loadExampleAssets } from "./helpers.js";

const baselines = [
  "testimonial-evidence-square",
  "testimonial-evidence-portrait",
  "testimonial-evidence-story",
  "testimonial-evidence-landscape",
  "comparison-square",
  "comparison-portrait",
  "comparison-story",
  "comparison-landscape",
  "problem-solution-square",
  "problem-solution-portrait",
  "problem-solution-story",
  "problem-solution-landscape",
  "offer-urgency-square",
  "offer-urgency-portrait",
  "offer-urgency-story",
  "offer-urgency-landscape",

  "benefit-proof-square",
  "benefit-proof-portrait",
  "benefit-proof-story",
  "benefit-proof-landscape",
  "benefit-proof-software",
  "benefit-proof-travel",

  "product-offer-square",
  "product-offer-portrait",
  "product-offer-story",
  "product-offer-landscape",
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
  "tiktok-carousel-slide",
  "image-led-campaign",
  "image-led-campaign-square",
  "image-led-campaign-portrait",
  "split-editorial-landscape",
  "split-editorial-square",
  "split-editorial-portrait",
  "image-carousel",
  "image-carousel-metric",
  "split-editorial-landscape-balanced",
  "split-editorial-square-balanced",
  "split-editorial-portrait-balanced",
  "image-carousel-balanced",
  "image-carousel-metric-balanced",
  "type-carousel-balanced",
] as const;

describe("reviewed visual baselines", () => {
  it.each(baselines)(
    "%s matches the exact pinned PNG",
    async (name) => {
      const designPath = resolve(`tests/visual/baselines/${name}.design.json`);
      const pngPath = resolve(`tests/visual/baselines/${name}.png`);
      const manifestPath = resolve(`tests/visual/baselines/${name}.manifest.json`);
      const document = JSON.parse(await readFile(designPath, "utf8")) as DesignDocument;
      const assets = await loadExampleAssets(document);
      const result = await renderGraphic(document, {
        formats: ["png"],
        creationTimestamp: "2026-07-29T10:00:00.000Z",
        assets,
      });
      const output = result.outputs[0]!;

      if (name === "tiktok-carousel-slide") {
        expect(output.bytes.byteLength).toBeLessThanOrEqual(100_000);
      }

      if (process.env["GLYPHKILN_UPDATE_VISUALS"] === "1") {
        await writeFile(pngPath, output.bytes);
        await writeFile(
          manifestPath,
          await prettier.format(JSON.stringify(output.manifest), { parser: "json" }),
          "utf8",
        );
      }

      const baseline = new Uint8Array(await readFile(pngPath));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        output: { sha256: string };
      };
      expect(sha256(output.bytes)).toBe(manifest.output.sha256);
      expect(output.bytes).toEqual(baseline);
    },
    60_000,
  );
});
