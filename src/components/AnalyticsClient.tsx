'use client'

import { useEffect, useState, useCallback } from 'react'
import { DependencyGraph } from '@/components/DependencyGraph'
import { AnalyticsStats } from '@/components/AnalyticsStats'
import { Loader2 } from 'lucide-react'
import type { AnalyticsGraph } from '@/lib/analytics-graph'

export function AnalyticsClient() {
  const [graph, setGraph] = useState<AnalyticsGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/analytics')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          )
        }
        const data = (await res.json()) as AnalyticsGraph
        if (!cancelled) {
          setGraph(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleNodeSelect = useCallback((nodeId: string) => {
    setFocusNodeId(nodeId)
    // Scroll graph into view
    const el = document.getElementById('analytics-graph')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Clear focus after animation
    setTimeout(() => setFocusNodeId(null), 2000)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500 dark:text-slate-400">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm">Loading ecosystem data...</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Fetching fund.at records from the ATmosphere
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load analytics: {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            setError(null)
            void fetch('/api/analytics')
              .then((r) => r.json())
              .then((data) => {
                setGraph(data as AnalyticsGraph)
                setLoading(false)
              })
              .catch((e) => {
                setError(
                  e instanceof Error ? e.message : 'Failed to load analytics',
                )
                setLoading(false)
              })
          }}
          className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500 dark:text-slate-400">
        <p className="text-sm">No ecosystem data available yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div id="analytics-graph">
        <DependencyGraph
          nodes={graph.nodes}
          edges={graph.edges}
          focusNodeId={focusNodeId}
          onNodeClick={(node) => {
            if (node.contributeUrl) {
              window.open(node.contributeUrl, '_blank', 'noopener')
            }
          }}
        />
      </div>

      <AnalyticsStats
        nodes={graph.nodes}
        stats={graph.stats}
        onNodeSelect={handleNodeSelect}
      />

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Last updated: {new Date(graph.updatedAt).toLocaleString()}
        {' · '}
        Data from{' '}
        <a
          href="https://microcosm.blue"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Microcosm.blue
        </a>
        {' + '}
        <a
          href="https://fund.at"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          fund.at
        </a>{' '}
        catalog
      </p>
    </div>
  )
}
