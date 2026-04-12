'use client'

import { AvatarBadge, type Actor } from '@/components/AvatarBadge'

type Props = {
  suggestions: Actor[]
  active: number
  onPick: (actor: Actor) => void
  onHover: (index: number) => void
  idPrefix: string
  /** When provided, overrides default absolute positioning (used for portal rendering). */
  style?: React.CSSProperties
}

export function SuggestionList({ suggestions, active, onPick, onHover, idPrefix, style }: Props) {
  return (
    <ul
      id={`${idPrefix}-listbox`}
      role="listbox"
      className={`z-50 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${style ? '' : 'absolute left-0 right-0 top-full mt-1'}`}
      style={style}
    >
      {suggestions.map((actor, i) => (
        <li
          key={actor.did}
          id={`${idPrefix}-suggestion-${i}`}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(actor)
          }}
          onMouseEnter={() => onHover(i)}
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
  )
}
