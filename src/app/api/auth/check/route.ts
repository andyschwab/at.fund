import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/auth/client'
import { resolveHandleFromDid } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'

export async function GET() {
  const cookieStore = await cookies()
  const did = cookieStore.get('did')?.value

  if (!did) {
    return NextResponse.json({ valid: false, did: null, handle: null })
  }

  try {
    const client = await getOAuthClient()
    const session = await client.restore(did)
    if (!session) {
      logger.warn('auth/check: session restore returned null, clearing cookie', { did })
      cookieStore.delete('did')
      return NextResponse.json({ valid: false, did: null, handle: null })
    }
    // Best-effort handle resolution — don't block auth on it
    const handle = await resolveHandleFromDid(did).catch(() => null)
    return NextResponse.json({ valid: true, did, handle: handle ?? null })
  } catch (error) {
    logger.warn('auth/check: session not restorable, clearing cookie', {
      did,
      error: error instanceof Error ? error.message : String(error),
    })
    cookieStore.delete('did')
    return NextResponse.json({ valid: false, did: null, handle: null })
  }
}
