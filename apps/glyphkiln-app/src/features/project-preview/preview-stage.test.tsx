import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderGraphic } from "@glyphkiln/core";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createProjectPreview } from "@/lib/project-preview/render-preview";
import { createPreviewDesign } from "@/test/preview-design";

import { PreviewStage } from "./preview-stage";

describe("PreviewStage", () => {
  it("distinguishes current downloads from last-rendered stale artifacts", async () => {
    const result = await createProjectPreview(createPreviewDesign(), {
      render: async (document, options) => renderGraphic(document, options),
      now: () => new Date("2026-07-30T06:00:00.000Z"),
    });
    if (!result.body.ok) throw new Error("Expected a rendered preview.");

    const currentMarkup = renderToStaticMarkup(
      <PreviewStage
        catalog={createPreviewCatalog()}
        document={result.body.document}
        proof={result.body}
        isRendering={false}
        hasUnrenderedEdits={false}
      />,
    );
    expect(currentMarkup).toContain("Proof current");
    expect(currentMarkup).toContain("Deliberate downloads");
    expect(currentMarkup).toContain("Download SVG");
    expect(currentMarkup).not.toContain("Last rendered downloads");

    const staleMarkup = renderToStaticMarkup(
      <PreviewStage
        catalog={createPreviewCatalog()}
        document={result.body.document}
        proof={result.body}
        isRendering={false}
        hasUnrenderedEdits
      />,
    );
    expect(staleMarkup).toContain("Edits not rendered");
    expect(staleMarkup).toContain("Last rendered downloads");
    expect(staleMarkup).toContain("Download last SVG");
    expect(staleMarkup).toContain("before the current control changes");
  });
});
