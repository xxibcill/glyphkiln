import { describe, expect, it } from "vitest";

import {
  PRODUCT_CLAIM,
  RENDER_RESOURCE_LIMITS,
  RENDERER_NAME,
  RENDERER_VERSION,
  TYPOGRAPHY_POLICY,
  renderGraphic,
  sha256,
  verifyRenderReproduction,
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
    expect(svg).not.toContain("<text");
    expect(svg).toContain("<path");
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

  it("rejects unsupported output formats at the runtime boundary", async () => {
    await expect(
      renderGraphic(await loadExample("product-announcement"), {
        formats: ["gif" as never],
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_OUTPUT_FORMAT",
    });
  });

  it("rejects an unbounded output-format request before iterating it", async () => {
    await expect(
      renderGraphic(await loadExample("product-announcement"), {
        formats: Array.from(
          { length: RENDER_RESOURCE_LIMITS.maxOutputFormats + 1 },
          () => "svg",
        ),
      }),
    ).rejects.toMatchObject({
      code: "OUTPUT_FORMAT_LIMIT_EXCEEDED",
    });
  });

  it("rejects an oversized manifest timestamp at the option boundary", async () => {
    await expect(
      renderGraphic(await loadExample("product-announcement"), {
        creationTimestamp: "x".repeat(
          RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes + 1,
        ),
      }),
    ).rejects.toMatchObject({
      code: "CREATION_TIMESTAMP_LIMIT_EXCEEDED",
    });
  });
});

describe("render manifests", () => {
  it("retains text-quality warnings and their policy evidence", async () => {
    const result = await renderGraphic(await loadExample("product-announcement"), {
      formats: ["svg"],
      creationTimestamp: "2026-07-29T10:00:00.000Z",
    });
    const orphan = result.qualityIssues.find((issue) => issue.code === "ORPHAN_LINE");
    expect(orphan).toMatchObject({
      severity: "warning",
      layerId: "subtitle",
    });
    expect(orphan?.details).toMatchObject({
      affectedLine: "provenance.",
      segmentationPolicyVersion: "whitespace@1.0.0",
    });
    expect(Array.isArray(orphan?.details?.["measuredLineWidths"])).toBe(true);
    expect(typeof orphan?.details?.["finalLineToPreviousLineWidthRatio"]).toBe(
      "number",
    );
    expect(result.outputs[0]?.manifest.qualityIssues).toContainEqual(orphan);
  });

  it("records the complete provenance contract", async () => {
    const timestamp = "2026-07-29T10:00:00.000Z";
    const result = await renderGraphic(await loadExample("article-cover"), {
      formats: ["svg"],
      creationTimestamp: timestamp,
    });
    const output = result.outputs[0]!;
    expect(output.manifest).toMatchObject({
      manifestVersion: "1.2.0",
      designDocumentId: "example-article-cover",
      seed: "editorial-rendering-19",
      template: { id: "article-cover", version: "1.1.0" },
      renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
      typographyPolicy: TYPOGRAPHY_POLICY,
      dimensions: { width: 1280, height: 720 },
      output: {
        format: "svg",
        sha256: sha256(output.bytes),
        byteSize: output.bytes.byteLength,
      },
      creationTimestamp: timestamp,
      compositionGenerativeImageModelUsed: false,
      includedGenerativeAssetUsed: false,
      renderingMethod: "deterministic-code-rendering/direct-svg",
      productClaim: PRODUCT_CLAIM,
    });
    expect(output.manifest.proceduralAlgorithmVersions).toEqual({
      "flow-field": "1.1.0",
    });
    expect(output.manifest.fonts).toEqual([
      expect.objectContaining({ family: "Inter", weight: 700, style: "normal" }),
      expect.objectContaining({ family: "Inter", weight: 800, style: "normal" }),
      expect.objectContaining({ family: "Inter", weight: 500, style: "normal" }),
    ]);
  });

  it("verifies reproduced bytes and reports deterministic mismatches", async () => {
    const document = await loadExample("article-cover");
    const output = (
      await renderGraphic(document, {
        formats: ["svg"],
        creationTimestamp: "2026-07-29T10:00:00.000Z",
      })
    ).outputs[0]!;
    expect(
      verifyRenderReproduction({
        document,
        bytes: output.bytes,
        manifest: output.manifest,
      }),
    ).toEqual([]);
    expect(
      verifyRenderReproduction({
        document,
        bytes: output.bytes.slice(0, -1),
        manifest: output.manifest,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OUTPUT_SIZE_MISMATCH" }),
        expect.objectContaining({ code: "OUTPUT_HASH_MISMATCH" }),
      ]),
    );
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
