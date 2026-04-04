import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { fetchOwnEndorsements } from '@/lib/fund-at-records'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { lookupManualStewardRecord } from '@/lib/catalog'
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
export type { PdsHostFunding }
export type { EndorsementCounts }

export type EcosystemEntry = StewardEntry & EndorsementCounts

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'referenced'; entry: StewardEntry }
  | { type: 'pds-host'; funding: PdsHostFunding }
  | { type: 'ecosystem'; entries: EcosystemEntry[] }
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
      const isEcosystemOnly = entry.tags.length === 1 && entry.tags[0] === 'ecosystem'
      if (entry.tags.length > 0 && !isEcosystemOnly) {
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
    emit({ type: 'referenced', entry })
  })

  // ── Extract ecosystem entries and emit with endorsement counts ─────────
  if (ecosystemUriCounts.size > 0) {
    const ecosystemEntries: EcosystemEntry[] = []
    for (const entry of allEntries) {
      if (!entry.tags.includes('ecosystem')) continue

      const counts = ecosystemUriCounts.get(entry.uri)
        ?? (entry.did ? ecosystemUriCounts.get(entry.did) : undefined)
        ?? { endorsementCount: 0, networkEndorsementCount: 0 }

      ecosystemEntries.push({ ...entry, ...counts })
    }

    ecosystemEntries.sort(
      (a, b) => b.endorsementCount - a.endorsementCount || a.uri.localeCompare(b.uri),
    )

    if (ecosystemEntries.length > 0) {
      emit({ type: 'ecosystem', entries: ecosystemEntries })
    }
  }

  // ── Emit endorsement counts for ALL entries (from the single-pass map) ─
  // The endorsement map contains every URI endorsed by any follow,
  // so we can provide counts for any card — not just ecosystem.
  const allCounts: Record<string, EndorsementCounts> = {}
  for (const entry of allEntries) {
    // Try uri, then did, then handle — endorsements may target any form
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
  // Include ecosystem counts too
  for (const [uri, c] of ecosystemUriCounts) {
    if (!allCounts[uri]) allCounts[uri] = c
  }
  if (Object.keys(allCounts).length > 0) {
    emit({ type: 'endorsement-counts', counts: allCounts })
  }

  // ── PDS host funding ──────────────────────────────────────────────────
  if (gathered.pdsUrl) {
    try {
      const funding = await fetchFundingForUriLike(gathered.pdsUrl)
      if (funding) emit({ type: 'pds-host', funding })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
      logger.warn('scan: PDS host funding failed', { error: msg })
      emit({ type: 'warning', warning: { stewardUri: gathered.pdsUrl, step: 'pds-host-funding', message: msg } })
    }
  }

  logger.info('scan: completed', { did: gathered.did })
  emit({ type: 'done' })
}
