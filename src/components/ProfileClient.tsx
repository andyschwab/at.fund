'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { HandleAutocomplete } from '@/components/HandleAutocomplete'
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
// Endorse by handle
// ---------------------------------------------------------------------------

function EndorseByHandle({ onEndorse }: { onEndorse: (uri: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/20">
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
        Endorse a project by searching for their handle.
      </p>
      <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
        <HandleAutocomplete
          value={value}
          onChange={setValue}
          placeholder="Search by handle…"
          inputClassName="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          onClick={() => {
            const handle = value.trim()
            if (handle) {
              onEndorse(handle)
              setValue('')
            }
          }}
          disabled={!value.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <BadgePlus className="h-4 w-4" aria-hidden />
          Endorse
        </button>
      </div>
    </div>
  )
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
  endorsedSet,
  onEndorseUri,
  onUnendorseUri,
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
  /** Endorse/unendorse the profile entry itself. */
  onEndorse: () => void
  onUnendorse: () => void
  /** Endorsement state and handlers for sub-entries (deps, modals). */
  endorsedSet?: Set<string>
  onEndorseUri?: (uri: string) => void
  onUnendorseUri?: (uri: string) => void
  editing: boolean
  onEditToggle: () => void
  bskyShareUrl: string
  copyLink: () => void
  copied: boolean
  allEntries: StewardEntry[]
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
              endorsedSet={endorsedSet}
              onEndorse={onEndorseUri}
              onUnendorse={onUnendorseUri}
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
    viewMode !== 'public' ? initialEndorsedUris : [],
  )

  const { bskyShareUrl, copyLink, copied } = useShareActions(handle, viewMode === 'owner')

  // Shared entry store — populated by StackStream as it resolves endorsed entries + deps
  const [streamEntries, setStreamEntries] = useState<StewardEntry[]>([])
  const handleStreamEntries = useCallback((entries: StewardEntry[]) => {
    setStreamEntries(entries)
  }, [])

  // Committed entry — starts from server data, updated after successful publish
  const [baseEntry, setBaseEntry] = useState<StewardEntry | null>(serverEntry)

  // Live entry state — overlays form edits on top of baseEntry
  const [formOverrides, setFormOverrides] = useState<SetupFormData | null>(null)

  const entry: StewardEntry | null = baseEntry
    ? formOverrides
      ? {
          ...baseEntry,
          contributeUrl: formOverrides.contributeUrl,
          dependencies: formOverrides.dependencies.length > 0 ? formOverrides.dependencies : undefined,
          channels: formOverrides.channels,
          plans: formOverrides.plans,
        }
      : baseEntry
    : null

  const entryUri = entry?.uri ?? handle
  const isEndorsed = endorsedUris.has(entryUri) || endorsedUris.has(did)

  // Merge all known entries: server entry + stream-resolved + form-resolved
  const allEntries = useMemo(() => {
    const entries: StewardEntry[] = []
    if (entry) entries.push(entry)
    entries.push(...streamEntries)
    if (formOverrides?.resolvedDeps) entries.push(...formOverrides.resolvedDeps)
    return entries
  }, [entry, streamEntries, formOverrides?.resolvedDeps])

  const handleFormChange = useCallback((data: SetupFormData) => {
    setFormOverrides(data)
  }, [])

  const handleSaved = useCallback((data: SetupFormData) => {
    // Commit the published data as the new baseline
    if (baseEntry) {
      setBaseEntry({
        ...baseEntry,
        contributeUrl: data.contributeUrl,
        dependencies: data.dependencies.length > 0 ? data.dependencies : undefined,
        channels: data.channels,
        plans: data.plans,
      })
    }
    setFormOverrides(null)
    setEditing(false)
  }, [baseEntry])

  const handleCancel = useCallback(() => {
    setEditing(false)
    setFormOverrides(null)
  }, [])

  // The edit form rendered inside the card
  const editForm = viewMode === 'owner' && editing ? (
    <SetupClient
      did={did}
      handle={handle}
      existing={existing ?? null}
      initialEntry={serverEntry}
      onFormChange={handleFormChange}
      onSaved={handleSaved}
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
            endorsedSet={hasSession ? endorsedUris : undefined}
            onEndorseUri={hasSession ? (uri: string) => void endorse(uri) : undefined}
            onUnendorseUri={hasSession ? (uri: string) => void unendorse(uri) : undefined}
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
          <StackStream
            handle={handle}
            onAllEntriesChange={handleStreamEntries}
            endorsedSet={hasSession ? endorsedUris : undefined}
            onEndorse={hasSession ? (uri: string) => void endorse(uri) : undefined}
            onUnendorse={hasSession ? (uri: string) => void unendorse(uri) : undefined}
          />

          {/* Endorse by handle — logged-in users can add endorsements */}
          {hasSession && <EndorseByHandle onEndorse={(uri) => void endorse(uri)} />}
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
