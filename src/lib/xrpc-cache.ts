/**
 * TTL cache + singleflight (in-flight deduplication) for XRPC queries.
 *
 * Cacheable NSIDs are idempotent, read-only endpoints whose results are stable
 * within a short window.  The singleflight layer ensures that concurrent
 * callers waiting for the same query share a single network request.
 */

type Params = Record<string, string | string[] | boolean | number>

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** NSIDs whose responses are safe to cache for a short TTL. */
const CACHEABLE_NSIDS = new Set([
  'com.atproto.repo.describeRepo',
  'com.atproto.identity.resolveIdentity',
  'com.atproto.server.describeServer',
])

const DEFAULT_TTL_MS =
  process.env.NODE_ENV === 'production'
    ? 5 * 60 * 1000  // 5 minutes in prod
    : 30 * 60 * 1000 // 30 minutes in dev (survives hot reloads)

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type CacheEntry = { value: unknown; expiresAt: number }

// In dev the global object persists across hot reloads; using it here prevents
// the cache from being wiped every time a module is re-executed by HMR.
const g = global as typeof globalThis & {
  __xrpcCache?: Map<string, CacheEntry>
  __xrpcInflight?: Map<string, Promise<unknown>>
}
const cache = (g.__xrpcCache ??= new Map())
const inflight = (g.__xrpcInflight ??= new Map())

function makeKey(nsid: string, params: Params): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, v])
  return `${nsid}:${JSON.stringify(sorted)}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return `true` when the given NSID is eligible for caching. */
export function isCacheable(nsid: string): boolean {
  return CACHEABLE_NSIDS.has(nsid)
}

/** Look up a cached value. Returns `undefined` on miss or expiry. */
export function getCached<T>(nsid: string, params: Params): T | undefined {
  const key = makeKey(nsid, params)
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value as T
}

/** Store a value in the cache with the default TTL. */
export function setCached(nsid: string, params: Params, value: unknown): void {
  const key = makeKey(nsid, params)
  cache.set(key, { value, expiresAt: Date.now() + DEFAULT_TTL_MS })
}

/**
 * Singleflight: if an identical request is already in-flight, return its
 * promise so callers share the result.  Otherwise return `undefined`.
 */
export function getInflight<T>(nsid: string, params: Params): Promise<T> | undefined {
  return inflight.get(makeKey(nsid, params)) as Promise<T> | undefined
}

/** Register a promise as the in-flight request for a given key. */
export function setInflight(nsid: string, params: Params, promise: Promise<unknown>): void {
  inflight.set(makeKey(nsid, params), promise)
}

/** Remove the in-flight entry once the request settles. */
export function clearInflight(nsid: string, params: Params): void {
  inflight.delete(makeKey(nsid, params))
}

/** Clear the entire cache (useful for tests or manual refresh). */
export function clearCache(): void {
  cache.clear()
  inflight.clear()
}
