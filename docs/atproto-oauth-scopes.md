# ATProto OAuth Scopes and Service Proxying

Lessons learned from implementing authenticated Bluesky AppView access
in an ATProto OAuth application.

## Scope Format

ATProto permissions use scope strings in OAuth flows. The `rpc:` resource
type controls access to remote service API calls:

```
rpc:<lxm>?aud=<service-did>
```

- **lxm** (positional): Lexicon method NSID, e.g. `app.bsky.actor.getPreferences`
- **aud** (required): DID service reference with a **required** fragment,
  e.g. `did:web:api.bsky.app%23bsky_appview`

The `%23` is URL-encoded `#`. In scope strings, the fragment is part of the
aud value and must be percent-encoded.

Reference: https://atproto.com/specs/permissions

## PDS Scope Granting Behavior

The Bluesky PDS authorization server:

- **Grants** scopes with `aud=did:web:api.bsky.app%23bsky_appview` (with fragment)
- **Silently drops** scopes with `aud=did:web:api.bsky.app` (no fragment)

There is no error returned — the PDS simply does not include the no-fragment
scope in the issued token. Always inspect `session.getTokenInfo().scope` to
verify what was actually granted.

## PDS Scope Checking Mismatch (as of 2026-04)

When the PDS checks a token's scope at request time (for proxied calls to
the AppView), it checks for `aud=did:web:api.bsky.app` — the **no-fragment**
variant. This creates an impossible situation for `rpc:` scopes:

| Step | Format | Works? |
|------|--------|--------|
| Scope request (no fragment) | `rpc:...?aud=did:web:api.bsky.app` | PDS drops it |
| Scope request (with fragment) | `rpc:...?aud=did:web:api.bsky.app%23bsky_appview` | PDS grants it |
| Scope check at request time | expects `aud=did:web:api.bsky.app` | Doesn't match granted scope |

This affects `getServices`, `getFeedGenerators`, and likely other AppView
endpoints accessed through the PDS proxy.

## Working Approach: Public API for Read-Only Queries

Most Bluesky AppView queries (`getServices`, `getFeedGenerators`, `getProfile`,
`getFollows`) are **public read-only endpoints**. They can be called on
`https://public.api.bsky.app` without authentication — no `rpc:` scope needed.

```typescript
import { Client } from '@atproto/lex'

// No auth needed for public queries
const publicClient = new Client('https://public.api.bsky.app')
```

Only endpoints that access **user-private data** (like `getPreferences`)
require the authenticated session with a proxy:

```typescript
const authClient = new Client(session, {
  service: 'did:web:api.bsky.app#bsky_appview',
})
```

The `service` option sets the `Atproto-Proxy` header, which tells the PDS
to proxy the request to the specified AppView.

## Scope Configuration

Current working scope string:

```typescript
export const SCOPE = [
  'atproto',
  'repo:fund.at.disclosure',
  'repo:fund.at.contribute',
  'repo:fund.at.dependencies',
  'rpc:app.bsky.actor.getPreferences?aud=did:web:api.bsky.app%23bsky_appview',
].join(' ')
```

Only `getPreferences` needs an `rpc:` scope. All other Bluesky AppView
queries use the public API.

## Loopback Client ID Encoding

For local development, the ATProto OAuth SDK encodes the scope into the
loopback client ID URL. The `%23` in the scope gets double-encoded to
`%2523` in the URL, then decoded back to `%23` when parsed. This round-trips
correctly — no special handling needed.

## SDK Migration: @atproto/api → @atproto/lex

The `@atproto/lex` SDK (`Client` class) is the modern replacement for
`@atproto/api` (`Agent` class). Key differences:

| Feature | Agent (@atproto/api) | Client (@atproto/lex) |
|---------|---------------------|----------------------|
| Typed Bluesky methods | `agent.app.bsky.*` | Not included |
| Service proxy | `agent.configureProxy()` | `service` constructor option |
| Raw XRPC | Not directly | `client.fetchHandler()` |
| Record operations | `agent.com.atproto.repo.*` | `client.listRecords()`, `client.getRecord()`, etc. |
| Auth | Session passed to constructor | Session passed to constructor |

For Bluesky-specific calls not covered by the lex Client, use a raw XRPC
helper:

```typescript
async function xrpcQuery<T>(
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
  const path = `/xrpc/${nsid}?${qs.toString()}` as `/${string}`
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
```

## Bluesky Preference Parsing

When reading raw preferences (without the Agent's `getPreferences()` helper),
note these field names in the raw JSON:

- **Labelers:** `$type: 'app.bsky.actor.defs#labelersPref'`, field: `labelers`
- **Saved feeds (v2):** `$type: 'app.bsky.actor.defs#savedFeedsPrefV2'`, field: **`items`** (not `saved`)
- Feed items have `{ type, value }` where type is `'feed'`, `'list'`, or `'timeline'`
