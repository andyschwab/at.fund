import { Client } from '@atproto/lex'
import type { StewardEntry, Capability } from '@/lib/steward-model'
import { resolveIdentity } from '@/lib/identity'
import { resolveFunding } from '@/lib/funding'
import { xrpcQuery } from '@/lib/xrpc'
import { resolveDependencies } from '@/lib/pipeline/dep-resolve'
import { createScanContext } from '@/lib/scan-context'
import type { ScanContext } from '@/lib/scan-context'
import { logger } from '@/lib/logger'
import { PUBLIC_API, FEED_BATCH } from '@/lib/constants'

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
 * Returns null if the URI cannot be resolved to a DID.
 *
 * Runs the same logical pipeline as the streaming scan, scoped to one entity:
 *   1. Identity — resolve DID, fetch profile
 *   2. Funding  — fund.at records + manual catalog
 *   3. Capabilities — discover feeds and labeler from the DID's repo
 *   4. Dependencies — resolve transitive deps from catalog
 *
 * No authentication required — all data sources are public.
 */
export async function resolveEntry(uri: string, ctx?: ScanContext): Promise<ResolveResult | null> {
  const scanCtx = ctx ?? createScanContext()

  // ── 1. Identity ────────────────────────────────────────────────────────
  const identity = await resolveIdentity(uri)
  if (!identity) return null

  // ── 2. Funding ─────────────────────────────────────────────────────────
  const { funding } = await resolveFunding(identity, { ctx: scanCtx })

  const entry: StewardEntry = { ...identity, ...funding, tags: [] }

  // ── 3. Capabilities — discover feeds + labeler from the DID's repo ────
  const publicClient = new Client(PUBLIC_API)
  await discoverCapabilities(publicClient, identity.did, entry)

  // ── 4. Dependencies — resolve transitive deps from catalog ────────────
  const referenced = await resolveDependencies([entry], undefined, scanCtx)

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
