import { describe, expect, it } from "vitest";

import {
  DESIGN_DOCUMENT_VERSION,
  createDesignDocument,
  getDesignDocumentJsonSchema,
  validateDesignDocument,
  type CreateDesignDocumentInput,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("design document schema", () => {
  it.each(["product-announcement", "statistic-card", "quote-card", "article-cover"])(
    "validates the %s example",
    async (name) => {
      const result = validateDesignDocument(await loadExample(name));
      expect(result.success).toBe(true);
    },
  );

  it("rejects unknown top-level properties", async () => {
    const document = {
      ...(await loadExample("product-announcement")),
      unexpected: true,
    };
    const result = validateDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "unrecognized_keys" }),
        ]),
      );
    }
  });

  it("rejects unknown nested layer properties", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers[0] = { ...document.layers[0]!, unsafe: "value" } as never;
    expect(validateDesignDocument(document).success).toBe(false);
  });

  it("rejects unsupported document versions", async () => {
    const document = {
      ...(await loadExample("product-announcement")),
      schemaVersion: "2.0.0",
    };
    const result = validateDesignDocument(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems[0]?.path).toBe("schemaVersion");
    }
  });

  it("rejects duplicate layer IDs", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers[1] = { ...document.layers[1]!, id: document.layers[0]!.id };
    expect(validateDesignDocument(document).success).toBe(false);
  });

  it("creates a stable ID and applies schema defaults", async () => {
    const source = await loadExample("product-announcement");
    const input = Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== "id" && key !== "schemaVersion"),
    ) as CreateDesignDocumentInput;
    const first = createDesignDocument(input);
    const second = createDesignDocument(input);
    expect(first.id).toBe(second.id);
    expect(first.schemaVersion).toBe(DESIGN_DOCUMENT_VERSION);
    expect(first.layers.every((layer) => typeof layer.visible === "boolean")).toBe(
      true,
    );
  });

  it("exports strict draft 2020-12 JSON Schema", () => {
    const schema = getDesignDocumentJsonSchema() as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
  });
});
