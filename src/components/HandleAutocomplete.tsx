'use client'

import type { Actor } from '@/components/AvatarBadge'
import { SuggestionList } from '@/components/SuggestionList'
import { useTypeahead } from '@/hooks/useTypeahead'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  const { suggestions, open, setOpen, active, setActive, loading, containerRef, reset } =
    useTypeahead(value)

  function pick(actor: Actor) {
    onChange(actor.handle)
    reset()
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
        <SuggestionList
          suggestions={suggestions}
          active={active}
          onPick={pick}
          onHover={setActive}
          idPrefix="hac"
        />
      )}
    </div>
  )
}
