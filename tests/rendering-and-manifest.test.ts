import { describe, expect, it } from "vitest";

import {
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  renderGraphic,
  sha256,
} from "../src/index.js";
import { loadExample } from "./helpers.js";

describe("SVG and PNG rendering", () => {
  it("emits safe standalone SVG without active content", async () => {
    const document = await loadExample("product-announcement");
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type === "headline") {
      headline.text = '<script>alert("x")</script> & safe';
    }
    const result = await renderGraphic(document, { formats: ["svg"] });
    const svg = new TextDecoder().decode(result.outputs[0]?.bytes);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script");
    expect(svg).not.toMatch(/\bhref=["']https?:/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("emits a valid PNG at the registry dimensions", async () => {
    const result = await renderGraphic(await loadExample("product-announcement"), {
      formats: ["png"],
    });
    const bytes = result.outputs[0]!.bytes;
    expect([...bytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(627);
  });

  it("reproduces identical PNG bytes in the same environment", async () => {
    const document = await loadExample("quote-card");
    const first = await renderGraphic(document, { formats: ["png"] });
    const second = await renderGraphic(document, { formats: ["png"] });
    expect(sha256(first.outputs[0]!.bytes)).toBe(sha256(second.outputs[0]!.bytes));
  });
});

describe("render manifests", () => {
  it("records the complete provenance contract", async () => {
    const timestamp = "2026-07-29T10:00:00.000Z";
    const result = await renderGraphic(await loadExample("article-cover"), {
      formats: ["svg"],
      creationTimestamp: timestamp,
    });
    const output = result.outputs[0]!;
    expect(output.manifest).toMatchObject({
      manifestVersion: "1.0.0",
      designDocumentId: "example-article-cover",
      seed: "editorial-rendering-19",
      template: { id: "article-cover", version: "1.0.0" },
      renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
      dimensions: { width: 1280, height: 720 },
      output: {
        format: "svg",
        sha256: sha256(output.bytes),
        byteSize: output.bytes.byteLength,
      },
      creationTimestamp: timestamp,
      generativeImageModelUsed: false,
      renderingMethod: "deterministic-code-rendering/direct-svg",
      productClaim: PRODUCT_CLAIM,
    });
    expect(output.manifest.proceduralAlgorithmVersions).toEqual({
      "flow-field": "1.0.0",
    });
    expect(output.manifest.fonts).toHaveLength(4);
  });

  it("uses distinct manifests and fingerprints for SVG and PNG", async () => {
    const result = await renderGraphic(await loadExample("article-cover"), {
      formats: ["svg", "png"],
    });
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]?.fingerprint).not.toBe(result.outputs[1]?.fingerprint);
    expect(result.outputs[0]?.manifest.output.format).toBe("svg");
    expect(result.outputs[1]?.manifest.output.format).toBe("png");
  });
});
