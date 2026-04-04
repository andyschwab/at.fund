import dns from 'node:dns/promises'

/** DNS TXT name prefix for domain → DID discovery (ATProto `_atproto`). */
export const ATPROTO_TXT_PREFIX = '_atproto'

// Global-backed cache for hostname → DID lookups so results survive hot reloads in dev.
const gDns = global as typeof globalThis & {
  __atprotoDnsCache?: Map<string, string | null>
}
const dnsCache = (gDns.__atprotoDnsCache ??= new Map())

function parseDidFromTxtChunks(chunks: string[]): string | null {
  const flat = chunks.join('').trim()
  if (!flat) return null
  const didMatch = flat.match(/\b(did:plc:[a-z0-9]+|did:web:[^\s]+)/i)
  if (didMatch) return didMatch[1]!
  const keyVal = flat.match(/^\s*did\s*=\s*(did:[^\s]+)/i)
  if (keyVal) return keyVal[1]!
  return null
}

function candidateHostnames(hostname: string): string[] {
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length < 2) return []
  const out: string[] = []
  for (let i = 0; i <= labels.length - 2; i++) {
    out.push(labels.slice(i).join('.'))
  }
  return out
}

function parseDidFromWellKnownText(raw: string): string | null {
  const v = raw.trim().replace(/^"|"$/g, '')
  if (!v) return null
  const match = v.match(/^(did:plc:[a-z0-9]+|did:web:[a-z0-9.-]+)$/i)
  return match?.[1] ?? null
}

async function lookupDidViaWellKnown(hostname: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${hostname}/.well-known/atproto-did`)
    if (!res.ok) return null
    const text = await res.text()
    return parseDidFromWellKnownText(text)
  } catch {
    return null
  }
}

/**
 * Resolves a hostname to an ATProto DID.
 * For each hostname candidate (exact, then parents), tries DNS `_atproto` TXT
 * and then `https://<host>/.well-known/atproto-did`.
 */
export async function lookupAtprotoDid(hostname: string): Promise<string | null> {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h.includes('/') || h.includes(':')) return null

  const cacheKey = `climb:${h}`
  if (dnsCache.has(cacheKey)) return dnsCache.get(cacheKey)!

  let result: string | null = null
  outer: for (const candidate of candidateHostnames(h)) {
    const name = `${ATPROTO_TXT_PREFIX}.${candidate}`
    try {
      const records = await dns.resolveTxt(name)
      for (const chunks of records) {
        const did = parseDidFromTxtChunks(chunks)
        if (did) { result = did; break outer }
      }
    } catch {
      // Try HTTPS well-known fallback for this candidate.
    }
    const wellKnownDid = await lookupDidViaWellKnown(candidate)
    if (wellKnownDid) { result = wellKnownDid; break }
    // Otherwise keep climbing parent hostnames.
  }

  if (!result) {
    result = await lookupDidViaWellKnown(h)
  }

  dnsCache.set(cacheKey, result)
  return result
}

/**
 * Resolve a single hostname without climbing parent labels.
 * Uses DNS `_atproto` first, then HTTPS well-known.
 */
export async function lookupAtprotoDidExact(
  hostname: string,
): Promise<string | null> {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h.includes('/') || h.includes(':')) return null

  const cacheKey = `exact:${h}`
  if (dnsCache.has(cacheKey)) return dnsCache.get(cacheKey)!

  let result: string | null = null
  const name = `${ATPROTO_TXT_PREFIX}.${h}`
  try {
    const records = await dns.resolveTxt(name)
    for (const chunks of records) {
      const did = parseDidFromTxtChunks(chunks)
      if (did) { result = did; break }
    }
  } catch {
    // fall through
  }
  if (!result) result = await lookupDidViaWellKnown(h)

  dnsCache.set(cacheKey, result)
  return result
}
