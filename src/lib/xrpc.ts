import type { Client } from '@atproto/lex'

/**
 * Make a raw XRPC GET query through a lex Client.
 *
 * Useful for endpoints not covered by the Client's built-in methods
 * (e.g. app.bsky.* or com.atproto.identity.*).
 */
export async function xrpcQuery<T>(
  client: Client,
  nsid: string,
  params: Record<string, string | string[] | boolean | number> = {},
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
