export function normalizeStewardUri(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (raw.startsWith('did:')) return raw

  if (raw.includes('://')) {
    try {
      const u = new URL(raw)
      return u.hostname ? u.hostname.toLowerCase() : null
    } catch {
      return null
    }
  }

  const host = raw.toLowerCase().replace(/\.$/, '')
  if (!host) return null
  if (host.includes('/') || host.includes(':') || host.includes(' ')) return null
  return host
}

