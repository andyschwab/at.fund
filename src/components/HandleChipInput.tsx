'use client'

import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import type { Actor } from '@/components/AvatarBadge'
import { SuggestionList } from '@/components/SuggestionList'
import { useTypeahead } from '@/hooks/useTypeahead'
import { nextId } from '@/lib/next-id'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChipItem = { id: string; uri: string; label: string }

type Props = {
  chips: ChipItem[]
  onChange: (chips: ChipItem[]) => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A chip-style multi-value input for AT Protocol accounts (handles, DIDs, domains).
 * Typing triggers Bluesky handle typeahead; selecting a suggestion adds a chip.
 * Raw identifiers (domains like example.com, DIDs) can be added by pressing Enter.
 * Backspace on an empty input removes the last chip.
 */
export function HandleChipInput({ chips, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const { suggestions, open, setOpen, active, setActive, loading, containerRef, reset } =
    useTypeahead(query)
  const inputRef = useRef<HTMLInputElement>(null)

  function addChip(uri: string, label?: string) {
    const trimmed = uri.trim()
    if (!trimmed) return
    if (chips.some((c) => c.uri === trimmed)) {
      setQuery('')
      return
    }
    onChange([...chips, { id: nextId(), uri: trimmed, label: label ?? '' }])
    setQuery('')
    reset()
  }

  function removeChip(id: string) {
    onChange(chips.filter((c) => c.id !== id))
  }

  function pick(actor: Actor) {
    addChip(actor.handle, actor.displayName ?? '')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, suggestions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (active >= 0 && suggestions[active]) {
          pick(suggestions[active])
        } else if (query.trim()) {
          setOpen(false)
          addChip(query.trim())
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        setActive(-1)
      }
    } else {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault()
        addChip(query.trim())
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && !query && chips.length > 0) {
        removeChip(chips[chips.length - 1].id)
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Chip container + inline input */}
      <div
        className={`flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-[var(--support)] focus-within:ring-1 focus-within:ring-[var(--support)]/30 dark:border-slate-700 dark:bg-slate-900 ${
          disabled ? 'opacity-50' : 'cursor-text'
        }`}
        onClick={() => {
          if (!disabled) inputRef.current?.focus()
        }}
      >
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--support-border)] bg-[var(--support-muted)] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[var(--support)]"
          >
            <span className="max-w-[200px] truncate">{chip.label || chip.uri}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeChip(chip.id)
                }}
                aria-label={`Remove ${chip.label || chip.uri}`}
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[var(--support)] opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
              </button>
            )}
          </span>
        ))}

        {/* Inline search input */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true)
            }}
            placeholder={
              chips.length === 0 ? 'handle.bsky.social, example.com, did:plc:…' : 'Add more…'
            }
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls="hci-listbox"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `hci-suggestion-${active}` : undefined}
            className="min-w-[160px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
          />
          {loading && (
            <svg
              className="mr-1 h-3 w-3 shrink-0 animate-spin text-slate-400"
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
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {open && (
        <SuggestionList
          suggestions={suggestions}
          active={active}
          onPick={pick}
          onHover={setActive}
          idPrefix="hci"
        />
      )}
    </div>
  )
}
