'use client'

import { useState, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Override input element className (replaces default bordered style). */
  inputClassName?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function AvatarBadge({ actor }: { actor: Actor }) {
  const [failed, setFailed] = useState(false)
  const initials = (actor.displayName ?? actor.handle).slice(0, 2).toUpperCase()
  if (actor.avatar && !failed) {
    return (
      <img
        src={actor.avatar}
        alt=""
        onError={() => setFailed(true)}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--support-muted)] text-[10px] font-semibold text-[var(--support)]">
      {initials}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A combobox input that resolves Bluesky handles via typeahead.
 * Selecting a suggestion fills the input with the handle.
 * Works standalone (e.g. sign-in form) — see HandleChipInput for multi-value.
 */
export function HandleAutocomplete({
  value,
  onChange,
  placeholder = 'handle.bsky.social',
  disabled,
  id,
  inputClassName,
}: Props) {
  const [suggestions, setSuggestions] = useState<Actor[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debouncedQ = useDebounce(value, 200)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch typeahead suggestions
  useEffect(() => {
    const q = debouncedQ.trim()
    // Skip for DIDs and obviously non-handle inputs
    if (!q || q.startsWith('did:')) {
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

  function pick(actor: Actor) {
    onChange(actor.handle)
    setSuggestions([])
    setOpen(false)
    setActive(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter') {
      if (active >= 0 && suggestions[active]) {
        e.preventDefault()
        pick(suggestions[active])
      } else {
        // No active suggestion — close dropdown, let Enter bubble (e.g. form submit)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  const defaultInputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500'

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true)
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `hac-suggestion-${active}` : undefined}
          className={inputClassName ?? defaultInputClass}
        />
        {loading && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="h-3.5 w-3.5 animate-spin text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </span>
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {suggestions.map((actor, i) => (
            <li
              key={actor.did}
              id={`hac-suggestion-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(actor)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${
                i === active
                  ? 'bg-[var(--support-muted)] text-slate-900 dark:text-slate-100'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <AvatarBadge actor={actor} />
              <span className="min-w-0 flex-1">
                {actor.displayName && (
                  <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                    {actor.displayName}
                  </span>
                )}
                <span
                  className={`block truncate ${
                    actor.displayName
                      ? 'text-xs text-slate-500 dark:text-slate-400'
                      : 'text-sm font-medium text-slate-900 dark:text-slate-100'
                  }`}
                >
                  @{actor.handle}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
