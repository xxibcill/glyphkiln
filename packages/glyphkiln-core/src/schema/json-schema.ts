import { z } from "zod";

import { DesignDocumentSchema } from "./design-document.js";

export const DESIGN_DOCUMENT_RUNTIME_REFINEMENTS = [
  {
    code: "UNIQUE_LAYER_IDS",
    path: "$.layers[*].id",
    description: "Layer IDs must be unique within the document.",
  },
  {
    code: "UNIQUE_ASSET_IDS",
    path: "$.assets[*].id",
    description: "Asset IDs must be unique within the document.",
  },
  {
    code: "QUIET_REGION_HORIZONTAL_BOUNDS",
    path: "$.layers[*].quietRegion",
    description: "x + width must be less than or equal to 1.",
  },
  {
    code: "QUIET_REGION_VERTICAL_BOUNDS",
    path: "$.layers[*].quietRegion",
    description: "y + height must be less than or equal to 1.",
  },
  {
    code: "SUBJECT_REGION_HORIZONTAL_BOUNDS",
    path: "$.layers[*].subjectRegion",
    description: "x + width must be less than or equal to 1 (schema 1.7.0).",
  },
  {
    code: "SUBJECT_REGION_VERTICAL_BOUNDS",
    path: "$.layers[*].subjectRegion",
    description: "y + height must be less than or equal to 1 (schema 1.7.0).",
  },
  {
    code: "UNIQUE_EMPHASIS_PHRASES",
    path: "$.layers[*].emphasis[*].phrase",
    description: "Emphasis phrases must be unique within a text layer (schema 1.7.0).",
  },
  {
    code: "EMPHASIS_PHRASE_IN_TEXT",
    path: "$.layers[*].emphasis[*].phrase",
    description:
      "After whitespace normalization, each emphasis phrase must occur within one paragraph of the layer text (schema 1.7.0).",
  },
  {
    code: "LEXICON_ENTRY_NFC",
    path: "$.lexicon[*], $.brand.typography.lexicon[*]",
    description: "Thai lexicon entries must be in Unicode NFC (schema 1.8.0).",
  },
  {
    code: "UNIQUE_LEXICON_ENTRIES",
    path: "$.lexicon[*], $.brand.typography.lexicon[*]",
    description: "Thai lexicon entries must be unique within a lexicon (schema 1.8.0).",
  },
] as const;

export function getDesignDocumentJsonSchema(): object {
  const schema = z.toJSONSchema(DesignDocumentSchema, {
    io: "input",
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
  return {
    ...schema,
    $comment:
      "Run validateDesignDocument after JSON Schema validation for the refinements exported as DESIGN_DOCUMENT_RUNTIME_REFINEMENTS.",
  };
}
