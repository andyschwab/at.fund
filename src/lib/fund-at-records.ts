import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import type { OAuthSession } from '@atproto/oauth-client'
import { Client } from '@atproto/lex'
import type { AtIdentifierString } from '@atproto/lex-client'
import * as fund from '@/lexicons/fund'
import { xrpcQuery } from '@/lib/xrpc'

export const FUND_CONTRIBUTE = 'fund.at.contribute'
export const FUND_DEPENDENCY = 'fund.at.dependency'
export const FUND_ENDORSE = 'fund.at.endorse'

const PUBLIC_IDENTITY = 'https://public.api.bsky.app'
const publicClient = new Client(PUBLIC_IDENTITY)

export type FundAtResult = {
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

const PLC_DIRECTORY = 'https://plc.directory'

/**
 * Fetches a DID document from plc.directory.
 * This is the reliable path — com.atproto.identity.resolveIdentity is not
 * implemented on the public Bluesky API.
 */
async function fetchDidDocument(did: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function handleFromAlsoKnownAs(didDoc: unknown): string | undefined {
  if (!didDoc || typeof didDoc !== 'object') return undefined
  const raw = (didDoc as { alsoKnownAs?: unknown }).alsoKnownAs
  if (!Array.isArray(raw)) return undefined
  for (const v of raw) {
    if (typeof v !== 'string') continue
    if (!v.startsWith('at://')) continue
    const handle = v.slice('at://'.length).trim()
    if (handle) return handle
  }
  return undefined
}

export async function resolveHandleFromDid(
  stewardDid: string,
): Promise<string | undefined> {
  try {
    const didDoc = await fetchDidDocument(stewardDid)
    if (didDoc) return handleFromAlsoKnownAs(didDoc)
  } catch {
    // fall through
  }
  return undefined
}

export async function resolveDidFromIdentifier(
  identifier: string,
): Promise<string | undefined> {
  // If already a DID, return as-is
  if (identifier.startsWith('did:')) return identifier
  // Treat as a handle and resolve via the public API
  try {
    const res = await xrpcQuery<{ did: string }>(
      publicClient,
      'com.atproto.identity.resolveHandle',
      { handle: identifier },
    )
    return res.did
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// PDS resolution
// ---------------------------------------------------------------------------

export async function resolvePdsUrl(stewardDid: string): Promise<URL | null> {
  try {
    const didDoc = await fetchDidDocument(stewardDid)
    if (!didDoc) return null
    return extractPdsUrl(didDoc as AtprotoDidDocument)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// High-level fetch: fund.at.contribute + fund.at.dependency from one PDS
// ---------------------------------------------------------------------------

async function getClientForDid(
  stewardDid: string,
): Promise<Client | null> {
  const pdsUrl = await resolvePdsUrl(stewardDid)
  if (!pdsUrl) return null
  return new Client(pdsUrl.origin)
}

/**
 * Fetches fund.at.* records for a DID from its PDS.
 * Returns null when no records exist.
 */
export async function fetchFundAtRecords(
  stewardDid: string,
): Promise<FundAtResult | null> {
  const readClient = await getClientForDid(stewardDid)
  if (!readClient) return null

  const repo = stewardDid as AtIdentifierString

  let contributeUrl: string | undefined
  try {
    const res = await readClient.get(fund.at.contribute, { repo })
    if (res.value.url) contributeUrl = res.value.url
  } catch {
    // optional — record may not exist
  }

  let dependencies: Array<{ uri: string; label?: string }> | undefined
  try {
    const res = await readClient.list(fund.at.dependency, { repo, limit: 100 })
    const deps: Array<{ uri: string; label?: string }> = []
    for (const r of res.records) {
      const uri = r.value.uri?.trim()
      if (!uri) continue
      const label = r.value.label?.trim() || undefined
      deps.push({ uri, label })
    }
    if (deps.length > 0) dependencies = deps
  } catch {
    // optional
  }

  if (!contributeUrl && !dependencies) return null
  return { contributeUrl, dependencies }
}

// ---------------------------------------------------------------------------
// Authenticated read: use the session to list the user's own records directly,
// bypassing public API identity resolution.
// ---------------------------------------------------------------------------

/**
 * Fetches the user's own fund.at.endorse records — returns the endorsed URIs.
 */
export async function fetchOwnEndorsements(
  session: OAuthSession,
): Promise<string[]> {
  const client = new Client(session)
  try {
    const res = await client.list(fund.at.endorse, { limit: 100 })
    return res.records
      .map((r) => typeof r.value.uri === 'string' ? r.value.uri.trim() : '')
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function fetchOwnFundAtRecords(
  session: OAuthSession,
): Promise<FundAtResult | null> {
  const client = new Client(session)

  let contributeUrl: string | undefined
  try {
    const res = await client.get(fund.at.contribute)
    if (res.value.url) contributeUrl = res.value.url
  } catch {
    // optional
  }

  let dependencies: Array<{ uri: string; label?: string }> | undefined
  try {
    const res = await client.list(fund.at.dependency, { limit: 100 })
    const deps: Array<{ uri: string; label?: string }> = []
    for (const r of res.records) {
      const uri = r.value.uri?.trim()
      if (!uri) continue
      const label = r.value.label?.trim() || undefined
      deps.push({ uri, label })
    }
    if (deps.length > 0) dependencies = deps
  } catch {
    // optional
  }

  if (!contributeUrl && !dependencies) return null
  return { contributeUrl, dependencies }
}
