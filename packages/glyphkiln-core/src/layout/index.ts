import type { Bounds, Dimensions, QualityIssue } from "../domain/types.js";
import type { BrandSnapshot } from "../schema/index.js";

export function safeAreaBounds(dimensions: Dimensions, brand: BrandSnapshot): Bounds {
  const { safeArea } = brand;
  return {
    x: dimensions.width * safeArea.left,
    y: dimensions.height * safeArea.top,
    width: dimensions.width * (1 - safeArea.left - safeArea.right),
    height: dimensions.height * (1 - safeArea.top - safeArea.bottom),
  };
}

export function isInside(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function safeAreaIssue(
  safeArea: Bounds,
  textBounds: Bounds,
  layerId: string,
): QualityIssue | undefined {
  if (isInside(safeArea, textBounds)) return undefined;
  return {
    code: "TEXT_OUTSIDE_SAFE_AREA",
    severity: "error",
    message: "Text bounding box extends beyond the configured safe area.",
    layerId,
    details: { safeArea, textBounds },
  };
}

export function contrastRatio(foreground: string, background: string): number {
  const bright = relativeLuminance(foreground);
  const dark = relativeLuminance(background);
  return (Math.max(bright, dark) + 0.05) / (Math.min(bright, dark) + 0.05);
}

export function contrastIssue(
  foreground: string,
  background: string,
  layerId: string,
  minimum = 4.5,
): QualityIssue | undefined {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= minimum) return undefined;
  return {
    code: "LOW_TEXT_CONTRAST",
    severity: "error",
    message: `Text contrast ratio ${ratio.toFixed(2)} is below ${minimum.toFixed(1)}.`,
    layerId,
    details: { foreground, background, ratio, minimum },
  };
}

function relativeLuminance(hex: string): number {
  const channels = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
