'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ScanStreamEvent, ScanWarning, EndorsementCounts } from '@/lib/pipeline/scan-stream'
import type { StewardEntry } from '@/lib/steward-model'
import { EntryIndex } from '@/lib/steward-merge'
import { useSession } from '@/components/SessionContext'

// ---------------------------------------------------------------------------
// Module-level scan cache — survives in-app navigation, cleared on Refresh
// ---------------------------------------------------------------------------

type ScanCache = {
  meta: ScanMeta | null
  entries: StewardEntry[]
  warnings: ScanWarning[]
  endorsedUris: Set<string>
  endorsementCounts: Record<string, EndorsementCounts>
}

let _scanCache: ScanCache | null = null

export type ScanMeta = { did: string; handle?: string; pdsUrl?: string }

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the streaming NDJSON scan lifecycle: fetch, parse events,
 * maintain an EntryIndex for dedup, and cache results across navigations.
 */
export function useScanStream() {
  const { authFetch } = useSession()

  const [meta, setMeta] = useState<ScanMeta | null>(null)
  const [entries, setEntries] = useState<StewardEntry[]>([])
  const [warnings, setWarnings] = useState<ScanWarning[]>([])
  const [endorsedUris, setEndorsedUris] = useState<Set<string>>(new Set())
  const [endorsementCounts, setEndorsementCounts] = useState<Record<string, EndorsementCounts>>({})
  const [loading, setLoading] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const entryIndexRef = useRef(new EntryIndex())

  const runScan = useCallback(async (extra: string[]) => {
    _scanCache = null
    setLoading(true)
    setScanDone(false)
    setScanStatus('')
    setMeta(null)
    setEntries([])
    setWarnings([])
    setEndorsedUris(new Set())
    setEndorsementCounts({})
    setError(null)
    entryIndexRef.current = new EntryIndex()

    try {
      const params = new URLSearchParams()
      if (extra.length) params.set('extraStewards', extra.join(','))
      const res = await authFetch(`/api/lexicons/stream?${params}`)
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
          } else if (event.type === 'endorsed') {
            setEndorsedUris(new Set(event.uris))
          } else if (event.type === 'entry') {
            entryIndexRef.current.upsert(event.entry)
            setEntries(entryIndexRef.current.toArray())
          } else if (event.type === 'endorsement-counts') {
            setEndorsementCounts(event.counts)
          } else if (event.type === 'warning') {
            setWarnings((prev) => [...prev, event.warning])
          } else if (event.type === 'done') {
            setScanDone(true)
            setScanStatus('')
          }
        }
      }
    } catch (x) {
      setError(
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
    _scanCache = { meta, entries, warnings, endorsedUris, endorsementCounts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanDone])

  // On mount: restore from cache or start scan
  useEffect(() => {
    if (_scanCache) {
      setMeta(_scanCache.meta)
      setEntries(_scanCache.entries)
      setWarnings(_scanCache.warnings)
      setEndorsedUris(_scanCache.endorsedUris)
      setEndorsementCounts(_scanCache.endorsementCounts)
      setScanDone(true)
      return
    }
    void runScan([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    meta,
    entries,
    warnings,
    endorsedUris,
    endorsementCounts,
    loading,
    scanDone,
    scanStatus,
    error,
    entryIndexRef,
    setEntries,
    setEndorsedUris,
    runScan,
  }
}
