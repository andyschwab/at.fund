'use client'

import { useState } from 'react'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'
import {
  BadgeCheck,
  BadgePlus,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NameLinkVariant = 'support' | 'discover' | 'sky' | 'network'
export type DropletIconState = 'direct' | 'dependency' | 'none'

/**
 * Visual variant for CardIconSlot. Maps 1:1 from our CardType:
 *   tool → 'support', account → 'network', discover → 'discover'
 */
export type CardVariant = 'support' | 'network' | 'discover'

// ---------------------------------------------------------------------------
// Tag badges
// ---------------------------------------------------------------------------

const TAG_LABEL: Partial<Record<StewardTag, string>> = {
  tool: 'tool',
  labeler: 'labeler',
  feed: 'feed',
  follow: 'follow',
  ecosystem: 'ecosystem',
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

export function CapabilitiesSection({ capabilities }: { capabilities: Capability[] }) {
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
// EndorseButton (pill-style, used in non-compact article cards)
// ---------------------------------------------------------------------------

export function EndorseButton({
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
      className={`group ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors ${
        endorsed
          ? 'text-[var(--support)] bg-[var(--support-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30'
          : 'text-slate-400 hover:text-[var(--support)] hover:bg-[var(--support-muted)] dark:text-slate-500 dark:hover:text-[var(--support)]'
      }`}
    >
      {endorsed ? (
        <>
          <BadgeCheck className="h-3.5 w-3.5 group-hover:hidden" strokeWidth={2} aria-hidden />
          <X className="hidden h-3.5 w-3.5 group-hover:block" strokeWidth={2} aria-hidden />
          <span className="group-hover:hidden">Endorsed</span>
          <span className="hidden group-hover:inline">Remove</span>
        </>
      ) : (
        <>
          <BadgePlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Endorse
        </>
      )}
    </button>
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

// ---------------------------------------------------------------------------
// CardIconSlot — avatar image (with contribute badge) or plain droplet icon
// ---------------------------------------------------------------------------

export function CardIconSlot({
  avatar,
  state,
  contributeUrl,
  variant,
  compact = false,
}: {
  avatar?: string
  state: DropletIconState
  contributeUrl?: string
  variant: CardVariant
  compact?: boolean
}) {
  const [avatarFailed, setAvatarFailed] = useState(false)
  const slot = compact ? 'h-9 w-9' : 'h-12 w-12'
  const icon = compact ? 'h-5 w-5' : 'h-7 w-7'
  const badgeSlot = compact ? 'h-4 w-4' : 'h-5 w-5'
  const badgeIcon = compact ? 'h-2.5 w-2.5' : 'h-3 w-3'

  const supportBadge = 'bg-[var(--support)] text-[var(--support-foreground)]'
  const networkBadge = 'bg-[var(--network)] text-white'

  if (avatar && !avatarFailed) {
    const badge =
      state === 'direct' && contributeUrl ? (
        <a
          href={contributeUrl}
          target="_blank"
          rel="noreferrer"
          title="Contribute"
          className={`absolute -bottom-1 -right-1 flex ${badgeSlot} items-center justify-center rounded-full shadow-sm transition-opacity hover:opacity-90 ${variant === 'network' ? networkBadge : supportBadge}`}
        >
          <DropletIcon className={badgeIcon} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Contribute</span>
        </a>
      ) : state === 'dependency' ? (
        <span
          className={`absolute -bottom-1 -right-1 flex ${badgeSlot} items-center justify-center rounded-full bg-amber-100 text-amber-500 shadow-sm dark:bg-amber-500/20 dark:text-amber-400`}
        >
          <DropletIcon className={badgeIcon} strokeWidth={1.75} aria-hidden />
        </span>
      ) : null

    return (
      <div className={`relative shrink-0 ${slot}`}>
        <img
          src={avatar}
          alt=""
          onError={() => setAvatarFailed(true)}
          className={`${slot} rounded-xl object-cover transition-opacity ${state !== 'direct' ? 'grayscale opacity-50' : ''}`}
        />
        {badge}
      </div>
    )
  }

  // No avatar — plain droplet icon slot
  if (variant === 'support' && state === 'direct' && contributeUrl) {
    return (
      <a
        href={contributeUrl}
        target="_blank"
        rel="noreferrer"
        title="Contribute"
        className={`flex shrink-0 ${slot} items-center justify-center rounded-xl bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90`}
      >
        <DropletIcon className={icon} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Contribute</span>
      </a>
    )
  }
  if (variant === 'support' && state === 'dependency') {
    return (
      <span
        className={`flex shrink-0 ${slot} items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400`}
        title="No contribution link — has sub-dependencies"
      >
        <DropletIcon className={icon} strokeWidth={1.75} aria-hidden />
      </span>
    )
  }
  if (variant === 'network' && contributeUrl) {
    return (
      <a
        href={contributeUrl}
        target="_blank"
        rel="noreferrer"
        title="Contribute"
        className={`flex shrink-0 ${slot} items-center justify-center rounded-xl bg-[var(--network)] text-white shadow-sm transition-opacity hover:opacity-90`}
      >
        <DropletIcon className={icon} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Contribute</span>
      </a>
    )
  }
  const emptyTitle = variant === 'discover' ? 'No contribution link yet' : 'No contribution link published'
  return (
    <span
      className={`flex shrink-0 ${slot} items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 text-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-600`}
      title={emptyTitle}
    >
      <DropletIcon className={icon} strokeWidth={1.5} aria-hidden />
    </span>
  )
}
