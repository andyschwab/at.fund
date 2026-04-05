import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import type { OAuthSession } from '@atproto/oauth-client'
import { Client } from '@atproto/lex'
import type { AtIdentifierString } from '@atproto/lex-client'
import * as fund from '@/lexicons/fund'
import type { FundingManifest } from '@/lib/funding-manifest'
import { xrpcQuery } from '@/lib/xrpc'

// New grouped NSIDs
export const FUND_DECLARATION = 'fund.at.actor.declaration'
export const FUND_CONTRIBUTE = 'fund.at.funding.contribute'
export const FUND_MANIFEST = 'fund.at.funding.manifest'
export const FUND_DEPENDENCY = 'fund.at.graph.dependency'
export const FUND_ENDORSE = 'fund.at.graph.endorse'

// Legacy NSIDs — used for fallback reads during migration
export const LEGACY_CONTRIBUTE = 'fund.at.contribute'
export const LEGACY_MANIFEST = 'fund.at.manifest'
export const LEGACY_DEPENDENCY = 'fund.at.dependency'
export const LEGACY_ENDORSE = 'fund.at.endorse'

const PUBLIC_IDENTITY = 'https://public.api.bsky.app'
const publicClient = new Client(PUBLIC_IDENTITY)

// Global-backed cache for DID documents so results survive hot reloads in dev.
const gDid = global as typeof globalThis & {
  __didDocCache?: Map<string, Record<string, unknown> | null>
}
const didDocCache = (gDid.__didDocCache ??= new Map())

export type FundAtResult = {
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
  manifest?: FundingManifest
  /** True if any records were found using legacy NSIDs (migration needed). */
  needsMigration?: boolean
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
  if (didDocCache.has(did)) return didDocCache.get(did)!
  let result: Record<string, unknown> | null = null
  try {
    const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
    if (res.ok) result = (await res.json()) as Record<string, unknown>
  } catch {
    // leave result as null
  }
  didDocCache.set(did, result)
  return result
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
// ATProto manifest → FundingManifest conversion
// ---------------------------------------------------------------------------

/**
 * Converts a fund.at.funding.manifest (or legacy fund.at.manifest) record
 * value into a FundingManifest. Handles both old field names (id, type) and
 * new ones (channelId, channelType).
 */
function atprotoManifestToFundingManifest(
  value: Record<string, unknown>,
): FundingManifest | null {
  const channels = value.channels as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(channels) || channels.length === 0) return null

  return {
    version: 'v1.0.0',
    entity: { type: 'other', role: 'other', name: '', description: '' },
    funding: {
      channels: channels.map((ch) => ({
        guid: String(ch.channelId ?? ch.id ?? ''),
        type: (['bank', 'payment-provider', 'cheque', 'cash', 'other'] as const).includes(
          (ch.channelType ?? ch.type) as 'bank' | 'payment-provider' | 'cheque' | 'cash' | 'other',
        )
          ? ((ch.channelType ?? ch.type) as 'bank' | 'payment-provider' | 'cheque' | 'cash' | 'other')
          : 'other',
        address: String(ch.uri ?? ''),
        description: ch.description ? String(ch.description) : undefined,
      })),
      plans: Array.isArray(value.plans)
        ? (value.plans as Array<Record<string, unknown>>).map((p) => ({
            guid: String(p.planId ?? p.id ?? ''),
            status: 'active' as const,
            name: String(p.name ?? ''),
            description: p.description ? String(p.description) : undefined,
            amount: typeof p.amount === 'number' ? p.amount / 100 : 0,
            currency: String(p.currency ?? 'USD'),
            frequency: (['one-time', 'weekly', 'fortnightly', 'monthly', 'yearly', 'other'] as const)
              .includes(p.frequency as 'one-time' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | 'other')
              ? (p.frequency as 'one-time' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | 'other')
              : 'other',
            channels: Array.isArray(p.channels)
              ? p.channels.map((c: unknown) =>
                  typeof c === 'object' && c && 'channelId' in c
                    ? String((c as Record<string, unknown>).channelId)
                    : typeof c === 'string' ? c : '',
                ).filter(Boolean)
              : [],
          }))
        : [],
    },
  }
}

// ---------------------------------------------------------------------------
// High-level fetch: new NSIDs with legacy fallback
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
 * Tries new grouped NSIDs first, falls back to legacy flat NSIDs.
 * Returns null when no records exist.
 *
 * When `pdsUrl` is provided, skips the DID document fetch (saves one round-trip).
 * The two PDS calls (contribute + dependency) run in parallel.
 */
export async function fetchFundAtRecords(
  stewardDid: string,
  pdsUrl?: string,
): Promise<FundAtResult | null> {
  let readClient: Client | null
  if (pdsUrl) {
    readClient = new Client(pdsUrl)
  } else {
    readClient = await getClientForDid(stewardDid)
  }
  if (!readClient) return null

  const repo = stewardDid as AtIdentifierString
  let needsMigration = false

  // Run contribute + dependency fetches in parallel (new NSIDs, then legacy fallback)
  const [contributeResult, dependencyResult] = await Promise.all([
    (async (): Promise<{ url?: string; legacy: boolean }> => {
      try {
        const res = await readClient.get(fund.at.funding.contribute, { repo })
        return { url: res.value.url || undefined, legacy: false }
      } catch {
        try {
          const res = await readClient.get(fund.at.contribute, { repo })
          return { url: res.value.url || undefined, legacy: !!res.value.url }
        } catch {
          return { legacy: false }
        }
      }
    })(),
    (async (): Promise<{ deps?: Array<{ uri: string; label?: string }>; legacy: boolean }> => {
      try {
        const res = await readClient.list(fund.at.graph.dependency, { repo, limit: 100 })
        const deps: Array<{ uri: string; label?: string }> = []
        for (const r of res.records) {
          const subject = (r.value as Record<string, unknown>).subject as string | undefined
          const uri = subject?.trim()
          if (!uri) continue
          const label = ((r.value as Record<string, unknown>).label as string)?.trim() || undefined
          deps.push({ uri, label })
        }
        if (deps.length > 0) return { deps, legacy: false }
      } catch { /* try legacy */ }
      try {
        const res = await readClient.list(fund.at.dependency, { repo, limit: 100 })
        const deps: Array<{ uri: string; label?: string }> = []
        for (const r of res.records) {
          const uri = r.value.uri?.trim()
          if (!uri) continue
          const label = r.value.label?.trim() || undefined
          deps.push({ uri, label })
        }
        return { deps: deps.length > 0 ? deps : undefined, legacy: deps.length > 0 }
      } catch {
        return { legacy: false }
      }
    })(),
  ])

  const contributeUrl = contributeResult.url
  const dependencies = dependencyResult.deps
  if (contributeResult.legacy || dependencyResult.legacy) needsMigration = true

  // ── Manifest: try new, fall back to legacy ────────────────────────────
  let manifest: FundingManifest | undefined
  try {
    const res = await readClient.get(fund.at.funding.manifest, { repo })
    manifest = atprotoManifestToFundingManifest(res.value as Record<string, unknown>) ?? undefined
  } catch {
    try {
      const res = await readClient.get(fund.at.manifest, { repo })
      manifest = atprotoManifestToFundingManifest(res.value as Record<string, unknown>) ?? undefined
      if (manifest) needsMigration = true
    } catch { /* neither exists */ }
  }

  if (!contributeUrl && !dependencies && !manifest) return null
  return { contributeUrl, dependencies, manifest, needsMigration: needsMigration || undefined }
}

// ---------------------------------------------------------------------------
// Authenticated read: use the session to list the user's own records directly,
// bypassing public API identity resolution.
// ---------------------------------------------------------------------------

/**
 * Fetches the user's own fund.at.graph.endorse records — returns the endorsed subjects.
 * Falls back to legacy fund.at.endorse.
 */
export async function fetchOwnEndorsements(
  session: OAuthSession,
): Promise<string[]> {
  const client = new Client(session)

  // Try new NSID first
  try {
    const res = await client.list(fund.at.graph.endorse, { limit: 100 })
    const uris = res.records
      .map((r) => {
        const val = r.value as Record<string, unknown>
        const subject = (val.subject ?? val.uri) as string | undefined
        return typeof subject === 'string' ? subject.trim() : ''
      })
      .filter(Boolean)
    if (uris.length > 0) return uris
  } catch { /* optional */ }

  // Fall back to legacy
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
  let needsMigration = false

  // ── Contribute URL ────────────────────────────────────────────────────
  let contributeUrl: string | undefined
  try {
    const res = await client.get(fund.at.funding.contribute)
    if (res.value.url) contributeUrl = res.value.url
  } catch {
    try {
      const res = await client.get(fund.at.contribute)
      if (res.value.url) {
        contributeUrl = res.value.url
        needsMigration = true
      }
    } catch { /* neither exists */ }
  }

  // ── Dependencies ──────────────────────────────────────────────────────
  let dependencies: Array<{ uri: string; label?: string }> | undefined
  try {
    const res = await client.list(fund.at.graph.dependency, { limit: 100 })
    const deps: Array<{ uri: string; label?: string }> = []
    for (const r of res.records) {
      const val = r.value as Record<string, unknown>
      const uri = (val.subject as string)?.trim()
      if (!uri) continue
      const label = (val.label as string)?.trim() || undefined
      deps.push({ uri, label })
    }
    if (deps.length > 0) dependencies = deps
  } catch { /* optional */ }

  if (!dependencies) {
    try {
      const res = await client.list(fund.at.dependency, { limit: 100 })
      const deps: Array<{ uri: string; label?: string }> = []
      for (const r of res.records) {
        const uri = r.value.uri?.trim()
        if (!uri) continue
        const label = r.value.label?.trim() || undefined
        deps.push({ uri, label })
      }
      if (deps.length > 0) {
        dependencies = deps
        needsMigration = true
      }
    } catch { /* optional */ }
  }

  // ── Manifest ──────────────────────────────────────────────────────────
  let manifest: FundingManifest | undefined
  try {
    const res = await client.get(fund.at.funding.manifest)
    manifest = atprotoManifestToFundingManifest(res.value as Record<string, unknown>) ?? undefined
  } catch {
    try {
      const res = await client.get(fund.at.manifest)
      manifest = atprotoManifestToFundingManifest(res.value as Record<string, unknown>) ?? undefined
      if (manifest) needsMigration = true
    } catch { /* neither exists */ }
  }

  if (!contributeUrl && !dependencies && !manifest) return null
  return { contributeUrl, dependencies, manifest, needsMigration: needsMigration || undefined }
}
