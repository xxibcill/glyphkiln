import { describe, expect, it } from "vitest";

import { FileSystemRenderBlobStorage } from "./filesystem-render-blob-storage";
import {
  createRenderBlobStorageFromEnvironment,
  readStorageRootFromEnvironment,
} from "./configured-storage";

function testEnvironment(
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("configured render storage", () => {
  it.each([{}, { GLYPHKILN_STORAGE_ROOT: "   " }])(
    "fails closed when the storage root is absent",
    (environment) => {
      expect(() =>
        readStorageRootFromEnvironment(testEnvironment(environment)),
      ).toThrow("GLYPHKILN_STORAGE_ROOT is required for immutable render storage.");
      expect(() =>
        createRenderBlobStorageFromEnvironment(testEnvironment(environment)),
      ).toThrow("GLYPHKILN_STORAGE_ROOT is required for immutable render storage.");
    },
  );

  it("normalizes surrounding whitespace before constructing storage", () => {
    const environment = testEnvironment({
      GLYPHKILN_STORAGE_ROOT: "  /srv/glyphkiln/storage  ",
    });

    expect(readStorageRootFromEnvironment(environment)).toBe("/srv/glyphkiln/storage");
    expect(createRenderBlobStorageFromEnvironment(environment)).toBeInstanceOf(
      FileSystemRenderBlobStorage,
    );
  });

  it("leaves filesystem safety validation to the storage adapter", () => {
    expect(() =>
      createRenderBlobStorageFromEnvironment(
        testEnvironment({
          GLYPHKILN_STORAGE_ROOT: "relative/storage",
        }),
      ),
    ).toThrow("Render storage must use a non-root absolute directory.");
  });
});
