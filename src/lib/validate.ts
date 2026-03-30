/**
 * Shared field validators for fund.at records.
 * Each returns an error message string, or null if valid.
 * Empty/blank values are NOT considered errors — these are optional fields.
 */

export function validateUrl(v: string): string | null {
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'Must start with https://'
    }
    return null
  } catch {
    return 'Not a valid URL'
  }
}

export function validateEmail(v: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return 'Not a valid email address'
  }
  return null
}

export function validateHandle(v: string): string | null {
  const h = v.replace(/^@/, '')
  if (/\s/.test(h)) {
    return "Handles don't have spaces"
  }
  if (!h.includes('.')) {
    return 'Should look like you.bsky.social'
  }
  return null
}

/**
 * Run a validator only when the trimmed value is non-empty.
 * Returns null for blank values (field is optional / untouched).
 */
export function validateIfPresent(
  value: string,
  validator: (v: string) => string | null,
): string | null {
  const t = value.trim()
  if (!t) return null
  return validator(t)
}
