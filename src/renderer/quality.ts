import type { QualityIssue } from "../domain/types.js";
import { getFormatDimensions } from "../formats/index.js";
import type { DesignDocument } from "../schema/index.js";

export function runDocumentQualityChecks(document: DesignDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const dimensions = getFormatDimensions(document.format);
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    issues.push({
      code: "INVALID_DIMENSIONS",
      severity: "error",
      message: "The selected format has invalid dimensions.",
      details: { dimensions },
    });
  }
  const prohibited = new Set(
    document.brand.prohibitedColors.map((value) => value.toLowerCase()),
  );
  for (const [name, value] of Object.entries(document.brand.palette)) {
    const colors = Array.isArray(value) ? value : [value];
    for (const paletteColor of colors) {
      if (prohibited.has(paletteColor.toLowerCase())) {
        issues.push({
          code: "PROHIBITED_COLOR",
          severity: "error",
          message: `Brand palette field "${name}" uses prohibited color ${paletteColor}.`,
          details: { paletteField: name, color: paletteColor },
        });
      }
    }
  }
  const procedural = document.layers.find(
    (
      layer,
    ): layer is Extract<
      (typeof document.layers)[number],
      { type: "procedural-decoration" }
    > => layer.type === "procedural-decoration" && layer.visible,
  );
  const prohibitedStyles = new Set(
    document.brand.prohibitedStyles.map((style) => style.toLocaleLowerCase("en-US")),
  );
  const selectedStyles = [
    document.template.id,
    ...(procedural === undefined ? [] : [procedural.style]),
  ];
  for (const style of selectedStyles) {
    if (!prohibitedStyles.has(style.toLocaleLowerCase("en-US"))) continue;
    issues.push({
      code: "PROHIBITED_STYLE",
      severity: "error",
      message: `Selected style "${style}" is prohibited by the brand snapshot.`,
      details: { style },
    });
  }
  if (
    procedural !== undefined &&
    !document.brand.preferredProceduralStyles.includes(procedural.style)
  ) {
    issues.push({
      code: "NON_PREFERRED_PROCEDURAL_STYLE",
      severity: "warning",
      message: `Procedural style "${procedural.style}" is outside the brand preference list.`,
      layerId: procedural.id,
      details: {
        selected: procedural.style,
        preferred: document.brand.preferredProceduralStyles,
      },
    });
  }
  return issues;
}

export function assertOutputValidity(format: "svg" | "png", bytes: Uint8Array): void {
  if (format === "svg") {
    const text = new TextDecoder().decode(bytes);
    if (!text.startsWith("<svg ") || !text.endsWith("</svg>")) {
      throw new Error("SVG output is not a complete SVG document.");
    }
    return;
  }
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < signature.length) {
    throw new Error("PNG output is truncated.");
  }
  for (const [index, byte] of signature.entries()) {
    if (bytes[index] !== byte) {
      throw new Error("PNG output has an invalid signature.");
    }
  }
}
