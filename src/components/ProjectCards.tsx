'use client'

import { useMemo } from 'react'
import type { StewardEntry } from '@/lib/steward-model'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import Link from 'next/link'
import {
  BadgeCheck,
  BadgePlus,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import {
  type NameLinkVariant,
  type CardVariant,
  heartState,
  websiteFallbackForUri,
  profileUrlFor,
  StewardNameHeading,
  HandleBadge,
  TagBadges,
  CapabilitiesSection,
  EndorseButton,
  ProfileAvatar,
  CardIconSlot,
} from '@/components/card-primitives'
import { DependenciesSection } from '@/components/card-dependencies'

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

const ICON_VARIANT: Record<CardType, CardVariant> = {
  tool: 'support',
  account: 'network',
  discover: 'discover',
}

// ---------------------------------------------------------------------------
// Shared card content — used by StewardCard (non-compact) for all variants
// ---------------------------------------------------------------------------

/**
 * Unified inner content for all card types.
 *
 * Two card types:
 *   - Tool (tool tag):       warm accent, title links to website
 *   - Account (everything else): blue accent, title links to Bluesky profile
 *
 * The "discover" state is just an account card with an empty-state banner.
 */
function CardInner({
  entry,
  type,
  allEntries = [],
  lookup,
  endorsed,
  onEndorse,
  onUnendorse,
  endorsedSet,
}: {
  entry: StewardEntry
  type: CardType
  allEntries?: StewardEntry[]
  lookup?: (uri: string) => StewardEntry | undefined
  endorsed?: boolean
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  endorsedSet?: Set<string>
}) {
  const isTool = type === 'tool'
  const isDiscover = type === 'discover'
  const linkVariant = LINK_VARIANT[type]
  const iconVariant = ICON_VARIANT[type]

  const websiteFallback = websiteFallbackForUri(entry.uri)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const profileUrl = profileUrlFor(entry)
  const nameHref = isTool ? websiteUrl : profileUrl

  const state = heartState(entry.contributeUrl, entry.dependencies, lookup)

  return (
    <div className="flex gap-3">
      <CardIconSlot
        avatar={entry.avatar}
        state={isDiscover ? 'none' : state}
        contributeUrl={entry.contributeUrl}
        variant={iconVariant}
      />
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
        {isDiscover && (
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
            endorsedSet={endorsedSet}
            onEndorse={onEndorse}
            onUnendorse={onUnendorse}
          />
        )}
      </div>
    </div>
  )
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
  const stewardLabel = funding?.pdsStewardHandle ?? funding?.pdsStewardUri
  const websiteUrl = (stewardLabel ? websiteFallbackForUri(stewardLabel) : undefined)
    ?? `https://${pdsHostname}`
  const displayName = stewardLabel ?? pdsHostname
  const contributeUrl = funding?.contributeUrl
  const initials = pdsHostname.slice(0, 2).toUpperCase()

  return (
    <li className={`px-4 py-3.5 transition-all duration-100 ${
      contributeUrl
        ? 'bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/50'
        : 'opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
    }`}>
      <div className="flex items-start gap-3">
        <a
          href={websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 transition-opacity hover:opacity-75"
          tabIndex={-1}
          aria-hidden
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {initials}
          </span>
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StewardNameHeading name={displayName} href={websiteUrl} linkVariant="support" />
            <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-400">
              home server
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {pdsHostname}
          </p>
        </div>

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
          <span className="w-11" aria-hidden />
        </div>
      </div>
    </li>
  )
}

/**
 * Unified steward card. Two card types:
 *   - Tool (NSID-linked): warm accent, title links to website
 *   - Account (everything else): blue accent, title links to Bluesky profile
 *
 * "Discover" is an account card with an empty-state banner for entries
 * whose source is unknown and have no confirmed capabilities.
 *
 * When `compact` is true, renders as a `<li>` row for list views.
 */
export function StewardCard({
  entry,
  allEntries = [],
  endorsed,
  endorsedSet,
  onEndorse,
  onUnendorse,
  compact = false,
}: {
  entry: StewardEntry
  allEntries?: StewardEntry[]
  endorsed?: boolean
  endorsedSet?: Set<string>
  onEndorse?: (uri: string) => void
  onUnendorse?: (uri: string) => void
  compact?: boolean
}) {
  const type = cardType(entry)

  const entryByUri = useMemo(
    () => new Map(allEntries.map((e) => [e.uri, e])),
    [allEntries],
  )
  const lookup = (uri: string) => entryByUri.get(uri)

  // Compute endorsed from endorsedSet when provided
  const isEndorsed = endorsed ?? (endorsedSet
    ? (endorsedSet.has(entry.uri) || endorsedSet.has(entry.did ?? ''))
    : false)

  // ── Compact row — used inside a divided <ul> container in give lists ───
  if (compact) {
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

  // ── Non-compact: article card using CardInner ─────────────────────────
  return (
    <article className={ARTICLE_CLASS[type]}>
      <CardInner
        entry={entry}
        type={type}
        allEntries={allEntries}
        lookup={lookup}
        endorsed={isEndorsed}
        onEndorse={onEndorse}
        onUnendorse={onUnendorse}
        endorsedSet={endorsedSet}
      />
    </article>
  )
}
