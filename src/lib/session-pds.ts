import type { OAuthSession } from '@atproto/oauth-client'

/** Hostname of the user’s PDS (from OAuth token audience), if parseable. */
export async function getPdsHostnameFromSession(
  session: OAuthSession,
): Promise<string | undefined> {
  try {
    const info = await session.getTokenInfo()
    const aud = info.aud
    if (!aud || typeof aud !== 'string') return undefined
    const u = new URL(aud)
    return u.hostname || undefined
  } catch {
    return undefined
  }
}
