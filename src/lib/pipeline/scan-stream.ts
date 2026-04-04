import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry } from '@/lib/steward-model'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { fetchOwnEndorsements } from '@/lib/fund-at-records'
import { gatherAccounts } from './account-gather'
import type { ScanWarning } from './account-gather'
import { enrichAccounts } from './account-enrich'
import { attachCapabilities } from './capability-scan'
import { resolveDependencies } from './dep-resolve'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Stream event types (same interface the client expects)
// ---------------------------------------------------------------------------

export type { ScanWarning }

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'referenced'; entry: StewardEntry }
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

  // ── Phase 1: Gather ────────────────────────────────────────────────────
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

  // ── Phase 2: Enrich ────────────────────────────────────────────────────
  emit({ type: 'status', message: `Resolving ${gathered.accounts.size} account${gathered.accounts.size === 1 ? '' : 's'}…` })

  const enriched = await enrichAccounts(
    session,
    gathered.accounts,
    gathered.unresolvedServices,
    (entry) => {
      // Only emit entries that have an identity (tools, follows).
      // Feed/labeler-only accounts are held until Phase 3 confirms their
      // capabilities — a feed is always a capability of an account, never
      // a standalone entry.
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
      enriched.entries, // only DID-keyed entries can have capabilities
      gathered.feedUris,
      gathered.labelerDids,
      (entry) => emit({ type: 'entry', entry }), // re-emit with capabilities
    )
  }

  // ── Phase 4: Dependencies ──────────────────────────────────────────────
  emit({ type: 'status', message: 'Resolving dependencies…' })
  await resolveDependencies(allEntries, (entry) => {
    emit({ type: 'referenced', entry })
  })

  // ── PDS host ───────────────────────────────────────────────────────────
  // Always emit a pds-host entry so the user sees their data server in My Stack.
  // Funding details are optional — the entry shows regardless.
  if (gathered.pdsUrl) {
    try {
      const pdsHostname = new URL(gathered.pdsUrl).hostname
      const funding = await fetchFundingForUriLike(gathered.pdsUrl)
      const pdsEntry: StewardEntry = {
        uri: funding?.pdsStewardUri ?? pdsHostname,
        did: funding?.stewardDid,
        handle: funding?.pdsStewardHandle,
        tags: ['tool', 'pds-host'],
        displayName: funding?.pdsStewardUri ?? pdsHostname,
        description: `Hosts your personal data at ${pdsHostname}`,
        contributeUrl: funding?.contributeUrl,
        dependencies: funding?.dependencies?.map((d) => d.uri),
        source: funding ? 'fund.at' : 'unknown',
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
