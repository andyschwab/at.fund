import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/auth/client'

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
      cookieStore.delete('did')
      return NextResponse.json({ valid: false, did: null })
    }
    return NextResponse.json({ valid: true, did })
  } catch {
    // Session in cookie but not restorable — stale cookie, clear it
    cookieStore.delete('did')
    return NextResponse.json({ valid: false, did: null })
  }
}
