import { describe, expect, it } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";

import { resourceReferencesMatchDocument } from "./revision-resource-provenance";

describe("revision resource provenance", () => {
  it("accepts an exact app-owned font admission and rejects another ID", () => {
    const document = createPreviewDesign();
    document.metadata = {
      resourceVersions: {
        assets: [],
        fonts: [
          {
            id: "font-corrected",
            family: "Kiln Sans",
            weight: 700,
            style: "normal",
            sha256: "a".repeat(64),
            origin: { kind: "licensed-library" },
            license: { status: "licensed", identifier: "license-corrected" },
          },
        ],
      },
    };

    expect(
      resourceReferencesMatchDocument(document, [
        {
          resourceId: "font-corrected",
          resourceKind: "font",
          ordinal: 0,
        },
      ]),
    ).toBe(true);
    expect(
      resourceReferencesMatchDocument(document, [
        { resourceId: "font-earlier", resourceKind: "font", ordinal: 0 },
      ]),
    ).toBe(false);
  });

  it("accepts deterministic legacy font backfills but rejects missing ordinals", () => {
    const document = createPreviewDesign();
    document.metadata = {
      resourceVersions: {
        assets: [],
        fonts: [
          {
            family: "Kiln Sans",
            weight: 700,
            style: "normal",
            sha256: "a".repeat(64),
          },
        ],
      },
    };

    expect(
      resourceReferencesMatchDocument(document, [
        { resourceId: "font-legacy", resourceKind: "font", ordinal: 0 },
      ]),
    ).toBe(true);
    expect(
      resourceReferencesMatchDocument(document, [
        { resourceId: "font-legacy", resourceKind: "font", ordinal: 1 },
      ]),
    ).toBe(false);
  });
});
