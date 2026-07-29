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
