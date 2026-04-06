'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BadgePlus,
  Check,
  Copy,
  Pencil,
  Share2,
  X,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import {
  ProfileAvatar,
  HandleBadge,
  TagBadges,
  CapabilitiesSection,
  FundingChannelsSection,
} from '@/components/card-primitives'
import { DependenciesSection } from '@/components/card-dependencies'
import { StackStream } from '@/components/StackStream'
import { SetupClient } from '@/components/SetupClient'
import { useSession } from '@/components/SessionContext'
import { useEndorsement } from '@/hooks/useEndorsement'
import type { StewardEntry } from '@/lib/steward-model'
import type { FundAtResult } from '@/lib/fund-at-records'

type ViewMode = 'public' | 'viewer' | 'owner'

type ProfileClientProps = {
  viewMode: ViewMode
  entry: StewardEntry | null
  endorsedUris: string[]
  handle: string
  did: string
  existing?: FundAtResult | null
  initialEdit?: boolean
}

// ---------------------------------------------------------------------------
// Share helpers
// ---------------------------------------------------------------------------

function useShareActions(handle: string, isOwner: boolean) {
  const [copied, setCopied] = useState(false)
  const profileUrl = `https://at.fund/${handle}`

  const shareText = isOwner
    ? `Support the tools I build on the Atmosphere\n${profileUrl}`
    : `Check out @${handle} on at.fund\n${profileUrl}`

  const bskyShareUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`

  function copyLink() {
    void navigator.clipboard.writeText(profileUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return { bskyShareUrl, copyLink, copied }
}

// ---------------------------------------------------------------------------
// Profile header
// ---------------------------------------------------------------------------

function ProfileHeader({
  entry,
  handle,
  bskyShareUrl,
  copyLink,
  copied,
}: {
  entry: StewardEntry | null
  handle: string
  bskyShareUrl: string
  copyLink: () => void
  copied: boolean
}) {
  const displayName = entry?.displayName ?? handle
  const description = entry?.description

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-4">
        {entry ? (
          <ProfileAvatar entry={entry} size="md" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="text-sm font-semibold">{handle.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {displayName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">@{handle}</p>
          {description && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>

      {/* Page-level actions — always visible, stable position */}
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={bskyShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0085ff] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Funding card (profile-page variant of StewardCard)
// ---------------------------------------------------------------------------

function FundingCard({
  entry,
  viewMode,
  isEndorsed,
  onEndorse,
  onUnendorse,
  onEditToggle,
  editing,
}: {
  entry: StewardEntry
  viewMode: ViewMode
  isEndorsed: boolean
  onEndorse: () => void
  onUnendorse: () => void
  onEditToggle: () => void
  editing: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-1">
        {/* Fund button */}
        {entry.contributeUrl ? (
          <a
            href={entry.contributeUrl}
            target="_blank"
            rel="noreferrer"
            title="Opens their contribution page"
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium text-[var(--support)] transition-opacity hover:opacity-75"
          >
            <DropletIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span>Fund</span>
          </a>
        ) : (
          <span
            title="This account hasn't configured a contribution link yet"
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-slate-300 dark:text-slate-600"
          >
            <DropletIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span>Fund</span>
          </span>
        )}

        {/* Endorse button — adapts by mode */}
        {viewMode === 'viewer' && (
          <button
            type="button"
            onClick={isEndorsed ? onUnendorse : onEndorse}
            title={isEndorsed ? 'Remove endorsement' : 'Endorse this builder'}
            className={`group flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
              isEndorsed
                ? 'text-[var(--support)] hover:text-red-600 dark:hover:text-red-400'
                : 'text-slate-400 hover:text-[var(--support)] dark:text-slate-500 dark:hover:text-[var(--support)]'
            }`}
          >
            <BadgePlus className="h-5 w-5" strokeWidth={isEndorsed ? 2 : 1.75} aria-hidden />
            <span>{isEndorsed ? 'Endorsed' : 'Endorse'}</span>
          </button>
        )}
        {viewMode === 'public' && (
          <button
            type="button"
            onClick={() => {
              // Open the login modal
              const dialog = document.querySelector<HTMLDialogElement>('dialog')
              dialog?.showModal()
            }}
            title="Sign in to endorse"
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-300 cursor-pointer transition-colors hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
          >
            <BadgePlus className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span>Endorse</span>
          </button>
        )}

        {/* Owner edit toggle */}
        {viewMode === 'owner' && (
          <button
            type="button"
            onClick={onEditToggle}
            title={editing ? 'Close editor' : 'Edit your funding profile'}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
              editing
                ? 'text-[var(--support)]'
                : 'text-slate-400 hover:text-[var(--support)] dark:text-slate-500 dark:hover:text-[var(--support)]'
            }`}
          >
            {editing ? (
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            ) : (
              <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            )}
            <span>{editing ? 'Close' : 'Edit'}</span>
          </button>
        )}
      </div>

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <TagBadges tags={entry.tags} />
        </div>
      )}

      {/* Capabilities */}
      {entry.capabilities && entry.capabilities.length > 0 && (
        <div className="mt-3">
          <CapabilitiesSection capabilities={entry.capabilities} />
        </div>
      )}

      {/* Funding channels */}
      {(entry.channels || entry.plans) && (
        <div className="mt-3">
          <FundingChannelsSection channels={entry.channels} plans={entry.plans} />
        </div>
      )}

      {/* Dependencies */}
      {entry.dependencies && entry.dependencies.length > 0 && (
        <div className="mt-3">
          <DependenciesSection
            dependencies={entry.dependencies}
            allEntries={[entry]}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ProfileClient
// ---------------------------------------------------------------------------

export function ProfileClient({
  viewMode,
  entry,
  endorsedUris: initialEndorsedUris,
  handle,
  did,
  existing,
  initialEdit = false,
}: ProfileClientProps) {
  const { hasSession } = useSession()
  const [editing, setEditing] = useState(initialEdit)
  const { endorsedUris, endorse, unendorse } = useEndorsement(
    viewMode === 'viewer' ? initialEndorsedUris : [],
  )

  const { bskyShareUrl, copyLink, copied } = useShareActions(handle, viewMode === 'owner')

  const entryUri = entry?.uri ?? handle
  const isEndorsed = endorsedUris.has(entryUri) || endorsedUris.has(did)

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">

        {/* Header */}
        <ProfileHeader
          entry={entry}
          handle={handle}
          bskyShareUrl={bskyShareUrl}
          copyLink={copyLink}
          copied={copied}
        />

        {/* Funding card */}
        {entry ? (
          <FundingCard
            entry={entry}
            viewMode={viewMode}
            isEndorsed={isEndorsed}
            onEndorse={() => void endorse(entryUri)}
            onUnendorse={() => void unendorse(entryUri)}
            onEditToggle={() => setEditing((prev) => !prev)}
            editing={editing}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white/60 p-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {viewMode === 'owner'
                ? 'You haven\'t set up your funding profile yet.'
                : 'This account hasn\'t set up funding yet.'}
            </p>
            {viewMode === 'owner' && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--support)] px-4 py-2 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Set up your profile
              </button>
            )}
          </div>
        )}

        {/* Owner inline edit section */}
        {viewMode === 'owner' && editing && (
          <div className="rounded-xl border border-[var(--support-border)] bg-white p-1 shadow-sm dark:bg-slate-900/60">
            <SetupClient did={did} handle={handle} existing={existing ?? null} />
          </div>
        )}

        {/* Endorsements section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Endorsed projects
            </h2>
            {viewMode === 'owner' && hasSession && (
              <Link
                href="/give"
                className="text-sm font-medium text-[var(--support)] transition-opacity hover:opacity-80"
              >
                Discover builders to fund →
              </Link>
            )}
          </div>
          <StackStream handle={handle} />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          Endorsements are public ATProto records.{' '}
          <Link href="/" className="underline hover:text-slate-600 dark:hover:text-slate-400">
            Discover your own at at.fund
          </Link>
        </p>

      </div>
    </div>
  )
}
