import { Buffer } from "node:buffer";

import { hashCanonical } from "@glyphkiln/core";
import { describe, expect, it, vi } from "vitest";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createProjectPreview } from "@/lib/project-preview/render-preview";
import { createPreviewDesign } from "@/test/preview-design";

import { createAppAlphaApi } from "./api-client";

describe("App Alpha comparison integrity", () => {
  it("accepts exact proofs and rejects tampered comparison bytes", async () => {
    const proofResult = await createProjectPreview(createPreviewDesign(), {
      render: async (document, options) => {
        const { renderGraphic } = await import("@glyphkiln/core");
        return renderGraphic(document, options);
      },
      now: () => new Date("2026-08-12T01:00:00.000Z"),
    });
    if (!proofResult.body.ok) throw new Error("Expected a rendered proof fixture.");
    const proof = proofResult.body;
    const tampered = structuredClone(proof);
    const png = tampered.outputs.find((output) => output.format === "png");
    if (png === undefined) throw new Error("Expected a PNG proof fixture.");
    png.base64 = Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]).toString("base64");
    png.byteSize = 8;
    png.manifest.output.byteSize = 8;
    const revision = {
      kind: "design-revision" as const,
      designId: "design-1",
      designName: "Exact comparison",
      revisionId: "revision-1",
      revisionNumber: 1,
      brandSnapshotId: "brand-1",
      documentHash: hashCanonical(proof.document),
      document: proof.document,
      createdAt: "2026-08-12T01:00:00.000Z",
    };
    const comparisonResponse = (left = proof, right = proof) =>
      jsonResponse(
        {
          ok: true,
          status: 200,
          value: {
            kind: "revision-comparison",
            left: {
              revision,
              qualityIssues: left.qualityIssues,
              evidence: left.evidence,
              outputs: left.outputs,
            },
            right: {
              revision,
              qualityIssues: right.qualityIssues,
              evidence: right.evidence,
              outputs: right.outputs,
            },
          },
        },
        200,
      );
    const input = {
      workspaceId: "workspace-1",
      leftDesignId: "design-1",
      leftRevisionId: "revision-1",
      rightDesignId: "design-1",
      rightRevisionId: "revision-1",
    };
    const catalog = createPreviewCatalog();

    await expect(
      createAppAlphaApi(
        vi.fn(() => Promise.resolve(comparisonResponse())),
        catalog,
      ).compareRevisions(input),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      createAppAlphaApi(
        vi.fn(() => Promise.resolve(comparisonResponse(proof, tampered))),
        catalog,
      ).compareRevisions(input),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "PREVIEW_INTEGRITY_FAILED" },
    });

    await expect(
      createAppAlphaApi(
        vi.fn(() => Promise.resolve(comparisonResponse(tampered, proof))),
        catalog,
      ).compareRevisions(input),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "PREVIEW_INTEGRITY_FAILED" },
    });
  });
});

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
