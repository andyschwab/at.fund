'use client'

import { StewardCard } from '@/components/ProjectCards'
import { CardErrorBoundary } from '@/components/CardErrorBoundary'
import type { StewardEntry } from '@/lib/steward-model'

export function StackEntriesList({
  entries,
  allEntries,
}: {
  entries: StewardEntry[]
  allEntries: StewardEntry[]
}) {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
      {entries.map((entry) => (
        <CardErrorBoundary key={entry.uri} uri={entry.uri}>
          <StewardCard
            entry={entry}
            allEntries={allEntries}
            active
          />
        </CardErrorBoundary>
      ))}
    </ul>
  )
}
