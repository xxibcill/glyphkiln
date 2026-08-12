import process from "node:process";

import { GlyphkilnError } from "../domain/types.js";
import type { ColorNormalizationInput } from "./color-normalization.js";
import { normalizeRasterColorInProcess } from "./color-normalization-engine.js";

type NormalizationRequest = {
  input: ColorNormalizationInput;
};

process.once("message", (message: unknown) => {
  void handleRequest(message);
});

async function handleRequest(message: unknown): Promise<void> {
  try {
    const request = parseRequest(message);
    const result = await normalizeRasterColorInProcess(request.input);
    process.send?.({ ok: true, result }, () => process.disconnect?.());
  } catch (error) {
    process.send?.({ ok: false, error: serializeError(error) }, () =>
      process.disconnect?.(),
    );
  }
}

function parseRequest(value: unknown): NormalizationRequest {
  if (typeof value !== "object" || value === null || !("input" in value)) {
    throw new GlyphkilnError(
      "The color-normalization process received an invalid request.",
      "INVALID_COLOR_NORMALIZATION_PROCESS_REQUEST",
    );
  }
  return value as NormalizationRequest;
}

function serializeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof GlyphkilnError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}
