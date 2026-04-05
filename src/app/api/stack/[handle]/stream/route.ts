import type { NextRequest } from 'next/server'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { resolveEntry } from '@/lib/pipeline/entry-resolve'
import { resolveDependencies } from '@/lib/pipeline/dep-resolve'
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
        const entries: StewardEntry[] = []

        // Resolve primary entries in parallel; emit each as it completes so
        // the client can render cards progressively.
        await Promise.allSettled(
          urisToResolve.map(async (uri) => {
            try {
              const { entry } = await resolveEntry(uri, sharedCtx)
              entries.push(entry)
              emit({ type: 'entry', entry })
            } catch { /* skip unresolvable entries */ }
          }),
        )

        // Resolve deps for all primary entries together in one BFS pass.
        // Emit as refs — client adds these to the allEntries lookup only.
        const refs = await resolveDependencies(entries, undefined, sharedCtx)
        for (const entry of refs) {
          emit({ type: 'ref', entry })
        }
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
