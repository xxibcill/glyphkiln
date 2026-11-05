import { readFileSync } from "node:fs";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  DESIGN_DOCUMENT_RUNTIME_REFINEMENTS,
  getDesignDocumentJsonSchema,
  validateDesignDocument,
} from "../src/index.js";
import {
  THAI_LEXICON_ENTRY_PATTERN,
  keepTogetherPhrasesOf,
  preferBreakAfterOf,
} from "../src/schema/design-document.js";
import { normalizeThaiLexicon } from "../src/typography/thai-segmentation-hybrid.js";

type Draft = {
  schemaVersion: string;
  lexicon?: unknown;
  brand: { typography: { lexicon?: unknown } };
  layers: { type: string; keepTogether?: unknown }[];
};
const base = JSON.parse(
  readFileSync(
    new URL("./visual/m1/image-led-campaign-m1-square.design.json", import.meta.url),
    "utf8",
  ),
) as Draft;
const validateJsonSchema = new Ajv2020().compile(getDesignDocumentJsonSchema());

function withChanges(change: (document: typeof base) => void): typeof base {
  const document = structuredClone(base);
  change(document);
  return document;
}
const headline = (document: typeof base) =>
  document.layers.find((layer) => layer.type === "headline")!;

describe("DesignDocument 1.8.0 M3 fields", () => {
  it("accepts a document lexicon, a brand lexicon and preferred breaks", () => {
    const document = withChanges((draft) => {
      draft.lexicon = ["เพื่อนไร่เพื่อนสวน"];
      draft.brand.typography.lexicon = ["คิลน์ฟอร์ม"];
      headline(draft).keepTogether = {
        phrases: ["into form"],
        preferBreakAfter: ["Light,"],
      };
    });
    expect(validateJsonSchema(document)).toBe(true);
    const result = validateDesignDocument(document);
    expect(result.problems).toEqual([]);
    expect(result.success && result.data.schemaVersion).toBe("1.8.0");
    expect(result.success && "lexicon" in result.data && result.data.lexicon).toEqual([
      "เพื่อนไร่เพื่อนสวน",
    ]);
  });

  it("still accepts the phrase-list form of keepTogether", () => {
    const document = withChanges((draft) => {
      headline(draft).keepTogether = ["into form"];
    });
    expect(validateJsonSchema(document)).toBe(true);
    expect(validateDesignDocument(document).success).toBe(true);
  });

  it.each([
    ["a Latin entry", ["brand"], true],
    ["a Thai digit", ["๑๒"], true],
    ["a space", ["กรุง เทพ"], true],
    ["an empty entry", [""], true],
    ["a 41-unit entry", ["ก".repeat(41)], true],
    [
      "101 entries",
      Array.from(
        { length: 101 },
        (_, i) => "ก".repeat((i % 40) + 1) + "ข".repeat(Math.floor(i / 40)),
      ),
      true,
    ],
    ["a duplicate", ["กรุง", "กรุง"], false],
    ["a non-NFC entry", ["กุ่"], false],
  ])("rejects a lexicon with %s", (_, lexicon, jsonSchemaRejects) => {
    for (const place of ["document", "brand"] as const) {
      const document = withChanges((draft) => {
        if (place === "document") draft.lexicon = lexicon;
        else draft.brand.typography.lexicon = lexicon;
      });
      expect(validateJsonSchema(document), `${place} JSON Schema`).toBe(
        !jsonSchemaRejects,
      );
      expect(validateDesignDocument(document).success, place).toBe(false);
    }
  });

  it("rejects unknown keepTogether keys and the fields on 1.7.0", () => {
    expect(
      validateDesignDocument(
        withChanges((draft) => {
          headline(draft).keepTogether = { phrases: ["form"], prefer: ["x"] };
        }),
      ).success,
    ).toBe(false);
    const legacy = JSON.parse(
      readFileSync(
        new URL("./visual/baselines/statistic-card-roles.design.json", import.meta.url),
        "utf8",
      ),
    ) as Draft;
    expect(legacy.schemaVersion).not.toBe("1.8.0");
    expect(validateDesignDocument(legacy).success).toBe(true);
    expect(validateDesignDocument({ ...legacy, lexicon: ["กรุง"] }).success).toBe(
      false,
    );
  });

  it("documents the refinements JSON Schema cannot express", () => {
    expect(DESIGN_DOCUMENT_RUNTIME_REFINEMENTS.map((rule) => rule.code)).toEqual(
      expect.arrayContaining(["LEXICON_ENTRY_NFC", "UNIQUE_LEXICON_ENTRIES"]),
    );
  });

  it("matches the segmenter's lexicon alphabet exactly", () => {
    for (let code = 0x0e00; code <= 0x0e7f; code += 1) {
      const character = String.fromCharCode(code);
      let segmenterAccepts = true;
      try {
        normalizeThaiLexicon([character]);
      } catch {
        segmenterAccepts = false;
      }
      expect(THAI_LEXICON_ENTRY_PATTERN.test(character), code.toString(16)).toBe(
        segmenterAccepts,
      );
    }
  });

  it("reads both keepTogether forms", () => {
    expect(keepTogetherPhrasesOf(undefined)).toEqual([]);
    expect(keepTogetherPhrasesOf(["a"])).toEqual(["a"]);
    expect(keepTogetherPhrasesOf({ preferBreakAfter: ["b"] })).toEqual([]);
    expect(keepTogetherPhrasesOf({ phrases: ["a"] })).toEqual(["a"]);
    expect(preferBreakAfterOf(["a"])).toEqual([]);
    expect(preferBreakAfterOf(undefined)).toEqual([]);
    expect(preferBreakAfterOf({ phrases: ["a"] })).toEqual([]);
    expect(preferBreakAfterOf({ preferBreakAfter: ["b"] })).toEqual(["b"]);
  });
});
