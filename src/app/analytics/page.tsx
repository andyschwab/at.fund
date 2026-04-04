import type { Metadata } from 'next'
import { AnalyticsClient } from '@/components/AnalyticsClient'

export const metadata: Metadata = {
  title: 'at.fund — Ecosystem Analytics',
  description:
    'Explore the AT Protocol funding ecosystem. See dependency graphs, critical infrastructure, endorsements, and contribution activity across the ATmosphere.',
  openGraph: {
    title: 'at.fund — Ecosystem Analytics',
    description:
      'Interactive dependency graph showing who funds what in the AT Protocol ecosystem.',
  },
}

export default function AnalyticsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Ecosystem Analytics
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The AT Protocol funding network — who depends on whom, and where the
          money flows.
        </p>
      </div>

      <AnalyticsClient />
    </main>
  )
}
