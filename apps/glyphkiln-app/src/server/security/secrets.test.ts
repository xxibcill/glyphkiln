import { describe, expect, it } from "vitest";

import {
  AUTH_TOKEN_BYTES,
  CryptoSecretFactory,
  hashSecret,
  verifyCsrfToken,
  verifySecretHash,
} from "./secrets";

describe("CryptoSecretFactory", () => {
  it("creates 256-bit unpadded base64url tokens", () => {
    const factory = new CryptoSecretFactory();
    const token = factory.createToken();

    expect(AUTH_TOKEN_BYTES).toBe(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(AUTH_TOKEN_BYTES);
  });

  it("does not reuse tokens", () => {
    const factory = new CryptoSecretFactory();
    const tokens = Array.from({ length: 256 }, () => factory.createToken());

    expect(new Set(tokens)).toHaveLength(tokens.length);
  });

  it("creates RFC 4122 version 4 UUID identifiers without reuse", () => {
    const factory = new CryptoSecretFactory();
    const ids = Array.from({ length: 64 }, () => factory.createId());

    expect(ids[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new Set(ids)).toHaveLength(ids.length);
  });
});

describe("secret hashing", () => {
  it("produces a lowercase hexadecimal SHA-256 digest", () => {
    expect(hashSecret("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("verifies matching hashes and fails closed for invalid hashes", () => {
    const secret = "not-written-to-errors-or-logs";
    const secretHash = hashSecret(secret);

    expect(verifySecretHash(secret, secretHash)).toBe(true);
    expect(verifySecretHash("another-secret", secretHash)).toBe(false);
    expect(verifySecretHash(secret, "")).toBe(false);
    expect(verifySecretHash(secret, "z".repeat(64))).toBe(false);
  });

  it("verifies CSRF proof against the stored hash", () => {
    const csrfToken = new CryptoSecretFactory().createToken();
    const csrfTokenHash = hashSecret(csrfToken);

    expect(verifyCsrfToken(csrfToken, csrfTokenHash)).toBe(true);
    expect(verifyCsrfToken(`${csrfToken}x`, csrfTokenHash)).toBe(false);
  });
});
