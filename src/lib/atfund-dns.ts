import dns from 'node:dns/promises'

/** DNS TXT name prefix for domain → DID discovery (ATProto `_atproto`). */
export const ATPROTO_TXT_PREFIX = '_atproto'

function parseDidFromTxtChunks(chunks: string[]): string | null {
  const flat = chunks.join('').trim()
  if (!flat) return null
  const didMatch = flat.match(/\b(did:plc:[a-z0-9]+|did:web:[^\s]+)/i)
  if (didMatch) return didMatch[1]!
  const keyVal = flat.match(/^\s*did\s*=\s*(did:[^\s]+)/i)
  if (keyVal) return keyVal[1]!
  return null
}

/**
 * Looks up `_atproto.<hostname>` TXT and returns the domain’s ATProto DID if present.
 * The returned DID is the canonical identity for that hostname.
 */
export async function lookupAtprotoDid(hostname: string): Promise<string | null> {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h.includes('/') || h.includes(':')) return null

  const name = `${ATPROTO_TXT_PREFIX}.${h}`
  try {
    const records = await dns.resolveTxt(name)
    for (const chunks of records) {
      const did = parseDidFromTxtChunks(chunks)
      if (did) return did
    }
  } catch {
    return null
  }
  return null
}
