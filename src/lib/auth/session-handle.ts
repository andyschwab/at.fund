import { Agent } from '@atproto/api'
import type { OAuthSession } from '@atproto/oauth-client'

/** Handle from `com.atproto.repo.describeRepo` (home PDS; works for any ATProto host). */
export function handleFromDescribeRepo(data: {
  handle?: string
}): string | undefined {
  const h = data.handle
  return typeof h === 'string' && h.trim() ? h.trim() : undefined
}

/** When `describeRepo` did not return a handle (e.g. some test setups). */
export async function getBlueskyHandleFallback(
  session: OAuthSession,
): Promise<string | undefined> {
  try {
    const agent = new Agent(session)
    const prof = await agent.app.bsky.actor.getProfile({
      actor: session.did,
    })
    return prof.data.handle
  } catch {
    return undefined
  }
}

/**
 * Resolve the account handle for display: home PDS describeRepo first, then
 * Bluesky AppView profile when available.
 */
export async function getSessionHandle(
  session: OAuthSession,
  describeRepoHandle?: string,
): Promise<string | undefined> {
  if (describeRepoHandle) return describeRepoHandle
  try {
    const agent = new Agent(session)
    const res = await agent.com.atproto.repo.describeRepo({ repo: session.did })
    const h = handleFromDescribeRepo(res.data)
    if (h) return h
  } catch {
    // fall through
  }
  return getBlueskyHandleFallback(session)
}
