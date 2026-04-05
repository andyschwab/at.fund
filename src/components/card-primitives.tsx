'use client'

import { useState } from 'react'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'

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

// Re-export entryPriority so card-dependencies can import from this module.
export { entryPriority } from '@/lib/entry-priority'

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

