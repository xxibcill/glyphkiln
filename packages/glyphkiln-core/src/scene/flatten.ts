export function flattenElements<T>(
  elements: readonly T[],
  getChildren: (element: T) => readonly T[] | undefined,
): T[] {
  const flattened: T[] = [];
  const pending = [...elements].reverse();
  while (pending.length > 0) {
    const element = pending.pop()!;
    flattened.push(element);
    const children = getChildren(element);
    if (children === undefined) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]!);
    }
  }
  return flattened;
}
