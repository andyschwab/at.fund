'use client'

import { useState, useRef, useEffect } from 'react'
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

  // Fetch typeahead suggestions
  useEffect(() => {
    const q = debouncedQ.trim()
    if (!q || q.startsWith('did:') || q.includes('/')) {
      setSuggestions([])
      setOpen(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          const actors: Actor[] = data.actors ?? []
          setSuggestions(actors)
          setOpen(actors.length > 0)
          setActive(-1)
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQ])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function reset() {
    setSuggestions([])
    setOpen(false)
    setActive(-1)
  }

  return { suggestions, open, setOpen, active, setActive, loading, containerRef, reset }
}
