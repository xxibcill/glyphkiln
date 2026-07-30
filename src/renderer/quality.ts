import type { QualityIssue } from "../domain/types.js";
import { getFormatDimensions } from "../formats/index.js";
import type { DesignDocument } from "../schema/index.js";
import { collectVisibleDesignTextLayoutDiagnostics } from "../typography/design-text-layout.js";
import { TEXT_LAYOUT_DIAGNOSTICS_VERSION } from "../typography/text-layout.js";

export type TextLayoutQualitySummary = {
  totalDiagnostics: number;
  retainedDiagnostics: number;
  truncated: boolean;
};

export type DocumentQualityCheckResult = {
  issues: QualityIssue[];
  textLayout: TextLayoutQualitySummary;
};

export function runDocumentQualityChecks(
  document: DesignDocument,
): DocumentQualityCheckResult {
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
  const textLayout = collectTextLayoutQualityIssues(document);
  issues.push(...textLayout.issues);
  const prohibited = new Set(
    document.brand.prohibitedColors.map((value) => value.toLowerCase()),
  );
  for (const colorUse of collectColorUses(document)) {
    if (!prohibited.has(colorUse.color.toLowerCase())) continue;
    issues.push({
      code: "PROHIBITED_COLOR",
      severity: "error",
      message: `${colorUse.source} uses prohibited color ${colorUse.color}.`,
      ...(colorUse.layerId === undefined ? {} : { layerId: colorUse.layerId }),
      details: { source: colorUse.source, color: colorUse.color },
    });
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
  return { issues, textLayout: textLayout.summary };
}

function collectTextLayoutQualityIssues(document: DesignDocument): {
  issues: QualityIssue[];
  summary: TextLayoutQualitySummary;
} {
  const collection = collectVisibleDesignTextLayoutDiagnostics(document);
  return {
    issues: collection.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: "error",
      message: diagnostic.message,
      layerId: diagnostic.layerId,
      details: {
        diagnosticsVersion: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
        fieldPath: diagnostic.fieldPath,
        layerType: diagnostic.layerType,
        totalMatches: diagnostic.totalMatches,
        matches: diagnostic.matches,
        truncated: diagnostic.truncated,
      },
    })),
    summary: {
      totalDiagnostics: collection.totalDiagnostics,
      retainedDiagnostics: collection.diagnostics.length,
      truncated: collection.truncated,
    },
  };
}

type ColorUse = {
  source: string;
  color: string;
  layerId?: string;
};

function collectColorUses(document: DesignDocument): ColorUse[] {
  const uses: ColorUse[] = [];
  for (const [name, value] of Object.entries(document.brand.palette)) {
    const colors = Array.isArray(value) ? value : [value];
    for (const paletteColor of colors) {
      uses.push({ source: `Brand palette field "${name}"`, color: paletteColor });
    }
  }
  for (const [name, color] of Object.entries(document.brand.themes[document.mode])) {
    uses.push({ source: `Selected theme field "${name}"`, color });
  }
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    if ("color" in layer && layer.color !== undefined) {
      uses.push({
        source: `Layer "${layer.id}"`,
        color: layer.color,
        layerId: layer.id,
      });
    }
    if (layer.type !== "chart") continue;
    for (const [index, value] of layer.values.entries()) {
      if (value.color === undefined) continue;
      uses.push({
        source: `Chart layer "${layer.id}" value ${index}`,
        color: value.color,
        layerId: layer.id,
      });
    }
  }
  return uses;
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
