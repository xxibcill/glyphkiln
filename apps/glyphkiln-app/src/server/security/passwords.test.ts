import { describe, expect, it } from "vitest";

import {
  ARGON2ID_PASSWORD_PROFILE,
  Argon2idPasswordHasher,
  PasswordPolicyError,
  validatePassword,
} from "./passwords";

describe("validatePassword", () => {
  it("accepts passwords at both Unicode length boundaries", () => {
    expect(validatePassword("a".repeat(12))).toEqual({ valid: true });
    expect(validatePassword("🔐".repeat(128))).toEqual({ valid: true });
  });

  it("rejects passwords outside the 12 through 128 code-point range", () => {
    expect(validatePassword("a".repeat(11))).toEqual({
      valid: false,
      reason: "too_short",
    });
    expect(validatePassword("a".repeat(129))).toEqual({
      valid: false,
      reason: "too_long",
    });
    expect(validatePassword("a".repeat(1_000_000))).toEqual({
      valid: false,
      reason: "too_long",
    });
  });

  it("rejects strings that cannot be encoded as their original Unicode value", () => {
    expect(validatePassword("\ud800".repeat(12))).toEqual({
      valid: false,
      reason: "invalid_unicode",
    });
  });
});

describe("Argon2idPasswordHasher", () => {
  it("uses the explicit OWASP Argon2id profile and verifies the password", async () => {
    const hasher = new Argon2idPasswordHasher();
    const password = "correct horse battery staple";

    const passwordHash = await hasher.hash(password);

    expect(ARGON2ID_PASSWORD_PROFILE).toEqual({
      memoryCostKiB: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLengthBytes: 32,
      saltLengthBytes: 16,
    });
    expect(passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    );
    await expect(hasher.verify(password, passwordHash)).resolves.toBe(true);
    await expect(hasher.verify("an incorrect password", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("uses a fresh salt for each password hash", async () => {
    const hasher = new Argon2idPasswordHasher();
    const password = "correct horse battery staple";

    const [firstHash, secondHash] = await Promise.all([
      hasher.hash(password),
      hasher.hash(password),
    ]);

    expect(firstHash).not.toBe(secondHash);
  });

  it("fails closed for malformed hashes", async () => {
    const hasher = new Argon2idPasswordHasher();

    await expect(
      hasher.verify("correct horse battery staple", "not-a-password-hash"),
    ).resolves.toBe(false);
  });

  it("rejects policy violations without leaking the password", async () => {
    const hasher = new Argon2idPasswordHasher();
    const rejectedPassword = "too short";

    const error = await hasher.hash(rejectedPassword).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(PasswordPolicyError);
    expect(error).toMatchObject({
      code: "PASSWORD_POLICY_REJECTED",
      reason: "too_short",
    });
    expect(String(error)).not.toContain(rejectedPassword);
    expect(JSON.stringify(error)).not.toContain(rejectedPassword);
  });
});
