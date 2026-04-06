'use client'

import Link from 'next/link'
import { Frame, Puzzle, BookOpen } from 'lucide-react'

const CARDS = [
  {
    icon: Frame,
    title: 'Embed a button',
    description: 'Drop a support button into any page with a single iframe. Customize the styling to match your site.',
    section: 'embeds',
  },
  {
    icon: Puzzle,
    title: 'Query the API',
    description: 'Resolve any handle, DID, or hostname to get identity, funding, and capabilities. Public endpoints — no auth needed.',
    section: 'api',
  },
  {
    icon: BookOpen,
    title: 'Read the Lexicon',
    description: 'Full schema reference for the fund.at.* lexicon — record types, field semantics, and ATProto conventions.',
    section: 'spec',
  },
] as const

export function Overview({ onNavigate }: { onNavigate: (section: string) => void }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        at.fund data is open. Builders, funding links, and endorsements on the network are
        accessible through our API — no authentication required. Build integrations, embed support
        buttons, or create your own tools on top of the{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">fund.at.*</code>{' '}
        lexicon.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map((card) => {
          const inner = (
            <>
              <card.icon
                className="mb-2 h-5 w-5 text-slate-400 transition-colors group-hover:text-[var(--support)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {card.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {card.description}
              </p>
            </>
          )
          const cls = "group rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-[var(--support)] hover:bg-[var(--support-muted)]/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[var(--support)]"

          if (card.section === 'spec') {
            return (
              <Link key={card.section} href="/spec" className={cls}>
                {inner}
              </Link>
            )
          }
          return (
            <button key={card.section} type="button" onClick={() => onNavigate(card.section)} className={cls}>
              {inner}
            </button>
          )
        })}
      </div>
    </div>
  )
}
