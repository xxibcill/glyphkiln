export function readBoundedEnvironmentInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const input = environment[name]?.trim();
  if (input === undefined || input === "") return fallback;
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}
