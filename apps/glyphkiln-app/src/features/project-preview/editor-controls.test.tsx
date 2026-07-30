import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";

import { createInitialPreviewForm } from "./document-builder";
import { EditorControls } from "./editor-controls";
import type { PreviewFailure } from "./types";

const FAILURE: PreviewFailure = {
  ok: false,
  status: 422,
  title: "Preview could not be rendered",
  code: "QUALITY_VALIDATION_FAILED",
  detail: "Render blocked by a quality error.",
  qualityIssues: [
    {
      code: "LOW_TEXT_CONTRAST",
      severity: "error",
      message: "Headline contrast is too low.",
      layerId: "headline",
    },
  ],
};

describe("EditorControls", () => {
  it("associates layer quality errors with their active copy control", () => {
    const markup = renderControls(false);

    expect(markup).toContain("Headline contrast is too low.");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="product-headline-error"');
    expect(markup).toContain("Preview could not be rendered");
  });

  it("withdraws stale field errors and asks for a new inspection", () => {
    const markup = renderControls(true);

    expect(markup).toContain("Controls changed. Inspect this version again.");
    expect(markup).not.toContain('aria-invalid="true"');
    expect(markup).not.toContain("Preview could not be rendered");
  });
});

function renderControls(validationIsStale: boolean): string {
  const catalog = createPreviewCatalog();
  return renderToStaticMarkup(
    <EditorControls
      catalog={catalog}
      state={createInitialPreviewForm(catalog)}
      response={FAILURE}
      isRendering={false}
      hasUnrenderedEdits={false}
      validationIsStale={validationIsStale}
      onStateChange={() => undefined}
      onRender={() => undefined}
    />,
  );
}
