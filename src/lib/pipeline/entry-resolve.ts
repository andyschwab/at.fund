import { Client } from '@atproto/lex'
import type { StewardEntry, Capability } from '@/lib/steward-model'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { xrpcQuery } from '@/lib/xrpc'
import { resolveDependencies } from '@/lib/pipeline/dep-resolve'
import { logger } from '@/lib/logger'

const PUBLIC_API = 'https://public.api.bsky.app'
const FEED_BATCH = 25

// ---------------------------------------------------------------------------
// Full vertical resolution for a single entry
// ---------------------------------------------------------------------------

type ResolveResult = {
  entry: StewardEntry
  referenced: StewardEntry[]
}

/**
 * Resolve a single URI (handle, DID, or hostname) into a fully-enriched
 * StewardEntry with capabilities and transitive dependency entries.
 *
 * Runs the same logical pipeline as the streaming scan, scoped to one entity:
 *   1. Identity — resolve DID, fetch profile
 *   2. Funding  — fund.at records + manual catalog
 *   3. Capabilities — discover feeds and labeler from the DID's repo
 *   4. Dependencies — resolve transitive deps from catalog
 *
 * No authentication required — all data sources are public.
 */
export async function resolveEntry(uri: string): Promise<ResolveResult> {
  const publicClient = new Client(PUBLIC_API)

  // ── 1. Resolve identity ────────────────────────────────────────────────
  const isDid = uri.startsWith('did:')
  let did: string | undefined
  const hostname = isDid ? undefined : uri

  if (isDid) {
    did = uri
  } else {
    // Could be a handle (e.g. jay.bsky.team) or a hostname (e.g. whtwnd.com)
    // Try handle resolution first, then DNS
    try {
      const data = await xrpcQuery<{ did?: string }>(
        publicClient,
        'com.atproto.identity.resolveHandle',
        { handle: uri },
      )
      if (data.did) did = data.did
    } catch {
      // Not a handle — try DNS for hostname
      try {
        const dnsDid = await lookupAtprotoDid(uri)
        if (dnsDid) did = dnsDid
      } catch {
        logger.warn('entry-resolve: identity resolution failed', { uri })
      }
    }
  }

  // Fetch profile
  let handle: string | undefined
  let displayName: string | undefined
  let description: string | undefined
  let avatar: string | undefined

  if (did) {
    try {
      const data = await xrpcQuery<{
        profiles?: Array<{
          did: string
          handle?: string
          displayName?: string
          description?: string
          avatar?: string
        }>
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: [did] })
      const profile = data.profiles?.[0]
      if (profile) {
        handle = profile.handle
        displayName = profile.displayName
        description = profile.description
        avatar = profile.avatar
      }
    } catch { /* profile fetch is best-effort */ }
  }

  // Multi-key catalog lookup
  const manual = lookupManualStewardRecord(uri)
    ?? (did ? lookupManualStewardRecord(did) : null)
    ?? (hostname ? lookupManualStewardRecord(hostname) : null)
    ?? (handle ? lookupManualStewardRecord(handle) : null)

  // Determine if this is a tool (has a hostname in catalog or a manual record)
  const isTool = !!hostname && !!manual

  const bestName = (displayName && !displayName.startsWith('did:'))
    ? displayName
    : hostname ?? handle ?? uri

  const entryUri = hostname ?? handle ?? uri
  const landingPage = !isTool && handle
    ? `https://bsky.app/profile/${handle}`
    : undefined

  // ── 2. Funding & catalog ───────────────────────────────────────────────
  let contributeUrl: string | undefined
  let dependencies: string[] | undefined
  let source: 'fund.at' | 'manual' | 'unknown' = 'unknown'

  if (did) {
    try {
      const fundAt = await fetchFundAtForStewardDid(did)
      if (fundAt) {
        contributeUrl = fundAt.contributeUrl ?? manual?.contributeUrl
        dependencies = mergeDeps(
          fundAt.dependencies?.map((d) => d.uri),
          manual?.dependencies,
        )
        source = 'fund.at'
      }
    } catch (e) {
      logger.warn('entry-resolve: fund.at fetch failed', {
        uri, did, error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (source === 'unknown' && manual) {
    contributeUrl = manual.contributeUrl
    dependencies = manual.dependencies
    source = 'manual'
  }

  const tags: string[] = isTool ? ['tool'] : []

  const entry: StewardEntry = {
    uri: entryUri,
    did,
    handle,
    avatar,
    tags: tags as StewardEntry['tags'],
    displayName: bestName,
    description,
    landingPage,
    contributeUrl,
    dependencies,
    source,
  }

  // ── 3. Capabilities — discover feeds + labeler from the DID's repo ────
  if (did) {
    await discoverCapabilities(publicClient, did, entry)
  }

  // ── 4. Dependencies — resolve transitive deps from catalog ────────────
  const referenced = await resolveDependencies([entry])

  return { entry, referenced }
}

// ---------------------------------------------------------------------------
// Stage 3: Capability discovery
// ---------------------------------------------------------------------------

async function discoverCapabilities(
  publicClient: Client,
  did: string,
  entry: StewardEntry,
): Promise<void> {
  const capabilities: Capability[] = []

  // Discover feeds by listing the DID's feed generator records
  try {
    const feedUris = await listFeedGeneratorUris(publicClient, did)
    if (feedUris.length > 0) {
      const feeds = await fetchFeedDetails(publicClient, feedUris)
      for (const feed of feeds) {
        const rkey = feed.uri?.match(/\/([^/]+)$/)?.[1] ?? ''
        const feedHandle = feed.creator?.handle ?? entry.handle
        capabilities.push({
          type: 'feed',
          name: feed.displayName ?? rkey ?? did,
          description: feed.description,
          uri: feed.uri,
          landingPage: feedHandle
            ? `https://bsky.app/profile/${feedHandle}/feed/${rkey}`
            : undefined,
        })
      }
      if (!entry.tags.includes('feed')) entry.tags.push('feed')
    }
  } catch (e) {
    logger.warn('entry-resolve: feed discovery failed', {
      did, error: e instanceof Error ? e.message : String(e),
    })
  }

  // Discover labeler
  try {
    const data = await xrpcQuery<{
      views?: Array<{
        uri?: string
        creator?: { did: string; displayName?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.labeler.getServices', { dids: [did], detailed: false })

    if (data.views && data.views.length > 0) {
      const view = data.views[0]!
      const labelerHandle = view.creator?.handle ?? entry.handle
      capabilities.push({
        type: 'labeler',
        name: view.creator?.displayName ?? labelerHandle ?? did,
        landingPage: labelerHandle
          ? `https://bsky.app/profile/${labelerHandle}`
          : `https://bsky.app/profile/${did}`,
      })
      if (!entry.tags.includes('labeler')) entry.tags.push('labeler')
    }
  } catch (e) {
    logger.warn('entry-resolve: labeler discovery failed', {
      did, error: e instanceof Error ? e.message : String(e),
    })
  }

  if (capabilities.length > 0) {
    entry.capabilities = [...(entry.capabilities ?? []), ...capabilities]
  }
}

// ---------------------------------------------------------------------------
// Feed generator helpers
// ---------------------------------------------------------------------------

type FeedView = {
  uri?: string
  displayName?: string
  description?: string
  creator?: { did?: string; handle?: string; displayName?: string }
}

/** List all feed generator AT URIs in a DID's repo. */
async function listFeedGeneratorUris(
  publicClient: Client,
  did: string,
): Promise<string[]> {
  const uris: string[] = []
  try {
    const res = await publicClient.listRecords(
      'app.bsky.feed.generator' as `${string}.${string}.${string}`,
      {
        repo: did as import('@atproto/lex-client').AtIdentifierString,
        limit: 100,
      },
    )
    for (const record of res.body.records ?? []) {
      if (record.uri) uris.push(String(record.uri))
    }
  } catch { /* repo may not exist or have no generators */ }
  return uris
}

/** Fetch display details for feed URIs (batched). */
async function fetchFeedDetails(
  publicClient: Client,
  feedUris: string[],
): Promise<FeedView[]> {
  const all: FeedView[] = []
  for (let i = 0; i < feedUris.length; i += FEED_BATCH) {
    const batch = feedUris.slice(i, i + FEED_BATCH)
    try {
      const data = await xrpcQuery<{ feeds?: FeedView[] }>(
        publicClient,
        'app.bsky.feed.getFeedGenerators',
        { feeds: batch },
      )
      all.push(...(data.feeds ?? []))
    } catch {
      logger.warn('entry-resolve: feed batch failed', { offset: i })
    }
  }
  return all
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeDeps(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set([...(a ?? []), ...(b ?? [])])
  return set.size > 0 ? [...set].sort() : undefined
}
