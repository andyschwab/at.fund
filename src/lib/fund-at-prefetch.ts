import { fetchFundAtRecords } from '@/lib/fund-at-records'
import type { FundAtResult } from '@/lib/fund-at-records'

export type { FundAtResult }

/**
 * A map of DID → Promise<FundAtResult | null> for speculative prefetching.
 *
 * Created in Phase 1 (gather) as DIDs are discovered. Later phases await
 * the already-in-flight promises instead of issuing their own fetch calls.
 * When the pipeline transitions to a server-side fund.at cache, only this
 * module needs to change — consumers still await the same promise shape.
 */
export type FundAtPrefetchMap = Map<string, Promise<FundAtResult | null>>

const PREFETCH_CONCURRENCY = 20

/**
 * Creates a prefetch controller that fires fund.at record fetches with
 * bounded concurrency. Each DID is fetched at most once; subsequent calls
 * for the same DID return the existing promise.
 */
export function createFundAtPrefetch(): {
  map: FundAtPrefetchMap
  prefetch: (did: string) => void
  /** Wait for all queued prefetches to complete (call before pipeline ends). */
  flush: () => Promise<void>
} {
  const map: FundAtPrefetchMap = new Map()
  let active = 0
  const queue: string[] = []
  let flushResolve: (() => void) | null = null
  let flushPromise: Promise<void> | null = null

  function checkFlush() {
    if (flushResolve && active === 0 && queue.length === 0) {
      flushResolve()
      flushResolve = null
      flushPromise = null
    }
  }

  function drain() {
    while (active < PREFETCH_CONCURRENCY && queue.length > 0) {
      const did = queue.shift()!
      active++
      const promise = fetchFundAtRecords(did).catch(() => null)
      map.set(did, promise)
      promise.then(() => {
        active--
        drain()
        checkFlush()
      })
    }
    checkFlush()
  }

  function prefetch(did: string) {
    if (!did.startsWith('did:') || map.has(did)) return
    queue.push(did)
    drain()
  }

  function flush(): Promise<void> {
    if (active === 0 && queue.length === 0) return Promise.resolve()
    if (!flushPromise) {
      flushPromise = new Promise((resolve) => {
        flushResolve = resolve
      })
    }
    return flushPromise
  }

  return { map, prefetch, flush }
}

/**
 * Fire a prefetch for a DID into an existing map (no concurrency control).
 * Used by later pipeline stages that discover new DIDs after Phase 1.
 */
export function prefetchInto(map: FundAtPrefetchMap, did: string): void {
  if (!did.startsWith('did:') || map.has(did)) return
  map.set(did, fetchFundAtRecords(did).catch(() => null))
}
