import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/auth/client'
import { getPublicUrl } from '@/lib/public-url'
import { getSessionHandle } from '@/lib/auth/session-handle'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const publicUrl = getPublicUrl()
  try {
    const params = request.nextUrl.searchParams
    const client = await getOAuthClient()

    const { session } = await client.callback(params)

    logger.info('oauth: callback successful', { did: session.did })

    // Resolve handle once at login — stored in cookie so no subsequent lookups needed
    const handle = await getSessionHandle(session).catch(() => undefined)

    const rawReturnTo = request.cookies.get('returnTo')?.value ?? '/'
    const safePath =
      rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
        ? rawReturnTo
        : '/'
    const response = NextResponse.redirect(new URL(safePath, publicUrl))
    response.cookies.delete('returnTo')

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }

    response.cookies.set('did', session.did, cookieOpts)
    if (handle) {
      response.cookies.set('handle', handle, cookieOpts)
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isStateLost =
      message.includes('state') ||
      message.includes('PKCE') ||
      message.includes('verifier')
    const reason = isStateLost ? 'state_lost' : 'callback_error'
    logger.error('oauth: callback failed', {
      error: message,
      reason,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.redirect(
      new URL(`/?error=login_failed&reason=${reason}`, publicUrl),
    )
  }
}
