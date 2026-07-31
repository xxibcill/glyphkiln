import { describe, expect, it } from "vitest";

import type { AppFailureCode } from "@/server/app-workflow/contracts";

import { commandResponse } from "./app-response";

describe("app command response", () => {
  it.each([
    ["AUTH_THROTTLED", "900"],
    ["AUTH_CAPACITY_REACHED", "1"],
    ["RENDER_CAPACITY_REACHED", "1"],
  ] satisfies readonly (readonly [AppFailureCode, string])[])(
    "sets a bounded Retry-After response for %s",
    (code, retryAfter) => {
      const response = commandResponse(
        {
          ok: false,
          status: 429,
          error: {
            code,
            title: "Temporarily unavailable",
            detail: "Try again later.",
          },
        },
        new Request("http://localhost/api/app/commands"),
        { NODE_ENV: "test" },
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
    },
  );
});
