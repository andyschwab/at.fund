import type { Client } from '@atproto/lex'
import {
  isCacheable,
  getCached,
  setCached,
  getInflight,
  setInflight,
  clearInflight,
} from './xrpc-cache'

export { clearCache as clearXrpcCache } from './xrpc-cache'

/**
 * Make a raw XRPC GET query through a lex Client.
 *
 * Useful for endpoints not covered by the Client's built-in methods
 * (e.g. app.bsky.* or com.atproto.identity.*).
 *
 * For cacheable NSIDs (describeRepo, resolveIdentity, describeServer) this
 * automatically deduplicates concurrent in-flight requests (singleflight)
 * and caches successful responses with a short TTL.
 */
export async function xrpcQuery<T>(
  client: Client,
  nsid: string,
  params: Record<string, string | string[] | boolean | number> = {},
): Promise<T> {
  // ── Cache / singleflight for eligible NSIDs ─────────────────────────
  if (isCacheable(nsid)) {
    const cached = getCached<T>(nsid, params)
    if (cached !== undefined) return cached

    const existing = getInflight<T>(nsid, params)
    if (existing) return existing

    const promise = xrpcFetch<T>(client, nsid, params).then(
      (value) => {
        setCached(nsid, params, value)
        clearInflight(nsid, params)
        return value
      },
      (err) => {
        clearInflight(nsid, params)
        throw err
      },
    )
    setInflight(nsid, params, promise)
    return promise
  }

  return xrpcFetch<T>(client, nsid, params)
}

/** Raw XRPC GET fetch (no caching). */
async function xrpcFetch<T>(
  client: Client,
  nsid: string,
  params: Record<string, string | string[] | boolean | number>,
): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item)
    } else {
      qs.set(k, String(v))
    }
  }
  const query = qs.toString()
  const path = (query ? `/xrpc/${nsid}?${query}` : `/xrpc/${nsid}`) as `/${string}`
  const res = await client.fetchHandler(path, {
    method: 'GET',
    headers: new Headers(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${nsid}: ${res.status} ${body}`)
  }
  return (await res.json()) as T
}
