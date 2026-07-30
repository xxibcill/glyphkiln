import { describe, expect, it } from "vitest";

import { readGlyphkilnHostname } from "./runtime-hostname.mjs";

describe("readGlyphkilnHostname", () => {
  it("uses loopback by default", () => {
    expect(readGlyphkilnHostname({})).toBe("127.0.0.1");
  });

  it("honors an explicit remote-hosting opt-in", () => {
    expect(readGlyphkilnHostname({ GLYPHKILN_HOSTNAME: " 0.0.0.0 " })).toBe("0.0.0.0");
  });
});
