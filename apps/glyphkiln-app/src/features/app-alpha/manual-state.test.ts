import { describe, expect, it } from "vitest";

import type { BrandSnapshot } from "@glyphkiln/core";

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
    expect(documentMatchesManualInput(document, brand, reopenedDraft)).toBe(true);
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
