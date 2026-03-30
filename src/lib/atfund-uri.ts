import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { fetchPdsHostFunding, type PdsHostFunding } from '@/lib/atfund-steward'

function hostnameFromUriLike(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (raw.startsWith('did:')) return null

  if (raw.includes('://')) {
    try {
      const u = new URL(raw)
      return u.hostname || null
    } catch {
      return null
    }
  }

  if (raw.includes('/') || raw.includes(' ') || raw.includes(':')) return null
  return raw.toLowerCase().replace(/\.$/, '')
}

/**
 * Generic fund.at discovery starting from a URI-like identifier (URL or hostname).
 * For hostnames, we resolve `_atproto.<hostname>` to a steward DID, then load
 * `fund.at.*` records from that DID’s PDS.
 */
export async function fetchFundingForUriLike(
  uriLike: string,
): Promise<PdsHostFunding | null> {
  const hostname = hostnameFromUriLike(uriLike)
  if (!hostname) return null

  const did = await lookupAtprotoDid(hostname)
  if (!did) return null

  return fetchPdsHostFunding(did, hostname)
}

