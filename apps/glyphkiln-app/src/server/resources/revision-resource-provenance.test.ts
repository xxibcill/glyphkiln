import { describe, expect, it } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";

import {
  resourceReferencesMatchDocument,
  type RevisionResourceReference,
} from "./revision-resource-provenance";

describe("revision resource provenance", () => {
  it("requires an exact app-owned font admission, including provenance", () => {
    const document = createPreviewDesign();
    document.metadata = {
      resourceVersions: {
        assets: [],
        fonts: [fontVersion()],
      },
    };
    const exact = fontReference();

    expect(resourceReferencesMatchDocument(document, [exact])).toBe(true);
    expect(
      resourceReferencesMatchDocument(document, [
        { ...exact, resourceId: "font-earlier" },
      ]),
    ).toBe(false);
    expect(
      resourceReferencesMatchDocument(document, [
        { ...exact, contentHash: "b".repeat(64) },
      ]),
    ).toBe(false);
    expect(
      resourceReferencesMatchDocument(document, [
        { ...exact, origin: { kind: "unknown" } },
      ]),
    ).toBe(false);
    expect(
      resourceReferencesMatchDocument(document, [
        {
          ...exact,
          license: { status: "licensed", identifier: "license-earlier" },
        },
      ]),
    ).toBe(false);
  });

  it("accepts a deterministic legacy font backfill but still verifies its identity", () => {
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
    const reference = fontReference();

    expect(resourceReferencesMatchDocument(document, [reference])).toBe(true);
    expect(
      resourceReferencesMatchDocument(document, [
        { ...reference, contentHash: "b".repeat(64) },
      ]),
    ).toBe(false);
    expect(
      resourceReferencesMatchDocument(document, [{ ...reference, ordinal: 1 }]),
    ).toBe(false);
  });

  it("matches asset declarations and repeated provenance to the same admission", () => {
    const document = createPreviewDesign();
    document.assets = [
      {
        id: "asset-corrected",
        mimeType: "image/png",
        sha256: "c".repeat(64),
        width: 32,
        height: 32,
        origin: { kind: "user-upload", sourceName: "Product team" },
      },
    ];
    document.metadata = {
      resourceVersions: {
        assets: [
          {
            id: "asset-corrected",
            sha256: "c".repeat(64),
            origin: { kind: "user-upload", sourceName: "Product team" },
            license: { status: "owned" },
          },
        ],
        fonts: [],
      },
    };
    const reference: RevisionResourceReference = {
      resourceId: "asset-corrected",
      resourceKind: "raster-asset",
      ordinal: 0,
      contentHash: "c".repeat(64),
      origin: { kind: "user-upload", sourceName: "Product team" },
      license: { status: "owned" },
    };

    expect(resourceReferencesMatchDocument(document, [reference])).toBe(true);
    expect(
      resourceReferencesMatchDocument(document, [
        { ...reference, license: { status: "unknown" } },
      ]),
    ).toBe(false);
  });
});

function fontVersion() {
  return {
    id: "font-corrected",
    family: "Kiln Sans",
    weight: 700,
    style: "normal" as const,
    sha256: "a".repeat(64),
    origin: { kind: "licensed-library" as const },
    license: { status: "licensed" as const, identifier: "license-corrected" },
  };
}

function fontReference(): RevisionResourceReference {
  return {
    resourceId: "font-corrected",
    resourceKind: "font",
    ordinal: 0,
    contentHash: "a".repeat(64),
    family: "Kiln Sans",
    weight: 700,
    style: "normal",
    origin: { kind: "licensed-library" },
    license: { status: "licensed", identifier: "license-corrected" },
  };
}
