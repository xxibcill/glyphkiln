import { describe, expect, it } from "vitest";

import { readBoundedBinaryRequest } from "./binary-request";

const MEDIA_TYPES = new Set(["image/png"]);

describe("readBoundedBinaryRequest", () => {
  it("accepts bounded binary chunks and normalizes the media type", async () => {
    const result = await readBoundedBinaryRequest(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-type": "IMAGE/PNG; ignored=value" },
        body: Uint8Array.from([1, 2, 3]),
      }),
      MEDIA_TYPES,
      3,
    );

    expect(result).toEqual({
      ok: true,
      mediaType: "image/png",
      bytes: Uint8Array.from([1, 2, 3]),
    });
  });

  it("rejects unsupported media before reading the body", async () => {
    const result = await readBoundedBinaryRequest(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-type": "image/svg+xml" },
        body: "<svg/>",
      }),
      MEDIA_TYPES,
      100,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("enforces both declared and streamed byte limits", async () => {
    const declared = await readBoundedBinaryRequest(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "content-length": "4",
        },
        body: Uint8Array.from([1, 2, 3]),
      }),
      MEDIA_TYPES,
      3,
    );
    const streamed = await readBoundedBinaryRequest(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: Uint8Array.from([1, 2, 3, 4]),
      }),
      MEDIA_TYPES,
      3,
    );

    expect(declared).toMatchObject({
      ok: false,
      failure: { status: 413, code: "REQUEST_BYTES_LIMIT_EXCEEDED" },
    });
    expect(streamed).toMatchObject({
      ok: false,
      failure: { status: 413, code: "REQUEST_BYTES_LIMIT_EXCEEDED" },
    });
  });
});
