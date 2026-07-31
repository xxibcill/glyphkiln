import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_FONT_SHA256,
  GlyphkilnError,
  renderGraphic,
  renderGraphicIsolated,
  verifyRenderReproduction,
} from "@glyphkiln/core";
import type { ResolvedFont } from "@glyphkiln/core";

import { createPreviewDesign } from "@/test/preview-design";

import { createProjectPreview } from "./render-preview";

const FIXED_NOW = new Date("2026-07-30T06:00:00.000Z");

describe("createProjectPreview", () => {
  it("renders both reproducible formats with their own manifests", async () => {
    const result = await createProjectPreview(createPreviewDesign(), {
      render: renderGraphicIsolated,
      now: () => FIXED_NOW,
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) throw new Error("Expected a rendered preview.");

    expect(result.body.qualityIssues).toHaveLength(1);
    expect(result.body.qualityIssues[0]).toMatchObject({
      code: "ORPHAN_LINE",
      severity: "warning",
      layerId: "subtitle",
    });
    expect(result.body.qualityIssues[0]?.details).toMatchObject({
      affectedLine: "provenance.",
      isolatedWord: true,
    });
    expect(result.body.outputs.map((output) => output.format)).toEqual(["svg", "png"]);

    for (const output of result.body.outputs) {
      const bytes = new Uint8Array(Buffer.from(output.base64, "base64"));
      expect(bytes.byteLength).toBe(output.byteSize);
      expect(output.filename).toBe(`glyphkiln-local-project-preview.${output.format}`);
      expect(output.manifest.creationTimestamp).toBe(FIXED_NOW.toISOString());
      expect(output.manifest.output.format).toBe(output.format);
      expect(output.manifest.qualityIssues).toEqual(result.body.qualityIssues);
      expect(
        verifyRenderReproduction({
          document: result.body.document,
          bytes,
          manifest: output.manifest,
        }),
      ).toEqual([]);
    }
  });

  it("returns Core validation problems without invoking the renderer", async () => {
    let renderCalled = false;
    const invalid = { ...createPreviewDesign(), seed: "" };
    const result = await createProjectPreview(invalid, {
      render: async () => {
        renderCalled = true;
        return renderGraphicIsolated(invalid);
      },
      now: () => FIXED_NOW,
    });

    expect(renderCalled).toBe(false);
    expect(result).toMatchObject({
      status: 422,
      body: {
        ok: false,
        code: "INVALID_DESIGN_DOCUMENT",
        problems: [{ path: "seed" }],
      },
    });
  });

  it("supplies the registered font bytes explicitly to every render", async () => {
    let suppliedFonts: readonly ResolvedFont[] | undefined;
    const result = await createProjectPreview(createPreviewDesign(), {
      render: async (document, options = {}) => {
        suppliedFonts = options.fonts;
        return renderGraphic(document, options);
      },
      now: () => FIXED_NOW,
    });

    expect(result.status).toBe(200);
    expect(suppliedFonts).toHaveLength(1);
    expect(suppliedFonts?.[0]).toMatchObject({
      family: "Inter",
      sha256: DEVELOPMENT_FONT_SHA256,
    });
    expect(suppliedFonts?.[0]?.bytes).toBeInstanceOf(Uint8Array);
    expect(suppliedFonts?.[0]?.bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects overlapping local renders instead of growing an unbounded queue", async () => {
    let rejectFirst: ((reason: Error) => void) | undefined;
    const first = createProjectPreview(createPreviewDesign(), {
      render: () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
      now: () => FIXED_NOW,
    });
    await Promise.resolve();

    const second = await createProjectPreview(createPreviewDesign(), {
      render: renderGraphicIsolated,
      now: () => FIXED_NOW,
    });

    expect(second).toMatchObject({
      status: 429,
      body: { ok: false, code: "PREVIEW_RENDER_BUSY" },
    });
    if (rejectFirst === undefined) throw new Error("First render did not start.");
    rejectFirst(new Error("Release the test render slot."));
    await expect(first).resolves.toMatchObject({
      status: 500,
      body: { ok: false, code: "PREVIEW_RENDER_FAILED" },
    });
  });

  it("preserves actionable quality issues from a blocked render", async () => {
    const document = createPreviewDesign();
    document.layers = document.layers.filter((layer) => layer.type !== "headline");

    const result = await createProjectPreview(document, {
      render: renderGraphicIsolated,
      now: () => FIXED_NOW,
    });

    expect(result).toMatchObject({
      status: 422,
      body: {
        ok: false,
        code: "QUALITY_VALIDATION_FAILED",
        qualityIssues: [{ code: "REQUIRED_LAYER_MISSING", severity: "error" }],
      },
    });
  });

  it("preserves actionable Core asset failures while uploads are deferred", async () => {
    const document = createPreviewDesign();
    document.assets.push({
      id: "unresolved-mark",
      mimeType: "image/png",
      sha256: "a".repeat(64),
      width: 1,
      height: 1,
      origin: { kind: "unknown" },
    });

    const result = await createProjectPreview(document, {
      render: async (input, options) => renderGraphic(input, options),
      now: () => FIXED_NOW,
    });

    expect(result.status).toBe(422);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) throw new Error("Expected an asset failure.");
    expect(result.body.code).toBe("UNRESOLVED_ASSET");
    expect(result.body.detail).toContain("bytes were not supplied");
  });

  it("classifies renderer availability, timeout, resource, and unknown failures", async () => {
    const cases = [
      {
        error: new GlyphkilnError("not built", "RENDER_PROCESS_NOT_BUILT"),
        status: 503,
      },
      {
        error: new GlyphkilnError("ipc failed", "RENDER_PROCESS_IPC_FAILED"),
        status: 503,
      },
      {
        error: new GlyphkilnError("too slow", "RENDER_TIMEOUT"),
        status: 504,
      },
      {
        error: new GlyphkilnError("too large", "DESIGN_RESOURCE_LIMIT_EXCEEDED"),
        status: 413,
      },
      {
        error: new Error("private implementation detail"),
        status: 500,
      },
    ];

    for (const testCase of cases) {
      const result = await createProjectPreview(createPreviewDesign(), {
        render: () => Promise.reject(testCase.error),
        now: () => FIXED_NOW,
      });
      expect(result.status).toBe(testCase.status);
      expect(result.body.ok).toBe(false);
      if (result.body.ok) throw new Error("Expected a render failure.");
      expect(result.body.detail).not.toContain("private implementation detail");
    }
  });
});
