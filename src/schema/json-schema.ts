import { z } from "zod";

import { DesignDocumentSchema } from "./design-document.js";

export function getDesignDocumentJsonSchema(): object {
  return z.toJSONSchema(DesignDocumentSchema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
}
