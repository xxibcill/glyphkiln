import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DESIGN_DOCUMENT_VERSION,
  DESIGN_DOCUMENT_RUNTIME_REFINEMENTS,
  TEMPLATE_IDS,
  createDesignDocument,
  getDesignDocumentJsonSchema,
  validateDesignDocument,
  type CreateDesignDocumentInput,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("design document schema", () => {
  it.each(TEMPLATE_IDS)("validates the %s example", async (name) => {
    const result = validateDesignDocument(await loadExample(name));
    expect(result.success).toBe(true);
  });

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

  it("exports strict draft 2020-12 input JSON Schema", async () => {
    const schema = getDesignDocumentJsonSchema() as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
    expect(DESIGN_DOCUMENT_RUNTIME_REFINEMENTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNIQUE_LAYER_IDS" }),
        expect.objectContaining({ code: "QUIET_REGION_HORIZONTAL_BOUNDS" }),
      ]),
    );
    const validateJsonSchema = new Ajv2020().compile(schema);
    for (const name of TEMPLATE_IDS) {
      expect(
        validateJsonSchema(await loadExample(name)),
        JSON.stringify(validateJsonSchema.errors),
      ).toBe(true);
    }
  });

  it("publishes conformance fixtures for runtime-only refinements", async () => {
    const schema = getDesignDocumentJsonSchema();
    const validateJsonSchema = new Ajv2020().compile(schema);
    const expectations = JSON.parse(
      await readFile(resolve("fixtures/schema-conformance/expectations.json"), "utf8"),
    ) as Record<string, { jsonSchemaValid: boolean; runtimeValid: boolean }>;
    for (const [name, expected] of Object.entries(expectations)) {
      const document = JSON.parse(
        await readFile(resolve(`fixtures/schema-conformance/${name}.json`), "utf8"),
      ) as unknown;
      expect(validateJsonSchema(document), name).toBe(expected.jsonSchemaValid);
      expect(validateDesignDocument(document).success, name).toBe(
        expected.runtimeValid,
      );
    }
  });
});
