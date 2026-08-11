import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderGraphic } from "@glyphkiln/core";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createProjectPreview } from "@/lib/project-preview/render-preview";
import { createPreviewDesign } from "@/test/preview-design";

import { ProofLedger } from "./proof-ledger";
import type { PreviewFailure } from "./types";

const FIXED_NOW = new Date("2026-07-30T06:00:00.000Z");

describe("ProofLedger", () => {
  it("labels input metadata as preflight rather than rendered proof", () => {
    const markup = renderToStaticMarkup(
      <ProofLedger
        catalog={createPreviewCatalog()}
        document={createPreviewDesign()}
        response={null}
        proof={null}
        hasUnrenderedEdits={false}
        validationIsStale={false}
      />,
    );

    expect(markup).toContain("Input contract");
    expect(markup).toContain("PREFLIGHT");
    expect(markup).toContain("Render once to produce manifest-backed evidence.");
    expect(markup).not.toContain(">LIVE<");
  });

  it("does not describe an operational failure as a clean contract", () => {
    const failure: PreviewFailure = {
      ok: false,
      status: 503,
      title: "Local renderer is unavailable",
      code: "RENDER_PROCESS_NOT_BUILT",
      detail: "The isolated Core renderer is not ready.",
    };
    const markup = renderToStaticMarkup(
      <ProofLedger
        catalog={createPreviewCatalog()}
        document={createPreviewDesign()}
        response={failure}
        proof={null}
        hasUnrenderedEdits={false}
        validationIsStale={false}
      />,
    );

    expect(markup).toContain("Inspection unavailable");
    expect(markup).toContain(failure.detail);
    expect(markup).not.toContain("Contract clean");
  });

  it("pairs render evidence with fixed browser-safe authoring guidance", () => {
    const failure: PreviewFailure = {
      ok: false,
      status: 422,
      title: "Design document needs attention",
      code: "QUALITY_VALIDATION_FAILED",
      detail: "Review the render evidence.",
      qualityIssues: [
        {
          code: "LOW_TEXT_CONTRAST",
          severity: "error",
          message: "Measured foreground contrast is 1.25:1.",
          layerId: "headline",
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <ProofLedger
        catalog={createPreviewCatalog()}
        document={createPreviewDesign()}
        response={failure}
        proof={null}
        hasUnrenderedEdits={false}
        validationIsStale={false}
      />,
    );

    expect(markup).toContain("LOW_TEXT_CONTRAST");
    expect(markup).toContain("Measured foreground contrast is 1.25:1.");
    expect(markup).toContain("Next action:");
    expect(markup).toContain(
      "Adjust brand colors, imagery, or the closed treatment and review contrast evidence.",
    );
    expect(markup).toContain('data-authoring-action="improve-contrast"');
  });

  it("keeps complete quality evidence when authoring guidance is bounded", () => {
    const failure: PreviewFailure = {
      ok: false,
      status: 422,
      title: "Design document needs attention",
      code: "QUALITY_VALIDATION_FAILED",
      detail: "Review the render evidence.",
      qualityIssues: Array.from({ length: 129 }, (_, index) => ({
        code: "ORPHAN_LINE",
        severity: "warning" as const,
        message: `Review line ${index.toString()}.`,
        layerId: `headline-${index.toString()}`,
      })),
    };
    const markup = renderToStaticMarkup(
      <ProofLedger
        catalog={createPreviewCatalog()}
        document={createPreviewDesign()}
        response={failure}
        proof={null}
        hasUnrenderedEdits={false}
        validationIsStale={false}
      />,
    );

    expect(markup).toContain(">129<");
    expect(markup).toContain(
      "Additional quality issues are shown without mapped authoring guidance.",
    );
    expect(markup).toContain("Review line 128.");
    expect(markup.match(/Next action:/g)).toHaveLength(128);
  });

  it("reads rendered provenance from the manifest and marks stale evidence", async () => {
    const result = await createProjectPreview(createPreviewDesign(), {
      render: async (document, options) => renderGraphic(document, options),
      now: () => FIXED_NOW,
    });
    if (!result.body.ok) throw new Error("Expected a rendered preview.");
    const proof = structuredClone(result.body);
    const manifest = proof.outputs[0].manifest;
    manifest.assets = [
      {
        id: "generated-mark",
        sha256: "a".repeat(64),
        origin: {
          kind: "generated",
          sourceName: "Local mark",
          sourceReference: "asset-library/mark-01",
          generativeImageModel: "Declared source model",
        },
      },
    ];

    const editedDocument = structuredClone(proof.document);
    editedDocument.seed = "an-unfired-edit";
    const markup = renderToStaticMarkup(
      <ProofLedger
        catalog={createPreviewCatalog()}
        document={editedDocument}
        response={proof}
        proof={proof}
        hasUnrenderedEdits
        validationIsStale
      />,
    );

    expect(markup).toContain("Rendered provenance");
    expect(markup).toContain("STALE");
    expect(markup).toContain("This evidence belongs to the last rendered proof.");
    expect(markup).toContain(manifest.renderer.name);
    expect(markup).toContain(manifest.renderer.version);
    expect(markup).toContain(manifest.productClaim);
    expect(markup).toContain(manifest.fonts[0]?.sha256);
    expect(markup).toContain("Validation needs refresh");
    expect(markup).toContain("Manifest asset origins");
    expect(markup).toContain("generated-mark");
    expect(markup).toContain("Declared source model");
    expect(markup).toContain("aaaaaaaa…aaaaaa");
  });
});
