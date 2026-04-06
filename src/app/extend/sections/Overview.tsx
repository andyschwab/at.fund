'use client'

import { Code, Frame, Puzzle, BookOpen } from 'lucide-react'

const CARDS = [
  {
    icon: Puzzle,
    title: 'Query the API',
    description: 'Resolve any handle, DID, or hostname to get identity, funding, and capabilities. Public endpoints — no auth needed.',
    section: 'api',
  },
  {
    icon: Frame,
    title: 'Embed a button',
    description: 'Drop a support button into any page with a single iframe. Customize the styling to match your site.',
    section: 'embeds',
  },
  {
    icon: Code,
    title: 'Code snippets',
    description: 'Copy-paste examples for common use cases — resolve builders, read streaming scans, fetch lexicon schemas.',
    section: 'snippets',
  },
] as const

export function Overview({ onNavigate }: { onNavigate: (section: string) => void }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        at.fund data is open. Every builder, funding link, and endorsement on the network is
        accessible through our API — no keys, no rate limits. Build integrations, embed support
        buttons, or create your own tools on top of the{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">fund.at.*</code>{' '}
        lexicon.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <button
            key={card.section}
            type="button"
            onClick={() => onNavigate(card.section)}
            className="group rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-[var(--support)] hover:bg-[var(--support-muted)]/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[var(--support)]"
          >
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
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
        <BookOpen className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.5} aria-hidden />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          For full lexicon schema reference, see the{' '}
          <a href="/spec" className="font-medium text-[var(--support)] hover:underline">
            Spec
          </a>{' '}
          page.
        </p>
      </div>
    </div>
  )
}
