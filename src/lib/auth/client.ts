import {
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
} from '@atproto/oauth-client-node'
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node'
import type { OAuthClientMetadataInput } from '@atproto/oauth-types'
import { getPublicUrl, isLoopbackPublicUrl } from '@/lib/public-url'
import { logger } from '@/lib/logger'

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
  'repo:fund.at.disclosure',
  'repo:fund.at.contribute',
  'repo:fund.at.dependencies',
  // Bluesky AppView RPCs needed for subscriptions scan.
  // The aud must match exactly what the AppView checks for.
  'rpc:app.bsky.actor.getPreferences?aud=did:web:api.bsky.app%23bsky_appview',
  'rpc:app.bsky.labeler.getServices?aud=did:web:api.bsky.app',
  'rpc:app.bsky.feed.getFeedGenerators?aud=did:web:api.bsky.app',
].join(' ')

const globalAuth = globalThis as unknown as {
  stateStore: Map<string, NodeSavedState>
  sessionStore: Map<string, NodeSavedSession>
}
globalAuth.stateStore ??= new Map()
globalAuth.sessionStore ??= new Map()

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
  client = new NodeOAuthClient({
    clientMetadata: metadata,
    fetch: safeFetch,
    stateStore: {
      async get(k: string) {
        return globalAuth.stateStore.get(k)
      },
      async set(k: string, v: NodeSavedState) {
        globalAuth.stateStore.set(k, v)
      },
      async del(k: string) {
        globalAuth.stateStore.delete(k)
      },
    },
    sessionStore: {
      async get(k: string) {
        return globalAuth.sessionStore.get(k)
      },
      async set(k: string, v: NodeSavedSession) {
        globalAuth.sessionStore.set(k, v)
      },
      async del(k: string) {
        globalAuth.sessionStore.delete(k)
      },
    },
    requestLock: requestLocalLock,
  })

  return client
}
