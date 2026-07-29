import { getFormatDimensions } from "./formats/index.js";
import { validateDesignDocument, type DesignDocument } from "./schema/index.js";
import { getTemplate } from "./templates/index.js";
import { GlyphkilnError } from "./domain/types.js";

export type DesignInspection = {
  valid: true;
  schemaVersion: string;
  id: string;
  template: {
    id: string;
    version: string;
    requiredLayers: readonly string[];
    constraints: {
      headlineMaximumLines: number;
      safeAreaBehavior: string;
      layout: string;
    };
  };
  format: string;
  dimensions: { width: number; height: number };
  layerCount: number;
  layerTypes: string[];
  assets: number;
  fonts: number;
};

export function inspectDesignDocument(input: unknown): DesignInspection {
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    throw new GlyphkilnError(
      "Design document validation failed.",
      "INVALID_DESIGN_DOCUMENT",
      { problems: validation.problems },
    );
  }
  return inspectValidatedDocument(validation.data);
}

function inspectValidatedDocument(document: DesignDocument): DesignInspection {
  const template = getTemplate(document);
  return {
    valid: true,
    schemaVersion: document.schemaVersion,
    id: document.id,
    template: {
      id: template.id,
      version: template.version,
      requiredLayers: template.requiredLayers,
      constraints: template.constraints,
    },
    format: document.format,
    dimensions: getFormatDimensions(document.format),
    layerCount: document.layers.length,
    layerTypes: document.layers.map((layer) => layer.type),
    assets: document.assets.length,
    fonts: document.fonts.length,
  };
}
