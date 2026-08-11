type OwnDataProperty =
  | { readonly found: false; readonly unsafe: boolean }
  | { readonly found: true; readonly unsafe: false; readonly value: unknown };

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

export function readExactDataRecord(
  input: unknown,
  expectedKeys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!isPlainRecord(input)) return undefined;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    return undefined;
  }
  if (
    keys.length !== expectedKeys.size ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
  ) {
    return undefined;
  }

  const output: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key !== "string") return undefined;
    const property = readOwnDataProperty(input, key);
    if (!property.found) return undefined;
    output[key] = property.value;
  }
  return output;
}

export function readOwnDataProperty(input: object, key: PropertyKey): OwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined) return { found: false, unsafe: false };
    return "value" in descriptor
      ? { found: true, unsafe: false, value: descriptor.value }
      : { found: false, unsafe: true };
  } catch {
    return { found: false, unsafe: true };
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
