import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import prettier from "prettier";
import { describe, expect, it } from "vitest";

import { renderGraphic, sha256, type DesignDocument } from "../src/index.js";
import { loadExampleAssets } from "./helpers.js";

const baselines = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
  "tiktok-carousel-slide",
  "image-led-campaign",
  "image-led-campaign-square",
  "image-led-campaign-portrait",
] as const;

describe("reviewed visual baselines", () => {
  it.each(baselines)("%s matches the exact pinned PNG", async (name) => {
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
  });
});
