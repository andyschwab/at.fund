import { createFundAtPrefetch, prefetchInto } from '@/lib/fund-at-prefetch'
import type { FundAtPrefetchMap } from '@/lib/fund-at-prefetch'

export type { FundAtPrefetchMap }

/**
 * Shared network context for a scan session.
 *
 * Created once by the orchestrator (scanStreaming, scanRepo, scanFollows, etc.)
 * and threaded through every pipeline phase and standalone resolver.
 * All network-level concerns — prefetch, caching, concurrency — live here
 * so there is exactly one place to manage them.
 *
 * When the app transitions to a server-side fund.at cache, only this module
 * (and fund-at-prefetch) need to change. Consumers still await the same
 * promise shape from ctx.fundAtPrefetch.
 */
export type ScanContext = {
  /** Speculative fund.at record prefetches. Await instead of fetching directly. */
  readonly fundAtPrefetch: FundAtPrefetchMap
  /** Fire a prefetch for a DID (deduped, bounded concurrency). */
  readonly prefetch: (did: string) => void
  /** Fire a prefetch outside the bounded queue (ecosystem, late discovery). */
  readonly prefetchUnbounded: (did: string) => void
}

/**
 * Create a fresh scan context. Call once per scan session.
 */
export function createScanContext(): ScanContext {
  const { map, prefetch, flush: _flush } = createFundAtPrefetch()

  return {
    fundAtPrefetch: map,
    prefetch,
    prefetchUnbounded: (did: string) => prefetchInto(map, did),
  }
}
