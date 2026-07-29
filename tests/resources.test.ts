import { describe, expect, it } from "vitest";

import {
  FontRegistry,
  RENDER_RESOURCE_LIMITS,
  RENDER_WORKER_PROFILE,
  validateDesignDocument,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("render resource limits", () => {
  it("rejects metadata deeper than the public limit before schema recursion", async () => {
    const document = cloneDocument(await loadExample("quote-card"));
    let nested: unknown = "leaf";
    for (let depth = 0; depth <= RENDER_RESOURCE_LIMITS.maxMetadataDepth; depth += 1) {
      nested = { nested };
    }
    document.metadata = { nested } as never;
    const result = validateDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "METADATA_DEPTH_LIMIT_EXCEEDED" }),
        ]),
      );
    }
  });

  it("rejects metadata larger than the public byte limit", async () => {
    const document = cloneDocument(await loadExample("quote-card"));
    document.metadata = {
      payload: "x".repeat(RENDER_RESOURCE_LIMITS.maxMetadataBytes + 1),
    };
    const result = validateDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "METADATA_BYTES_LIMIT_EXCEEDED" }),
        ]),
      );
    }
  });

  it("rejects cyclic SDK input without recursing indefinitely", async () => {
    const document = cloneDocument(await loadExample("quote-card"));
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    document.metadata = cycle as never;
    const result = validateDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "CYCLIC_DESIGN_INPUT" }),
        ]),
      );
    }
  });

  it("rejects a huge sparse collection without iterating its declared length", () => {
    const sparse: unknown[] = [];
    sparse.length = RENDER_RESOURCE_LIMITS.maxDesignDocumentEntries + 1;
    const result = validateDesignDocument(sparse);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DESIGN_ENTRIES_LIMIT_EXCEEDED" }),
        ]),
      );
    }
  });

  it("rejects oversized caller-supplied fonts before hashing or parsing", () => {
    expect(
      () =>
        new FontRegistry([
          {
            family: "Oversized",
            weight: 400,
            style: "normal",
            bytes: new Uint8Array(RENDER_RESOURCE_LIMITS.maxFontBytes + 1),
          },
        ]),
    ).toThrow(
      expect.objectContaining({
        code: "FONT_BYTES_LIMIT_EXCEEDED",
      }),
    );
  });

  it("publishes an actionable process-isolation profile", () => {
    expect(RENDER_WORKER_PROFILE.executionBoundary).toBe("node-child-process");
    expect(RENDER_WORKER_PROFILE.networkAccess).toBe("not-exposed-to-render-input");
    expect(RENDER_WORKER_PROFILE.subprocessAccess).toBe("deny");
    expect(RENDER_WORKER_PROFILE.maxConcurrentRenders).toBe(1);
    expect(RENDER_WORKER_PROFILE.timeoutMilliseconds).toBeGreaterThan(0);
    expect(
      RENDER_WORKER_PROFILE.nodeResourceLimits.maxOldGenerationSizeMb,
    ).toBeGreaterThan(0);
    expect(
      RENDER_WORKER_PROFILE.nodeResourceLimits.maxYoungGenerationSizeMb,
    ).toBeGreaterThan(0);
    expect(RENDER_WORKER_PROFILE.nodeResourceLimits.stackSizeMb).toBeGreaterThan(0);
  });
});
