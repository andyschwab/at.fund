import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { fetchOwnEndorsements } from '@/lib/fund-at-records'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { collectNetworkEndorsementsCached, getCountsFromMap } from '@/lib/microcosm'
import { gatherAccounts } from './account-gather'
import type { ScanWarning } from './account-gather'
import { enrichAccounts } from './account-enrich'
import { attachCapabilities } from './capability-scan'
import { resolveDependencies } from './dep-resolve'
import { discoverEcosystem } from './ecosystem-scan'
import type { EndorsementCounts } from './ecosystem-scan'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Stream event types (same interface the client expects)
// ---------------------------------------------------------------------------

export type { ScanWarning }
export type { EndorsementCounts }

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'endorsement-counts'; counts: Record<string, EndorsementCounts> }
  | { type: 'warning'; warning: ScanWarning }
  | { type: 'done' }

// ---------------------------------------------------------------------------
// Streaming scan orchestrator
// ---------------------------------------------------------------------------

export async function scanStreaming(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
  emit: (event: ScanStreamEvent) => void,
): Promise<void> {
  // ── Endorsements: fetch early so the client can mark entries ────────────
  try {
    const endorsedUris = await fetchOwnEndorsements(session)
    if (endorsedUris.length > 0) {
      emit({ type: 'endorsed', uris: endorsedUris })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch endorsements'
    logger.warn('scan: endorsement fetch failed', { error: msg })
  }

  // ── Phase 1: Gather accounts ──────────────────────────────────────────
  const gathered = await gatherAccounts(session, selfReportedStewards, (msg) => {
    emit({ type: 'status', message: msg })
  })

  emit({
    type: 'meta',
    did: gathered.did,
    handle: gathered.handle,
    pdsUrl: gathered.pdsUrl,
  })

  for (const w of gathered.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Collect network endorsements (single pass over all follows) ────────
  // O(follows): one PDS resolve + one listRecords per follow DID.
  // Builds a map of endorsed URI → Set<endorser DIDs> that we reuse for
  // ecosystem discovery AND per-card endorsement counts.
  const followDids: string[] = []
  for (const [did, stub] of gathered.accounts) {
    if (stub.tags.has('follow')) followDids.push(did)
  }

  emit({ type: 'status', message: `Scanning ${followDids.length} follows for endorsements…` })
  const endorsementMap = await collectNetworkEndorsementsCached(followDids)

  // ── Ecosystem discovery (fast lookup against pre-collected map) ────────
  const ecosystemUriCounts = new Map<string, EndorsementCounts>()

  try {
    const discovery = discoverEcosystem(endorsementMap)

    if (discovery.uris.size > 0) {
      // Build set of URIs already gathered (by DID or hostname)
      const existingUris = new Set<string>()
      for (const [did, stub] of gathered.accounts) {
        existingUris.add(did)
        for (const h of stub.hostnames) existingUris.add(h)
      }
      for (const svc of gathered.unresolvedServices) {
        existingUris.add(svc.hostname)
      }

      const uriEntries = [...discovery.uris.entries()]
        .filter(([uri]) => !existingUris.has(uri))

      await Promise.all(uriEntries.map(async ([uri, counts]) => {
        ecosystemUriCounts.set(uri, counts)

        if (uri.startsWith('did:')) {
          if (!gathered.accounts.has(uri)) {
            gathered.accounts.set(uri, {
              did: uri,
              tags: new Set<StewardTag>(['ecosystem']),
              hostnames: new Set(),
            })
          }
          return
        }

        // Hostname — check catalog for an atprotoHandle alias first
        const catalogEntry = lookupManualStewardRecord(uri)
        const lookupHostname = catalogEntry?.atprotoHandle ?? uri

        try {
          const did = await lookupAtprotoDid(lookupHostname)
          if (did && !existingUris.has(did) && !gathered.accounts.has(did)) {
            gathered.accounts.set(did, {
              did,
              tags: new Set<StewardTag>(['ecosystem']),
              hostnames: new Set([uri]),
            })
            ecosystemUriCounts.set(did, counts)
            return
          }
        } catch { /* DNS lookup failed */ }

        // No DID found — use unresolved services path
        gathered.unresolvedServices.push({ hostname: uri, tags: ['ecosystem'] })
      }))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ecosystem injection failed'
    logger.warn('scan: ecosystem injection failed', { error: msg })
  }

  // ── Phase 2: Enrich ────────────────────────────────────────────────────
  emit({ type: 'status', message: `Resolving ${gathered.accounts.size} account${gathered.accounts.size === 1 ? '' : 's'}…` })

  const enriched = await enrichAccounts(
    session,
    gathered.accounts,
    gathered.unresolvedServices,
    (entry) => {
      if (entry.tags.length > 0) {
        emit({ type: 'entry', entry })
      }
    },
  )

  for (const w of enriched.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Phase 3: Capabilities ──────────────────────────────────────────────
  const allEntries = [...enriched.entries, ...enriched.unresolvedEntries]

  if (gathered.feedUris.length > 0 || gathered.labelerDids.length > 0) {
    emit({ type: 'status', message: 'Loading feed and labeler details…' })
    await attachCapabilities(
      enriched.entries,
      gathered.feedUris,
      gathered.labelerDids,
      (entry) => emit({ type: 'entry', entry }),
    )
  }

  // ── Phase 4: Dependencies ──────────────────────────────────────────────
  emit({ type: 'status', message: 'Resolving dependencies…' })
  await resolveDependencies(allEntries, (entry) => {
    emit({ type: 'entry', entry })
  })

  // ── Emit endorsement counts for ALL entries (from the single-pass map) ─
  const allCounts: Record<string, EndorsementCounts> = {}
  for (const entry of allEntries) {
    let counts = getCountsFromMap(endorsementMap, entry.uri)
    if (counts.networkEndorsementCount === 0 && entry.did) {
      counts = getCountsFromMap(endorsementMap, entry.did)
    }
    if (counts.networkEndorsementCount === 0 && entry.handle) {
      counts = getCountsFromMap(endorsementMap, entry.handle)
    }

    if (counts.networkEndorsementCount > 0) {
      allCounts[entry.uri] = {
        endorsementCount: counts.networkEndorsementCount,
        networkEndorsementCount: counts.networkEndorsementCount,
      }
    }
  }
  for (const [uri, c] of ecosystemUriCounts) {
    if (!allCounts[uri]) allCounts[uri] = c
  }
  if (Object.keys(allCounts).length > 0) {
    emit({ type: 'endorsement-counts', counts: allCounts })
  }

  // ── PDS host ───────────────────────────────────────────────────────────
  // Always emit a pds-host entry so the user sees their data server in My Stack.
  // Funding details are optional — the entry shows regardless.
  if (gathered.pdsUrl) {
    try {
      const pdsHostname = new URL(gathered.pdsUrl).hostname

      // Walk the catalog chain to resolve physical hostname → entryway → operator.
      // Two-level example: lionsmane.us-east.host.bsky.network → bsky.social → bsky.app
      // One-level example: bsky.social → bsky.app (pdsHostname IS already the entryway)
      const step1 = resolveStewardUri(pdsHostname)
      const step2 = step1 ? resolveStewardUri(step1) : null
      const catalogEntryway = step2 ? step1 : (step1 ? pdsHostname : null)
      const catalogOperator = step2 ?? step1

      // Fetch funding against the catalog operator when known; otherwise try the physical URL
      const funding = await fetchFundingForUriLike(catalogOperator ?? gathered.pdsUrl)

      const entryway = catalogEntryway ?? funding?.pdsEntryway ?? pdsHostname
      const operator = catalogOperator ?? funding?.pdsStewardUri ?? pdsHostname

      const pdsEntry: StewardEntry = {
        uri: operator,
        did: funding?.stewardDid,
        handle: funding?.pdsStewardHandle,
        tags: ['tool', 'pds-host'],
        displayName: operator,
        contributeUrl: funding?.contributeUrl,
        dependencies: funding?.dependencies?.map((d) => d.uri),
        source: funding ? 'fund.at' : 'unknown',
        capabilities: entryway !== operator
          ? [{ type: 'pds', name: entryway, hostname: entryway, landingPage: `https://${entryway}` }]
          : undefined,
      }
      emit({ type: 'entry', entry: pdsEntry })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host lookup failed'
      logger.warn('scan: PDS host lookup failed', { error: msg })
      emit({ type: 'warning', warning: { stewardUri: gathered.pdsUrl, step: 'pds-host-funding', message: msg } })
    }
  }

  logger.info('scan: completed', { did: gathered.did })
  emit({ type: 'done' })
}
