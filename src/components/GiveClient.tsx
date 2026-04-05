'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { EndorsementCounts } from '@/lib/pipeline/scan-stream'
import type { StewardEntry } from '@/lib/steward-model'
import { entryPriority } from '@/lib/entry-priority'
import { pdslsRepoUrl } from '@/lib/pdsls'
import { useSession } from '@/components/SessionContext'
import { useScanStream } from '@/hooks/useScanStream'
import { StewardCard } from '@/components/ProjectCards'
import { CardErrorBoundary } from '@/components/CardErrorBoundary'
import { HandleAutocomplete } from '@/components/HandleAutocomplete'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BadgePlus,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TagFilter = 'all' | 'tool' | 'labeler' | 'feed' | 'follow'

const TAG_FILTER_LABELS: { tag: TagFilter; label: string }[] = [
  { tag: 'tool', label: 'Tools' },
  { tag: 'labeler', label: 'Labelers' },
  { tag: 'feed', label: 'Feeds' },
  { tag: 'follow', label: 'Network' },
]

function isEndorsed(e: StewardEntry, uris: Set<string>): boolean {
  return uris.has(e.uri) || uris.has(e.did ?? '')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GiveClient() {
  const { did: sessionDid, authFetch } = useSession()

  const {
    meta, entries, warnings, endorsedUris, endorsementCounts,
    loading, scanDone, scanStatus, error,
    entryIndexRef, setEntries, setEndorsedUris,
    runScan,
  } = useScanStream()

  const [selfReport, setSelfReport] = useState('')
  const [hasOwnRecords, setHasOwnRecords] = useState<boolean | null>(null)
  const [activeTag, setActiveTag] = useState<TagFilter>('all')
  const [activeTab, setActiveTab] = useState<'discover' | 'ecosystem'>('discover')

  // Check whether the logged-in user has published fund.at records
  useState(() => {
    if (!sessionDid) return
    fetch(`/api/entry?uri=${encodeURIComponent(sessionDid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setHasOwnRecords(!!data?.contributeUrl || !!(data?.dependencies?.length)))
      .catch(() => setHasOwnRecords(false))
  })

  // ── Derived state ─────────────────────────────────────────────────────

  const pdsEntries = useMemo(
    () => entries.filter((e) => e.tags.includes('pds-host')),
    [entries],
  )

  const isEcosystemOnly = (e: StewardEntry) =>
    e.tags.includes('ecosystem') && !e.tags.some((t) => t === 'tool' || t === 'labeler' || t === 'feed' || t === 'follow')

  const visibleEntries = useMemo(() => {
    const lookup = (uri: string) => entries.find((e) => e.uri === uri)
    const included = entries.filter(
      (e) =>
        !e.tags.includes('pds-host') &&
        !isEcosystemOnly(e) &&
        (e.tags.some((t) => t === 'tool' || t === 'labeler' || t === 'feed') ||
          (e.tags.includes('follow') && !!e.contributeUrl)),
    )
    return included.sort((a, b) => {
      const diff = entryPriority(a, lookup) - entryPriority(b, lookup)
      return diff !== 0 ? diff : a.uri.localeCompare(b.uri)
    })
  }, [entries])

  const endorsedEntries = useMemo(
    () => visibleEntries.filter((e) => isEndorsed(e, endorsedUris)),
    [visibleEntries, endorsedUris],
  )
  const discoveredEntries = useMemo(
    () => visibleEntries.filter((e) => !isEndorsed(e, endorsedUris)),
    [visibleEntries, endorsedUris],
  )

  const filteredEntries = useMemo(() => {
    if (activeTag === 'all') return discoveredEntries
    return discoveredEntries.filter((e) => e.tags.includes(activeTag))
  }, [discoveredEntries, activeTag])

  const tagCounts = useMemo(() => {
    const counts: Partial<Record<TagFilter, number>> = {}
    for (const e of discoveredEntries) {
      for (const t of e.tags) {
        if (t === 'tool' || t === 'labeler' || t === 'feed' || t === 'follow') {
          counts[t] = (counts[t] ?? 0) + 1
        }
      }
    }
    return counts
  }, [discoveredEntries])

  const lookupCounts = useCallback((entry: StewardEntry): EndorsementCounts | undefined => {
    return endorsementCounts[entry.uri]
      ?? (entry.did ? endorsementCounts[entry.did] : undefined)
      ?? (entry.handle ? endorsementCounts[entry.handle] : undefined)
  }, [endorsementCounts])

  const visibleEcosystemEntries = useMemo(() => {
    const discoverUris = new Set(visibleEntries.map((e) => e.uri))
    return entries
      .filter((e) => isEcosystemOnly(e) && !discoverUris.has(e.uri))
      .sort((a, b) => {
        const ca = lookupCounts(a)?.networkEndorsementCount ?? 0
        const cb = lookupCounts(b)?.networkEndorsementCount ?? 0
        return cb - ca || a.uri.localeCompare(b.uri)
      })
  }, [entries, visibleEntries, lookupCounts])

  // ── Endorsement handlers ──────────────────────────────────────────────

  const handleEndorse = useCallback(async (uri: string) => {
    setEndorsedUris((prev) => new Set([...prev, uri]))
    try {
      const res = await authFetch('/api/endorse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      })
      if (!res.ok) {
        setEndorsedUris((prev) => { const next = new Set(prev); next.delete(uri); return next })
      }
    } catch {
      setEndorsedUris((prev) => { const next = new Set(prev); next.delete(uri); return next })
    }
  }, [authFetch, setEndorsedUris])

  const handleUnendorse = useCallback(async (uri: string) => {
    const entry = entryIndexRef.current.toArray().find(
      (e) => e.uri === uri || e.did === uri,
    )
    const removeUris = new Set([uri])
    if (entry?.uri) removeUris.add(entry.uri)
    if (entry?.did) removeUris.add(entry.did)
    if (entry?.handle) removeUris.add(entry.handle)

    setEndorsedUris((prev) => {
      const next = new Set(prev)
      for (const u of removeUris) next.delete(u)
      return next
    })
    try {
      const res = await authFetch('/api/endorse', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      })
      if (!res.ok) {
        setEndorsedUris((prev) => new Set([...prev, ...removeUris]))
      }
    } catch {
      setEndorsedUris((prev) => new Set([...prev, ...removeUris]))
    }
  }, [authFetch, entryIndexRef, setEndorsedUris])

  const endorseAndFetch = useCallback(async (uri: string) => {
    handleEndorse(uri)
    try {
      const res = await fetch(`/api/entry?uri=${encodeURIComponent(uri)}`)
      if (!res.ok) return
      const data = await res.json() as { entry: StewardEntry; referenced: StewardEntry[] }
      entryIndexRef.current.upsert(data.entry)
      setEntries(entryIndexRef.current.toArray())
      if (data.entry.uri !== uri) {
        setEndorsedUris((prev) => new Set([...prev, data.entry.uri]))
      }
      if (data.entry.did && data.entry.did !== uri) {
        setEndorsedUris((prev) => new Set([...prev, data.entry.did!]))
      }
      for (const ref of data.referenced) {
        entryIndexRef.current.upsert(ref)
      }
      if (data.referenced.length > 0) {
        setEntries(entryIndexRef.current.toArray())
      }
    } catch (e) {
      console.warn('endorseAndFetch failed', e)
    }
  }, [handleEndorse, entryIndexRef, setEntries, setEndorsedUris])

  // ── Render helpers ────────────────────────────────────────────────────

  function parseSelfReportInput(): string[] {
    return selfReport.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  }

  const pdsUrl = meta?.pdsUrl
  const filterableTagCount = TAG_FILTER_LABELS.filter(({ tag }) => (tagCounts[tag] ?? 0) > 0).length
  const hasStackContent = !!pdsUrl || endorsedEntries.length > 0

  const fundableEntries = useMemo(
    () => visibleEntries.filter((e) => !!e.contributeUrl),
    [visibleEntries],
  )
  const endorsedFundable = useMemo(
    () => fundableEntries.filter((e) => isEndorsed(e, endorsedUris)),
    [fundableEntries, endorsedUris],
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">

        {/* Controls row: refresh + data explorer */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTag('all')
              runScan(parseSelfReportInput())
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {loading ? 'Scanning\u2026' : 'Refresh'}
          </button>
          {meta?.did && (
            <a
              href={pdslsRepoUrl(meta.did)}
              target="_blank"
              rel="noreferrer"
              title="Opens PDSls in a new tab"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              Data explorer
            </a>
          )}
          {loading && scanStatus && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden />
              <span>{scanStatus}</span>
            </div>
          )}
          {!loading && hasOwnRecords === true && (
            <Link
              href="/setup"
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-emerald-600 transition-opacity hover:opacity-80 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Your funding records look good
            </Link>
          )}
          {!loading && hasOwnRecords === false && (
            <Link
              href="/setup"
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-[var(--support)] transition-opacity hover:opacity-80"
            >
              Set up your funding records
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          )}
        </div>

        {/* ── My Stack ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white/60 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40">
          <div className="mb-3 flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-[var(--support)]" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              My Stack
            </h2>
            {scanDone && endorsedEntries.length > 0 && meta?.handle && (
              <a
                href={`/stack/${meta.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-sm text-emerald-600 transition-opacity hover:opacity-75 dark:text-emerald-400"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Share your stack
              </a>
            )}
          </div>
          {!hasStackContent && !loading && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Contribute to projects, then endorse the ones you value. Click{' '}
              <span className="inline-flex items-center gap-0.5 font-medium text-slate-600 dark:text-slate-300">
                <BadgePlus className="inline h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Endorse
              </span>{' '}
              on any project below to add it here. Endorsements are public,
              protocol-level signals of trust.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {(pdsEntries.length > 0 || endorsedEntries.length > 0) && (
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
                {pdsEntries.map((entry) => (
                  <CardErrorBoundary key={entry.uri} uri={entry.uri}>
                    <StewardCard
                      entry={entry}
                      allEntries={entries}
                    />
                  </CardErrorBoundary>
                ))}
                {endorsedEntries.map((entry) => {
                  const counts = lookupCounts(entry)
                  return (
                    <CardErrorBoundary key={entry.uri} uri={entry.uri}>
                      <StewardCard
                        entry={entry}
                        allEntries={entries}
                        endorsed
                        endorsedSet={endorsedUris}
                        onEndorse={handleEndorse}
                        onUnendorse={handleUnendorse}
                        networkEndorsementCount={counts?.networkEndorsementCount}
                      />
                    </CardErrorBoundary>
                  )
                })}
              </ul>
            )}

            {/* Endorse by handle */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/20">
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                Endorse an account not listed below by searching for their handle.
              </p>
              <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
                <HandleAutocomplete
                  value={selfReport}
                  onChange={setSelfReport}
                  placeholder="Search by handle…"
                  disabled={loading}
                  inputClassName="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    const handle = selfReport.trim()
                    if (handle) {
                      endorseAndFetch(handle)
                      setSelfReport('')
                    }
                  }}
                  disabled={!selfReport.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <BadgePlus className="h-4 w-4" aria-hidden />
                  Endorse
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats bar ────────────────────────────────────────── */}
        {scanDone && fundableEntries.length > 0 && (() => {
          const count = endorsedFundable.length
          if (count === 0) {
            return (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-400">
                <span>
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">{fundableEntries.length} project{fundableEntries.length === 1 ? '' : 's'}</strong> in your stack have funding links.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('discover')}
                  className="shrink-0 text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Start endorsing →
                </button>
              </div>
            )
          }
          return (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-800/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              <span>
                You&rsquo;ve endorsed <strong className="font-semibold">{count} project{count === 1 ? '' : 's'}</strong> that accept funding.
              </span>
              {meta?.handle && (
                <a
                  href={`/stack/${meta.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-medium hover:underline"
                >
                  Share on Atmosphere →
                </a>
              )}
            </div>
          )
        })()}

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {warnings.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-amber-800 dark:text-amber-300 [&::-webkit-details-marker]:hidden">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {warnings.length} lookup{warnings.length === 1 ? '' : 's'} had issues
              <span className="text-amber-600 dark:text-amber-500">{'\u25BE'}</span>
            </summary>
            <ul className="mt-2 space-y-1 pl-6 text-amber-700 dark:text-amber-400">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-mono text-xs">{w.stewardUri}</span>: {w.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* ── Tabbed: My Fundable Services / Endorsed by My Network ── */}
        <section className="space-y-3">
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'discover'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              My Fundable Services{discoveredEntries.length > 0 ? ` (${discoveredEntries.length})` : ''}
              {activeTab === 'discover' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--support)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ecosystem')}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'ecosystem'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Endorsed by My Network{visibleEcosystemEntries.length > 0 ? ` (${visibleEcosystemEntries.length})` : ''}
              {activeTab === 'ecosystem' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--support)]" />
              )}
            </button>
          </div>

          {/* ── My Fundable Services tab ─────────────────────────── */}
          {activeTab === 'discover' && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                These projects were found in your Atmosphere account data. Click the funding link to contribute, then endorse to add to My Stack.
              </p>
              {discoveredEntries.length === 0 && scanDone ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No additional tools found in your saved data yet. Add more
                  above if you know them.
                </p>
              ) : (
                <>
                  {filterableTagCount > 1 && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTag('all')}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeTag === 'all'
                            ? 'bg-[var(--support)] text-[var(--support-foreground)]'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        All ({discoveredEntries.length})
                      </button>
                      {TAG_FILTER_LABELS.map(({ tag, label }) => {
                        const count = tagCounts[tag] ?? 0
                        if (count === 0) return null
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setActiveTag(tag)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              activeTag === tag
                                ? 'bg-[var(--support)] text-[var(--support-foreground)]'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                            }`}
                          >
                            {label} ({count})
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {filteredEntries.length > 0 && (
                    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
                      {filteredEntries.map((entry) => {
                        const counts = lookupCounts(entry)
                        return (
                          <CardErrorBoundary key={entry.uri} uri={entry.uri}>
                            <StewardCard
                              entry={entry}
                              allEntries={entries}
                              endorsedSet={endorsedUris}
                              onEndorse={handleEndorse}
                              onUnendorse={handleUnendorse}
                              networkEndorsementCount={counts?.networkEndorsementCount}
                            />
                          </CardErrorBoundary>
                        )
                      })}
                    </ul>
                  )}
                  {filteredEntries.length === 0 && discoveredEntries.length === 0 && loading && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      <span>{scanStatus || 'Scanning\u2026'}</span>
                    </div>
                  )}
                  {filteredEntries.length === 0 && discoveredEntries.length > 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No entries match this filter.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Endorsed by My Network tab ────────────────────────── */}
          {activeTab === 'ecosystem' && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Projects and services endorsed by people you follow that aren&apos;t already in your fundable services.
              </p>
              {meta?.endorsementsCapped && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Endorsement scanning is available for the first 2,500 of your {meta.followCount?.toLocaleString()} follows.
                </p>
              )}
              {visibleEcosystemEntries.length > 0 ? (
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
                  {visibleEcosystemEntries.map((entry) => {
                    const counts = lookupCounts(entry)
                    return (
                      <CardErrorBoundary key={entry.uri} uri={entry.uri}>
                        <StewardCard
                          entry={entry}
                          allEntries={entries}
                          endorsedSet={endorsedUris}
                          onEndorse={handleEndorse}
                          onUnendorse={handleUnendorse}
                          networkEndorsementCount={counts?.networkEndorsementCount}
                        />
                      </CardErrorBoundary>
                    )
                  })}
                </ul>
              ) : scanDone ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No network endorsements found yet. As more people in your network use at.fund, endorsed projects will appear here.
                </p>
              ) : loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                  <span>{scanStatus || 'Scanning\u2026'}</span>
                </div>
              ) : null}
            </>
          )}
        </section>

      </div>
    </div>
  )
}
