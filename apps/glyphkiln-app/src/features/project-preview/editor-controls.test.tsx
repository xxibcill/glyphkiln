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

  it("keeps required badges visual without changing control names", () => {
    const markup = renderControls(false);

    expect(markup).toContain(
      '<span class="required-mark" aria-hidden="true">required</span>',
    );
  });

  it("exposes narrative and metric controls for TikTok carousel slides", () => {
    const narrativeMarkup = renderTiktokControls("narrative");
    expect(narrativeMarkup).toContain("TikTok carousel slide");
    expect(narrativeMarkup).toContain('id="tiktok-slide-number"');
    expect(narrativeMarkup).toMatch(/id="tiktok-slide-number"[^>]*required=""/);
    expect(narrativeMarkup).toContain('id="tiktok-headline"');
    expect(narrativeMarkup).toContain('id="tiktok-subtitle"');
    expect(narrativeMarkup).not.toContain('id="tiktok-statistic-value"');
    expect(narrativeMarkup).toContain("Keep one message per slide.");
    expect(narrativeMarkup).toContain("01 / 07");
    expect(narrativeMarkup).toContain("3-slide pack");
    expect(narrativeMarkup).toContain("7–9-slide sequence");
    expect(narrativeMarkup).toContain(
      "place the action CTA after the benefits or on the final slide.",
    );

    const metricMarkup = renderTiktokControls("metric");
    expect(metricMarkup).toContain('id="tiktok-statistic-value"');
    expect(metricMarkup).toContain('id="tiktok-statistic-label"');
    expect(metricMarkup).not.toContain('id="tiktok-subtitle"');
  });

  it("replaces TikTok procedural controls with its typography-first policy", () => {
    const tiktokMarkup = renderTiktokControls("narrative");

    expect(tiktokMarkup).toContain("Typography-first carousel");
    expect(tiktokMarkup).toContain(
      "AI-assisted starters prioritize semantic typography and renderer-native structural rules.",
    );
    expect(tiktokMarkup).toContain(
      "They do not add generated illustration or SVG assets.",
    );
    expect(tiktokMarkup).toContain(
      "the TikTok template keeps conservative extra clearance at the right and bottom edges.",
    );
    expect(tiktokMarkup).not.toContain('id="procedural-style"');
    expect(tiktokMarkup).not.toContain('id="intensity"');
    expect(tiktokMarkup).not.toContain("Quiet-region geometry");

    const productMarkup = renderControls(false);
    expect(productMarkup).toContain('id="procedural-style"');
    expect(productMarkup).toContain('id="intensity"');
  });

  it("associates synthetic metric quality issues with their editor fields", () => {
    const metricFailure: PreviewFailure = {
      ...FAILURE,
      qualityIssues: [
        {
          code: "TEXT_OVERFLOW",
          severity: "error",
          message: "The metric value is too long.",
          layerId: "carousel-statistic-value",
        },
      ],
    };

    const markup = renderTiktokControls("metric", metricFailure);
    expect(markup).toContain("The metric value is too long.");
    expect(markup).toContain('aria-describedby="tiktok-statistic-value-error"');
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

function renderTiktokControls(
  mode: "narrative" | "metric",
  response: PreviewFailure | null = null,
): string {
  const catalog = createPreviewCatalog();
  const state = createInitialPreviewForm(catalog);
  state.composition.templateId = "tiktok-carousel-slide";
  state.composition.formatId = "tiktok-photo-carousel";
  state.copy.tiktokCarouselSlide.mode = mode;

  return renderToStaticMarkup(
    <EditorControls
      catalog={catalog}
      state={state}
      response={response}
      isRendering={false}
      hasUnrenderedEdits={false}
      validationIsStale={false}
      onStateChange={() => undefined}
      onRender={() => undefined}
    />,
  );
}
