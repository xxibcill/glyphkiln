import { GlyphkilnError, type OutputFormat } from "../domain/types.js";
import { RENDER_RESOURCE_LIMITS } from "../resources/index.js";

export function validateOutputFormats(
  formats: readonly unknown[],
): readonly OutputFormat[] {
  if (formats.length > RENDER_RESOURCE_LIMITS.maxOutputFormats) {
    throw new GlyphkilnError(
      `At most ${RENDER_RESOURCE_LIMITS.maxOutputFormats} output formats may be requested.`,
      "OUTPUT_FORMAT_LIMIT_EXCEEDED",
      {
        maximum: RENDER_RESOURCE_LIMITS.maxOutputFormats,
        actual: formats.length,
      },
    );
  }
  const validated: OutputFormat[] = [];
  for (const format of formats) {
    if (format !== "svg" && format !== "png") {
      throw new GlyphkilnError(
        `Unsupported output format "${String(format)}".`,
        "UNSUPPORTED_OUTPUT_FORMAT",
        { supportedFormats: ["svg", "png"] },
      );
    }
    validated.push(format);
  }
  const unique = [...new Set(validated)];
  if (unique.length === 0) {
    throw new GlyphkilnError(
      "At least one output format is required.",
      "OUTPUT_FORMAT_REQUIRED",
    );
  }
  return unique;
}

export function validateCreationTimestamp(timestamp: unknown): string {
  if (
    typeof timestamp !== "string" ||
    Buffer.byteLength(timestamp) > RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes
  ) {
    throw new GlyphkilnError(
      "Manifest creation timestamp exceeds the renderer resource boundary.",
      "CREATION_TIMESTAMP_LIMIT_EXCEEDED",
      { maximum: RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes },
    );
  }
  return timestamp;
}
