import type { NextRequest } from 'next/server'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { resolveEntry } from '@/lib/pipeline/entry-resolve'
import { createScanContext } from '@/lib/scan-context'
import type { StewardEntry } from '@/lib/steward-model'

export const dynamic = 'force-dynamic'

export type StackStreamEvent =
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'ref';   entry: StewardEntry }
  | { type: 'done' }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: StackStreamEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }

      try {
        const endorsedUris = await fetchPublicEndorsements(handle)
        const urisToResolve = endorsedUris.slice(0, 30)

        const sharedCtx = createScanContext()

        // Resolve primary entries in parallel; emit each as it completes so
        // the client can render cards progressively. resolveEntry() already
        // resolves dependencies internally, and the shared ScanContext dedupes
        // dep resolution across parallel calls via its singleflight cache.
        const seenRefDids = new Set<string>()

        await Promise.allSettled(
          urisToResolve.map(async (uri) => {
            try {
              const result = await resolveEntry(uri, sharedCtx)
              if (!result) return // skip entries that don't resolve to a DID
              emit({ type: 'entry', entry: result.entry })

              // Emit referenced deps (dedup by DID across entries)
              for (const ref of result.referenced) {
                if (!seenRefDids.has(ref.did)) {
                  seenRefDids.add(ref.did)
                  emit({ type: 'ref', entry: ref })
                }
              }
            } catch { /* skip unresolvable entries */ }
          }),
        )
      } catch { /* best-effort; always close cleanly */ }

      emit({ type: 'done' })
      controller.close()
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
