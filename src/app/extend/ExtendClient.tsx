'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Frame, Puzzle } from 'lucide-react'
import { Overview } from './sections/Overview'
import { ApiExplorer } from './sections/ApiExplorer'
import { EmbedPlayground } from './sections/EmbedPlayground'

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'embeds', label: 'Embeds' },
  { id: 'api', label: 'API' },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExtendClient() {
  const [activeTab, setActiveTab] = useState('overview')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Scroll to a section and update active tab
  const navigateTo = useCallback((id: string) => {
    const el = sectionRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setActiveTab(id)
  }, [])

  // Track scroll position to update active pill
  useEffect(() => {
    const entries = TABS.map((t) => t.id)
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-section')
            if (id) setActiveTab(id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )

    const timer = setTimeout(() => {
      for (const id of entries) {
        const el = sectionRefs.current[id]
        if (el) observer.observe(el)
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  function setRef(id: string) {
    return (el: HTMLElement | null) => {
      sectionRefs.current[id] = el
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Extend</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Build with at.fund — embeds and APIs to integrate funding discovery into your app.
        </p>
      </div>

      {/* Sticky section nav */}
      <div className="sticky top-[57px] z-20 -mx-4 mb-8 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateTo(tab.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--support-muted)] text-[var(--support)]'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-12">
        <section ref={setRef('overview')} data-section="overview" className="scroll-mt-28">
          <Overview onNavigate={navigateTo} />
        </section>

        <section
          ref={setRef('embeds')}
          data-section="embeds"
          className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--support-muted)]">
              <Frame className="h-4.5 w-4.5 text-[var(--support)]" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Embed Playground
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Add a support button to any page with a single iframe tag.
              </p>
            </div>
          </div>
          <EmbedPlayground />
        </section>

        <section
          ref={setRef('api')}
          data-section="api"
          className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--support-muted)]">
              <Puzzle className="h-4.5 w-4.5 text-[var(--support)]" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                API Explorer
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Test public endpoints inline — resolve any handle, DID, or hostname.
              </p>
            </div>
          </div>
          <ApiExplorer />
        </section>
      </div>
    </div>
  )
}
