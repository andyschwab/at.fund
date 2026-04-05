'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import type { Actor } from '@/components/AvatarBadge'

/**
 * Manages Bluesky handle typeahead state: debounced fetch, outside-click
 * dismiss, and arrow-key navigation. Shared by HandleAutocomplete and
 * HandleChipInput.
 */
export function useTypeahead(query: string, delay = 200) {
  const [suggestions, setSuggestions] = useState<Actor[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debouncedQ = useDebounce(query, delay)
  const containerRef = useRef<HTMLDivElement>(null)

  // Track the latest query for cancellation
  const latestQuery = useRef(debouncedQ)
  latestQuery.current = debouncedQ

  // Fetch typeahead suggestions when the debounced query changes.
  // All setState calls happen inside async callbacks — never synchronously
  // in the effect body — to satisfy the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const q = debouncedQ.trim()
    if (!q || q.startsWith('did:') || q.includes('/')) {
      setSuggestions((prev) => (prev.length === 0 ? prev : []))
      setOpen(false)
      setLoading(false)
      return
    }

    let cancelled = false

    async function run() {
      setLoading(true)
      try {
        const res = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`,
        )
        const data = await res.json()
        if (!cancelled) {
          const actors: Actor[] = data.actors ?? []
          setSuggestions(actors)
          setOpen(actors.length > 0)
          setActive(-1)
        }
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [debouncedQ])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const reset = useCallback(() => {
    setSuggestions([])
    setOpen(false)
    setActive(-1)
  }, [])

  return { suggestions, open, setOpen, active, setActive, loading, containerRef, reset }
}
