import { describe, expect, it } from "vitest";

import type { BrandSnapshot, DesignDocument } from "@glyphkiln/core";

import {
  buildPreviewDocument,
  createInitialPreviewForm,
} from "@/features/project-preview/document-builder";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";

import {
  buildBrandSnapshotDraft,
  buildManualDraft,
  documentMatchesManualInput,
  formFromStoredDocument,
  withBrandSnapshot,
} from "./manual-state";

const catalog = createPreviewCatalog();

describe("manual App Alpha state", () => {
  it("keeps trusted document fields out of the manual draft", () => {
    const state = createInitialPreviewForm(catalog);
    const draft = buildManualDraft(state, catalog);

    expect(draft).toMatchObject({
      templateId: state.composition.templateId,
      format: state.composition.formatId,
      seed: state.composition.seed,
      mode: state.brand.mode,
    });
    expect(draft).not.toHaveProperty("brand");
    expect(draft).not.toHaveProperty("fonts");
    expect(draft).not.toHaveProperty("template.version");
    expect(draft).not.toHaveProperty("id");
  });

  it("builds brand values without accepting snapshot identity or version", () => {
    const state = createInitialPreviewForm(catalog);
    const snapshot = buildBrandSnapshotDraft(state);

    expect(snapshot.palette.primary).toBe(state.brand.primary);
    expect(snapshot.preferredProceduralStyles).toEqual([
      state.composition.proceduralStyle,
    ]);
    expect(snapshot).not.toHaveProperty("snapshotId");
    expect(snapshot).not.toHaveProperty("version");
    expect(snapshot).not.toHaveProperty("name");
  });

  it("reopens stored structured copy and exact immutable brand values", () => {
    const initial = createInitialPreviewForm(catalog);
    const brand = createPublishedBrand();
    const branded = withBrandSnapshot(initial, brand);
    const candidate = buildPreviewDocument(branded, catalog);
    const document = {
      ...candidate,
      id: "design-1",
      metadata: { source: "glyphkiln-app-manual" },
    };

    const reopened = formFromStoredDocument(document, catalog);
    const reopenedDraft = buildManualDraft(reopened, catalog);

    expect(reopened.brand.snapshotId).toBe(brand.snapshotId);
    expect(reopened.brand.version).toBe(brand.version);
    expect(reopened.copy.productAnnouncement.headline).toBe(
      initial.copy.productAnnouncement.headline,
    );
    expect(
      documentMatchesManualInput(
        document,
        brand,
        reopenedDraft,
        catalog.developmentFontSha256,
      ),
    ).toBe(true);
  });

  it("preserves exact resource selections when reopening a saved revision", () => {
    const initial = createInitialPreviewForm(catalog);
    const brand = createPublishedBrand();
    const candidate = buildPreviewDocument(withBrandSnapshot(initial, brand), catalog);
    const document: DesignDocument = {
      ...candidate,
      id: "design-with-resources",
      assets: [
        {
          id: "asset-selected",
          mimeType: "image/png",
          sha256: "a".repeat(64),
          width: 32,
          height: 32,
          origin: { kind: "user-upload" },
        },
      ],
      fonts: [
        ...candidate.fonts,
        {
          family: "Kiln Sans",
          weight: 700,
          style: "normal",
          sha256: "b".repeat(64),
        },
      ],
      metadata: {
        source: "glyphkiln-app-manual",
        resourceVersions: {
          assets: [
            {
              id: "asset-selected",
              sha256: "a".repeat(64),
              origin: { kind: "user-upload" },
              license: { status: "owned" },
            },
          ],
          fonts: [
            {
              id: "font-selected",
              family: "Kiln Sans",
              weight: 700,
              style: "normal",
              sha256: "b".repeat(64),
              origin: { kind: "licensed-library" },
              license: { status: "licensed" },
            },
          ],
        },
      },
    };

    const reopened = formFromStoredDocument(document, catalog);
    const reopenedDraft = buildManualDraft(reopened, catalog);

    expect(reopenedDraft.resources).toEqual({
      assetIds: ["asset-selected"],
      fontIds: ["font-selected"],
    });
    expect(
      documentMatchesManualInput(
        document,
        brand,
        reopenedDraft,
        catalog.developmentFontSha256,
      ),
    ).toBe(true);
  });

  it("reopens the visible sequence copy and metric mode of a carousel slide", () => {
    const initial = createInitialPreviewForm(catalog);
    initial.composition.templateId = "tiktok-carousel-slide";
    initial.composition.formatId = "tiktok-photo-carousel";
    initial.copy.tiktokCarouselSlide.mode = "metric";
    initial.copy.tiktokCarouselSlide.slideNumber = "04 / 06";
    initial.copy.tiktokCarouselSlide.value = "100%";
    initial.copy.tiktokCarouselSlide.label =
      "reproducible from one pinned rendering contract";

    const brand = createPublishedBrand();
    const branded = withBrandSnapshot(initial, brand);
    const candidate = buildPreviewDocument(branded, catalog);
    const document = {
      ...candidate,
      id: "carousel-slide-4",
      metadata: { source: "glyphkiln-app-manual" },
    };

    const reopened = formFromStoredDocument(document, catalog);
    const reopenedDraft = buildManualDraft(reopened, catalog);

    expect(reopened.copy.tiktokCarouselSlide).toMatchObject({
      mode: "metric",
      slideNumber: "04 / 06",
      value: "100%",
      label: "reproducible from one pinned rendering contract",
    });
    expect(
      documentMatchesManualInput(
        document,
        brand,
        reopenedDraft,
        catalog.developmentFontSha256,
      ),
    ).toBe(true);
  });
});

function createPublishedBrand(): BrandSnapshot {
  const state = createInitialPreviewForm(catalog);
  return {
    snapshotId: "brand-kit-1",
    version: "1.0.3",
    name: "Foundry & Field",
    ...buildBrandSnapshotDraft(state),
  };
}
