import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/auth/client'
import { logger } from '@/lib/logger'
import type { OAuthSession } from '@atproto/oauth-client'

export async function getSession(): Promise<OAuthSession | null> {
  const did = await getDid()
  if (!did) return null

  try {
    const client = await getOAuthClient()
    return await client.restore(did)
  } catch (error) {
    logger.warn('session: restore failed', {
      did,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't delete the cookie here — cookie mutation is only allowed in
    // Server Actions or Route Handlers, and getSession() is also called
    // during SSR render (layout.tsx). The stale cookie will be cleaned up
    // by /api/auth/check or by authFetch triggering invalidateSession().
    return null
  }
}

export async function getDid(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('did')?.value ?? null
}
