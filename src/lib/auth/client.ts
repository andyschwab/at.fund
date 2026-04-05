import {
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
} from '@atproto/oauth-client-node'
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node'
import type { OAuthClientMetadataInput } from '@atproto/oauth-types'
import { getPublicUrl, isLoopbackPublicUrl } from '@/lib/public-url'
import { logger } from '@/lib/logger'
import { createKvStore } from '@/lib/auth/kv-store'

// Work around Next.js dev-mode fetch patch that breaks DPoP POST retries.
//
// Next.js's patchFetch (patch-fetch.js:608-617) reconstructs Request objects
// by extracting `request.body` (a ReadableStream) and passing it to
// `new Request(url, { body: readableStream })`. When the ATProto DPoP layer
// retries a POST after receiving a fresh nonce, the ReadableStream from the
// first attempt has already been consumed, causing:
//   "expected non-null body source"
//
// Fix: materialise the body and pass (url, init) instead of a Request object.
// This makes Next.js take the `else if (init)` path, which extracts `init.body`
// directly — a concrete value that can be re-used across retries.
const _fetch = globalThis.fetch
const safeFetch: typeof globalThis.fetch = async (input, init) => {
  // bindFetch() in @atproto-labs/fetch always passes a single Request object
  if (input instanceof Request && !init) {
    const newInit: RequestInit & { duplex?: string } = {
      method: input.method,
      headers: input.headers,
      redirect: input.redirect,
      signal: input.signal,
    }
    if (input.body) {
      newInit.body = await input.arrayBuffer()
      newInit.duplex = 'half'
    }
    return _fetch.call(globalThis, input.url, newInit)
  }
  return _fetch.call(globalThis, input, init)
}

export const SCOPE = [
  'atproto',
  // New grouped NSIDs
  'repo:fund.at.actor.declaration',
  'repo:fund.at.funding.contribute',
  'repo:fund.at.funding.channel',
  'repo:fund.at.funding.plan',
  'repo:fund.at.graph.dependency',
  'repo:fund.at.graph.endorse',
  // Legacy NSIDs (needed for migration reads/deletes)
  'repo:fund.at.contribute',
  'repo:fund.at.dependency',
  'repo:fund.at.endorse',
  // getPreferences is proxied through the PDS and requires an rpc: scope.
  // getServices/getFeedGenerators use the public API so no scope needed.
  'rpc:app.bsky.actor.getPreferences?aud=did:web:api.bsky.app%23bsky_appview',
].join(' ')

const useRedis = !!(
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
  (process.env.UPSTASH_KV_REST_API_URL && process.env.UPSTASH_KV_REST_API_TOKEN) ||
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
)

function getStores() {
  if (useRedis) {
    return {
      stateStore: createKvStore<NodeSavedState>('atproto:state', 600), // 10 min TTL for OAuth flow
      sessionStore: createKvStore<NodeSavedSession>('atproto:session', 60 * 60 * 24 * 7), // 7 days
    }
  }
  // Fallback: in-memory for local dev without Redis
  const g = globalThis as unknown as {
    stateStore: Map<string, NodeSavedState>
    sessionStore: Map<string, NodeSavedSession>
  }
  g.stateStore ??= new Map()
  g.sessionStore ??= new Map()
  return {
    stateStore: {
      async get(k: string) { return g.stateStore.get(k) },
      async set(k: string, v: NodeSavedState) { g.stateStore.set(k, v) },
      async del(k: string) { g.stateStore.delete(k) },
    },
    sessionStore: {
      async get(k: string) { return g.sessionStore.get(k) },
      async set(k: string, v: NodeSavedSession) { g.sessionStore.set(k, v) },
      async del(k: string) { g.sessionStore.delete(k) },
    },
  }
}

let client: NodeOAuthClient | null = null
let clientKey: string | null = null

function buildClientMetadata(): OAuthClientMetadataInput {
  const base = getPublicUrl()
  if (isLoopbackPublicUrl()) {
    return buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [`${base}/oauth/callback`],
    })
  }
  const clientId = `${base}/oauth-client-metadata.json`
  return {
    client_id: clientId,
    client_name: 'Contribute to your tools',
    client_uri: base,
    redirect_uris: [`${base}/oauth/callback`],
    scope: SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  }
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  const base = getPublicUrl()
  const key = `${base}|${SCOPE}`
  if (client && clientKey === key) {
    return client
  }

  clientKey = key
  const metadata = buildClientMetadata()
  logger.info('oauth: building client', {
    client_id: metadata.client_id,
    scope: metadata.scope,
  })
  const stores = getStores()
  logger.info('oauth: session store backend', { backend: useRedis ? 'redis' : 'memory' })
  client = new NodeOAuthClient({
    clientMetadata: metadata,
    fetch: safeFetch,
    stateStore: stores.stateStore,
    sessionStore: stores.sessionStore,
    requestLock: requestLocalLock,
  })

  return client
}
