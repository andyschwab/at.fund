import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/auth/client'
import { logger } from '@/lib/logger'

export async function GET() {
  const cookieStore = await cookies()
  const did = cookieStore.get('did')?.value

  if (!did) {
    return NextResponse.json({ valid: false, did: null })
  }

  try {
    const client = await getOAuthClient()
    const session = await client.restore(did)
    if (!session) {
      logger.warn('auth/check: session restore returned null, clearing cookies', { did })
      cookieStore.delete('did')
      cookieStore.delete('handle')
      return NextResponse.json({ valid: false, did: null })
    }
    return NextResponse.json({ valid: true, did })
  } catch (error) {
    logger.warn('auth/check: session not restorable, clearing cookies', {
      did,
      error: error instanceof Error ? error.message : String(error),
    })
    cookieStore.delete('did')
    cookieStore.delete('handle')
    return NextResponse.json({ valid: false, did: null })
  }
}
