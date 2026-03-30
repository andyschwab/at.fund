export type PdsPlatformFingerprint = {
  hostname: string
  /** Best-effort product/platform label (bucket key). */
  platform: string
  /** Raw `Server` header when present (often includes software + version). */
  serverHeader?: string
  /** `X-Powered-By` header when present. */
  poweredByHeader?: string
}

function normalizeHostname(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Accept either "https://host" or "host"
  if (raw.includes('://')) {
    try {
      const u = new URL(raw)
      return u.hostname || null
    } catch {
      return null
    }
  }

  // Bare hostname; reject obvious junk
  if (raw.includes('/') || raw.includes(' ')) return null
  return raw
}

function guessPlatformFromHeaders(h: Headers): {
  platform: string
  serverHeader?: string
  poweredByHeader?: string
} {
  const serverHeader = h.get('server') ?? undefined
  const poweredByHeader = h.get('x-powered-by') ?? undefined

  const hay = `${serverHeader ?? ''} ${poweredByHeader ?? ''}`.toLowerCase()
  if (hay.includes('atproto')) return { platform: 'atproto', serverHeader, poweredByHeader }
  if (hay.includes('picopds')) return { platform: 'picopds', serverHeader, poweredByHeader }
  if (hay.includes('nginx')) return { platform: 'nginx (unknown app)', serverHeader, poweredByHeader }
  if (hay.includes('cloudflare')) return { platform: 'cloudflare (unknown app)', serverHeader, poweredByHeader }

  return { platform: 'unknown', serverHeader, poweredByHeader }
}

/**
 * Best-effort fingerprint of a PDS "platform" from HTTP response headers.
 * We intentionally keep this lightweight and non-invasive: a single request
 * to a well-known XRPC endpoint, then bucket by headers.
 */
export async function fingerprintPdsHost(
  inputHostname: string,
): Promise<PdsPlatformFingerprint | null> {
  const hostname = normalizeHostname(inputHostname)
  if (!hostname) return null

  // `describeServer` is safe and ubiquitous; even if it errors, headers are useful.
  const url = `https://${hostname}/xrpc/com.atproto.server.describeServer`
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      // Avoid caching so repeated runs reflect reality.
      cache: 'no-store',
    })
    const guessed = guessPlatformFromHeaders(res.headers)
    return { hostname, ...guessed }
  } catch {
    return { hostname, platform: 'unreachable' }
  }
}

export function summarizePlatforms(
  fingerprints: readonly PdsPlatformFingerprint[],
): Array<{ platform: string; count: number }> {
  const counts = new Map<string, number>()
  for (const fp of fingerprints) {
    counts.set(fp.platform, (counts.get(fp.platform) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))
}

