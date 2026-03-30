'use client'

import { useState, useRef, useMemo } from 'react'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import type { DisclosureMeta } from '@/lib/fund-at-records'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import Link from 'next/link'
import {
  ArrowRight,
  AtSign,
  FileText,
  Globe,
  Heart,
  Mail,
  Megaphone,
  Scale,
  Cog,
  Shield,
  X,
} from 'lucide-react'

const TAG_LABEL: Partial<Record<StewardTag, string>> = {
  labeler: 'labeler',
  feed: 'feed',
  follow: 'follow',
}

function TagBadges({ tags }: { tags: StewardTag[] }) {
  const shown = tags.filter((t) => TAG_LABEL[t])
  if (shown.length === 0) return null
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[10px] font-medium leading-4 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500"
        >
          {TAG_LABEL[t]}
        </span>
      ))}
    </div>
  )
}

function disclosureMetaFromEntry(e: StewardEntry): DisclosureMeta {
  return {
    displayName: e.displayName,
    description: e.description,
    landingPage: e.landingPage,
    contactGeneralUrl: e.contactGeneralUrl,
    contactGeneralHandle: e.contactGeneralHandle,
    contactGeneralEmail: e.contactGeneralEmail,
    contactPressUrl: e.contactPressUrl,
    contactPressEmail: e.contactPressEmail,
    securityPolicyUri: e.securityPolicyUri,
    securityContactUri: e.securityContactUri,
    securityContactEmail: e.securityContactEmail,
    legalEntityName: e.legalEntityName,
    jurisdiction: e.jurisdiction,
    privacyPolicyUri: e.privacyPolicyUri,
    termsOfServiceUri: e.termsOfServiceUri,
    donorTermsUri: e.donorTermsUri,
    taxDisclosureUri: e.taxDisclosureUri,
    softwareLicenseUri: e.softwareLicenseUri,
  }
}

/** URI → https fallback URL for hostname-shaped URIs (not DIDs). */
function websiteFallbackForUri(uri: string): string | undefined {
  if (uri.startsWith('did:')) return undefined
  if (uri.includes('/') || uri.includes(':')) return undefined
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(uri)) return `https://${uri}`
  return undefined
}

/** Fixed disclosure "report card" slots (fund.at.disclosure), aligned with lexicon. */
type DisclosureSlot = {
  key: string
  label: string
  href: string | undefined
  Icon: typeof Globe
}

/** Public profile URL for an Atmosphere handle (Bluesky Social is the reference app). */
function atmosphereProfileHref(handle: string | undefined): string | undefined {
  if (!handle) return undefined
  const h = handle.trim().replace(/^@/, '')
  if (!h) return undefined
  return `https://bsky.app/profile/${encodeURIComponent(h)}`
}

function buildDisclosureSlots(
  disclosure: DisclosureMeta | undefined,
  websiteFallback: string | undefined,
): DisclosureSlot[] {
  const d = disclosure
  const website = d?.landingPage ?? websiteFallback
  const atmosphereHref = atmosphereProfileHref(d?.contactGeneralHandle)
  const contactHref =
    d?.contactGeneralUrl ??
    (d?.contactGeneralEmail
      ? `mailto:${d.contactGeneralEmail}`
      : undefined)
  const pressHref =
    d?.contactPressUrl ??
    (d?.contactPressEmail ? `mailto:${d.contactPressEmail}` : undefined)
  const securityHref = d?.securityPolicyUri ?? d?.securityContactUri

  return [
    { key: 'website', label: 'Website', Icon: Globe, href: website },
    {
      key: 'handle',
      label: 'Atmosphere handle',
      Icon: AtSign,
      href: atmosphereHref,
    },
    { key: 'contact', label: 'Contact', Icon: Mail, href: contactHref },
    { key: 'press', label: 'Press', Icon: Megaphone, href: pressHref },
    { key: 'security', label: 'Security', Icon: Shield, href: securityHref },
    {
      key: 'privacy',
      label: 'Privacy policy',
      Icon: Scale,
      href: d?.privacyPolicyUri,
    },
    {
      key: 'terms',
      label: 'Terms of service',
      Icon: FileText,
      href: d?.termsOfServiceUri,
    },
    {
      key: 'donor',
      label: 'Donor terms',
      Icon: FileText,
      href: d?.donorTermsUri,
    },
    {
      key: 'tax',
      label: 'Tax disclosure',
      Icon: Scale,
      href: d?.taxDisclosureUri,
    },
    {
      key: 'license',
      label: 'Software license',
      Icon: FileText,
      href: d?.softwareLicenseUri,
    },
  ]
}

function StewardNameHeading({
  name,
  websiteUrl,
  linkVariant,
}: {
  name: string
  websiteUrl?: string
  linkVariant: 'support' | 'discover' | 'sky' | 'network'
}) {
  const base =
    'min-w-0 flex-1 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100'
  if (!websiteUrl) {
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
    <h3 className="min-w-0 flex-1">
      <a
        href={websiteUrl}
        target="_blank"
        rel="noreferrer"
        className={`block truncate rounded-sm underline decoration-slate-300 decoration-1 underline-offset-2 transition-colors dark:decoration-slate-600 ${base} ${hover}`}
      >
        {name}
      </a>
    </h3>
  )
}

function DisclosureReportRow({ slots }: { slots: DisclosureSlot[] }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {slots.map((slot) => {
        const Icon = slot.Icon
        const active = !!slot.href
        if (!active) {
          return (
            <span
              key={slot.key}
              title={`Not published: ${slot.label}`}
              className="rounded-md p-1.5 text-slate-300 dark:text-slate-600"
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              <span className="sr-only">Not published: {slot.label}</span>
            </span>
          )
        }
        return (
          <a
            key={slot.key}
            href={slot.href}
            target="_blank"
            rel="noreferrer"
            title={slot.label}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="sr-only">{slot.label}</span>
          </a>
        )
      })}
    </div>
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

type HeartState = 'direct' | 'dependency' | 'none'

/**
 * 'dependency' only fires when at least one listed dep resolves to an entry
 * with a contribution link — so we never imply actionability we can't back up.
 */
function heartState(
  links: import('@/lib/fund-at-records').FundLink[] | undefined,
  dependencies: string[] | undefined,
  lookup?: (uri: string) => StewardEntry | undefined,
): HeartState {
  if (links?.[0]) return 'direct'
  if (dependencies?.length && lookup) {
    if (dependencies.some((uri) => !!(lookup(uri)?.links?.[0]))) return 'dependency'
  }
  return 'none'
}

function depRowTier(
  e: StewardEntry | undefined,
  lookup?: (uri: string) => StewardEntry | undefined,
): number {
  if (!e) return 2
  if (e.links?.[0]) return 0
  if (
    e.dependencies?.length &&
    lookup &&
    e.dependencies.some((uri) => !!(lookup(uri)?.links?.[0]))
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
  state: HeartState
  onExpand: () => void
}) {
  const contributeLink = entry?.links?.[0]
  const name = entry?.displayName ?? depUri
  const websiteUrl = entry?.landingPage ?? websiteFallbackForUri(depUri)

  return (
    <div className="flex items-center gap-2 py-1.5">
      {state === 'direct' ? (
        <a
          href={contributeLink!.url}
          target="_blank"
          rel="noreferrer"
          title={contributeLink!.label}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
          onClick={(e) => e.stopPropagation()}
        >
          <Heart className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
          <span className="sr-only">{contributeLink!.label}</span>
        </a>
      ) : state === 'dependency' ? (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
          title="No contribution link — has sub-dependencies"
        >
          <Heart className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
        </span>
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
          title="No contribution link published"
        >
          <Heart className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
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

/** Card content rendered inside the modal — same layout as the main card but without the outer article shell. */
function ModalCardContent({
  entry,
  onExpandDep,
  lookup,
}: {
  entry: StewardEntry
  onExpandDep: (uri: string) => void
  lookup?: (uri: string) => StewardEntry | undefined
}) {
  const contributeLink = entry.links?.[0]
  const state = heartState(entry.links, entry.dependencies, lookup)
  const websiteFallback = websiteFallbackForUri(entry.uri)
  const disclosure = disclosureMetaFromEntry(entry)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const disclosureSlots = buildDisclosureSlots(disclosure, websiteFallback)

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {state === 'direct' ? (
            <a
              href={contributeLink!.url}
              target="_blank"
              rel="noreferrer"
              title={contributeLink!.label}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Heart className="h-8 w-8 fill-current" strokeWidth={0} aria-hidden />
              <span className="sr-only">{contributeLink!.label}</span>
            </a>
          ) : state === 'dependency' ? (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
              title="No contribution link — has sub-dependencies"
            >
              <Heart className="h-8 w-8 fill-current" strokeWidth={0} aria-hidden />
            </span>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
              title="No contribution link published"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <StewardNameHeading
              name={entry.displayName}
              websiteUrl={websiteUrl}
              linkVariant="support"
            />
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
          </div>
          {entry.description && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {entry.description}
            </p>
          )}
        </div>
      </div>

      {entry.dependencies && entry.dependencies.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
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
                  state={heartState(depEntry?.links, depEntry?.dependencies, lookup)}
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

  const sortedDependencies = useMemo(
    () =>
      [...dependencies].sort(
        (a, b) => depRowTier(entryByUri.get(a), lookup) - depRowTier(entryByUri.get(b), lookup),
      ),
    [dependencies, entryByUri],
  )

  async function openDep(uri: string) {
    setModal({ uri, entry: null, loading: true, error: null })
    if (!dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
    try {
      const res = await fetch(`/api/steward?uri=${encodeURIComponent(uri)}`)
      const data = await res.json() as StewardEntry | { error: string }
      if (!res.ok) throw new Error('error' in data ? data.error : 'Failed to load')
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
          {sortedDependencies.map((depUri) => {
            const depEntry = entryByUri.get(depUri)
            return (
              <DependencyRow
                key={depUri}
                depUri={depUri}
                entry={depEntry}
                state={heartState(depEntry?.links, depEntry?.dependencies, lookup)}
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
            className="ml-3 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="p-5">
          {modal?.loading && (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          )}
          {modal?.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{modal.error}</p>
          )}
          {modal?.entry && (
            <ModalCardContent entry={modal.entry} onExpandDep={openDep} lookup={lookup} />
          )}
        </div>
      </dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Card visual variant helpers
// ---------------------------------------------------------------------------

type CardVariant = 'support' | 'network' | 'discover'

function cardVariant(entry: StewardEntry): CardVariant {
  if (entry.source === 'unknown') return 'discover'
  const hasPrimaryTag = entry.tags.some(
    (t) => t === 'tool' || t === 'labeler' || t === 'feed',
  )
  if (!hasPrimaryTag && entry.tags.includes('follow')) return 'network'
  return 'support'
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
  const disclosure = funding?.disclosure
  const pdsStewardLabel = funding?.pdsStewardHandle ?? funding?.pdsStewardUri
  const stewardWebsiteFallback = funding?.pdsStewardUri
    ? websiteFallbackForUri(funding.pdsStewardUri)
    : undefined
  const title =
    disclosure?.displayName ??
    (pdsStewardLabel
      ? `Your host steward (${pdsStewardLabel})`
      : `Your host (${pdsHostname})`)
  const contributeLink = funding?.links?.[0]
  const websiteFallback = stewardWebsiteFallback ?? `https://${pdsHostname}`
  const summary =
    disclosure?.description ??
    (pdsStewardLabel
      ? `Your account's home server (${pdsHostname}), operated by ${pdsStewardLabel}.`
      : `Your account's home server (${pdsHostname}) — support options if published.`)

  const disclosureSlots = buildDisclosureSlots(disclosure, websiteFallback)
  const websiteUrl = disclosure?.landingPage ?? websiteFallback

  return (
    <article className="rounded-xl border border-slate-200/90 border-l-4 border-l-sky-400/90 bg-gradient-to-br from-sky-50/90 to-white p-4 shadow-sm dark:border-slate-800 dark:from-sky-950/40 dark:to-slate-950">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {contributeLink ? (
            <a
              href={contributeLink.url}
              target="_blank"
              rel="noreferrer"
              title={contributeLink.label}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-sky-600"
            >
              <Heart
                className="h-8 w-8 fill-current"
                strokeWidth={0}
                aria-hidden
              />
              <span className="sr-only">{contributeLink.label}</span>
            </a>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
              title="No contribution link published"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <StewardNameHeading
              name={title}
              websiteUrl={websiteUrl}
              linkVariant="sky"
            />
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
            <Link
              href="/maintainers"
              className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Maintainers"
              aria-label="Maintainers"
            >
              <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
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
 * Unified steward card. Renders as one of three visual variants based on the
 * entry's tags and source:
 *   - 'support' (tool/labeler/feed): warm contribution-focused style
 *   - 'network' (follow-only):       network/teal style
 *   - 'discover' (unknown):          amber discovery style
 *
 * When an entry carries both a primary tag (tool/labeler/feed) and a follow
 * tag, the support variant is used and a Bluesky profile link is shown.
 */
export function StewardCard({
  entry,
  allEntries = [],
}: {
  entry: StewardEntry
  allEntries?: StewardEntry[]
}) {
  const variant = cardVariant(entry)
  const isFollow = entry.tags.includes('follow')
  const contributeLink = entry.links?.[0]

  const entryByUri = useMemo(
    () => new Map(allEntries.map((e) => [e.uri, e])),
    [allEntries],
  )
  const lookup = (uri: string) => entryByUri.get(uri)
  const state = heartState(entry.links, entry.dependencies, lookup)

  const websiteFallback = websiteFallbackForUri(entry.uri)
  const disclosure = disclosureMetaFromEntry(entry)
  const websiteUrl = entry.landingPage ?? websiteFallback
  const disclosureSlots = buildDisclosureSlots(disclosure, websiteFallback)

  // Profile URL for follow-tagged entries
  const profileUrl = entry.handle
    ? `https://bsky.app/profile/${encodeURIComponent(entry.handle)}`
    : entry.did
      ? `https://bsky.app/profile/${encodeURIComponent(entry.did)}`
      : undefined

  if (variant === 'discover') {
    return (
      <article className="relative overflow-hidden rounded-xl border border-dashed border-[var(--discover-border)] bg-[var(--discover-muted)] p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-[var(--discover)] before:content-[''] dark:border-amber-500/35 dark:bg-amber-500/[0.07]">
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
              title="No contribution link yet"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <StewardNameHeading
                name={entry.displayName}
                websiteUrl={websiteUrl}
                linkVariant="discover"
              />
              <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
                <DisclosureReportRow slots={disclosureSlots} />
              </div>
              <Link
                href="/maintainers"
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="Maintainers"
                aria-label="Maintainers"
              >
                <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
              </Link>
            </div>
            <TagBadges tags={entry.tags} />
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Your account has saved something from this service—we don&apos;t have
              details about it yet.{' '}
              <Link
                href="/maintainers"
                className="font-medium text-[var(--discover)] underline underline-offset-2 dark:text-amber-400"
              >
                How projects get listed
              </Link>
            </p>
          </div>
        </div>
      </article>
    )
  }

  if (variant === 'network') {
    return (
      <article className="rounded-xl border border-slate-200/90 border-l-4 border-l-[var(--network-border)] bg-gradient-to-br from-[var(--network-muted)] to-white p-4 shadow-sm dark:border-slate-800 dark:from-[var(--network-muted)] dark:to-slate-950">
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            {contributeLink ? (
              <a
                href={contributeLink.url}
                target="_blank"
                rel="noreferrer"
                title={contributeLink.label}
                className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--network)] text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <Heart className="h-8 w-8 fill-current" strokeWidth={0} aria-hidden />
                <span className="sr-only">{contributeLink.label}</span>
              </a>
            ) : (
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
                title="No contribution link published"
              >
                <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <h3 className="min-w-0 flex-1">
                {profileUrl ? (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate rounded-sm text-base font-semibold tracking-tight text-slate-900 underline decoration-slate-300 decoration-1 underline-offset-2 transition-colors hover:text-[var(--network)] hover:decoration-[var(--network-border)] dark:text-slate-100 dark:decoration-slate-600"
                  >
                    {entry.displayName}
                  </a>
                ) : (
                  <span className="block truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {entry.displayName}
                  </span>
                )}
              </h3>
              {entry.handle && (
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  @{entry.handle}
                </span>
              )}
            </div>
            <TagBadges tags={entry.tags} />
            {entry.description && (
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {entry.description}
              </p>
            )}
          </div>
        </div>
      </article>
    )
  }

  // variant === 'support'
  return (
    <article className="rounded-xl border border-slate-200/90 border-l-4 border-l-[var(--support-border)] bg-gradient-to-br from-[var(--support-muted)] to-white p-4 shadow-sm dark:border-slate-800 dark:from-[var(--support-muted)] dark:to-slate-950">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {state === 'direct' ? (
            <a
              href={contributeLink!.url}
              target="_blank"
              rel="noreferrer"
              title={contributeLink!.label}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Heart className="h-8 w-8 fill-current" strokeWidth={0} aria-hidden />
              <span className="sr-only">{contributeLink!.label}</span>
            </a>
          ) : state === 'dependency' ? (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
              title="No contribution link — has sub-dependencies"
            >
              <Heart className="h-8 w-8 fill-current" strokeWidth={0} aria-hidden />
            </span>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600"
              title="No contribution link published"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <StewardNameHeading
              name={entry.displayName}
              websiteUrl={websiteUrl}
              linkVariant="support"
            />
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
            {/* Show Bluesky profile link for entries that are also a follow */}
            {isFollow && profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                title={`@${entry.handle ?? entry.did} on Bluesky`}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <AtSign className="h-5 w-5" strokeWidth={2} aria-hidden />
                <span className="sr-only">Bluesky profile</span>
              </a>
            )}
            <Link
              href="/maintainers"
              className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Maintainers"
              aria-label="Maintainers"
            >
              <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
          <TagBadges tags={entry.tags} />
          {entry.description && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {entry.description}
            </p>
          )}
          {entry.dependencies && entry.dependencies.length > 0 && (
            <DependenciesSection
              dependencies={entry.dependencies}
              allEntries={allEntries}
            />
          )}
        </div>
      </div>
    </article>
  )
}
