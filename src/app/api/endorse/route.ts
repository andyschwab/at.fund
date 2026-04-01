import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { FUND_ENDORSE } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'

type RawValue = Record<string, unknown>

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

// POST — create an endorsement record
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

  const uri = str((body as Record<string, unknown>)?.uri)
  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 })
  }

  const client = new Client(session)
  const createdAt = l.toDatetimeString(new Date())

  try {
    await client.create(fund.at.endorse, { uri, createdAt })
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

// DELETE — remove an endorsement record by matching uri
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

  const uri = str((body as Record<string, unknown>)?.uri)
  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 })
  }

  const client = new Client(session)

  try {
    // List endorsement records to find the one matching this URI
    const res = await client.listRecords(FUND_ENDORSE, { limit: 100 })
    const records = res.body.records as Array<{ uri: string; value: unknown }>
    const match = records.find((r) => {
      const v = r.value as RawValue | undefined
      return v && typeof v.uri === 'string' && v.uri.trim() === uri
    })

    if (!match) {
      return NextResponse.json({ error: 'Endorsement not found' }, { status: 404 })
    }

    // Extract rkey from the AT URI: at://did:plc:.../fund.at.endorse/<rkey>
    const rkey = match.uri.split('/').pop()
    if (!rkey) {
      return NextResponse.json({ error: 'Could not determine record key' }, { status: 500 })
    }

    // Delete via XRPC procedure
    const deleteRes = await client.fetchHandler(
      '/xrpc/com.atproto.repo.deleteRecord' as `/${string}`,
      {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          repo: session.did,
          collection: FUND_ENDORSE,
          rkey,
        }),
      },
    )

    if (!deleteRes.ok) {
      const errBody = await deleteRes.text()
      throw new Error(`deleteRecord: ${deleteRes.status} ${errBody}`)
    }

    logger.info('endorse: record deleted', { did: session.did, uri })
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete endorsement'
    logger.error('endorse: delete failed', { did: session.did, uri, error: message })
    return NextResponse.json(
      {
        error: message,
        detail: 'Could not remove endorsement. Try signing out and back in to refresh your authorization.',
      },
      { status: 502 },
    )
  }
}
