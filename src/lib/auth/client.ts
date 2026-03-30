import {
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
} from '@atproto/oauth-client-node'
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node'
import type { OAuthClientMetadataInput } from '@atproto/oauth-types'
import { fetch as undici } from 'undici'
import { getPublicUrl, isLoopbackPublicUrl } from '@/lib/public-url'

export const SCOPE = [
  'atproto',
  'repo:fund.at.disclosure',
  'repo:fund.at.contribute',
  'repo:fund.at.dependencies',
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
  const key = base
  if (client && clientKey === key) {
    return client
  }

  clientKey = key
  client = new NodeOAuthClient({
    clientMetadata: buildClientMetadata(),
    fetch: undici as unknown as typeof globalThis.fetch,
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
