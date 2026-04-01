'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { ScanStreamEvent, ScanWarning, PdsHostFunding } from '@/lib/lexicon-scan'
import type { StewardEntry } from '@/lib/steward-model'
import { EntryIndex } from '@/lib/steward-merge'
import { pdslsRepoUrl } from '@/lib/pdsls'
import {
  StewardCard,
  PdsHostSupportCard,
} from '@/components/ProjectCards'
import {
  AlertCircle,
  ExternalLink,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Module-level scan cache — survives in-app navigation, cleared on Refresh
// ---------------------------------------------------------------------------

type ScanCache = {
  meta: { did: string; handle?: string; pdsUrl?: string } | null
  entries: StewardEntry[]
  referencedEntries: StewardEntry[]
  warnings: ScanWarning[]
  pdsHostFunding: PdsHostFunding | undefined
}

let _scanCache: ScanCache | null = null

type TagFilter = 'all' | 'tool' | 'labeler' | 'feed' | 'follow'

const TAG_FILTER_LABELS: { tag: TagFilter; label: string }[] = [
  { tag: 'tool', label: 'Tools' },
  { tag: 'labeler', label: 'Labelers' },
  { tag: 'feed', label: 'Feeds' },
  { tag: 'follow', label: 'Network' },
]

function entryTier(e: StewardEntry): number {
  if (e.source === 'unknown') return 3
  if (e.contributeUrl) return 0
  if (e.dependencies && e.dependencies.length > 0) return 1
  return 2
}

export function GiveClient() {
  const [loading, setLoading] = useState(false)
  const [selfReport, setSelfReport] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Streaming scan state
  const [meta, setMeta] = useState<{ did: string; handle?: string; pdsUrl?: string } | null>(null)
  const [entries, setEntries] = useState<StewardEntry[]>([])
  const [referencedEntries, setReferencedEntries] = useState<StewardEntry[]>([])
  const [warnings, setWarnings] = useState<ScanWarning[]>([])
  const [pdsHostFunding, setPdsHostFunding] = useState<PdsHostFunding | undefined>()
  const [scanDone, setScanDone] = useState(false)
  const [scanStatus, setScanStatus] = useState<string>('')
  const [activeTag, setActiveTag] = useState<TagFilter>('all')
  const entryIndexRef = useRef(new EntryIndex())

  // Inclusion rule: tools/labelers/feeds always; follows only if actionable
  const visibleEntries = useMemo(() => {
    const included = entries.filter(
      (e) =>
        e.tags.some((t) => t === 'tool' || t === 'labeler' || t === 'feed') ||
        (e.tags.includes('follow') && !!e.contributeUrl),
    )
    return included.sort((a, b) => {
      const diff = entryTier(a) - entryTier(b)
      return diff !== 0 ? diff : a.uri.localeCompare(b.uri)
    })
  }, [entries])

  const filteredEntries = useMemo(() => {
    if (activeTag === 'all') return visibleEntries
    return visibleEntries.filter((e) => e.tags.includes(activeTag))
  }, [visibleEntries, activeTag])

  const tagCounts = useMemo(() => {
    const counts: Partial<Record<TagFilter, number>> = {}
    for (const e of visibleEntries) {
      for (const t of e.tags) {
        if (t === 'tool' || t === 'labeler' || t === 'feed' || t === 'follow') {
          counts[t] = (counts[t] ?? 0) + 1
        }
      }
    }
    return counts
  }, [visibleEntries])

  const allEntriesForLookup = useMemo(
    () => [...entries, ...referencedEntries],
    [entries, referencedEntries],
  )

  const runStreamingScan = useCallback(async (extra: string[]) => {
    _scanCache = null
    setLoading(true)
    setScanDone(false)
    setScanStatus('')
    setMeta(null)
    setEntries([])
    setReferencedEntries([])
    setWarnings([])
    setPdsHostFunding(undefined)
    setErr(null)
    setActiveTag('all')
    entryIndexRef.current = new EntryIndex()

    try {
      const params = new URLSearchParams()
      if (extra.length) params.set('extraStewards', extra.join(','))
      const res = await fetch(`/api/lexicons/stream?${params}`)
      if (!res.ok || !res.body) {
        let msg = 'Scan failed'
        try {
          const data = await res.json() as { detail?: string; error?: string }
          msg = data.detail ?? data.error ?? msg
        } catch { /* empty body */ }
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.trim()) continue
          let event: ScanStreamEvent
          try {
            event = JSON.parse(line) as ScanStreamEvent
          } catch {
            continue
          }

          if (event.type === 'meta') {
            setMeta({ did: event.did, handle: event.handle, pdsUrl: event.pdsUrl })
          } else if (event.type === 'status') {
            setScanStatus(event.message)
          } else if (event.type === 'entry') {
            entryIndexRef.current.upsert(event.entry)
            setEntries(entryIndexRef.current.toArray())
          } else if (event.type === 'referenced') {
            setReferencedEntries((prev) => [...prev, event.entry])
          } else if (event.type === 'pds-host') {
            setPdsHostFunding(event.funding)
          } else if (event.type === 'warning') {
            setWarnings((prev) => [...prev, event.warning])
          } else if (event.type === 'done') {
            setScanDone(true)
            setScanStatus('')
          }
        }
      }
    } catch (x) {
      setErr(
        x instanceof Error
          ? x.message === 'Scan failed'
            ? 'Could not load your account data. Try again.'
            : x.message
          : 'Could not load your account data. Try again.',
      )
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save completed scan to cache
  useEffect(() => {
    if (!scanDone) return
    _scanCache = { meta, entries, referencedEntries, warnings, pdsHostFunding }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanDone])

  // On mount: restore from cache or start scan
  useEffect(() => {
    if (_scanCache) {
      setMeta(_scanCache.meta)
      setEntries(_scanCache.entries)
      setReferencedEntries(_scanCache.referencedEntries)
      setWarnings(_scanCache.warnings)
      setPdsHostFunding(_scanCache.pdsHostFunding)
      setScanDone(true)
      return
    }
    void runStreamingScan([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function parseSelfReportInput(): string[] {
    return selfReport
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const pdsUrl = meta?.pdsUrl
  const filterableTagCount = TAG_FILTER_LABELS.filter(({ tag }) => (tagCounts[tag] ?? 0) > 0).length

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">

        {/* Controls row: refresh + data explorer */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runStreamingScan(parseSelfReportInput())}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {loading ? 'Scanning…' : 'Refresh'}
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
        </div>

        {/* PDS host card */}
        {pdsUrl && (
          <PdsHostSupportCard
            pdsHostname={new URL(pdsUrl).hostname}
            funding={pdsHostFunding}
          />
        )}

        {/* Add more tools / Watch list */}
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/30">
          <div className="mb-3 flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
            <PlusCircle className="h-5 w-5 text-[var(--support)]" aria-hidden />
            Add to my watch list
          </div>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Paste extra names your developer or app gave you, even if
            they&apos;re not in your saved data yet. Separate with spaces or
            commas.
          </p>
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={selfReport}
              onChange={(e) => setSelfReport(e.target.value)}
              placeholder="e.g. whtwnd.com or did:plc:..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => runStreamingScan(parseSelfReportInput())}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" aria-hidden />
              Add to list
            </button>
          </div>
        </section>

        {err && (
          <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {err}
          </p>
        )}

        {warnings.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-amber-800 dark:text-amber-300 [&::-webkit-details-marker]:hidden">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {warnings.length} lookup{warnings.length === 1 ? '' : 's'} had issues
              <span className="text-amber-600 dark:text-amber-500">▾</span>
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

        {/* Steward list */}
        <section className="space-y-4">
          {visibleEntries.length === 0 && scanDone ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              We didn&apos;t find any extra tools in your saved data yet. You
              can add more above if you know them.
            </p>
          ) : (
            <>
              {/* Filter pills */}
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
                    All ({visibleEntries.length})
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

              {/* Flat entry list */}
              <div className="flex flex-col gap-4">
                {filteredEntries.map((entry) => (
                  <StewardCard
                    key={entry.uri}
                    entry={entry}
                    allEntries={allEntriesForLookup}
                  />
                ))}
                {filteredEntries.length === 0 && visibleEntries.length === 0 && loading && (
                  <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                    <span>{scanStatus || 'Scanning…'}</span>
                  </div>
                )}
                {filteredEntries.length === 0 && visibleEntries.length > 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No entries match this filter.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

      </div>
    </div>
  )
}
