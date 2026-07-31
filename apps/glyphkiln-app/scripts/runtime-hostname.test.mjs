import { describe, expect, it } from "vitest";

import {
  readGlyphkilnHostname,
  validateGlyphkilnRuntimeConfiguration,
} from "./runtime-hostname.mjs";

function secureRemoteEnvironment(overrides = {}) {
  return {
    DATABASE_URL: "postgresql://glyphkiln:database-secret@database.internal/glyphkiln",
    GLYPHKILN_HOSTNAME: "app.internal",
    GLYPHKILN_PUBLIC_ORIGIN: "https://glyphkiln.example",
    GLYPHKILN_SECURE_COOKIES: "true",
    GLYPHKILN_TRUST_PROXY: "true",
    NODE_ENV: "production",
    ...overrides,
  };
}

describe("readGlyphkilnHostname", () => {
  it("uses loopback by default", () => {
    expect(readGlyphkilnHostname({})).toBe("127.0.0.1");
    expect(readGlyphkilnHostname({ GLYPHKILN_HOSTNAME: "  " })).toBe("127.0.0.1");
  });

  it.each([
    ["localhost", "localhost"],
    ["IPv4 loopback", "127.0.0.1"],
    ["another IPv4 loopback address", "127.0.0.42"],
    ["IPv6 loopback", "::1"],
    ["expanded IPv6 loopback", "0:0:0:0:0:0:0:1"],
    ["IPv4-mapped IPv6 loopback", "::ffff:127.0.0.1"],
  ])("supports %s without remote-hosting configuration", (_label, hostname) => {
    expect(readGlyphkilnHostname({ GLYPHKILN_HOSTNAME: ` ${hostname} ` })).toBe(
      hostname,
    );
  });

  it.each([
    ["DNS", "app.internal"],
    ["IPv4", "10.20.30.40"],
    ["IPv6", "2001:db8::10"],
  ])(
    "accepts a concrete remote %s bind when every control is valid",
    (_label, hostname) => {
      expect(
        readGlyphkilnHostname(
          secureRemoteEnvironment({ GLYPHKILN_HOSTNAME: ` ${hostname} ` }),
        ),
      ).toBe(hostname);
    },
  );

  it("accepts an IPv6 HTTPS public origin", () => {
    expect(
      readGlyphkilnHostname(
        secureRemoteEnvironment({
          GLYPHKILN_PUBLIC_ORIGIN: "https://[2001:db8::20]:8443",
        }),
      ),
    ).toBe("app.internal");
  });

  it.each([
    ["0.0.0.0"],
    ["::"],
    ["0:0:0:0:0:0:0:0"],
    ["::ffff:0.0.0.0"],
    ["*"],
    ["*.internal"],
  ])("rejects wildcard bind hostname %s", (hostname) => {
    expect(() =>
      readGlyphkilnHostname(secureRemoteEnvironment({ GLYPHKILN_HOSTNAME: hostname })),
    ).toThrowError(/GLYPHKILN_HOSTNAME.*wildcard/i);
  });

  it.each([
    ["a URL", "https://app.internal"],
    ["a hostname with a port", "app.internal:3000"],
    ["a hostname with an underscore", "app_internal"],
    ["an empty DNS label", "app..internal"],
    ["an invalid leading hyphen", "-app.internal"],
    ["an invalid IPv4 address", "999.999.999.999"],
    ["a noncanonical IPv4 address", "127.1"],
    ["a bracketed IPv6 address", "[2001:db8::1]"],
  ])("rejects %s", (_label, hostname) => {
    expect(() =>
      readGlyphkilnHostname(secureRemoteEnvironment({ GLYPHKILN_HOSTNAME: hostname })),
    ).toThrowError(/Invalid GLYPHKILN_HOSTNAME/);
  });
});

describe("validateGlyphkilnRuntimeConfiguration", () => {
  it("returns a pure loopback/remote classification", () => {
    expect(validateGlyphkilnRuntimeConfiguration({})).toEqual({
      hostname: "127.0.0.1",
      isLoopback: true,
    });
    expect(validateGlyphkilnRuntimeConfiguration(secureRemoteEnvironment())).toEqual({
      hostname: "app.internal",
      isLoopback: false,
    });
  });

  it.each([
    ["NODE_ENV", { NODE_ENV: "development" }, /NODE_ENV \(must equal "production"\)/],
    [
      "GLYPHKILN_PUBLIC_ORIGIN",
      { GLYPHKILN_PUBLIC_ORIGIN: undefined },
      /GLYPHKILN_PUBLIC_ORIGIN/,
    ],
    [
      "GLYPHKILN_TRUST_PROXY",
      { GLYPHKILN_TRUST_PROXY: "false" },
      /GLYPHKILN_TRUST_PROXY \(must equal "true"\)/,
    ],
    ["DATABASE_URL", { DATABASE_URL: undefined }, /DATABASE_URL/],
    [
      "GLYPHKILN_SECURE_COOKIES",
      { GLYPHKILN_SECURE_COOKIES: "false" },
      /GLYPHKILN_SECURE_COOKIES \(must equal "true"\)/,
    ],
  ])(
    "rejects remote binding when %s is invalid or missing",
    (_name, overrides, message) => {
      expect(() =>
        validateGlyphkilnRuntimeConfiguration(secureRemoteEnvironment(overrides)),
      ).toThrowError(message);
    },
  );

  it("reports every invalid remote prerequisite together without values", () => {
    let error;
    try {
      validateGlyphkilnRuntimeConfiguration({
        DATABASE_URL: "postgresql://user:do-not-print@",
        GLYPHKILN_HOSTNAME: "app.internal",
        GLYPHKILN_PUBLIC_ORIGIN: "http://origin-value-must-not-print.example/path",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("NODE_ENV");
    expect(error.message).toContain("GLYPHKILN_PUBLIC_ORIGIN");
    expect(error.message).toContain("GLYPHKILN_TRUST_PROXY");
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("GLYPHKILN_SECURE_COOKIES");
    expect(error.message).not.toContain("do-not-print");
    expect(error.message).not.toContain("origin-value-must-not-print");
  });

  it.each([
    ["HTTP", "http://glyphkiln.example"],
    ["credentials", "https://user:secret@glyphkiln.example"],
    ["a root path", "https://glyphkiln.example/"],
    ["a path", "https://glyphkiln.example/app"],
    ["a query", "https://glyphkiln.example?mode=remote"],
    ["an empty query", "https://glyphkiln.example?"],
    ["a fragment", "https://glyphkiln.example#app"],
    ["a backslash", "https://glyphkiln.example\\"],
    ["embedded whitespace", "https://glyphkiln.exa mple"],
    ["localhost", "https://localhost"],
    ["IPv4 loopback", "https://127.0.0.42"],
    ["IPv6 loopback", "https://[::1]"],
    ["IPv4-mapped IPv6 loopback", "https://[::ffff:127.0.0.1]"],
    ["an IPv4 wildcard", "https://0.0.0.0"],
    ["an IPv6 wildcard", "https://[::]"],
    ["a malformed hostname", "https://bad_host.example"],
  ])("rejects a public origin containing %s", (_label, publicOrigin) => {
    expect(() =>
      validateGlyphkilnRuntimeConfiguration(
        secureRemoteEnvironment({
          GLYPHKILN_PUBLIC_ORIGIN: publicOrigin,
        }),
      ),
    ).toThrowError(/GLYPHKILN_PUBLIC_ORIGIN/);
  });

  it.each([
    ["an empty value", ""],
    ["a non-URL value", "database.internal/glyphkiln"],
    ["a non-PostgreSQL protocol", "mysql://database.internal/glyphkiln"],
    ["no database host", "postgresql:///glyphkiln"],
    ["embedded whitespace", "postgresql://data\nbase.internal/glyphkiln"],
  ])("rejects DATABASE_URL with %s", (_label, databaseUrl) => {
    expect(() =>
      validateGlyphkilnRuntimeConfiguration(
        secureRemoteEnvironment({ DATABASE_URL: databaseUrl }),
      ),
    ).toThrowError(/DATABASE_URL/);
  });

  it("accepts the postgres URL protocol alias", () => {
    expect(
      validateGlyphkilnRuntimeConfiguration(
        secureRemoteEnvironment({
          DATABASE_URL: "postgres://database.internal/glyphkiln",
        }),
      ),
    ).toMatchObject({ isLoopback: false });
  });
});
