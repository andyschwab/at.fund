'use client'

import { useMemo } from 'react'
import type { StewardEntry } from '@/lib/steward-model'
import {
  BadgeCheck,
  BadgePlus,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import {
  heartState,
  websiteFallbackForUri,
  profileUrlFor,
  StewardNameHeading,
  HandleBadge,
  TagBadges,
  CapabilitiesSection,
  ProfileAvatar,
} from '@/components/card-primitives'
import { DependenciesSection } from '@/components/card-dependencies'
import { cardType, LINK_VARIANT } from '@/components/card-utils'

// ---------------------------------------------------------------------------
// Card export
// ---------------------------------------------------------------------------

export function StewardCard({
  entry,
  allEntries = [],
  endorsed,
  endorsedSet,
  onEndorse,
  onUnendorse,
  networkEndorsementCount,
}: {
  entry: StewardEntry
  allEntries?: StewardEntry[]
  endorsed?: boolean
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  networkEndorsementCount?: number
}) {
  const type = cardType(entry)

  const entryByKey = useMemo(() => {
    const m = new Map<string, StewardEntry>()
    for (const e of allEntries) {
      m.set(e.uri, e)
      if (e.did) m.set(e.did, e)
      if (e.handle) m.set(e.handle, e)
    }
    return m
  }, [allEntries])
  const lookup = (uri: string) => entryByKey.get(uri)

  const isEndorsed = endorsed ?? (endorsedSet
    ? (endorsedSet.has(entry.uri) || endorsedSet.has(entry.did ?? ''))
    : false)

  const linkVariant = LINK_VARIANT[type]
  const state = heartState(entry.contributeUrl, entry.dependencies, lookup)
  const websiteFallback = websiteFallbackForUri(entry.uri)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const profileUrl = profileUrlFor(entry)
  const linkHref = type === 'tool' ? websiteUrl : (profileUrl ?? websiteUrl)
  const endorseHandler = isEndorsed ? onUnendorse : onEndorse

  return (
    <li className={`px-4 py-3.5 transition-all duration-100 ${
      state === 'none'
        ? 'opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
        : 'bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/50'
    }`}>
      <div className="flex items-start gap-3">
        <ProfileAvatar entry={entry} href={linkHref} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StewardNameHeading
              name={entry.displayName}
              href={linkHref}
              linkVariant={linkVariant}
            />
            <HandleBadge handle={entry.handle} did={entry.did} />
            <TagBadges tags={entry.tags} />
          </div>
          {entry.description && (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {entry.description}
            </p>
          )}
          {networkEndorsementCount != null && networkEndorsementCount > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {networkEndorsementCount} endorsement{networkEndorsementCount === 1 ? '' : 's'} from your network
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {entry.contributeUrl ? (
            <a
              href={entry.contributeUrl}
              target="_blank"
              rel="noreferrer"
              title="Opens their contribution page"
              className="flex w-11 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium text-[var(--support)] transition-opacity hover:opacity-75"
            >
              <DropletIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <span>Fund</span>
            </a>
          ) : (
            <span
              title="This account hasn't configured a contribution link yet"
              className="flex w-11 flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-medium text-slate-300 dark:text-slate-600"
            >
              <DropletIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <span>Fund</span>
            </span>
          )}

          {endorseHandler ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); endorseHandler(entry.uri) }}
              title={isEndorsed ? 'Remove from your stack' : 'Public signal of trust — adds this project to your stack'}
              className={`group flex w-11 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
                isEndorsed
                  ? 'text-[var(--support)] hover:text-red-600 dark:hover:text-red-400'
                  : 'text-slate-400 hover:text-[var(--support)] dark:text-slate-500 dark:hover:text-[var(--support)]'
              }`}
            >
              {isEndorsed ? (
                <>
                  <BadgeCheck className="h-4 w-4 group-hover:hidden" strokeWidth={2} aria-hidden />
                  <X className="hidden h-4 w-4 group-hover:block" strokeWidth={2} aria-hidden />
                  <span className="group-hover:hidden">Endorsed</span>
                  <span className="hidden group-hover:inline">Remove</span>
                </>
              ) : (
                <>
                  <BadgePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  <span>Endorse</span>
                </>
              )}
            </button>
          ) : (
            <span
              className="flex w-11 flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-medium text-slate-300 dark:text-slate-600"
            >
              <BadgePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <span>Endorse</span>
            </span>
          )}
        </div>
      </div>

      {entry.capabilities && entry.capabilities.length > 0 && (
        <div className="pl-12">
          <CapabilitiesSection capabilities={entry.capabilities} />
        </div>
      )}

      {entry.dependencies && entry.dependencies.length > 0 && (
        <div className="pl-12">
          <DependenciesSection
            dependencies={entry.dependencies}
            allEntries={allEntries}
            endorsedSet={endorsedSet}
            onEndorse={onEndorse}
            onUnendorse={onUnendorse}
          />
        </div>
      )}
    </li>
  )
}
