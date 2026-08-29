export function fontReferenceKey(
  family: string,
  weight: number,
  style: string,
): string {
  return `${family.toLocaleLowerCase("en-US")}\u0000${weight.toString()}\u0000${style}`;
}
