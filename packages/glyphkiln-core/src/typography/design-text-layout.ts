import type { DesignDocument, DesignLayer } from "../schema/index.js";
import {
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  type TextLayoutDiagnostic,
} from "./text-layout.js";

export type DesignTextLayoutDiagnostic = TextLayoutDiagnostic & {
  layerId: string;
  layerType: DesignLayer["type"];
  fieldPath: string;
  visible: boolean;
  blocksRender: boolean;
};

export type DesignTextLayoutInspection = {
  version: typeof TEXT_LAYOUT_DIAGNOSTICS_VERSION;
  renderable: boolean;
  totalDiagnostics: number;
  diagnostics: readonly DesignTextLayoutDiagnostic[];
  truncated: boolean;
};

export type RetainedDesignTextLayoutDiagnostics = {
  totalDiagnostics: number;
  diagnostics: readonly DesignTextLayoutDiagnostic[];
  truncated: boolean;
};

type TextField = {
  text: string;
  fieldPath: string;
};

type DiagnosticCollection = {
  totalDiagnostics: number;
  diagnostics: DesignTextLayoutDiagnostic[];
  blockingDiagnostics: number;
};

const MAX_DOCUMENT_DIAGNOSTICS = 128;

export function inspectDesignTextLayout(
  document: DesignDocument,
): DesignTextLayoutInspection {
  const collection = collectDiagnostics(document, true);
  return {
    version: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
    renderable: collection.blockingDiagnostics === 0,
    totalDiagnostics: collection.totalDiagnostics,
    diagnostics: collection.diagnostics,
    truncated: collection.totalDiagnostics > collection.diagnostics.length,
  };
}

export function collectVisibleDesignTextLayoutDiagnostics(
  document: DesignDocument,
): RetainedDesignTextLayoutDiagnostics {
  const collection = collectDiagnostics(document, false);
  return {
    totalDiagnostics: collection.totalDiagnostics,
    diagnostics: collection.diagnostics,
    truncated: collection.totalDiagnostics > collection.diagnostics.length,
  };
}

function collectDiagnostics(
  document: DesignDocument,
  includeHidden: boolean,
): DiagnosticCollection {
  const collection: DiagnosticCollection = {
    totalDiagnostics: 0,
    diagnostics: [],
    blockingDiagnostics: 0,
  };
  for (const [layerIndex, layer] of document.layers.entries()) {
    if (!includeHidden && !layer.visible) continue;
    collectLayerDiagnostics(layer, layerIndex, collection);
  }
  return collection;
}

function collectLayerDiagnostics(
  layer: DesignLayer,
  layerIndex: number,
  collection: DiagnosticCollection,
): void {
  for (const field of getTextFields(layer, layerIndex)) {
    const analysis = analyzeTextLayoutSupport(field.text);
    for (const diagnostic of analysis.diagnostics) {
      collection.totalDiagnostics += 1;
      if (layer.visible) collection.blockingDiagnostics += 1;
      if (collection.diagnostics.length >= MAX_DOCUMENT_DIAGNOSTICS) continue;
      collection.diagnostics.push({
        ...diagnostic,
        layerId: layer.id,
        layerType: layer.type,
        fieldPath: field.fieldPath,
        visible: layer.visible,
        blocksRender: layer.visible,
      });
    }
  }
}

function getTextFields(layer: DesignLayer, layerIndex: number): TextField[] {
  const layerPath = `/layers/${layerIndex}`;
  switch (layer.type) {
    case "headline":
    case "subtitle":
    case "eyebrow":
    case "cta":
    case "footer":
    case "attribution":
    case "badge":
      return [{ text: layer.text, fieldPath: `${layerPath}/text` }];
    case "statistic":
      return [
        { text: layer.value, fieldPath: `${layerPath}/value` },
        { text: layer.label, fieldPath: `${layerPath}/label` },
        ...(layer.trend === undefined
          ? []
          : [{ text: layer.trend, fieldPath: `${layerPath}/trend` }]),
      ];
    case "chart":
      return layer.values.map((value, valueIndex) => ({
        text: value.label,
        fieldPath: `${layerPath}/values/${valueIndex}/label`,
      }));
    case "background":
    case "procedural-decoration":
    case "logo":
    case "product-screenshot":
    case "image":
    case "icon":
    case "shape":
      return [];
    default:
      return assertNever(layer);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled design layer: ${String(value)}`);
}
