import { NextRequest, NextResponse } from 'next/server'
import { resolveEntry } from '@/lib/pipeline/entry-resolve'
import { logger } from '@/lib/logger'

/**
 * Full vertical resolution for a single entry.
 *
 * GET /api/entry?uri=<handle-or-did-or-hostname>
 *
 * Returns { entry: StewardEntry, referenced: StewardEntry[] }
 * No authentication required — all data sources are public.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('uri')
  if (!raw) {
    return NextResponse.json({ error: 'Missing uri parameter' }, { status: 400 })
  }

  const uri = raw.trim()
  if (!uri) {
    return NextResponse.json({ error: 'Empty uri parameter' }, { status: 400 })
  }

  try {
    const result = await resolveEntry(uri)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to resolve entry'
    logger.error('entry: resolve failed', { uri, error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
