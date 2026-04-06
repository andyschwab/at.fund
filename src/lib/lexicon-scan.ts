import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry } from '@/lib/steward-model'
import { entryPriority } from '@/lib/entry-priority'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { gatherAccounts } from '@/lib/pipeline/account-gather'
import type { ScanWarning } from '@/lib/pipeline/account-gather'
import { enrichAccounts } from '@/lib/pipeline/account-enrich'
import { attachCapabilities } from '@/lib/pipeline/capability-scan'
import { resolveDependencies } from '@/lib/pipeline/dep-resolve'
import { createScanContext } from '@/lib/scan-context'
import { logger } from '@/lib/logger'

export type { ScanWarning }

export type ScanResult = {
  did: string
  handle?: string
  pdsUrl?: string
  entries: StewardEntry[]
  referencedEntries: StewardEntry[]
  warnings: ScanWarning[]
}

/**
 * Non-streaming batch scan. Runs the same pipeline phases as the streaming
 * scan (scan-stream.ts) but collects results into a single ScanResult.
 *
 * Used by the /api/lexicons route (GET + POST).
 */
export async function scanRepo(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
): Promise<ScanResult> {
  const ctx = createScanContext()

  // ── Phase 1: Gather accounts ────────────────────────────────────────
  const gathered = await gatherAccounts(session, selfReportedStewards, undefined, ctx)

  // ── Phase 2: Enrich ─────────────────────────────────────────────────
  const enriched = await enrichAccounts(
    session,
    gathered.accounts,
    undefined,
    ctx,
  )

  const allEntries = [...enriched.entries]
  const warnings: ScanWarning[] = [...gathered.warnings, ...enriched.warnings]

  // ── Phase 3: Capabilities ───────────────────────────────────────────
  if (gathered.feedUris.length > 0 || gathered.labelerDids.length > 0) {
    await attachCapabilities(
      enriched.entries,
      gathered.feedUris,
      gathered.labelerDids,
    )
  }

  // ── Phase 4: Dependencies ───────────────────────────────────────────
  const referencedEntries = await resolveDependencies(allEntries, undefined, ctx)

  // ── PDS host entry (only if operator resolves to a DID) ─────────────
  let pdsEntry: StewardEntry | undefined
  if (gathered.pdsUrl) {
    try {
      const pdsHostname = new URL(gathered.pdsUrl).hostname
      const funding = (await fetchFundingForUriLike(gathered.pdsUrl)) ?? undefined
      if (funding?.stewardDid) {
        const entryway = funding.pdsEntryway ?? pdsHostname
        pdsEntry = {
          uri: funding.stewardDid,
          did: funding.stewardDid,
          handle: funding.pdsStewardHandle,
          tags: ['tool', 'pds-host'],
          displayName: funding.pdsStewardUri ?? entryway,
          contributeUrl: funding.contributeUrl,
          dependencies: funding.dependencies?.map((d) => d.uri),
          source: 'fund.at',
          capabilities: [{ type: 'pds', name: entryway, hostname: entryway, landingPage: `https://${entryway}` }],
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host lookup failed'
      logger.warn('scan: PDS host lookup failed', { error: msg })
      warnings.push({ stewardUri: gathered.pdsUrl, step: 'pds-host-funding', message: msg })
    }
  }

  // ── Sort and return ─────────────────────────────────────────────────
  const entries = pdsEntry ? [pdsEntry, ...allEntries] : allEntries

  const lookup = (uri: string) => entries.find((e) => e.did === uri || e.uri === uri)
  entries.sort((a, b) => {
    const diff = entryPriority(a, lookup) - entryPriority(b, lookup)
    return diff !== 0 ? diff : a.did.localeCompare(b.did)
  })

  logger.info('scan: completed', {
    did: gathered.did,
    entryCount: entries.length,
    referencedCount: referencedEntries.length,
    warningCount: warnings.length,
  })

  return {
    did: gathered.did,
    handle: gathered.handle,
    pdsUrl: gathered.pdsUrl,
    entries,
    referencedEntries,
    warnings,
  }
}
