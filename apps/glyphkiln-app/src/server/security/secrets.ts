import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const AUTH_TOKEN_BYTES = 32;

const SHA256_BYTES = 32;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const INVALID_SHA256_DIGEST = Buffer.alloc(SHA256_BYTES);

export type SecretFactory = {
  createToken(): string;
  createId(): string;
};

export class CryptoSecretFactory implements SecretFactory {
  createToken(): string {
    return randomBytes(AUTH_TOKEN_BYTES).toString("base64url");
  }

  createId(): string {
    return randomUUID({ disableEntropyCache: true });
  }
}

export function hashSecret(secret: string): string {
  return digestSecret(secret).toString("hex");
}

export function verifySecretHash(
  presentedSecret: string,
  expectedSecretHash: string,
): boolean {
  const expectedHashIsValid = SHA256_HEX_PATTERN.test(expectedSecretHash);
  const expectedDigest = expectedHashIsValid
    ? Buffer.from(expectedSecretHash, "hex")
    : INVALID_SHA256_DIGEST;
  const matches = timingSafeEqual(digestSecret(presentedSecret), expectedDigest);

  return expectedHashIsValid && matches;
}

export function verifyCsrfToken(
  presentedToken: string,
  expectedTokenHash: string,
): boolean {
  return verifySecretHash(presentedToken, expectedTokenHash);
}

function digestSecret(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}
