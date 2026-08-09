type OwnDataProperty =
  { readonly found: false } | { readonly found: true; readonly value: unknown };

export function readArrayLength(input: unknown): number | undefined {
  try {
    if (!Array.isArray(input)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "number" ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0
    ) {
      return undefined;
    }
    return descriptor.value;
  } catch {
    return undefined;
  }
}

export function readArrayDataValue(input: readonly unknown[], index: number): unknown {
  const property = readOwnDataProperty(input, String(index));
  return property.found ? property.value : undefined;
}

export function readOwnDataProperty(input: object, key: PropertyKey): OwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor !== undefined && "value" in descriptor
      ? { found: true, value: descriptor.value }
      : { found: false };
  } catch {
    return { found: false };
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
