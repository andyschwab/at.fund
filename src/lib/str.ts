/**
 * Coerce an unknown value to a trimmed, non-empty string or `undefined`.
 * Useful for parsing untrusted request bodies.
 */
export function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}
