import { randomBytes } from "node:crypto";

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

export const PASSWORD_POLICY = Object.freeze({
  minimumCodePoints: 12,
  maximumCodePoints: 128,
  maximumUtf8Bytes: 512,
});

export const ARGON2ID_PASSWORD_PROFILE = Object.freeze({
  memoryCostKiB: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLengthBytes: 32,
  saltLengthBytes: 16,
});

export type PasswordPolicyRejection = "invalid_unicode" | "too_short" | "too_long";

export type PasswordPolicyResult =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; reason: PasswordPolicyRejection }>;

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
};

export class PasswordPolicyError extends Error {
  readonly code = "PASSWORD_POLICY_REJECTED";

  constructor(readonly reason: PasswordPolicyRejection) {
    super("Password does not meet the password policy.");
    this.name = "PasswordPolicyError";
  }
}

export class PasswordHashingError extends Error {
  readonly code = "PASSWORD_HASHING_FAILED";

  constructor() {
    super("Password hashing failed.");
    this.name = "PasswordHashingError";
  }
}

export function validatePassword(password: string): PasswordPolicyResult {
  if (password.length > PASSWORD_POLICY.maximumCodePoints * 2) {
    return { valid: false, reason: "too_long" };
  }

  if (!password.isWellFormed()) {
    return { valid: false, reason: "invalid_unicode" };
  }

  const codePointLength = Array.from(password).length;
  if (codePointLength < PASSWORD_POLICY.minimumCodePoints) {
    return { valid: false, reason: "too_short" };
  }

  if (
    codePointLength > PASSWORD_POLICY.maximumCodePoints ||
    Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumUtf8Bytes
  ) {
    return { valid: false, reason: "too_long" };
  }

  return { valid: true };
}

export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const validation = validatePassword(password);
    if (!validation.valid) {
      throw new PasswordPolicyError(validation.reason);
    }

    try {
      return await argon2Hash(Buffer.from(password, "utf8"), {
        // @node-rs/argon2 declares ambient const enums that isolated modules
        // cannot access by name. These are Argon2id and version 0x13.
        algorithm: 2,
        version: 1,
        memoryCost: ARGON2ID_PASSWORD_PROFILE.memoryCostKiB,
        timeCost: ARGON2ID_PASSWORD_PROFILE.timeCost,
        parallelism: ARGON2ID_PASSWORD_PROFILE.parallelism,
        outputLen: ARGON2ID_PASSWORD_PROFILE.outputLengthBytes,
        salt: randomBytes(ARGON2ID_PASSWORD_PROFILE.saltLengthBytes),
      });
    } catch {
      throw new PasswordHashingError();
    }
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    if (!validatePassword(password).valid || !isSupportedPasswordHash(passwordHash)) {
      return false;
    }

    try {
      return await argon2Verify(passwordHash, Buffer.from(password, "utf8"));
    } catch {
      return false;
    }
  }
}

function isSupportedPasswordHash(passwordHash: string): boolean {
  const profilePrefix = [
    "$argon2id$v=19$m=",
    String(ARGON2ID_PASSWORD_PROFILE.memoryCostKiB),
    ",t=",
    String(ARGON2ID_PASSWORD_PROFILE.timeCost),
    ",p=",
    String(ARGON2ID_PASSWORD_PROFILE.parallelism),
    "$",
  ].join("");

  return passwordHash.length <= 256 && passwordHash.startsWith(profilePrefix);
}
