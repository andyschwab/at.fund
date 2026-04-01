import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/auth/client'
import { logger } from '@/lib/logger'

export async function POST() {
  const cookieStore = await cookies()
  const did = cookieStore.get('did')?.value

  if (did) {
    try {
      const client = await getOAuthClient()
      await client.revoke(did)
    } catch (error) {
      // Revoke may fail (session not in memory, network error, etc.)
      // Log it but continue — we still need to clean up the cookie.
      logger.warn('oauth: revoke failed during logout', {
        did,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  cookieStore.delete('did')
  return NextResponse.json({ success: true })
}
