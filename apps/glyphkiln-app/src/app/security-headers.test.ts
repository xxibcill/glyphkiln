import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("application document security headers", () => {
  it("denies framing for every page and route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const rules = await nextConfig.headers?.();
    const allRoutes = rules?.find((rule) => rule.source === "/(.*)");

    expect(allRoutes?.headers).toEqual(
      expect.arrayContaining([
        {
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'none'") as string,
        },
        { key: "X-Frame-Options", value: "DENY" },
      ]),
    );
  });
});
