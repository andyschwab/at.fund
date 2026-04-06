'use client'

import { StewardCard } from '@/components/ProjectCards'
import { CardErrorBoundary } from '@/components/CardErrorBoundary'
import type { StewardEntry } from '@/lib/steward-model'

type EndorsementCounts = { networkEndorsementCount?: number }

export function StackEntriesList({
  entries,
  allEntries,
  endorsedSet,
  onEndorse,
  onUnendorse,
  endorsementCounts,
  active,
}: {
  entries: StewardEntry[]
  allEntries: StewardEntry[]
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  endorsementCounts?: Record<string, EndorsementCounts>
  /** Whether entries should show the "active" (funded/endorsed) background. */
  active?: boolean
}) {
  function lookupCounts(entry: StewardEntry): EndorsementCounts | undefined {
    if (!endorsementCounts) return undefined
    return endorsementCounts[entry.uri]
      ?? (entry.did ? endorsementCounts[entry.did] : undefined)
      ?? (entry.handle ? endorsementCounts[entry.handle] : undefined)
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
      {entries.map((entry) => {
        const counts = lookupCounts(entry)
        return (
          <CardErrorBoundary key={entry.uri} uri={entry.uri}>
            <StewardCard
              entry={entry}
              allEntries={allEntries}
              endorsedSet={endorsedSet}
              onEndorse={onEndorse}
              onUnendorse={onUnendorse}
              networkEndorsementCount={counts?.networkEndorsementCount}
              active={active}
            />
          </CardErrorBoundary>
        )
      })}
    </ul>
  )
}
