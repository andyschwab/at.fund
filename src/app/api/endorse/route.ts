import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { FUND_ENDORSE, deleteWithFallback } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'
import { str } from '@/lib/str'

// POST — create or overwrite an endorsement record.
// The rkey is the endorsed DID, so endorsing the same entity twice is idempotent.
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

  const uri = str((body as Record<string, unknown>)?.uri)?.trim()
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

// DELETE — remove an endorsement record. The rkey is the endorsed DID.
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

  const uri = str((body as Record<string, unknown>)?.uri)?.trim()
  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 })
  }

  const client = new Client(session)

  try {
    await deleteWithFallback(client, FUND_ENDORSE, uri)
    logger.info('endorse: record deleted', { did: session.did, uri })
    return NextResponse.json({ success: true })
  } catch {
    // Return success anyway — the record may already be gone
    logger.warn('endorse: no record found to delete', { did: session.did, uri })
    return NextResponse.json({ success: true })
  }
}
