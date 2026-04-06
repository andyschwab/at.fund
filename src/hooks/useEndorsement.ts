'use client'

import { useCallback, useState } from 'react'
import { useSession } from '@/components/SessionContext'

/**
 * Lightweight endorsement hook for use outside of GiveClient.
 * Manages a set of endorsed URIs and provides optimistic endorse/unendorse.
 */
export function useEndorsement(initialEndorsed: string[] = []) {
  const { authFetch, hasSession } = useSession()
  const [endorsedUris, setEndorsedUris] = useState<Set<string>>(
    () => new Set(initialEndorsed),
  )

  const endorse = useCallback(async (uri: string) => {
    if (!hasSession) return
    setEndorsedUris((prev) => new Set([...prev, uri]))
    try {
      const res = await authFetch('/api/endorse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      })
      if (!res.ok) {
        setEndorsedUris((prev) => {
          const next = new Set(prev)
          next.delete(uri)
          return next
        })
      }
    } catch {
      setEndorsedUris((prev) => {
        const next = new Set(prev)
        next.delete(uri)
        return next
      })
    }
  }, [authFetch, hasSession])

  /**
   * Remove an endorsement. Pass all known identifiers for the entry
   * (uri, did, handle) so they're all removed from the set and sent
   * to the API for rkey lookup.
   */
  const unendorse = useCallback(async (uri: string, allUris?: string[]) => {
    if (!hasSession) return
    const removeUris = new Set([uri, ...(allUris ?? [])])
    setEndorsedUris((prev) => {
      const next = new Set(prev)
      for (const u of removeUris) next.delete(u)
      return next
    })
    try {
      const res = await authFetch('/api/endorse', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, uris: [...removeUris] }),
      })
      if (!res.ok) {
        setEndorsedUris((prev) => new Set([...prev, ...removeUris]))
      }
    } catch {
      setEndorsedUris((prev) => new Set([...prev, ...removeUris]))
    }
  }, [authFetch, hasSession])

  const isEndorsed = useCallback(
    (uri: string) => endorsedUris.has(uri),
    [endorsedUris],
  )

  return { endorsedUris, endorse, unendorse, isEndorsed }
}
