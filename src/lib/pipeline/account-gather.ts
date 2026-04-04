import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import { xrpcQuery } from '@/lib/xrpc'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri } from '@/lib/catalog'
import { describeServerStewardUri } from '@/lib/atfund-uri'
import {
  getBlueskyHandleFallback,
  handleFromDescribeRepo,
} from '@/lib/auth/session-handle'
import { filterThirdPartyCollections } from '@/lib/repo-inspect'
import {
  resolveCalendarCatalogKeys,
  resolveSiteStandardPairs,
  stripDerivedCollections,
} from '@/lib/repo-collection-resolve'
import { logger } from '@/lib/logger'
import type { StewardTag } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountStub = {
  did: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
  tags: Set<StewardTag>
  /** Tool hostnames associated with this DID (for catalog lookup). */
  hostnames: Set<string>
  /** PDS entryway hostname if this stub was discovered via PDS host resolution (e.g. 'bsky.social'). */
  pdsEntryway?: string
}

export type UnresolvedService = {
  hostname: string
  tags: StewardTag[]
}

export type ScanWarning = {
  stewardUri: string
  step: string
  message: string
}

export type GatherResult = {
  did: string
  handle?: string
  pdsUrl?: string
  /** True if the PDS host was resolved to an operator account via the resolver chain. */
  pdsOperatorResolved: boolean
  accounts: Map<string, AccountStub>
  unresolvedServices: UnresolvedService[]
  warnings: ScanWarning[]
  /** Feed AT URIs from user prefs (for Phase 3). */
  feedUris: string[]
  /** Labeler DIDs from user prefs (for Phase 3). */
  labelerDids: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC_API = 'https://public.api.bsky.app'

function addToAccount(
  accounts: Map<string, AccountStub>,
  did: string,
  tag: StewardTag,
  extra?: { handle?: string; displayName?: string; description?: string; hostname?: string },
) {
  let stub = accounts.get(did)
  if (!stub) {
    stub = { did, tags: new Set(), hostnames: new Set() }
    accounts.set(did, stub)
  }
  stub.tags.add(tag)
  if (extra?.handle && !stub.handle) stub.handle = extra.handle
  if (extra?.displayName && !stub.displayName) stub.displayName = extra.displayName
  if (extra?.description && !stub.description) stub.description = extra.description
  if (extra?.hostname) stub.hostnames.add(extra.hostname)
}

/**
 * Ensure a DID is present in the accounts map without assigning a tag.
 * Used for feed creators and labelers whose tags are derived from confirmed
 * capability data in Phase 3 (capability-scan), not from the discovery source.
 */
function ensureAccount(accounts: Map<string, AccountStub>, did: string) {
  if (!accounts.has(did)) {
    accounts.set(did, { did, tags: new Set(), hostnames: new Set() })
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Gather all accounts
// ---------------------------------------------------------------------------

export async function gatherAccounts(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
  onStatus?: (msg: string) => void,
): Promise<GatherResult> {
  const client = new Client(session)
  const publicClient = new Client(PUBLIC_API)
  const accounts = new Map<string, AccountStub>()
  const unresolvedServices: UnresolvedService[] = []
  const warnings: ScanWarning[] = []

  // ── Resolve PDS URL ────────────────────────────────────────────────────
  let pdsUrl: string | undefined
  try {
    const info = await session.getTokenInfo(false)
    const raw = info.aud?.trim()
    if (raw && /^https?:\/\//i.test(raw)) pdsUrl = new URL(raw).origin
  } catch { /* ignore */ }
  if (!pdsUrl) {
    try {
      const { resolvePdsUrl } = await import('@/lib/fund-at-records')
      const url = await resolvePdsUrl(session.did)
      if (url) pdsUrl = url.origin
    } catch { /* ignore */ }
  }

  // ── Resolve PDS operator via ATProto + resolver chain ─────────────────
  // Chain: physical host (lionsmane.us-east.host.bsky.network)
  //   → com.atproto.server.describeServer → entryway (bsky.social, from policy links)
  //   → matchPrefix resolver               → operator (bsky.app)
  //   → DNS lookup                         → operator DID
  if (pdsUrl) {
    try {
      const physicalHostname = new URL(pdsUrl).hostname
      // Ask ATProto for the steward domain — it's in the policy link hostnames.
      const entryway = await describeServerStewardUri(physicalHostname)
      if (entryway) {
        const operator = resolveStewardUri(entryway) ?? entryway
        try {
          const operatorDid = await lookupAtprotoDid(operator)
          if (operatorDid) {
            const stub = accounts.get(operatorDid) ?? {
              did: operatorDid, tags: new Set<StewardTag>(), hostnames: new Set<string>(),
            }
            stub.tags.add('pds-host')
            stub.hostnames.add(operator)
            stub.pdsEntryway = entryway
            accounts.set(operatorDid, stub)
          }
        } catch (e) {
          logger.warn('gather: PDS operator DNS lookup failed', {
            operator, error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    } catch (e) {
      logger.warn('gather: PDS operator resolution failed', {
        pdsUrl, error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ── Describe repo ──────────────────────────────────────────────────────
  onStatus?.('Reading your repository…')
  const repoInfo = await xrpcQuery<{ collections?: string[]; handle?: string }>(
    client, 'com.atproto.repo.describeRepo', { repo: session.did },
  )
  const collections = repoInfo.collections ?? []
  const handle = handleFromDescribeRepo(repoInfo) ?? (await getBlueskyHandleFallback(session))

  // ── Discover tool steward URIs from repo collections ───────────────────
  const thirdParty = filterThirdPartyCollections(collections)
  const staticCols = stripDerivedCollections(thirdParty)
  const [calendarKeys, siteStandardPairs] = await Promise.all([
    resolveCalendarCatalogKeys(client, session.did, thirdParty),
    resolveSiteStandardPairs(client, session.did, thirdParty),
  ])

  const observed = new Set<string>()
  for (const c of staticCols) observed.add(c)
  for (const k of calendarKeys) observed.add(k)
  for (const pair of siteStandardPairs) observed.add(pair.contentType)
  for (const s of selfReportedStewards) observed.add(s)

  const stewardUris = new Set<string>()
  for (const key of observed) {
    const resolved = resolveStewardUri(key)
    if (resolved) stewardUris.add(resolved)
  }

  logger.info('gather: resolved steward URIs', {
    did: session.did,
    stewardCount: stewardUris.size,
    stewardUris: [...stewardUris].sort(),
  })

  if (stewardUris.size > 0) {
    onStatus?.(`Resolving ${stewardUris.size} steward${stewardUris.size === 1 ? '' : 's'}…`)
  }

  // ── Resolve steward URIs to DIDs ───────────────────────────────────────
  await Promise.allSettled(
    [...stewardUris].sort().map(async (stewardUri) => {
      if (stewardUri.startsWith('did:')) {
        addToAccount(accounts, stewardUri, 'tool')
        return
      }
      // Hostname — try DNS lookup
      try {
        const did = await lookupAtprotoDid(stewardUri)
        if (did) {
          addToAccount(accounts, did, 'tool', { hostname: stewardUri })
          return
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'DNS lookup failed'
        logger.warn('gather: DNS lookup failed', { stewardUri, error: msg })
        warnings.push({ stewardUri, step: 'dns-lookup', message: msg })
      }
      // No DID found — unresolved service
      unresolvedServices.push({ hostname: stewardUri, tags: ['tool'] })
    }),
  )

  // ── Gather follows ─────────────────────────────────────────────────────
  onStatus?.('Loading follows and subscriptions…')

  let feedUris: string[] = []
  let labelerDids: string[] = []

  await Promise.all([
    // Follows
    (async () => {
      try {
        let cursor: string | undefined
        do {
          const res = await xrpcQuery<{
            follows: Array<{ did: string; handle?: string; displayName?: string; description?: string }>
            cursor?: string
          }>(publicClient, 'app.bsky.graph.getFollows', {
            actor: session.did, limit: 100, ...(cursor ? { cursor } : {}),
          })
          for (const f of res.follows) {
            addToAccount(accounts, f.did, 'follow', {
              handle: f.handle, displayName: f.displayName, description: f.description,
            })
          }
          cursor = res.cursor
        } while (cursor)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Follow scan failed'
        logger.warn('gather: follow scan failed', { error: msg })
        warnings.push({ stewardUri: session.did, step: 'follow-scan', message: msg })
      }
    })(),
    // Subscriptions (just collect feed URIs and labeler DIDs)
    (async () => {
      try {
        const authClient = new Client(session, { service: 'did:web:api.bsky.app#bsky_appview' })
        const prefs = await xrpcQuery<{
          preferences: Array<{
            $type: string
            labelers?: Array<{ did: string }>
            items?: Array<{ type: string; value: string }>
          }>
        }>(authClient, 'app.bsky.actor.getPreferences', {})
        for (const pref of prefs.preferences) {
          if (pref.$type === 'app.bsky.actor.defs#labelersPref' && pref.labelers) {
            labelerDids = pref.labelers.map((l) => l.did)
            for (const did of labelerDids) ensureAccount(accounts, did)
          }
          if (pref.$type === 'app.bsky.actor.defs#savedFeedsPrefV2' && pref.items) {
            feedUris = pref.items.filter((f) => f.type === 'feed').map((f) => f.value)
            // Ensure feed creator DIDs exist; tags derived in Phase 3
            for (const uri of feedUris) {
              const m = uri.match(/^at:\/\/(did:[^/]+)\//)
              if (m) ensureAccount(accounts, m[1]!)
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Subscriptions scan failed'
        logger.warn('gather: subscriptions scan failed', { error: msg })
        warnings.push({ stewardUri: session.did, step: 'subscriptions-scan', message: msg })
      }
    })(),
  ])

  logger.info('gather: completed', {
    did: session.did,
    accountCount: accounts.size,
    unresolvedCount: unresolvedServices.length,
    tagBreakdown: {
      tool: [...accounts.values()].filter((a) => a.tags.has('tool')).length,
      follow: [...accounts.values()].filter((a) => a.tags.has('follow')).length,
      feed: [...accounts.values()].filter((a) => a.tags.has('feed')).length,
      labeler: [...accounts.values()].filter((a) => a.tags.has('labeler')).length,
    },
  })

  const pdsOperatorResolved = [...accounts.values()].some((s) => s.tags.has('pds-host'))
  return { did: session.did, handle: handle ?? undefined, pdsUrl, pdsOperatorResolved, accounts, unresolvedServices, warnings, feedUris, labelerDids }
}
