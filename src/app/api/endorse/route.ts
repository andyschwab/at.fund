import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { FUND_ENDORSE, deleteWithFallback } from '@/lib/fund-at-records'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'
import { str } from '@/lib/str'

// POST — create or overwrite an endorsement record.
// The rkey IS the endorsed URI, so endorsing the same entity twice is idempotent.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawUri = str((body as Record<string, unknown>)?.uri)
  const uri = rawUri ? normalizeStewardUri(rawUri) : null
  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 })
  }

  const client = new Client(session)
  const createdAt = l.toDatetimeString(new Date())

  try {
    await client.put(fund.at.graph.endorse, { subject: uri, createdAt }, { rkey: uri })
    logger.info('endorse: record created', { did: session.did, uri })
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create endorsement'
    logger.error('endorse: create failed', { did: session.did, uri, error: message })
    return NextResponse.json(
      {
        error: message,
        detail: 'Could not create endorsement. Try signing out and back in to refresh your authorization.',
      },
      { status: 502 },
    )
  }
}

// DELETE — remove an endorsement record. The rkey is the endorsed URI,
// but the caller may not know which form of the URI was used as the rkey
// (hostname, handle, or DID). Accept an array of candidate URIs and try each.
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const rawUri = str(b?.uri)
  const uri = rawUri ? normalizeStewardUri(rawUri) : null
  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 })
  }

  // Collect all candidate rkeys — the primary uri plus any alternatives
  const candidates = new Set([uri])
  if (rawUri && rawUri !== uri) candidates.add(rawUri) // keep raw form as fallback
  if (Array.isArray(b?.uris)) {
    for (const u of b.uris) {
      if (typeof u === 'string' && u.trim()) {
        candidates.add(u.trim())
        const normalized = normalizeStewardUri(u.trim())
        if (normalized) candidates.add(normalized)
      }
    }
  }

  const client = new Client(session)

  let deleted = false
  for (const rkey of candidates) {
    try {
      await deleteWithFallback(client, FUND_ENDORSE, rkey)
      deleted = true
    } catch {
      // Try next candidate
    }
  }

  if (deleted) {
    logger.info('endorse: record deleted', { did: session.did, uri })
    return NextResponse.json({ success: true })
  }

  logger.warn('endorse: no record found to delete', { did: session.did, candidates: [...candidates] })
  // Return success anyway — the record may already be gone
  return NextResponse.json({ success: true })
}
