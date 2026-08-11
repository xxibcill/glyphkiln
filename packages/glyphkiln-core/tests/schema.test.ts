import { execFile } from "node:child_process";
import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
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
  type DesignDocument,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

const execFileAsync = promisify(execFile);
const schemaConformanceGenerator = resolve("scripts/generate-schema-conformance.mjs");

async function schemaConformanceVerifierFailure(): Promise<string> {
  try {
    await execFileAsync(process.execPath, [schemaConformanceGenerator, "--verify"]);
    throw new Error("Expected schema conformance verifier to fail.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return error.stderr;
    }
    throw error;
  }
}

function currentDisplayRole(document: DesignDocument): {
  weight: number;
  lineHeight: number;
  tracking: number;
} {
  const typography = document.brand.typography;
  if (!("roles" in typography) || typography.roles?.display === undefined) {
    throw new Error("Expected a current display typography role.");
  }
  return typography.roles.display;
}

function currentImageLayer(document: DesignDocument): {
  fit?: "contain" | "cover";
  focalPoint?: { x: number; y: number };
  treatment?: "none" | "dark-scrim" | "light-scrim";
} {
  const image = document.layers.find((layer) => layer.type === "image");
  if (image?.type !== "image" || !("focalPoint" in image)) {
    throw new Error("Expected a current image layer.");
  }
  return image as {
    fit?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    treatment?: "none" | "dark-scrim" | "light-scrim";
  };
}

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
    expect(DESIGN_DOCUMENT_VERSION).toBe("1.4.0");
    expect(SUPPORTED_DESIGN_DOCUMENT_VERSIONS).toEqual([
      "1.0.0",
      "1.1.0",
      "1.2.0",
      "1.3.0",
      "1.4.0",
    ]);

    const legacy = await loadExample("product-announcement");
    expect(legacy.schemaVersion).toBe("1.0.0");
    expect(validateDesignDocument(legacy).success).toBe(true);

    const carousel = {
      ...(await loadExample("tiktok-carousel-slide")),
      schemaVersion: "1.1.0",
      template: { id: "tiktok-carousel-slide", version: "1.0.2" },
      format: "tiktok-carousel",
    };
    expect(validateDesignDocument(carousel).success).toBe(true);
    expect(
      validateDesignDocument({ ...carousel, schemaVersion: "1.0.0" }).success,
    ).toBe(false);
  });

  it("versions bounded brand roles and focal image controls in schema 1.4.0", async () => {
    const document = await loadExample("image-led-campaign");
    const validateJsonSchema = new Ajv2020().compile(getDesignDocumentJsonSchema());
    const expectValidity = (candidate: unknown, expected: boolean) => {
      expect(validateDesignDocument(candidate).success).toBe(expected);
      expect(
        validateJsonSchema(candidate),
        JSON.stringify(validateJsonSchema.errors),
      ).toBe(expected);
    };

    expectValidity(document, true);

    const legacy = { ...document, schemaVersion: "1.3.0" };
    expectValidity(legacy, false);

    for (const [property, value] of [
      ["weight", 100],
      ["weight", 900],
      ["lineHeight", 0.85],
      ["lineHeight", 1.8],
      ["tracking", -0.05],
      ["tracking", 0.2],
    ] as const) {
      const boundary = structuredClone(document);
      currentDisplayRole(boundary)[property] = value;
      expectValidity(boundary, true);
    }

    for (const [property, value] of [
      ["weight", 99],
      ["weight", 901],
      ["weight", 150],
      ["lineHeight", 0.849],
      ["lineHeight", 1.801],
      ["tracking", -0.051],
      ["tracking", 0.201],
    ] as const) {
      const outsideBoundary = structuredClone(document);
      currentDisplayRole(outsideBoundary)[property] = value;
      expectValidity(outsideBoundary, false);
    }

    for (const focalPoint of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]) {
      const boundary = structuredClone(document);
      currentImageLayer(boundary).focalPoint = focalPoint;
      expectValidity(boundary, true);
    }

    for (const focalPoint of [
      { x: -0.001, y: 0.5 },
      { x: 1.001, y: 0.5 },
      { x: 0.5, y: -0.001 },
      { x: 0.5, y: 1.001 },
    ]) {
      const outsideBoundary = structuredClone(document);
      currentImageLayer(outsideBoundary).focalPoint = focalPoint;
      expectValidity(outsideBoundary, false);
    }

    for (const treatment of ["none", "dark-scrim", "light-scrim"] as const) {
      const allowed = structuredClone(document);
      currentImageLayer(allowed).treatment = treatment;
      expectValidity(allowed, true);
    }
    const invalidTreatment = structuredClone(document);
    (currentImageLayer(invalidTreatment) as { treatment: string }).treatment =
      "custom-filter";
    expectValidity(invalidTreatment, false);

    const omitted = structuredClone(document);
    const omittedImage = currentImageLayer(omitted);
    delete omittedImage.fit;
    delete omittedImage.focalPoint;
    delete omittedImage.treatment;
    if ("roles" in omitted.brand.typography) {
      delete omitted.brand.typography.roles;
    }
    expectValidity(omitted, true);
    const parsed = validateDesignDocument(omitted);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const parsedImage = parsed.data.layers.find((layer) => layer.type === "image");
      expect(parsedImage).toMatchObject({ fit: "contain", visible: true });
      expect(parsedImage).not.toHaveProperty("focalPoint");
      expect(parsedImage).not.toHaveProperty("treatment");
      expect(parsed.data.brand.typography).not.toHaveProperty("roles");
    }
  });

  it("validates bounded keep-together phrases in schema 1.2.0 and newer", async () => {
    const source = await loadExample("product-announcement");
    const current = {
      ...source,
      schemaVersion: "1.2.0",
      layers: source.layers.map((layer) =>
        layer.type === "headline" ? { ...layer, keepTogether: ["ยังเดินต่อ"] } : layer,
      ),
    };
    expect(validateDesignDocument(current).success).toBe(true);
    expect(validateDesignDocument({ ...current, schemaVersion: "1.2.0" }).success).toBe(
      true,
    );
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
    const { id: _id, schemaVersion: _schemaVersion, ...input } = source;
    expect(_id).toBe("example-product-announcement");
    expect(_schemaVersion).toBe("1.0.0");
    const first = createDesignDocument(input);
    const second = createDesignDocument(input);
    expect(first.id).toBe(second.id);
    expect(first.schemaVersion).toBe(DESIGN_DOCUMENT_VERSION);
    expect(first.layers.every((layer) => typeof layer.visible === "boolean")).toBe(
      true,
    );
  });

  it("creates current 3:4 carousel documents through the public helper type", async () => {
    const source = await loadExample("tiktok-carousel-slide");
    const { id: _id, schemaVersion: _schemaVersion, ...input } = source;
    expect(_id).toBe("example-tiktok-carousel-slide-01");
    expect(_schemaVersion).toBe("1.3.0");
    const typedInput = input satisfies CreateDesignDocumentInput;

    const document = createDesignDocument(typedInput);

    expect(document.schemaVersion).toBe(DESIGN_DOCUMENT_VERSION);
    expect(document.format).toBe("tiktok-photo-carousel");
    expect(document.template).toEqual({
      id: "tiktok-carousel-slide",
      version: "1.0.3",
    });
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
        name === "tiktok-carousel-slide"
          ? "1.3.0"
          : name === "image-led-campaign"
            ? DESIGN_DOCUMENT_VERSION
            : "1.0.0";
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

  it("rejects obsolete conformance artifacts without rewriting them", async () => {
    const unexpectedFixture = resolve(
      "fixtures/schema-conformance/obsolete-verifier-test.json",
    );
    await writeFile(unexpectedFixture, "{}\n", "utf8");

    try {
      await expect(schemaConformanceVerifierFailure()).resolves.toContain(
        "obsolete-verifier-test.json",
      );
      await expect(readFile(unexpectedFixture, "utf8")).resolves.toBe("{}\n");
    } finally {
      await rm(unexpectedFixture, { force: true });
    }
  });
});
