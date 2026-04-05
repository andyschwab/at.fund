/**
 * Merge two optional dependency arrays into a sorted, deduplicated array.
 * Returns `undefined` when both inputs are empty/absent.
 */
export function mergeDeps(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set([...(a ?? []), ...(b ?? [])])
  return set.size > 0 ? [...set].sort() : undefined
}
