import { describe, expect, it } from "vitest";

import { RENDER_RESOURCE_LIMITS } from "@glyphkiln/core";

import { createPreviewDesign } from "@/test/preview-design";
import { createProjectPreview } from "@/lib/project-preview/render-preview";

import { POST } from "./route";

const ENDPOINT = "http://localhost/api/preview";

describe("POST /api/preview", () => {
  it("requires a JSON media type", async () => {
    const response = await POST(
      request("{}", { "content-type": "text/plain;charset=utf-8" }),
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request('{"seed":'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "MALFORMED_JSON",
    });
  });

  it("rejects request bytes that are not valid UTF-8", async () => {
    const response = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        body: new Uint8Array([0xff]),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
  });

  it("rejects declared and streamed bodies beyond the Core limit", async () => {
    const declared = await POST(
      request("{}", {
        "content-length": String(RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes + 1),
      }),
    );
    expect(declared.status).toBe(413);

    const streamed = await POST(
      request(" ".repeat(RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes + 1)),
    );
    expect(streamed.status).toBe(413);
  });

  it("returns path-aware validation problems", async () => {
    const document = createPreviewDesign();
    document.seed = "";
    const response = await POST(request(JSON.stringify(document)));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "INVALID_DESIGN_DOCUMENT",
      problems: [{ path: "seed" }],
    });
  });

  it("renders SVG and PNG without caching the response", async () => {
    const response = await POST(
      request(JSON.stringify(createPreviewDesign()), {
        "content-type": " Application/JSON ; charset=utf-8",
      }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      outputs: { format: string; base64: string; byteSize: number }[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body.ok).toBe(true);
    expect(body.outputs.map((output) => output.format)).toEqual(["svg", "png"]);
    for (const output of body.outputs) {
      expect(Buffer.from(output.base64, "base64")).toHaveLength(output.byteSize);
    }
  });

  it("exposes bounded render admission with a retry hint", async () => {
    let rejectFirst: ((reason: Error) => void) | undefined;
    const first = createProjectPreview(createPreviewDesign(), {
      render: () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
      now: () => new Date("2026-07-30T06:00:00.000Z"),
    });
    await Promise.resolve();

    const response = await POST(request(JSON.stringify(createPreviewDesign())));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      code: "PREVIEW_RENDER_BUSY",
    });
    if (rejectFirst === undefined) throw new Error("First render did not start.");
    rejectFirst(new Error("Release the test render slot."));
    await first;
  });
});

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}
