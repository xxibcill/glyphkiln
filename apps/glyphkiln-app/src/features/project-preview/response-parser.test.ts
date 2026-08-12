import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { IMAGE_CONTRAST_POLICY_VERSION } from "@glyphkiln/core";

import { createPreviewDesign } from "@/test/preview-design";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createProjectPreview } from "@/lib/project-preview/render-preview";

import {
  parsePreviewResponse,
  previewIntegrityPrerequisiteFailure,
  verifyPreviewIntegrity,
} from "./response-parser";
import type { PreviewSuccess } from "./types";

const FIXED_NOW = new Date("2026-07-30T06:00:00.000Z");
const CATALOG = createPreviewCatalog();

describe("parsePreviewResponse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    await expect(
      verifyPreviewIntegrity(result.body, CATALOG, result.body.document),
    ).resolves.toBeNull();
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

  it("rejects malformed or unbounded render evidence", async () => {
    const malformed = structuredClone(await renderSuccess());
    malformed.evidence.safeArea.width = -1;
    expect(parsePreviewResponse(malformed, 200)).toMatchObject({
      ok: false,
      code: "INVALID_PREVIEW_RESPONSE",
    });

    const unbounded = structuredClone(await renderSuccess());
    unbounded.evidence.contrast = Array.from({ length: 101 }, () => ({
      layerId: "headline",
      policyVersion: IMAGE_CONTRAST_POLICY_VERSION,
      foreground: "#000000",
      minimumRequired: 4.5,
      minimumRatio: 7,
      maximumRatio: 7,
      samples: [],
    }));
    expect(parsePreviewResponse(unbounded, 200)).toMatchObject({
      ok: false,
      code: "INVALID_PREVIEW_RESPONSE",
    });
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
    const failure = await verifyPreviewIntegrity(tampered, CATALOG, response.document);
    expect(failure).toMatchObject({
      ok: false,
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(failure?.detail).toContain("bytes do not match");
  });

  it("rejects correctly hashed artifacts with dimensions outside the trusted format", async () => {
    const response = await renderSuccess();
    const wrongSvg = structuredClone(response);
    const svg = wrongSvg.outputs.find((output) => output.format === "svg");
    if (svg === undefined) throw new Error("Expected an SVG output.");
    const { width, height } = svg.manifest.dimensions;
    replaceOutputBytes(
      wrongSvg,
      "svg",
      new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toString()}" height="${height.toString()}" viewBox="0 0 1 1"></svg>`,
      ),
    );

    const svgFailure = await verifyPreviewIntegrity(
      wrongSvg,
      CATALOG,
      response.document,
    );
    expect(svgFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(svgFailure?.detail).toContain("dimensions");

    const wrongPng = structuredClone(response);
    replaceOutputBytes(
      wrongPng,
      "png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const pngFailure = await verifyPreviewIntegrity(
      wrongPng,
      CATALOG,
      response.document,
    );
    expect(pngFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(pngFailure?.detail).toContain("dimensions");
  });

  it("rejects document and cross-format provenance tampering", async () => {
    const response = await renderSuccess();
    const changedDocument = structuredClone(response);
    changedDocument.document.brand.name = "Tampered brand";
    const documentFailure = await verifyPreviewIntegrity(
      changedDocument,
      CATALOG,
      response.document,
    );
    expect(documentFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(documentFailure?.detail).toContain("design document");

    const changedManifest = structuredClone(response);
    const png = changedManifest.outputs.find((output) => output.format === "png");
    if (png === undefined) throw new Error("Expected a PNG output.");
    png.manifest.creationTimestamp = "2026-07-30T07:00:00.000Z";
    const manifestFailure = await verifyPreviewIntegrity(
      changedManifest,
      CATALOG,
      response.document,
    );
    expect(manifestFailure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(manifestFailure?.detail).toContain("same render provenance");

    const changedMethod = structuredClone(response);
    const svg = changedMethod.outputs.find((output) => output.format === "svg");
    if (svg === undefined) throw new Error("Expected an SVG output.");
    svg.manifest.renderingMethod = "deterministic-code-rendering/resvg";
    const methodFailure = await verifyPreviewIntegrity(
      changedMethod,
      CATALOG,
      response.document,
    );
    expect(methodFailure?.detail).toContain("wrong rendering method");
  });

  it("rejects an internally valid proof for a different submitted document", async () => {
    const response = await renderSuccess();
    const submittedDocument = structuredClone(response.document);
    submittedDocument.seed = "different-submitted-seed";

    const failure = await verifyPreviewIntegrity(response, CATALOG, submittedDocument);

    expect(failure).toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
    expect(failure?.detail).toContain("submitted design document");
  });

  it("binds shared claims and font hashes to the trusted catalog and document", async () => {
    const response = await renderSuccess();
    const changedClaim = structuredClone(response);
    for (const output of changedClaim.outputs) {
      const manifest = output.manifest as { productClaim: string };
      manifest.productClaim = "Fabricated provenance claim";
    }
    await expect(
      verifyPreviewIntegrity(changedClaim, CATALOG, response.document),
    ).resolves.toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });

    const changedFont = structuredClone(response);
    for (const output of changedFont.outputs) {
      const manifest = output.manifest as {
        fonts: { sha256: string }[];
      };
      manifest.fonts[0].sha256 = "b".repeat(64);
    }
    await expect(
      verifyPreviewIntegrity(changedFont, CATALOG, response.document),
    ).resolves.toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });

    const changedTypographyPolicy = structuredClone(response);
    for (const output of changedTypographyPolicy.outputs) {
      const manifest = output.manifest as {
        typographyPolicy: { algorithmVersion: string };
      };
      manifest.typographyPolicy.algorithmVersion = "tampered";
    }
    await expect(
      verifyPreviewIntegrity(changedTypographyPolicy, CATALOG, response.document),
    ).resolves.toMatchObject({
      code: "PREVIEW_INTEGRITY_FAILED",
    });
  });

  it("requires secure-context Web Crypto before accepting proof artifacts", async () => {
    const response = await renderSuccess();
    vi.stubGlobal("crypto", undefined);

    expect(previewIntegrityPrerequisiteFailure()).toMatchObject({
      ok: false,
      code: "PREVIEW_SECURE_CONTEXT_REQUIRED",
    });
    await expect(
      verifyPreviewIntegrity(response, CATALOG, response.document),
    ).resolves.toMatchObject({
      ok: false,
      code: "PREVIEW_SECURE_CONTEXT_REQUIRED",
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

function replaceOutputBytes(
  response: PreviewSuccess,
  format: "svg" | "png",
  bytes: Uint8Array,
): void {
  const output = response.outputs.find((candidate) => candidate.format === format);
  if (output === undefined) throw new Error(`Expected a ${format} output.`);
  output.base64 = Buffer.from(bytes).toString("base64");
  output.byteSize = bytes.byteLength;
  output.manifest.output.byteSize = bytes.byteLength;
  output.manifest.output.sha256 = createHash("sha256").update(bytes).digest("hex");
}
