/**
 * Canonical public origin for redirects and OAuth client_id (no trailing slash).
 */
export function getPublicUrl(): string {
  const raw = process.env.PUBLIC_URL?.trim() || 'http://127.0.0.1:3000'
  return raw.replace(/\/$/, '')
}

export function isLoopbackPublicUrl(): boolean {
  try {
    const host = new URL(getPublicUrl()).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  } catch {
    return true
  }
}
