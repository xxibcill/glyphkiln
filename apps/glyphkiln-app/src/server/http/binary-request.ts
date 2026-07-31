export type BinaryRequestFailure = {
  status: 400 | 413 | 415;
  code:
    "INVALID_REQUEST_BODY" | "REQUEST_BYTES_LIMIT_EXCEEDED" | "UNSUPPORTED_MEDIA_TYPE";
  title: string;
  detail: string;
};

export type BinaryRequestResult =
  | { ok: true; mediaType: string; bytes: Uint8Array }
  | { ok: false; failure: BinaryRequestFailure };

export async function readBoundedBinaryRequest(
  request: Request,
  acceptedMediaTypes: ReadonlySet<string>,
  maximumBytes: number,
): Promise<BinaryRequestResult> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType === undefined || !acceptedMediaTypes.has(mediaType)) {
    return failure(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Resource media type is not supported",
      "Upload a PNG, JPEG, TrueType, or OpenType font with its exact media type.",
    );
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return failure(
        400,
        "INVALID_REQUEST_BODY",
        "Resource body could not be read",
        "Send a valid binary request body and try again.",
      );
    }
    if (parsedLength > maximumBytes) return tooLarge(maximumBytes);
  }
  if (request.body === null) {
    return { ok: true, mediaType, bytes: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      byteLength += result.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        return tooLarge(maximumBytes);
      }
      chunks.push(new Uint8Array(result.value));
    }
  } catch {
    return failure(
      400,
      "INVALID_REQUEST_BODY",
      "Resource body could not be read",
      "Send a valid binary request body and try again.",
    );
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, mediaType, bytes };
}

function tooLarge(maximumBytes: number): BinaryRequestResult {
  return failure(
    413,
    "REQUEST_BYTES_LIMIT_EXCEEDED",
    "Resource is too large",
    `Resource uploads must be ${maximumBytes.toString()} bytes or smaller.`,
  );
}

function failure(
  status: BinaryRequestFailure["status"],
  code: BinaryRequestFailure["code"],
  title: string,
  detail: string,
): BinaryRequestResult {
  return { ok: false, failure: { status, code, title, detail } };
}
