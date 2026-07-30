import { NextResponse } from "next/server";

import { RENDER_RESOURCE_LIMITS } from "@glyphkiln/core";

import type { PreviewFailure } from "@/features/project-preview/types";
import { createProjectPreview } from "@/lib/project-preview/render-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!isJsonRequest(request)) {
    return errorResponse(
      415,
      "JSON request required",
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the structured design document as application/json.",
    );
  }

  if (declaredBodyIsTooLarge(request)) {
    return bodyTooLargeResponse();
  }

  let body: string | undefined;
  try {
    body = await readBoundedBody(request);
  } catch {
    return errorResponse(
      400,
      "Request body could not be read",
      "INVALID_REQUEST_BODY",
      "Send the preview document as valid UTF-8 JSON and try again.",
    );
  }
  if (body === undefined) {
    return bodyTooLargeResponse();
  }

  let input: unknown;
  try {
    input = JSON.parse(body) as unknown;
  } catch {
    return errorResponse(
      400,
      "JSON could not be read",
      "MALFORMED_JSON",
      "Check the document syntax and send the preview request again.",
    );
  }

  const result = await createProjectPreview(input);
  const headers =
    result.status === 429
      ? { ...RESPONSE_HEADERS, "Retry-After": "1" }
      : RESPONSE_HEADERS;
  return NextResponse.json(result.body, {
    status: result.status,
    headers,
  });
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLocaleLowerCase("en-US") === "application/json"
  );
}

function declaredBodyIsTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return false;
  const declaredBytes = Number(contentLength);
  return Number.isFinite(declaredBytes) && declaredBytes > maximumRequestBytes();
}

function maximumRequestBytes(): number {
  return RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes;
}

async function readBoundedBody(request: Request): Promise<string | undefined> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for (let result = await reader.read(); !result.done; result = await reader.read()) {
    byteLength += result.value.byteLength;
    if (byteLength > maximumRequestBytes()) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

function bodyTooLargeResponse(): NextResponse {
  return errorResponse(
    413,
    "Design document is too large",
    "DESIGN_BYTES_LIMIT_EXCEEDED",
    `Preview documents must be ${maximumRequestBytes().toString()} bytes or smaller.`,
  );
}

function errorResponse(
  status: number,
  title: string,
  code: string,
  detail: string,
): NextResponse {
  const body: PreviewFailure = { ok: false, status, title, code, detail };
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}
