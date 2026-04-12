'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { StackEntriesList } from './StackEntriesList'
import type { StackStreamEvent } from '@/app/api/stack/[handle]/stream/route'
import type { StewardEntry } from '@/lib/steward-model'

export function StackStream({
  handle,
  entries,
  allEntries,
  onEntry,
  onRef,
  endorsedSet,
  onEndorse,
  onUnendorse,
}: {
  handle: string
  /** Primary entries to display (filtered by parent). */
  entries: StewardEntry[]
  /** All known entries for dependency lookup. */
  allEntries: StewardEntry[]
  /** Called when a primary entry arrives from the stream. */
  onEntry: (entry: StewardEntry) => void
  /** Called when a ref (dependency) entry arrives from the stream. */
  onRef: (entry: StewardEntry) => void
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
}) {
  const [done, setDone] = useState(false)
  const [started, setStarted] = useState(false)

  // Stable refs for callbacks — the stream effect should only re-run
  // when `handle` changes, not when callback identities change.
  const onEntryRef = useRef(onEntry)
  const onRefRef = useRef(onRef)
  useEffect(() => { onEntryRef.current = onEntry }, [onEntry])
  useEffect(() => { onRefRef.current = onRef }, [onRef])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setStarted(true)
      try {
        const res = await fetch(`/api/stack/${handle}/stream`)
        if (!res.ok || !res.body) { setDone(true); return }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (cancelled || streamDone) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()!

          for (const line of lines) {
            if (!line.trim()) continue
            let event: StackStreamEvent
            try { event = JSON.parse(line) as StackStreamEvent }
            catch { continue }

            if (event.type === 'entry') {
              if (!cancelled) onEntryRef.current(event.entry)
            } else if (event.type === 'ref') {
              if (!cancelled) onRefRef.current(event.entry)
            } else if (event.type === 'done') {
              if (!cancelled) setDone(true)
            }
          }
        }
      } catch {
        if (!cancelled) setDone(true)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [handle])

  if (!done && (!started || entries.length === 0)) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Loading stack…
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Resolving endorsed projects and their funding info
          </p>
        </div>
      </div>
    )
  }

  if (done && entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/60 p-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No endorsed projects found for @{handle}.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {entries.length} project{entries.length === 1 ? '' : 's'} endorsed
        {!done && <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400"><RefreshCw className="h-3 w-3 animate-spin" aria-hidden />loading…</span>}
      </p>
      <StackEntriesList
        entries={entries}
        allEntries={allEntries}
        endorsedSet={endorsedSet}
        onEndorse={onEndorse}
        onUnendorse={onUnendorse}
        active
      />
    </div>
  )
}
