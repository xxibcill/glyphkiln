import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DESIGN_DOCUMENT_VERSION,
  DESIGN_DOCUMENT_RUNTIME_REFINEMENTS,
  SUPPORTED_DESIGN_DOCUMENT_VERSIONS,
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

  it("keeps legacy schemas readable while versioning new rendering controls", async () => {
    expect(DESIGN_DOCUMENT_VERSION).toBe("1.2.0");
    expect(SUPPORTED_DESIGN_DOCUMENT_VERSIONS).toEqual(["1.0.0", "1.1.0", "1.2.0"]);

    const legacy = await loadExample("product-announcement");
    expect(legacy.schemaVersion).toBe("1.0.0");
    expect(validateDesignDocument(legacy).success).toBe(true);

    const carousel = {
      ...(await loadExample("tiktok-carousel-slide")),
      schemaVersion: "1.1.0",
    };
    expect(validateDesignDocument(carousel).success).toBe(true);
    expect(
      validateDesignDocument({ ...carousel, schemaVersion: "1.0.0" }).success,
    ).toBe(false);
  });

  it("validates bounded keep-together phrases only in schema 1.2.0", async () => {
    const source = await loadExample("product-announcement");
    const current = {
      ...source,
      schemaVersion: "1.2.0",
      layers: source.layers.map((layer) =>
        layer.type === "headline" ? { ...layer, keepTogether: ["ยังเดินต่อ"] } : layer,
      ),
    };
    expect(validateDesignDocument(current).success).toBe(true);
    expect(validateDesignDocument({ ...current, schemaVersion: "1.1.0" }).success).toBe(
      false,
    );

    const invalid = {
      ...current,
      layers: current.layers.map((layer) =>
        layer.type === "headline"
          ? { ...layer, keepTogether: [" duplicate", "duplicate\nphrase"] }
          : layer,
      ),
    };
    expect(validateDesignDocument(invalid).success).toBe(false);
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
    expect(DESIGN_DOCUMENT_RUNTIME_REFINEMENTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNIQUE_LAYER_IDS" }),
        expect.objectContaining({ code: "QUIET_REGION_HORIZONTAL_BOUNDS" }),
      ]),
    );
    const validateJsonSchema = new Ajv2020().compile(schema);
    expect(
      validateJsonSchema({
        ...(await loadExample("product-announcement")),
        unexpected: true,
      }),
    ).toBe(false);
    for (const name of TEMPLATE_IDS) {
      const example = await loadExample(name);
      const schemaVersion =
        name === "tiktok-carousel-slide" ? DESIGN_DOCUMENT_VERSION : "1.0.0";
      expect(
        validateJsonSchema({ ...example, schemaVersion }),
        JSON.stringify(validateJsonSchema.errors),
      ).toBe(true);
    }
    const mislabeledCarousel = {
      ...(await loadExample("tiktok-carousel-slide")),
      schemaVersion: "1.0.0",
    };
    expect(validateJsonSchema(mislabeledCarousel)).toBe(false);
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
