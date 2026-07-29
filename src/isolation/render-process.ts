import process from "node:process";

import { GlyphkilnError } from "../domain/types.js";
import { renderGraphic, type RenderGraphicOptions } from "../renderer/index.js";

type RenderRequest = {
  input: unknown;
  options: RenderGraphicOptions;
};

process.once("message", (message: unknown) => {
  void handleRequest(message);
});

async function handleRequest(message: unknown): Promise<void> {
  try {
    const request = parseRequest(message);
    const result = await renderGraphic(request.input, request.options);
    process.send?.({ ok: true, result }, () => process.disconnect());
  } catch (error) {
    process.send?.(
      {
        ok: false,
        error: serializeError(error),
      },
      () => process.disconnect(),
    );
  }
}

function parseRequest(value: unknown): RenderRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    !("input" in value) ||
    !("options" in value)
  ) {
    throw new GlyphkilnError(
      "The isolated render process received an invalid request.",
      "INVALID_RENDER_PROCESS_REQUEST",
    );
  }
  return value as RenderRequest;
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
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}
