import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  renderGraphic,
  validateDesignDocument,
  type DesignDocument,
} from "../src/index.js";

describe("full design fixtures", () => {
  it("keeps every edge fixture schema-valid and render-accounted", async () => {
    const directory = resolve("fixtures/renderable");
    const files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const document = JSON.parse(
        await readFile(resolve(directory, file), "utf8"),
      ) as DesignDocument;
      expect(validateDesignDocument(document).success, file).toBe(true);
      const expected = document.metadata?.["fixtureExpected"];
      if (expected === "render-success") {
        await expect(
          renderGraphic(document, {
            formats: ["svg"],
            creationTimestamp: "2026-07-29T10:00:00.000Z",
          }),
          file,
        ).resolves.toBeDefined();
      } else if (expected === "quality-failure") {
        await expect(renderGraphic(document), file).rejects.toMatchObject({
          code: "QUALITY_VALIDATION_FAILED",
        });
      } else {
        await expect(renderGraphic(document), file).rejects.toMatchObject({
          code: "UNSUPPORTED_FONT",
        });
      }
    }
  });
});
