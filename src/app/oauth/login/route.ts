import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, SCOPE } from '@/lib/auth/client'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const handle = body?.handle

    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'Handle is required' }, { status: 400 })
    }

    const client = await getOAuthClient()
    const authUrl = await client.authorize(handle.trim(), {
      scope: SCOPE,
    })

    logger.info('oauth: login initiated', { handle: handle.trim() })
    return NextResponse.json({ redirectUrl: authUrl.toString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed'
    logger.error('oauth: login failed', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: message, detail: 'Could not start the login flow. Check your handle and try again.' },
      { status: 500 },
    )
  }
}
