'use client'

import { useState, useRef, useMemo } from 'react'
import type { StewardEntry } from '@/lib/steward-model'
import {
  ArrowRight,
  BadgeCheck,
  BadgePlus,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import {
  type DropletIconState,
  type NameLinkVariant,
  heartState,
  depRowTier,
  ProfileAvatar,
  StewardNameHeading,
  HandleBadge,
  TagBadges,
  CapabilitiesSection,
  websiteFallbackForUri,
  profileUrlFor,
} from '@/components/card-primitives'

// ---------------------------------------------------------------------------
// Card type helpers (duplicated lightly to avoid circular dep with ProjectCards)
// ---------------------------------------------------------------------------

type CardType = 'tool' | 'account' | 'discover'

function cardType(entry: StewardEntry): CardType {
  if (entry.tags.includes('tool')) return 'tool'
  if (entry.source === 'unknown' && !entry.capabilities?.length) return 'discover'
  return 'account'
}

const LINK_VARIANT: Record<CardType, NameLinkVariant> = {
  tool: 'support',
  account: 'network',
  discover: 'discover',
}

// ---------------------------------------------------------------------------
// DependencyRow — a single row in the "Depends on" section
// ---------------------------------------------------------------------------

type ModalState = {
  uri: string
  entry: StewardEntry | null
  loading: boolean
  error: string | null
}

function DependencyRow({
  depUri,
  entry,
  state,
  onExpand,
}: {
  depUri: string
  entry?: StewardEntry
  state: DropletIconState
  onExpand: () => void
}) {
  const name = entry?.displayName ?? depUri
  const stub = entry ?? { uri: depUri, displayName: name, avatar: undefined }

  const dropletClass =
    state === 'direct'
      ? 'bg-[var(--support)] text-[var(--support-foreground)]'
      : state === 'dependency'
        ? 'bg-amber-100 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400'
        : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`View details for ${name}`}
      className="flex w-full items-center gap-2 py-1.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/50"
    >
      <div className="relative shrink-0">
        <ProfileAvatar entry={stub} size="sm" />
        <span className={`absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full shadow-sm ${dropletClass}`}>
          <DropletIcon className="h-2 w-2" strokeWidth={state === 'none' ? 1.5 : 2} aria-hidden />
        </span>
      </div>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
        {name}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
    </button>
  )
}

// ---------------------------------------------------------------------------
// ModalCardContent — compact layout rendered inside the dependency modal
// ---------------------------------------------------------------------------

function ModalCardContent({
  entry,
  onExpandDep,
  lookup,
  endorsedSet,
  onEndorse,
  onUnendorse,
}: {
  entry: StewardEntry
  onExpandDep: (uri: string) => void
  lookup?: (uri: string) => StewardEntry | undefined
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
}) {
  const contributeUrl = entry.contributeUrl
  const state = heartState(entry.contributeUrl, entry.dependencies, lookup)
  const type = cardType(entry)
  const linkVariant = LINK_VARIANT[type]
  const websiteFallback = websiteFallbackForUri(entry.uri)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const profileUrl = profileUrlFor(entry)
  const linkHref = type === 'tool' ? websiteUrl : profileUrl

  const endorsed = endorsedSet
    ? (endorsedSet.has(entry.uri) || endorsedSet.has(entry.did ?? ''))
    : false
  const endorseHandler = onEndorse || onUnendorse
    ? (endorsed ? onUnendorse : onEndorse)
    : undefined

  return (
    <div>
      {/* Header row — matches compact card style */}
      <div className={`-mx-5 -mt-5 mb-4 flex items-start gap-3 px-5 py-4 ${
        state === 'none'
          ? 'bg-slate-50 dark:bg-slate-900/40'
          : 'bg-emerald-50/60 dark:bg-emerald-950/20'
      }`}>
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
        </div>

        {/* Action buttons: Fund + Endorse */}
        <div className="flex shrink-0 items-start gap-1">
          {contributeUrl ? (
            <a
              href={contributeUrl}
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
          {endorseHandler && (
            <button
              type="button"
              onClick={() => endorseHandler(entry.uri)}
              title={endorsed ? 'Remove from your stack' : 'Public signal of trust — adds this project to your stack'}
              className={`group flex w-11 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
                endorsed
                  ? 'text-[var(--support)] hover:text-red-600 dark:hover:text-red-400'
                  : 'text-slate-400 hover:text-[var(--support)] dark:text-slate-500 dark:hover:text-[var(--support)]'
              }`}
            >
              {endorsed ? (
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
          )}
        </div>
      </div>

      {entry.capabilities && entry.capabilities.length > 0 && (
        <CapabilitiesSection capabilities={entry.capabilities} />
      )}

      {entry.dependencies && entry.dependencies.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Depends on
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {entry.dependencies.map((depUri) => {
              const depEntry = lookup?.(depUri)
              return (
                <DependencyRow
                  key={depUri}
                  depUri={depUri}
                  entry={depEntry}
                  state={heartState(depEntry?.contributeUrl, depEntry?.dependencies, lookup)}
                  onExpand={() => onExpandDep(depUri)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DependenciesSection — the full "Depends on" block with drill-down modal
// ---------------------------------------------------------------------------

export function DependenciesSection({
  dependencies,
  allEntries,
  endorsedSet,
  onEndorse,
  onUnendorse,
}: {
  dependencies: string[]
  allEntries: StewardEntry[]
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
}) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

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

  const sortedDeps = useMemo(() => {
    return [...dependencies].sort((a, b) => {
      const ea = lookup(a)
      const eb = lookup(b)
      const diff = depRowTier(ea, lookup) - depRowTier(eb, lookup)
      return diff !== 0 ? diff : a.localeCompare(b)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencies, allEntries])

  async function openDep(uri: string) {
    setModal({ uri, entry: null, loading: true, error: null })
    if (!dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
    try {
      const res = await fetch(`/api/entry?uri=${encodeURIComponent(uri)}`)
      const data = await res.json()
      if (!res.ok) throw new Error('error' in data ? (data as { error: string }).error : 'Failed to load')
      const result = data as { entry: StewardEntry; referenced?: StewardEntry[] }
      setModal({ uri, entry: result.entry, loading: false, error: null })
    } catch (e) {
      setModal({
        uri,
        entry: null,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load details',
      })
    }
  }

  function closeModal() {
    dialogRef.current?.close()
    setModal(null)
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Depends on
        </p>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {sortedDeps.map((depUri) => {
            const depEntry = lookup(depUri)
            return (
              <DependencyRow
                key={depUri}
                depUri={depUri}
                entry={depEntry}
                state={heartState(depEntry?.contributeUrl, depEntry?.dependencies, lookup)}
                onExpand={() => openDep(depUri)}
              />
            )
          })}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-950 [&::backdrop]:bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
            {modal?.entry?.displayName ?? modal?.uri ?? ''}
          </p>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="p-5">
          {modal?.loading && <p className="text-sm text-slate-500">Loading…</p>}
          {modal?.error && <p className="text-sm text-red-600 dark:text-red-400">{modal.error}</p>}
          {modal?.entry && (
            <ModalCardContent
              entry={modal.entry}
              onExpandDep={openDep}
              lookup={lookup}
              endorsedSet={endorsedSet}
              onEndorse={onEndorse}
              onUnendorse={onUnendorse}
            />
          )}
        </div>
      </dialog>
    </>
  )
}
