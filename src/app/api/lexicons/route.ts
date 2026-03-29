import { isValidNsid } from '@atproto/syntax'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { scanRepo } from '@/lib/lexicon-scan'

function parseExtraList(raw: string | null): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const extra = parseExtraList(request.nextUrl.searchParams.get('extraCollections'))
  const invalid = extra.filter((n) => !isValidNsid(n))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: 'Invalid NSID(s)', invalid },
      { status: 400 },
    )
  }

  try {
    const data = await scanRepo(session, extra)
    return NextResponse.json(data)
  } catch (e) {
    console.error('scanRepo failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to read repository' },
      { status: 502 },
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let selfReportedNsids: string[] = []
  try {
    const body = await request.json()
    if (Array.isArray(body?.selfReportedNsids)) {
      selfReportedNsids = body.selfReportedNsids.filter(
        (x: unknown) => typeof x === 'string',
      ) as string[]
    }
  } catch {
    // empty body
  }

  const invalid = selfReportedNsids.filter((n) => !isValidNsid(n))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: 'Invalid NSID(s)', invalid },
      { status: 400 },
    )
  }

  try {
    const data = await scanRepo(session, selfReportedNsids)
    return NextResponse.json(data)
  } catch (e) {
    console.error('scanRepo failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to read repository' },
      { status: 502 },
    )
  }
}
