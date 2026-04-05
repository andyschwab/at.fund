'use client'

import { useState } from 'react'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'
import type { FundingManifest, FundingChannel, FundingPlan } from '@/lib/funding-manifest'
import { detectPlatform, PLATFORM_LABELS } from '@/lib/funding-manifest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NameLinkVariant = 'support' | 'discover' | 'sky' | 'network'
export type DropletIconState = 'direct' | 'dependency' | 'none'

// ---------------------------------------------------------------------------
// Tag badges
// ---------------------------------------------------------------------------

const TAG_LABEL: Partial<Record<StewardTag, string>> = {
  tool: 'tool',
  labeler: 'labeler',
  feed: 'feed',
  follow: 'follow',
  ecosystem: 'ecosystem',
  'pds-host': 'personal data server',
}

export function TagBadges({ tags }: { tags: StewardTag[] }) {
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

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** URI -> https fallback URL for hostname-shaped URIs (not DIDs). */
export function websiteFallbackForUri(uri: string): string | undefined {
  if (uri.startsWith('did:')) return undefined
  if (uri.includes('/') || uri.includes(':')) return undefined
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(uri)) return `https://${uri}`
  return undefined
}

/** Build a Bluesky profile URL from handle or DID. */
export function profileUrlFor(entry: { handle?: string; did?: string }): string | undefined {
  if (entry.handle) return `https://bsky.app/profile/${entry.handle}`
  if (entry.did) return `https://bsky.app/profile/${entry.did}`
  return undefined
}

// ---------------------------------------------------------------------------
// Droplet icon state
// ---------------------------------------------------------------------------

export function heartState(
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

export function depRowTier(
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

// ---------------------------------------------------------------------------
// StewardNameHeading
// ---------------------------------------------------------------------------

export function StewardNameHeading({
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

// ---------------------------------------------------------------------------
// HandleBadge
// ---------------------------------------------------------------------------

export function HandleBadge({ handle, did }: { handle?: string; did?: string }) {
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

// ---------------------------------------------------------------------------
// CapabilitiesSection
// ---------------------------------------------------------------------------

const CAP_ICON: Record<Capability['type'], string> = {
  feed: '📰',
  labeler: '🏷️',
  pds: '🖥️',
}

const CAP_LABEL: Record<Capability['type'], string> = {
  feed: 'Feed',
  labeler: 'Labeler',
  pds: 'Personal Data Server',
}

export function CapabilitiesSection({ capabilities }: { capabilities: Capability[] }) {
  if (capabilities.length === 0) return null
  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Provides
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {capabilities.map((cap) => (
          <div key={cap.uri ?? `${cap.type}:${cap.name}`} className="flex items-center gap-2 py-1.5">
            <span className="shrink-0 text-sm" aria-hidden>{CAP_ICON[cap.type]}</span>
            <div className="min-w-0 flex-1">
              {cap.type === 'pds' ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {CAP_LABEL.pds}
                  </span>
                  {cap.landingPage ? (
                    <a
                      href={cap.landingPage}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900 dark:text-slate-300 dark:decoration-slate-600 dark:hover:text-slate-100"
                    >
                      {cap.name}
                    </a>
                  ) : (
                    <span className="truncate text-xs text-slate-700 dark:text-slate-300">{cap.name}</span>
                  )}
                </span>
              ) : (
                <span className="truncate text-xs text-slate-700 dark:text-slate-300">
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
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FundingChannelsSection — renders funding.json channels and plans
// ---------------------------------------------------------------------------

/** Human-friendly label for a channel: detected platform name or description fallback. */
function channelLabel(ch: FundingChannel): string {
  const platform = detectPlatform(ch.address)
  if (platform) return PLATFORM_LABELS[platform]
  if (ch.description) return ch.description
  // Fall back to the hostname of the address if it's a URL
  try {
    return new URL(ch.address).hostname
  } catch {
    return ch.type === 'bank' ? 'Bank transfer' : 'Other'
  }
}

function formatAmount(amount: number, currency: string): string {
  if (amount === 0) return ''
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

function frequencyLabel(freq: FundingPlan['frequency']): string {
  switch (freq) {
    case 'one-time': return 'one-time'
    case 'weekly': return '/wk'
    case 'fortnightly': return '/2wk'
    case 'monthly': return '/mo'
    case 'yearly': return '/yr'
    default: return ''
  }
}

export function FundingChannelsSection({ manifest }: { manifest: FundingManifest }) {
  const [expanded, setExpanded] = useState(false)
  const { channels, plans } = manifest.funding
  const activePlans = plans.filter((p) => p.status === 'active' && p.amount > 0)

  // Only linkable channels (URLs)
  const linkableChannels = channels.filter((ch) => {
    try { new URL(ch.address); return true } catch { return false }
  })

  if (linkableChannels.length === 0 && activePlans.length === 0) return null

  return (
    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-left cursor-pointer"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          funding.json
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {linkableChannels.length} channel{linkableChannels.length !== 1 ? 's' : ''}
          {activePlans.length > 0 && ` · ${activePlans.length} plan${activePlans.length !== 1 ? 's' : ''}`}
        </span>
        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {linkableChannels.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Channels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {linkableChannels.map((ch) => (
                  <a
                    key={ch.guid}
                    href={ch.address}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                  >
                    {channelLabel(ch)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {activePlans.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Plans
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activePlans.map((plan) => {
                  const amt = formatAmount(plan.amount, plan.currency)
                  const freq = frequencyLabel(plan.frequency)
                  return (
                    <span
                      key={plan.guid}
                      title={plan.description ?? plan.name}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      <span className="font-medium">{plan.name}</span>
                      {amt && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {amt}{freq}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProfileAvatar — identity image linking to the entry's primary URL
// ---------------------------------------------------------------------------

export function ProfileAvatar({
  entry,
  href,
  size = 'md',
}: {
  entry: Pick<StewardEntry, 'displayName' | 'uri' | 'avatar'>
  href?: string
  size?: 'sm' | 'md'
}) {
  const [failed, setFailed] = useState(false)
  const initials = (entry.displayName ?? entry.uri).slice(0, 2).toUpperCase()
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'

  const img =
    entry.avatar && !failed ? (
      <img
        src={entry.avatar}
        alt=""
        onError={() => setFailed(true)}
        className={`${dim} rounded-xl object-cover`}
      />
    ) : (
      <span className={`flex ${dim} items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>
        {initials}
      </span>
    )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 transition-opacity hover:opacity-75"
        tabIndex={-1}
        aria-hidden
      >
        {img}
      </a>
    )
  }
  return <div className="shrink-0">{img}</div>
}

