export function assertUnreachable(value: never, context: string): never {
  throw new Error(`Unhandled ${context}: ${String(value)}`);
}
