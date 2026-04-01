import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { scanStreaming } from '@/lib/pipeline/scan-stream'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'
import type { ScanStreamEvent } from '@/lib/pipeline/scan-stream'

export const dynamic = 'force-dynamic'

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
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const extra = parseExtraList(request.nextUrl.searchParams.get('extraStewards'))
  const normalized: string[] = []
  const invalid: string[] = []
  for (const s of extra) {
    const n = normalizeStewardUri(s)
    if (!n) invalid.push(s)
    else normalized.push(n)
  }
  if (invalid.length > 0) {
    return new Response(JSON.stringify({ error: 'Invalid steward URI(s)', invalid }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ScanStreamEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }

      try {
        await scanStreaming(session, normalized, emit)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Scan failed'
        logger.error('scanRepoStreaming failed', {
          did: session.did,
          error: message,
          stack: e instanceof Error ? e.stack : undefined,
        })
        emit({
          type: 'warning',
          warning: { stewardUri: '', step: 'fatal', message },
        })
        emit({ type: 'done' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
