'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BadgeCheck,
  BadgePlus,
  Check,
  Copy,
  Pencil,
  Share2,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import {
  ProfileAvatar,
  TagBadges,
  CapabilitiesSection,
  FundingChannelsSection,
} from '@/components/card-primitives'
import { DependenciesSection } from '@/components/card-dependencies'
import { StackStream } from '@/components/StackStream'
import { SetupClient } from '@/components/SetupClient'
import type { SetupFormData } from '@/components/SetupClient'
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
// Unified profile card
// ---------------------------------------------------------------------------

function ProfileCard({
  entry,
  handle,
  viewMode,
  isEndorsed,
  onEndorse,
  onUnendorse,
  editing,
  onEditToggle,
  bskyShareUrl,
  copyLink,
  copied,
  allEntries,
  editForm,
}: {
  entry: StewardEntry
  handle: string
  viewMode: ViewMode
  isEndorsed: boolean
  onEndorse: () => void
  onUnendorse: () => void
  editing: boolean
  onEditToggle: () => void
  bskyShareUrl: string
  copyLink: () => void
  copied: boolean
  /** All known entries for dependency lookup (names, icons, funding state). */
  allEntries: StewardEntry[]
  /** When editing, the SetupClient form renders inside the card */
  editForm?: React.ReactNode
}) {
  const profileUrl = entry.landingPage ?? (entry.handle ? `https://bsky.app/profile/${entry.handle}` : undefined)

  return (
    <div className={`rounded-xl border bg-white shadow-sm dark:bg-slate-900/60 ${
      editing
        ? 'border-[var(--support-border)]'
        : 'border-slate-200 dark:border-slate-700'
    }`}>
      {/* Header row — avatar, name, actions */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <ProfileAvatar entry={entry} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lg font-semibold text-slate-900 transition-colors hover:text-[var(--support)] dark:text-slate-100"
                >
                  {entry.displayName}
                </a>
              ) : (
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {entry.displayName}
                </h1>
              )}
              <TagBadges tags={entry.tags} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">@{handle}</p>
            {entry.description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {entry.description}
              </p>
            )}
          </div>
        </div>

        {/* Actions — top-right, stable position */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* Fund */}
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
              title="No contribution link configured"
              className="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-slate-300 dark:text-slate-600"
            >
              <DropletIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              <span>Fund</span>
            </span>
          )}

          {/* Endorse — adapts by mode */}
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
              {isEndorsed ? (
                <BadgeCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
              ) : (
                <BadgePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              )}
              <span>{isEndorsed ? 'Endorsed' : 'Endorse'}</span>
            </button>
          )}
          {viewMode === 'public' && (
            <button
              type="button"
              onClick={() => {
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

          {/* Owner edit button — grayed out while editing */}
          {viewMode === 'owner' && (
            <button
              type="button"
              onClick={editing ? undefined : onEditToggle}
              disabled={editing}
              title={editing ? 'Currently editing' : 'Edit your funding profile'}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                editing
                  ? 'text-slate-300 cursor-default dark:text-slate-600'
                  : 'text-slate-400 cursor-pointer hover:text-[var(--support)] dark:text-slate-500 dark:hover:text-[var(--support)]'
              }`}
            >
              <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span>Edit</span>
            </button>
          )}

          {/* Share + copy */}
          <div className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-2 dark:border-slate-700">
            <a
              href={bskyShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Share on Bluesky"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#0085ff] dark:hover:bg-slate-800"
            >
              <Share2 className="h-4 w-4" aria-hidden />
            </a>
            <button
              type="button"
              onClick={copyLink}
              title="Copy link"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Detail sections — live from entry data (updates when editing) */}
      {!editing && (entry.capabilities?.length || entry.channels || entry.plans || entry.dependencies?.length) && (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {entry.capabilities && entry.capabilities.length > 0 && (
            <CapabilitiesSection capabilities={entry.capabilities} />
          )}
          {(entry.channels || entry.plans) && (
            <FundingChannelsSection channels={entry.channels} plans={entry.plans} />
          )}
          {entry.dependencies && entry.dependencies.length > 0 && (
            <DependenciesSection
              dependencies={entry.dependencies}
              allEntries={allEntries}
            />
          )}
        </div>
      )}

      {/* Inline edit form — renders inside the card when editing */}
      {editing && editForm && (
        <div className="border-t border-[var(--support-border)] px-4 py-4">
          {editForm}
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
  entry: serverEntry,
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

  // Live entry state — starts from server data, updates from SetupClient form
  const [formOverrides, setFormOverrides] = useState<SetupFormData | null>(null)

  const entry: StewardEntry | null = serverEntry
    ? formOverrides
      ? {
          ...serverEntry,
          contributeUrl: formOverrides.contributeUrl,
          dependencies: formOverrides.dependencies.length > 0 ? formOverrides.dependencies : undefined,
          channels: formOverrides.channels,
          plans: formOverrides.plans,
        }
      : serverEntry
    : null

  const entryUri = entry?.uri ?? handle
  const isEndorsed = endorsedUris.has(entryUri) || endorsedUris.has(did)

  const handleFormChange = useCallback((data: SetupFormData) => {
    setFormOverrides(data)
  }, [])

  const handleCancel = useCallback(() => {
    setEditing(false)
    setFormOverrides(null)
  }, [])

  // Resolve dependency entries on initial load so the card can show names/icons
  const [initialDeps, setInitialDeps] = useState<StewardEntry[]>([])
  const serverDepUris = serverEntry?.dependencies
  useEffect(() => {
    if (!serverDepUris?.length) return
    let cancelled = false
    Promise.allSettled(
      serverDepUris.map((uri) =>
        fetch(`/api/entry?uri=${encodeURIComponent(uri)}`)
          .then((r) => r.json())
          .then((data: { entry?: StewardEntry; referenced?: StewardEntry[] }) => {
            const entries: StewardEntry[] = []
            if (data.entry) entries.push(data.entry)
            if (data.referenced) entries.push(...data.referenced)
            return entries
          })
          .catch(() => [] as StewardEntry[]),
      ),
    ).then((results) => {
      if (!cancelled) {
        setInitialDeps(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
      }
    })
    return () => { cancelled = true }
  }, [serverDepUris])

  // Merge all known entries for dependency lookup
  const allEntries = useMemo(() => {
    const entries: StewardEntry[] = []
    if (entry) entries.push(entry)
    // Prefer form-resolved deps when editing, otherwise use initial deps
    const deps = formOverrides?.resolvedDeps ?? initialDeps
    entries.push(...deps)
    return entries
  }, [entry, formOverrides?.resolvedDeps, initialDeps])

  // The edit form rendered inside the card
  const editForm = viewMode === 'owner' && editing ? (
    <SetupClient
      did={did}
      handle={handle}
      existing={existing ?? null}
      initialEntry={serverEntry}
      onFormChange={handleFormChange}
      onCancel={handleCancel}
      embedded
    />
  ) : null

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">

        {/* Unified profile card */}
        {entry ? (
          <ProfileCard
            entry={entry}
            handle={handle}
            viewMode={viewMode}
            isEndorsed={isEndorsed}
            onEndorse={() => void endorse(entryUri)}
            onUnendorse={() => void unendorse(entryUri)}
            editing={editing}
            onEditToggle={() => setEditing(true)}
            bskyShareUrl={bskyShareUrl}
            copyLink={copyLink}
            copied={copied}
            allEntries={allEntries}
            editForm={editForm}
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
