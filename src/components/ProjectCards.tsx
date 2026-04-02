'use client'

import { useState, useRef, useMemo } from 'react'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BadgePlus,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const TAG_LABEL: Partial<Record<StewardTag, string>> = {
  tool: 'tool',
  labeler: 'labeler',
  feed: 'feed',
  follow: 'follow',
}

function TagBadges({ tags }: { tags: StewardTag[] }) {
  const shown = tags.filter((t) => TAG_LABEL[t])
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((t) => (
        <span
          key={t}
          className="shrink-0 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
        >
          {TAG_LABEL[t]}
        </span>
      ))}
    </>
  )
}

/** URI -> https fallback URL for hostname-shaped URIs (not DIDs). */
function websiteFallbackForUri(uri: string): string | undefined {
  if (uri.startsWith('did:')) return undefined
  if (uri.includes('/') || uri.includes(':')) return undefined
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(uri)) return `https://${uri}`
  return undefined
}

/** Build a Bluesky profile URL from handle or DID. */
function profileUrlFor(entry: { handle?: string; did?: string }): string | undefined {
  if (entry.handle) return `https://bsky.app/profile/${entry.handle}`
  if (entry.did) return `https://bsky.app/profile/${entry.did}`
  return undefined
}

type NameLinkVariant = 'support' | 'discover' | 'sky' | 'network'

function StewardNameHeading({
  name,
  href,
  linkVariant,
}: {
  name: string
  href?: string
  linkVariant: NameLinkVariant
}) {
  const base =
    'min-w-0 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100'
  if (!href) {
    return <h3 className={`${base} truncate`}>{name}</h3>
  }
  const hover =
    linkVariant === 'support'
      ? 'hover:text-[var(--support)] hover:decoration-[var(--support-border)]'
      : linkVariant === 'network'
        ? 'hover:text-[var(--network)] hover:decoration-[var(--network-border)]'
        : linkVariant === 'discover'
          ? 'hover:text-[var(--discover)] hover:decoration-amber-500/50 dark:hover:text-amber-400'
          : 'hover:text-sky-700 hover:decoration-sky-500/50 dark:hover:text-sky-400'

  return (
    <h3 className="min-w-0">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`block truncate rounded-sm underline decoration-slate-300 decoration-1 underline-offset-2 transition-colors dark:decoration-slate-600 ${base} ${hover}`}
      >
        {name}
      </a>
    </h3>
  )
}

/** ATProto identity — shown inline right of the name, links to DID for provenance. */
function HandleBadge({ handle, did }: { handle?: string; did?: string }) {
  const label = handle ? `@${handle}` : did
  if (!label) return null
  const profileUrl = did
    ? `https://bsky.app/profile/${did}`
    : handle
      ? `https://bsky.app/profile/${handle}`
      : undefined
  return profileUrl ? (
    <a
      href={profileUrl}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 truncate text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-700 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200"
    >
      {label}
    </a>
  ) : (
    <span className="shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
  )
}

/** Compact listing of feeds/labelers this account provides. */
function CapabilitiesSection({ capabilities }: { capabilities: Capability[] }) {
  if (capabilities.length === 0) return null
  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Provides
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {capabilities.map((cap) => {
          const icon = cap.type === 'feed' ? '📰' : '🏷️'
          return (
            <div key={cap.uri ?? `${cap.type}:${cap.name}`} className="flex items-center gap-2 py-1.5">
              <span className="shrink-0 text-sm" aria-hidden>{icon}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                {cap.landingPage ? (
                  <a
                    href={cap.landingPage}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900 dark:decoration-slate-600 dark:hover:text-slate-100"
                  >
                    {cap.name}
                  </a>
                ) : (
                  cap.name
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Droplet icon state
// ---------------------------------------------------------------------------

type DropletIconState = 'direct' | 'dependency' | 'none'

function heartState(
  contributeUrl: string | undefined,
  dependencies: string[] | undefined,
  lookup?: (uri: string) => StewardEntry | undefined,
): DropletIconState {
  if (contributeUrl) return 'direct'
  if (dependencies?.length && lookup) {
    if (dependencies.some((uri) => !!(lookup(uri)?.contributeUrl))) return 'dependency'
  }
  return 'none'
}

/** The 14×14 droplet icon rendered in 3 states. Accent colour varies by card type. */
function FundingIcon({
  state,
  contributeUrl,
  accentClass,
}: {
  state: DropletIconState
  contributeUrl?: string
  accentClass: string
}) {
  if (state === 'direct') {
    return (
      <a
        href={contributeUrl!}
        target="_blank"
        rel="noreferrer"
        title="Contribute"
        className={`flex h-14 w-14 items-center justify-center rounded-xl shadow-sm transition-opacity hover:opacity-90 ${accentClass}`}
      >
        <DropletIcon className="h-8 w-8" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Contribute</span>
      </a>
    )
  }
  if (state === 'dependency') {
    return (
      <span
        className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
        title="No contribution link -- has sub-dependencies"
      >
        <DropletIcon className="h-8 w-8" strokeWidth={1.75} aria-hidden />
      </span>
    )
  }
  return (
    <span
      className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
      title="No contribution link published"
    >
      <DropletIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dependency rows + drill-down modal
// ---------------------------------------------------------------------------

type ModalState = {
  uri: string
  entry: StewardEntry | null
  loading: boolean
  error: string | null
}

function depRowTier(
  e: StewardEntry | undefined,
  lookup?: (uri: string) => StewardEntry | undefined,
): number {
  if (!e) return 2
  if (e.contributeUrl) return 0
  if (
    e.dependencies?.length &&
    lookup &&
    e.dependencies.some((uri) => !!(lookup(uri)?.contributeUrl))
  )
    return 1
  return 2
}

/** A single row in the "Depends on" inset section. */
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
  const contributeUrl = entry?.contributeUrl
  const name = entry?.displayName ?? depUri
  const websiteUrl = entry?.landingPage ?? websiteFallbackForUri(depUri)

  return (
    <div className="flex items-center gap-2 py-1.5">
      {state === 'direct' ? (
        <a
          href={contributeUrl!}
          target="_blank"
          rel="noreferrer"
          title="Contribute"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
          onClick={(e) => e.stopPropagation()}
        >
          <DropletIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          <span className="sr-only">Contribute</span>
        </a>
      ) : state === 'dependency' ? (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
          title="No contribution link -- has sub-dependencies"
        >
          <DropletIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
          title="No contribution link published"
        >
          <DropletIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {name}
          </a>
        ) : (
          name
        )}
      </span>
      <button
        type="button"
        onClick={onExpand}
        title={`View details for ${name}`}
        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        <span className="sr-only">View details for {name}</span>
      </button>
    </div>
  )
}

/**
 * Inset "Depends on" rows with a shared drill-down modal.
 */
function DependenciesSection({
  dependencies,
  allEntries,
}: {
  dependencies: string[]
  allEntries: StewardEntry[]
}) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const entryByUri = useMemo(
    () => new Map(allEntries.map((e) => [e.uri, e])),
    [allEntries],
  )
  const lookup = (uri: string) => entryByUri.get(uri)

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
      const res = await fetch(`/api/steward?uri=${encodeURIComponent(uri)}`)
      const data = await res.json()
      if (!res.ok) throw new Error('error' in data ? (data as { error: string }).error : 'Failed to load')
      setModal({ uri, entry: data as StewardEntry, loading: false, error: null })
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
            <CardInner
              entry={modal.entry}
              isTool={modal.entry.tags.includes('tool')}
              linkVariant={modal.entry.tags.includes('tool') ? 'support' : 'network'}
              allEntries={allEntries}
              lookup={lookup}
            />
          )}
        </div>
      </dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared card content — used by StewardCard (all variants) and the modal
// ---------------------------------------------------------------------------

function EndorseButton({
  endorsed,
  onEndorse,
  onUnendorse,
  uri,
}: {
  endorsed?: boolean
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  uri: string
}) {
  if (!onEndorse && !onUnendorse) return null
  const handler = endorsed ? onUnendorse : onEndorse
  if (!handler) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        handler(uri)
      }}
      title={endorsed ? 'Remove from My Stack' : 'Endorse and add to My Stack'}
      className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
        endorsed
          ? 'text-[var(--support)] bg-[var(--support-muted)] hover:bg-[var(--support-muted)]/80'
          : 'text-slate-400 hover:text-[var(--support)] hover:bg-[var(--support-muted)] dark:text-slate-500 dark:hover:text-[var(--support)]'
      }`}
    >
      {endorsed ? (
        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      ) : (
        <BadgePlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      )}
      {endorsed ? 'Endorsed' : 'Endorse'}
    </button>
  )
}

/**
 * Shared inner content for all card types and the dependency drill-down modal.
 *
 * Two card types:
 *   - Tool (isTool=true):  warm accent, title links to website
 *   - Account (isTool=false): blue accent, title links to Bluesky profile
 *
 * The "discover" state is just an account card with an empty-state banner.
 */
function CardInner({
  entry,
  isTool,
  linkVariant,
  accentClass = isTool
    ? 'bg-[var(--support)] text-[var(--support-foreground)]'
    : 'bg-[var(--network)] text-white',
  allEntries = [],
  lookup,
  endorsed,
  onEndorse,
  onUnendorse,
  discover,
}: {
  entry: StewardEntry
  isTool: boolean
  linkVariant: NameLinkVariant
  accentClass?: string
  allEntries?: StewardEntry[]
  lookup?: (uri: string) => StewardEntry | undefined
  endorsed?: boolean
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  /** Show the "we don't have details yet" banner. */
  discover?: boolean
}) {
  const websiteFallback = websiteFallbackForUri(entry.uri)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const profileUrl = profileUrlFor(entry)
  const nameHref = isTool ? websiteUrl : profileUrl

  const state = heartState(entry.contributeUrl, entry.dependencies, lookup)

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <FundingIcon
          state={discover ? 'none' : state}
          contributeUrl={entry.contributeUrl}
          accentClass={accentClass}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StewardNameHeading
            name={entry.displayName}
            href={nameHref}
            linkVariant={linkVariant}
          />
          <HandleBadge handle={entry.handle} did={entry.did} />
          <TagBadges tags={entry.tags} />
          <EndorseButton endorsed={endorsed} onEndorse={onEndorse} onUnendorse={onUnendorse} uri={entry.uri} />
        </div>
        {entry.description && (
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {entry.description}
          </p>
        )}
        {discover && (
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Your account has saved something from this service--we don&apos;t have
            details about it yet.{' '}
            <Link
              href="/lexicon"
              className="font-medium text-[var(--discover)] underline underline-offset-2 dark:text-amber-400"
            >
              How projects get listed
            </Link>
          </p>
        )}
        {entry.capabilities && entry.capabilities.length > 0 && (
          <CapabilitiesSection capabilities={entry.capabilities} />
        )}
        {entry.dependencies && entry.dependencies.length > 0 && (
          <DependenciesSection
            dependencies={entry.dependencies}
            allEntries={allEntries}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card type: tool vs account vs discover (empty-state account)
// ---------------------------------------------------------------------------

type CardType = 'tool' | 'account' | 'discover'

function cardType(entry: StewardEntry): CardType {
  if (entry.tags.includes('tool')) return 'tool'
  if (entry.source === 'unknown' && !entry.capabilities?.length) return 'discover'
  return 'account'
}

const ARTICLE_CLASS: Record<CardType, string> = {
  tool: 'rounded-xl border border-slate-200/90 border-l-4 border-l-[var(--support-border)] bg-gradient-to-br from-[var(--support-muted)] to-white p-4 shadow-sm dark:border-slate-800 dark:from-[var(--support-muted)] dark:to-slate-950',
  account: 'rounded-xl border border-slate-200/90 border-l-4 border-l-[var(--network-border)] bg-gradient-to-br from-[var(--network-muted)] to-white p-4 shadow-sm dark:border-slate-800 dark:from-[var(--network-muted)] dark:to-slate-950',
  discover: "relative overflow-hidden rounded-xl border border-dashed border-[var(--discover-border)] bg-[var(--discover-muted)] p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-[var(--discover)] before:content-[''] dark:border-amber-500/35 dark:bg-amber-500/[0.07]",
}

const LINK_VARIANT: Record<CardType, NameLinkVariant> = {
  tool: 'support',
  account: 'network',
  discover: 'discover',
}

// ---------------------------------------------------------------------------
// Card exports
// ---------------------------------------------------------------------------

export function PdsHostSupportCard({
  pdsHostname,
  funding,
}: {
  pdsHostname: string
  funding?: PdsHostFunding | null
}) {
  const pdsStewardLabel = funding?.pdsStewardHandle ?? funding?.pdsStewardUri
  const stewardWebsiteFallback = funding?.pdsStewardUri
    ? websiteFallbackForUri(funding.pdsStewardUri)
    : undefined
  const title =
    pdsStewardLabel
      ? `Your host steward (${pdsStewardLabel})`
      : `Your host (${pdsHostname})`
  const contributeUrl = funding?.contributeUrl
  const websiteFallback = stewardWebsiteFallback ?? `https://${pdsHostname}`
  const summary =
    pdsStewardLabel
      ? `Your account's home server (${pdsHostname}), operated by ${pdsStewardLabel}.`
      : `Your account's home server (${pdsHostname}) -- support options if published.`

  const websiteUrl = websiteFallback

  return (
    <article className="rounded-xl border border-slate-200/90 border-l-4 border-l-sky-400/90 bg-gradient-to-br from-sky-50/90 to-white p-4 shadow-sm dark:border-slate-800 dark:from-sky-950/40 dark:to-slate-950">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {contributeUrl ? (
            <a
              href={contributeUrl}
              target="_blank"
              rel="noreferrer"
              title="Contribute"
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-sky-600"
            >
              <DropletIcon
                className="h-8 w-8"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="sr-only">Contribute</span>
            </a>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
              title="No contribution link published"
            >
              <DropletIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <StewardNameHeading
            name={title}
            href={websiteUrl}
            linkVariant="sky"
          />
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {summary}
          </p>
          {pdsStewardLabel && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Steward: <span className="font-mono">{pdsStewardLabel}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Unified steward card. Two card types:
 *   - Tool (NSID-linked): warm accent, title links to website
 *   - Account (everything else): blue accent, title links to Bluesky profile
 *
 * "Discover" is an account card with an empty-state banner for entries
 * whose source is unknown and have no confirmed capabilities.
 */
export function StewardCard({
  entry,
  allEntries = [],
  endorsed,
  onEndorse,
  onUnendorse,
}: {
  entry: StewardEntry
  allEntries?: StewardEntry[]
  endorsed?: boolean
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
}) {
  const type = cardType(entry)

  const entryByUri = useMemo(
    () => new Map(allEntries.map((e) => [e.uri, e])),
    [allEntries],
  )
  const lookup = (uri: string) => entryByUri.get(uri)

  return (
    <article className={ARTICLE_CLASS[type]}>
      <CardInner
        entry={entry}
        isTool={type === 'tool'}
        linkVariant={LINK_VARIANT[type]}
        allEntries={allEntries}
        lookup={lookup}
        endorsed={endorsed}
        onEndorse={onEndorse}
        onUnendorse={onUnendorse}
        discover={type === 'discover'}
      />
    </article>
  )
}
