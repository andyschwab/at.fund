import { Agent } from '@atproto/api'
import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { logger } from '@/lib/logger'

const CONCURRENCY = 8

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i]!)
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Display-info helpers
// ---------------------------------------------------------------------------

type DisplayInfo = {
  did: string
  displayName: string
  description?: string
  handle?: string
  landingPage?: string
}

/**
 * Batch-fetch Bluesky labeler service views for a list of DIDs.
 * Returns a map of DID → DisplayInfo (only for DIDs that resolve).
 */
async function fetchLabelerDisplayInfo(
  agent: Agent,
  dids: string[],
): Promise<Map<string, DisplayInfo>> {
  const result = new Map<string, DisplayInfo>()
  if (dids.length === 0) return result
  try {
    const res = await agent.app.bsky.labeler.getServices({
      dids,
      detailed: false,
    })
    for (const view of res.data.views ?? []) {
      if (!('creator' in view)) continue
      const creator = view.creator
      if (!creator) continue
      const did = creator.did
      result.set(did, {
        did,
        displayName: creator.displayName ?? creator.handle,
        description: creator.description,
        handle: creator.handle,
      })
    }
  } catch (e) {
    logger.warn('subscriptions-scan: labeler display info fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return result
}

/**
 * Batch-fetch Bluesky feed generator views for a list of AT-URIs.
 * Returns a map of DID → DisplayInfo (only for feeds that resolve).
 */
async function fetchFeedDisplayInfo(
  agent: Agent,
  feedUris: string[],
): Promise<Map<string, DisplayInfo>> {
  const result = new Map<string, DisplayInfo>()
  if (feedUris.length === 0) return result
  try {
    const res = await agent.app.bsky.feed.getFeedGenerators({ feeds: feedUris })
    for (const view of res.data.feeds ?? []) {
      const did = view.did
      if (!did) continue
      result.set(did, {
        did,
        displayName: view.displayName,
        description: view.description,
        handle: view.creator?.handle,
        // Feed generators don't have a canonical landing page in the API —
        // callers can derive one from the AT-URI if needed.
      })
    }
  } catch (e) {
    logger.warn('subscriptions-scan: feed generator display info fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Per-DID resolution: fund.at → manual catalog → Bluesky profile fallback
// ---------------------------------------------------------------------------

async function resolveEntry(
  did: string,
  tag: StewardTag,
  fallback: DisplayInfo | undefined,
): Promise<StewardEntry> {
  // Try fund.at records first
  try {
    const fundAt = await fetchFundAtForStewardDid(did)
    if (fundAt) {
      const {
        displayName: dName,
        description: dDesc,
        landingPage: dLanding,
        ...disclosureExtras
      } = fundAt.disclosure
      return {
        uri: did,
        did,
        handle: fallback?.handle,
        tags: [tag],
        displayName: dName ?? fallback?.displayName ?? did,
        description: dDesc ?? fallback?.description,
        landingPage: dLanding,
        links: fundAt.links,
        dependencies: fundAt.dependencyUris,
        dependencyNotes: fundAt.dependencyNotes,
        source: 'fund.at',
        ...disclosureExtras,
      }
    }
  } catch {
    // fall through
  }

  // Try manual catalog by DID
  const manual = lookupManualStewardRecord(did)
  if (manual) {
    return {
      uri: did,
      did,
      handle: fallback?.handle,
      tags: [tag],
      displayName: manual.displayName,
      description: manual.description,
      landingPage: manual.landingPage,
      contactGeneralHandle: manual.contactGeneralHandle,
      links: manual.links.length > 0 ? manual.links : undefined,
      dependencies: manual.dependencies,
      source: 'manual',
    }
  }

  // Fall back to Bluesky profile data
  return {
    uri: did,
    did,
    handle: fallback?.handle,
    tags: [tag],
    displayName: fallback?.displayName ?? did,
    description: fallback?.description,
    landingPage: fallback?.landingPage,
    source: 'unknown',
  }
}

// ---------------------------------------------------------------------------
// Public scan function
// ---------------------------------------------------------------------------

export type SubscriptionScanResult = {
  entries: StewardEntry[]
  labelerCount: number
  feedCount: number
}

/**
 * Scans the authenticated user's Bluesky preferences to find:
 *   - Labeler services they subscribe to (tag: 'labeler')
 *   - Feed generators they have saved/pinned (tag: 'feed')
 *
 * For each, attempts fund.at record lookup, manual catalog fallback,
 * then Bluesky profile data as a last resort for display info.
 */
export async function scanSubscriptions(
  session: OAuthSession,
): Promise<SubscriptionScanResult> {
  const agent = new Agent(session)

  // Fetch preferences via the high-level SDK helper
  let labelerDids: string[] = []
  let feedUris: string[] = []

  try {
    const prefs = await agent.getPreferences()

    labelerDids = prefs.moderationPrefs.labelers.map((l) => l.did)

    feedUris = prefs.savedFeeds
      .filter((f) => f.type === 'feed')
      .map((f) => f.value)
  } catch (e) {
    logger.warn('subscriptions-scan: failed to fetch preferences', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { entries: [], labelerCount: 0, feedCount: 0 }
  }

  logger.info('subscriptions-scan: found subscriptions', {
    labelerCount: labelerDids.length,
    feedCount: feedUris.length,
  })

  if (labelerDids.length === 0 && feedUris.length === 0) {
    return { entries: [], labelerCount: 0, feedCount: 0 }
  }

  // Batch-fetch display info for both types in parallel
  const [labelerInfo, feedInfo] = await Promise.all([
    fetchLabelerDisplayInfo(agent, labelerDids),
    fetchFeedDisplayInfo(agent, feedUris),
  ])

  // Extract feed DIDs from GeneratorView results
  // (feedInfo is keyed by DID, so we use its keys, not the raw AT-URIs)
  const feedDids = [...feedInfo.keys()]

  // Resolve all entries concurrently (fund.at calls)
  const [labelerEntries, feedEntries] = await Promise.all([
    runWithConcurrency(labelerDids, CONCURRENCY, (did) =>
      resolveEntry(did, 'labeler', labelerInfo.get(did)),
    ),
    runWithConcurrency(feedDids, CONCURRENCY, (did) =>
      resolveEntry(did, 'feed', feedInfo.get(did)),
    ),
  ])

  const entries = [...labelerEntries, ...feedEntries]

  logger.info('subscriptions-scan: completed', {
    labelerCount: labelerEntries.length,
    feedCount: feedEntries.length,
    withFundAt: entries.filter((e) => e.source === 'fund.at').length,
  })

  return {
    entries,
    labelerCount: labelerEntries.length,
    feedCount: feedEntries.length,
  }
}
