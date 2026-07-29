import { describe, expect, it } from "vitest";

import { canonicalJson, createRenderFingerprint, hashCanonical } from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"z":1}',
    );
  });

  it("normalizes negative zero and rejects non-finite values", () => {
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });

  it("hashes equivalent objects identically", () => {
    expect(hashCanonical({ b: 2, a: 1 })).toBe(hashCanonical({ a: 1, b: 2 }));
  });
});

describe("render fingerprints", () => {
  const baseInputs = {
    outputFormat: "png" as const,
    assetHashes: ["a".repeat(64)],
    fontHashes: ["f".repeat(64)],
    proceduralAlgorithmVersions: { "flow-field": "1.0.0" },
  };

  it("is identical for identical inputs", async () => {
    const document = await loadExample("product-announcement");
    const first = createRenderFingerprint({ document, ...baseInputs });
    const second = createRenderFingerprint({ document, ...baseInputs });
    expect(first).toBe(second);
  });

  it("changes with the seed", async () => {
    const first = await loadExample("product-announcement");
    const second = cloneDocument(first);
    second.seed = "different-seed";
    expect(createRenderFingerprint({ document: first, ...baseInputs })).not.toBe(
      createRenderFingerprint({ document: second, ...baseInputs }),
    );
  });

  it("changes with the template version", async () => {
    const first = await loadExample("product-announcement");
    const second = cloneDocument(first);
    second.template.version = "1.0.1";
    expect(createRenderFingerprint({ document: first, ...baseInputs })).not.toBe(
      createRenderFingerprint({ document: second, ...baseInputs }),
    );
  });

  it("changes with asset hashes", async () => {
    const document = await loadExample("product-announcement");
    const first = createRenderFingerprint({ document, ...baseInputs });
    const second = createRenderFingerprint({
      document,
      ...baseInputs,
      assetHashes: ["b".repeat(64)],
    });
    expect(first).not.toBe(second);
  });

  it("changes with font hashes", async () => {
    const document = await loadExample("product-announcement");
    const first = createRenderFingerprint({ document, ...baseInputs });
    const second = createRenderFingerprint({
      document,
      ...baseInputs,
      fontHashes: ["e".repeat(64)],
    });
    expect(first).not.toBe(second);
  });

  it("keeps font identity-to-hash assignments in the fingerprint", async () => {
    const document = await loadExample("product-announcement");
    const common = {
      document,
      outputFormat: "png" as const,
      assetHashes: [],
      proceduralAlgorithmVersions: { "flow-field": "1.0.0" },
    };
    const first = createRenderFingerprint({
      ...common,
      fonts: [
        {
          family: "Alpha",
          weight: 400,
          style: "normal",
          sha256: "a".repeat(64),
        },
        {
          family: "Beta",
          weight: 400,
          style: "normal",
          sha256: "b".repeat(64),
        },
      ],
    });
    const second = createRenderFingerprint({
      ...common,
      fonts: [
        {
          family: "Alpha",
          weight: 400,
          style: "normal",
          sha256: "b".repeat(64),
        },
        {
          family: "Beta",
          weight: 400,
          style: "normal",
          sha256: "a".repeat(64),
        },
      ],
    });
    expect(first).not.toBe(second);
  });

  it("ignores non-rendering metadata and document ID", async () => {
    const first = await loadExample("product-announcement");
    const second = cloneDocument(first);
    second.id = "metadata-only-change";
    second.metadata = { requestTimestamp: "2099-01-01T00:00:00.000Z" };
    expect(createRenderFingerprint({ document: first, ...baseInputs })).toBe(
      createRenderFingerprint({ document: second, ...baseInputs }),
    );
  });
});
