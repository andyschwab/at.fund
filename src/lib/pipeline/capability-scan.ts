import { Client } from '@atproto/lex'
import type { StewardEntry, Capability } from '@/lib/steward-model'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'

const PUBLIC_API = 'https://public.api.bsky.app'

// ---------------------------------------------------------------------------
// Phase 3: Attach feed + labeler capabilities to enriched entries
// ---------------------------------------------------------------------------

export async function attachCapabilities(
  entries: StewardEntry[],
  feedUris: string[],
  labelerDids: string[],
  onUpdate?: (entry: StewardEntry) => void,
): Promise<void> {
  const publicClient = new Client(PUBLIC_API)
  const entryByDid = new Map<string, StewardEntry>()
  for (const e of entries) {
    if (e.did) entryByDid.set(e.did, e)
  }

  await Promise.all([
    attachFeedCapabilities(publicClient, feedUris, entryByDid, onUpdate),
    attachLabelerCapabilities(publicClient, labelerDids, entryByDid, onUpdate),
  ])
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

async function attachFeedCapabilities(
  publicClient: Client,
  feedUris: string[],
  entryByDid: Map<string, StewardEntry>,
  onUpdate?: (entry: StewardEntry) => void,
): Promise<void> {
  if (feedUris.length === 0) return

  try {
    const data = await xrpcQuery<{
      feeds?: Array<{
        uri?: string
        displayName?: string
        description?: string
        creator?: { did?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.feed.getFeedGenerators', { feeds: feedUris })

    // Group capabilities by creator DID
    const capsByDid = new Map<string, Capability[]>()

    for (const view of data.feeds ?? []) {
      const feedUri = view.uri
      if (!feedUri) continue
      const m = feedUri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)$/)
      const creatorDid = view.creator?.did ?? m?.[1]
      if (!creatorDid) continue
      const rkey = m?.[2] ?? ''

      const entry = entryByDid.get(creatorDid)
      const handle = view.creator?.handle ?? entry?.handle

      const cap: Capability = {
        type: 'feed',
        name: view.displayName ?? (rkey || creatorDid),
        description: view.description,
        uri: feedUri,
        landingPage: handle
          ? `https://bsky.app/profile/${handle}/feed/${rkey}`
          : `https://bsky.app/profile/${creatorDid}/feed/${rkey}`,
      }

      const list = capsByDid.get(creatorDid) ?? []
      list.push(cap)
      capsByDid.set(creatorDid, list)
    }

    // Attach to entries
    for (const [did, caps] of capsByDid) {
      const entry = entryByDid.get(did)
      if (!entry) continue
      entry.capabilities = [...(entry.capabilities ?? []), ...caps]
      if (!entry.tags.includes('feed')) entry.tags.push('feed')
      onUpdate?.(entry)
    }
  } catch (e) {
    logger.warn('capabilities: feed fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

// ---------------------------------------------------------------------------
// Labelers
// ---------------------------------------------------------------------------

async function attachLabelerCapabilities(
  publicClient: Client,
  labelerDids: string[],
  entryByDid: Map<string, StewardEntry>,
  onUpdate?: (entry: StewardEntry) => void,
): Promise<void> {
  if (labelerDids.length === 0) return

  try {
    const data = await xrpcQuery<{
      views?: Array<{
        uri?: string
        creator?: { did: string; displayName?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.labeler.getServices', { dids: labelerDids, detailed: false })

    for (const view of data.views ?? []) {
      const creator = view.creator
      if (!creator) continue

      const entry = entryByDid.get(creator.did)
      if (!entry) continue

      const handle = creator.handle ?? entry.handle
      const cap: Capability = {
        type: 'labeler',
        name: creator.displayName ?? creator.handle ?? creator.did,
        landingPage: handle
          ? `https://bsky.app/profile/${handle}`
          : `https://bsky.app/profile/${creator.did}`,
      }

      entry.capabilities = [...(entry.capabilities ?? []), cap]
      if (!entry.tags.includes('labeler')) entry.tags.push('labeler')
      onUpdate?.(entry)
    }
  } catch (e) {
    logger.warn('capabilities: labeler fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
