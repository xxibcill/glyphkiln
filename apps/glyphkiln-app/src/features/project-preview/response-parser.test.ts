import { describe, expect, it } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createProjectPreview } from "@/lib/project-preview/render-preview";

import { parsePreviewResponse, verifyPreviewIntegrity } from "./response-parser";
import type { PreviewSuccess } from "./types";

const FIXED_NOW = new Date("2026-07-30T06:00:00.000Z");
const CATALOG = createPreviewCatalog();

describe("parsePreviewResponse", () => {
  it("accepts a complete render response", async () => {
    const result = await createProjectPreview(createPreviewDesign(), {
      render: async (document, options) => {
        const { renderGraphic } = await import("@glyphkiln/core");
        return renderGraphic(document, options);
      },
      now: () => FIXED_NOW,
    });

    expect(parsePreviewResponse(result.body, result.status)).toEqual(result.body);
    if (!result.body.ok) throw new Error("Expected a rendered preview.");
    await expect(verifyPreviewIntegrity(result.body, CATALOG)).resolves.toBeNull();
  });

  it("accepts a status-aligned problem response", () => {
    const failure = {
      ok: false,
      status: 422,
      title: "Design document needs attention",
      code: "INVALID_DESIGN_DOCUMENT",
      detail: "Review the fields.",
      problems: [{ path: "seed", code: "too_small", message: "Required" }],
    } as const;

    expect(parsePreviewResponse(failure, 422)).toEqual(failure);
  });

  it("rejects success-shaped, status-mismatched, and incomplete responses", () => {
    const malformed = [
      { input: { ok: true, outputs: [], document: null }, status: 200 },
      {
        input: {
          ok: false,
          status: 422,
          title: "No",
          code: "NO",
          detail: "No",
        },
        status: 500,
      },
      {
        input: {
          ok: false,
          status: 200,
          title: "No",
          code: "NO",
          detail: "No",
        },
        status: 200,
      },
      { input: null, status: 200 },
    ];

    for (const testCase of malformed) {
      expect(parsePreviewResponse(testCase.input, testCase.status)).toMatchObject({
        ok: false,
        code: "INVALID_PREVIEW_RESPONSE",
      });
    }
  });

  it("rejects same-length output tampering after structural parsing", async () => {
    const response = await renderSuccess();
    const tampered = structuredClone(response);
    const svg = tampered.outputs.find((output) => output.format === "svg");
    if (svg === undefined) throw new Error("Expected an SVG output.");
    const replacement = svg.base64[24] === "A" ? "B" : "A";
    svg.base64 = `${svg.base64.slice(0, 24)}${replacement}${svg.base64.slice(25)}`;

    expect(parsePreviewResponse(tampered, 200).ok).toBe(true);
    const failure = await verifyPreviewIntegrity(tampered, CATALOG);
    expect(failure).toMatchObject({
      ok: false,
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(failure?.detail).toContain("bytes do not match");
  });

  it("rejects document and cross-format provenance tampering", async () => {
    const response = await renderSuccess();
    const changedDocument = structuredClone(response);
    changedDocument.document.brand.name = "Tampered brand";
    const documentFailure = await verifyPreviewIntegrity(changedDocument, CATALOG);
    expect(documentFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(documentFailure?.detail).toContain("design document");

    const changedManifest = structuredClone(response);
    const png = changedManifest.outputs.find((output) => output.format === "png");
    if (png === undefined) throw new Error("Expected a PNG output.");
    png.manifest.creationTimestamp = "2026-07-30T07:00:00.000Z";
    const manifestFailure = await verifyPreviewIntegrity(changedManifest, CATALOG);
    expect(manifestFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(manifestFailure?.detail).toContain("same render provenance");

    const changedMethod = structuredClone(response);
    const svg = changedMethod.outputs.find((output) => output.format === "svg");
    if (svg === undefined) throw new Error("Expected an SVG output.");
    svg.manifest.renderingMethod = "deterministic-code-rendering/resvg";
    const methodFailure = await verifyPreviewIntegrity(changedMethod, CATALOG);
    expect(methodFailure?.detail).toContain("wrong rendering method");
  });

  it("binds shared claims and font hashes to the trusted catalog and document", async () => {
    const response = await renderSuccess();
    const changedClaim = structuredClone(response);
    for (const output of changedClaim.outputs) {
      const manifest = output.manifest as { productClaim: string };
      manifest.productClaim = "Fabricated provenance claim";
    }
    await expect(verifyPreviewIntegrity(changedClaim, CATALOG)).resolves.toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });

    const changedFont = structuredClone(response);
    for (const output of changedFont.outputs) {
      const manifest = output.manifest as {
        fonts: { sha256: string }[];
      };
      manifest.fonts[0].sha256 = "b".repeat(64);
    }
    await expect(verifyPreviewIntegrity(changedFont, CATALOG)).resolves.toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
  });
});

async function renderSuccess(): Promise<PreviewSuccess> {
  const result = await createProjectPreview(createPreviewDesign(), {
    render: async (document, options) => {
      const { renderGraphic } = await import("@glyphkiln/core");
      return renderGraphic(document, options);
    },
    now: () => FIXED_NOW,
  });
  if (!result.body.ok) throw new Error("Expected a rendered preview.");
  return result.body;
}
