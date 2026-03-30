import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/auth/client'
import { getPublicUrl } from '@/lib/public-url'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const publicUrl = getPublicUrl()
  try {
    const params = request.nextUrl.searchParams
    const client = await getOAuthClient()

    const { session } = await client.callback(params)

    logger.info('oauth: callback successful', { did: session.did })

    const response = NextResponse.redirect(new URL('/', publicUrl))

    response.cookies.set('did', session.did, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('oauth: callback failed', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.redirect(new URL('/?error=login_failed', publicUrl))
  }
}
