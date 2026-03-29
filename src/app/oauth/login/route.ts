import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, SCOPE } from '@/lib/auth/client'

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

    return NextResponse.json({ redirectUrl: authUrl.toString() })
  } catch (error) {
    console.error('OAuth login error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 500 },
    )
  }
}
