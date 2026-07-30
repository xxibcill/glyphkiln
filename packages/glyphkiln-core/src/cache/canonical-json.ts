import { GlyphkilnError } from "../domain/types.js";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export function canonicalJson(value: unknown): string {
  return serializeCanonical(normalizeValue(value));
}

function normalizeValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new GlyphkilnError(
        "Canonical JSON does not support non-finite numbers.",
        "CANONICAL_NON_FINITE_NUMBER",
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value instanceof Uint8Array) {
    return { $bytesSha256: browserSafeBytesPlaceholder() };
  }
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(input).sort()) {
      const child = input[key];
      if (child !== undefined) {
        output[key] = normalizeValue(child);
      }
    }
    return output;
  }
  throw new GlyphkilnError(
    `Canonical JSON cannot serialize ${typeof value}.`,
    "CANONICAL_UNSUPPORTED_TYPE",
  );
}

function serializeCanonical(value: CanonicalValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (isCanonicalArray(value)) {
    return `[${value.map((item) => serializeCanonical(item)).join(",")}]`;
  }
  const objectValue = value as Readonly<Record<string, CanonicalValue>>;
  return `{${Object.keys(objectValue)
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(objectValue[key]!)}`)
    .join(",")}}`;
}

function isCanonicalArray(value: CanonicalValue): value is readonly CanonicalValue[] {
  return Array.isArray(value);
}

function browserSafeBytesPlaceholder(): never {
  throw new GlyphkilnError(
    "Canonical JSON byte hashing requires the Node.js Core entry point.",
    "CANONICAL_UNSUPPORTED_TYPE",
  );
}
