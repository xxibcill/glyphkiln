import { describe, expect, it } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";

import { POST } from "./route";

describe("POST /api/preview", () => {
  it("never renders caller-authored documents through the legacy anonymous path", async () => {
    const response = POST(
      new Request("http://localhost/api/preview", {
        method: "POST",
        body: JSON.stringify(createPreviewDesign()),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "LEGACY_PREVIEW_DISABLED",
    });
  });
});
