import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { scanRepo } from '@/lib/lexicon-scan'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'

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

  const extra =
    parseExtraList(request.nextUrl.searchParams.get('extraStewards'))

  const normalized: string[] = []
  const invalid: string[] = []
  for (const s of extra) {
    const n = normalizeStewardUri(s)
    if (!n) invalid.push(s)
    else normalized.push(n)
  }
  if (invalid.length > 0) {
    return NextResponse.json({ error: 'Invalid steward URI(s)', invalid }, { status: 400 })
  }

  try {
    const data = await scanRepo(session, normalized)
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read repository'
    logger.error('scanRepo failed (GET)', {
      did: session.did,
      error: message,
      stack: e instanceof Error ? e.stack : undefined,
    })
    return NextResponse.json(
      { error: message, detail: 'The scan could not complete. This may be a temporary issue with your PDS or the ATProto network.' },
      { status: 502 },
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let selfReportedStewards: string[] = []
  try {
    const body = await request.json()
    if (Array.isArray(body?.selfReportedStewards)) {
      selfReportedStewards = body.selfReportedStewards.filter(
        (x: unknown) => typeof x === 'string',
      ) as string[]
    }
  } catch {
    // empty body
  }

  const normalized: string[] = []
  const invalid: string[] = []
  for (const s of selfReportedStewards) {
    const n = normalizeStewardUri(s)
    if (!n) invalid.push(s)
    else normalized.push(n)
  }
  if (invalid.length > 0) {
    return NextResponse.json({ error: 'Invalid steward URI(s)', invalid }, { status: 400 })
  }

  try {
    const data = await scanRepo(session, normalized)
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read repository'
    logger.error('scanRepo failed (POST)', {
      did: session.did,
      error: message,
      stack: e instanceof Error ? e.stack : undefined,
      selfReportedStewards: normalized,
    })
    return NextResponse.json(
      { error: message, detail: 'The scan could not complete. This may be a temporary issue with your PDS or the ATProto network.' },
      { status: 502 },
    )
  }
}
