import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/auth/client'
import { getPublicUrl } from '@/lib/public-url'

export async function GET(request: NextRequest) {
  const publicUrl = getPublicUrl()
  try {
    const params = request.nextUrl.searchParams
    const client = await getOAuthClient()

    const { session } = await client.callback(params)

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
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/?error=login_failed', publicUrl))
  }
}
