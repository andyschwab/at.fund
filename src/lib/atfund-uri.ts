import { Client } from '@atproto/lex'
import { lookupAtprotoDid, lookupAtprotoDidExact } from '@/lib/atfund-dns'
import { fetchPdsHostFunding, type PdsHostFunding } from '@/lib/atfund-steward'
import { resolveDidFromIdentifier, resolveHandleFromDid } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'


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

function hostnameFromWebUrl(input: string | undefined): string | undefined {
  if (!input) return undefined
  try {
    return new URL(input).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * Call com.atproto.server.describeServer on a PDS hostname and extract the
 * steward URI (the branding/entryway domain, e.g. 'bsky.social') from policy
 * link hostnames or the server DID.
 *
 * Returns null when the server is unreachable or returns no useful identity.
 */
export async function describeServerStewardUri(hostname: string): Promise<string | null> {
  const result = await describeServerStewardFallback(hostname)
  return result.pdsStewardUri ?? null
}

async function describeServerStewardFallback(hostname: string): Promise<{
  pdsStewardUri?: string
  pdsStewardHandle?: string
  stewardDid?: string
}> {
  try {
    const pdsClient = new Client(`https://${hostname}`)
    const res = await xrpcQuery<{
      did?: string
      links?: { privacyPolicy?: string; termsOfService?: string }
    }>(pdsClient, 'com.atproto.server.describeServer', {})
    const did = typeof res.did === 'string' ? res.did : undefined
    const policyHost =
      hostnameFromWebUrl(res.links?.privacyPolicy) ??
      hostnameFromWebUrl(res.links?.termsOfService)
    const pdsStewardUri = policyHost ?? did
    const pdsStewardHandle =
      pdsStewardUri && !pdsStewardUri.startsWith('did:') ? pdsStewardUri : undefined
    return { pdsStewardUri, pdsStewardHandle, stewardDid: did }
  } catch {
    return {}
  }
}

/**
 * Generic fund.at discovery starting from a URI-like identifier (URL or hostname).
 * For hostnames, we resolve `_atproto.<hostname>` to a steward DID, then load
 * `fund.at.*` records from that DID's PDS.
 */
export async function fetchFundingForUriLike(
  uriLike: string,
): Promise<PdsHostFunding | null> {
  const hostname = hostnameFromUriLike(uriLike)
  if (!hostname) return null

  const did = await lookupAtprotoDid(hostname)
  if (!did) {
    const fallback = await describeServerStewardFallback(hostname)
    if (!fallback.pdsStewardUri && !fallback.stewardDid) return null

    const fallbackStewardDid =
      fallback.pdsStewardUri && !fallback.pdsStewardUri.startsWith('did:')
        ? (await lookupAtprotoDidExact(fallback.pdsStewardUri)) ??
          (await resolveDidFromIdentifier(fallback.pdsStewardUri))
        : fallback.pdsStewardUri
    const resolvedDid = fallbackStewardDid ?? fallback.stewardDid
    if (!resolvedDid) return null
    const resolvedHandle = await resolveHandleFromDid(resolvedDid)
    const resolvedUri = resolvedHandle ?? fallback.pdsStewardUri ?? resolvedDid

    // fallback.pdsStewardUri is the entryway (e.g. 'bsky.social'); resolvedUri is the operator (e.g. 'bsky.app')
    const pdsEntryway = fallback.pdsStewardUri !== resolvedUri ? fallback.pdsStewardUri : undefined
    const hostFunding = await fetchPdsHostFunding(resolvedDid, hostname, {
      pdsStewardUri: resolvedUri,
      pdsStewardHandle: resolvedHandle ?? fallback.pdsStewardHandle,
      pdsEntryway,
    })
    if (hostFunding) return hostFunding

    return {
      pdsHostname: hostname,
      stewardDid: resolvedDid,
      pdsStewardUri: resolvedUri,
      pdsStewardHandle: resolvedHandle ?? fallback.pdsStewardHandle,
      pdsEntryway,
    }
  }
  const pdsStewardHandle = await resolveHandleFromDid(did)
  const pdsStewardUri = pdsStewardHandle ?? did

  const hostFunding = await fetchPdsHostFunding(did, hostname, {
    pdsStewardUri,
    pdsStewardHandle,
    // direct path: hostname IS the entryway (e.g. 'bsky.social')
    pdsEntryway: hostname !== pdsStewardUri ? hostname : undefined,
  })
  if (hostFunding) return hostFunding

  // Return steward identity even when no fund.at.disclosure is published.
  return {
    pdsHostname: hostname,
    stewardDid: did,
    pdsStewardUri,
    pdsStewardHandle,
    pdsEntryway: hostname !== pdsStewardUri ? hostname : undefined,
  }
}
