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
    logger.warn('session: restore failed, clearing stale cookie', {
      did,
      error: error instanceof Error ? error.message : String(error),
    })
    const cookieStore = await cookies()
    cookieStore.delete('did')
    return null
  }
}

export async function getDid(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('did')?.value ?? null
}
