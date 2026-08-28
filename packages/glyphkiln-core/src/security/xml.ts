export function isXml10Compatible(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) continue;
    if (codePoint >= 0x20 && codePoint <= 0xd7ff) continue;
    if (codePoint >= 0xe000 && codePoint <= 0xfffd) continue;
    if (codePoint >= 0x10000 && codePoint <= 0x10ffff) continue;
    return false;
  }
  return true;
}
