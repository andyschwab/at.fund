'use client'

import {
  GitBranch,
  Heart,
  Clock,
  Users,
  TrendingUp,
  DollarSign,
  Link,
} from 'lucide-react'
import type { GraphNode, NetworkStats } from '@/lib/analytics-graph'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AnalyticsStatsProps = {
  nodes: GraphNode[]
  stats: NetworkStats
  onNodeSelect?: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {value}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ranked list
// ---------------------------------------------------------------------------

function RankedList({
  title,
  icon: Icon,
  items,
  renderValue,
  onSelect,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: GraphNode[]
  renderValue: (node: GraphNode) => React.ReactNode
  onSelect?: (nodeId: string) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((node, i) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => onSelect?.(node.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium text-slate-400">
                {i + 1}
              </span>
              {node.avatar ? (
                <img
                  src={node.avatar}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full"
                />
              ) : (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: node.hasFunding ? '#059669' : '#d97706',
                  }}
                >
                  {node.displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                {node.displayName}
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                {renderValue(node)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsStats({
  nodes,
  stats,
  onNodeSelect,
}: AnalyticsStatsProps) {
  // Compute ranked lists
  const mostCritical = [...nodes]
    .filter((n) => n.dependedOnBy > 0)
    .sort((a, b) => b.dependedOnBy - a.dependedOnBy)
    .slice(0, 10)

  const mostEndorsed = [...nodes]
    .filter((n) => n.endorsementCount > 0)
    .sort((a, b) => b.endorsementCount - a.endorsementCount)
    .slice(0, 10)

  const mostRecent = [...nodes]
    .filter((n) => n.createdAt)
    .sort((a, b) => {
      const da = new Date(a.createdAt!).getTime()
      const db = new Date(b.createdAt!).getTime()
      return db - da
    })
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label={stats.ufos?.contributeDids ? 'Stewards (network-wide)' : 'Stewards (graph)'}
          value={stats.ufos?.contributeDids || stats.totalStewards}
          color="#059669"
        />
        <StatCard
          icon={DollarSign}
          label="Funded"
          value={`${stats.fundedPercentage}%`}
          color="#059669"
        />
        <StatCard
          icon={Link}
          label={stats.ufos?.dependencyRecords ? 'Dependencies (network)' : 'Dependencies (graph)'}
          value={stats.ufos?.dependencyRecords || stats.totalDependencyLinks}
          color="#7c3aed"
        />
        <StatCard
          icon={Heart}
          label={stats.ufos?.endorseRecords ? 'Endorsements (network)' : 'Endorsements (graph)'}
          value={stats.ufos?.endorseRecords || stats.totalEndorsements}
          color="#d97706"
        />
      </div>

      {/* Ranked lists */}
      <div className="grid gap-4 md:grid-cols-3">
        <RankedList
          title="Most Critical Dependencies"
          icon={TrendingUp}
          items={mostCritical}
          renderValue={(n) => (
            <>
              <GitBranch className="mr-1 inline h-3 w-3" />
              {n.dependedOnBy}
            </>
          )}
          onSelect={onNodeSelect}
        />
        <RankedList
          title="Most Endorsed"
          icon={Heart}
          items={mostEndorsed}
          renderValue={(n) => (
            <>
              <Heart className="mr-1 inline h-3 w-3" />
              {n.endorsementCount}
            </>
          )}
          onSelect={onNodeSelect}
        />
        <RankedList
          title="Most Recent Contributors"
          icon={Clock}
          items={mostRecent}
          renderValue={(n) => {
            if (!n.createdAt) return null
            const d = new Date(n.createdAt)
            return d.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          }}
          onSelect={onNodeSelect}
        />
      </div>
    </div>
  )
}
