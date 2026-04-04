/**
 * Graph data aggregation for the public analytics page.
 *
 * Merges three data sources into a unified dependency graph:
 *   1. Manual catalog (src/data/catalog/*.json) — curated dependency edges
 *   2. UFOs record samples — most recent fund.at.* records from the firehose
 *   3. UFOs collection stats — aggregate create/DID counts for fund.at.*
 *   4. Constellation backlink counts — endorsements and dependency in-degree
 *
 * Important: UFOs does NOT provide a full record dump. It provides:
 *   - GET /records?collection=... → recent *samples* (a window of latest records)
 *   - GET /prefix?prefix=fund.at → aggregate stats per collection
 *   - GET /collections/stats?collection=... → creates, deletes, unique DIDs
 *   - GET /timeseries?collection=... → hourly/daily bucketed stats
 *
 * We combine samples (for concrete records to render) with stats (for totals)
 * and Constellation (for per-node backlink counts).
 */

import fs from 'node:fs'
import path from 'node:path'
import { logger } from '@/lib/logger'
import { normalizeStewardUri } from '@/lib/steward-uri'
import {
  safeListPrefix,
  safeGetRecordSamples,
  safeGetCollectionStats,
  safeGetAllLinksCounts,
  type UfosRecordSample,
} from '@/lib/microcosm'
import {
  getCachedGraph,
  setCachedGraph,
  getCachedRecords,
  setCachedRecords,
  getCachedEndorsements,
  setCachedEndorsements,
  type StoredGraph,
} from '@/lib/analytics-store'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GraphNode = {
  id: string
  did?: string
  handle?: string
  displayName: string
  avatar?: string
  contributeUrl?: string
  hasFunding: boolean
  endorsementCount: number
  dependedOnBy: number
  dependsOn: number
  tags: string[]
  source: 'fund.at' | 'manual' | 'both'
  createdAt?: string
}

export type GraphEdge = {
  source: string
  target: string
  label?: string
}

export type NetworkStats = {
  totalStewards: number
  totalWithFunding: number
  totalDependencyLinks: number
  totalEndorsements: number
  fundedPercentage: number
  /** Aggregate stats from UFOs — total creates across all fund.at.* collections */
  ufos?: {
    contributeRecords: number
    contributeDids: number
    dependencyRecords: number
    dependencyDids: number
    endorseRecords: number
    endorseDids: number
  }
}

export type AnalyticsGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: NetworkStats
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Manual catalog loading (mirrors pattern from src/lib/catalog.ts)
// ---------------------------------------------------------------------------

type CatalogRecord = {
  contributeUrl?: string
  dependencies?: string[]
}

function loadCatalog(): Record<string, CatalogRecord> {
  const catalogDir = path.join(process.cwd(), 'src', 'data', 'catalog')
  const records: Record<string, CatalogRecord> = {}
  for (const file of fs.readdirSync(catalogDir)) {
    if (!file.endsWith('.json')) continue
    const stewardUri = file.replace(/\.json$/, '')
    const content = fs.readFileSync(path.join(catalogDir, file), 'utf-8')
    records[stewardUri] = JSON.parse(content) as CatalogRecord
  }
  return records
}

// ---------------------------------------------------------------------------
// Build graph from catalog
// ---------------------------------------------------------------------------

function buildCatalogGraph(): { nodes: Map<string, GraphNode>; edges: GraphEdge[] } {
  const catalog = loadCatalog()
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  for (const [uri, record] of Object.entries(catalog)) {
    const node: GraphNode = {
      id: uri,
      displayName: uri,
      hasFunding: !!record.contributeUrl,
      contributeUrl: record.contributeUrl,
      endorsementCount: 0,
      dependedOnBy: 0,
      dependsOn: record.dependencies?.length ?? 0,
      tags: [],
      source: 'manual',
    }
    nodes.set(uri, node)

    for (const depUri of record.dependencies ?? []) {
      const normalizedDep = normalizeStewardUri(depUri) ?? depUri
      edges.push({ source: uri, target: normalizedDep })

      // Ensure dependency node exists
      if (!nodes.has(normalizedDep)) {
        nodes.set(normalizedDep, {
          id: normalizedDep,
          displayName: normalizedDep,
          hasFunding: false,
          endorsementCount: 0,
          dependedOnBy: 0,
          dependsOn: 0,
          tags: [],
          source: 'manual',
        })
      }
    }
  }

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Enrich with UFOs record samples
// ---------------------------------------------------------------------------

/**
 * UFOs /records returns a window of the most recently seen records.
 * We use these to discover concrete steward identities (DIDs) and their
 * contribute URLs / dependency targets / endorsement targets.
 */
async function fetchSamples(): Promise<{
  contribute: UfosRecordSample[]
  dependency: UfosRecordSample[]
  endorse: UfosRecordSample[]
}> {
  const cacheKey = 'fund.at.samples'
  const cached = await getCachedRecords(cacheKey)
  if (cached) {
    return JSON.parse(cached as unknown as string) as {
      contribute: UfosRecordSample[]
      dependency: UfosRecordSample[]
      endorse: UfosRecordSample[]
    }
  }

  // Fetch samples for all three collections in parallel
  const [contribute, dependency, endorse] = await Promise.all([
    safeGetRecordSamples(['fund.at.contribute']),
    safeGetRecordSamples(['fund.at.dependency']),
    safeGetRecordSamples(['fund.at.endorse']),
  ])

  const result = { contribute, dependency, endorse }
  await setCachedRecords(cacheKey, JSON.stringify(result) as unknown as UfosRecordSample[])
  return result
}

function enrichWithContributeSamples(
  nodes: Map<string, GraphNode>,
  samples: UfosRecordSample[],
): void {
  for (const sample of samples) {
    const did = sample.did
    if (!did) continue

    const url = (sample.record as { url?: string }).url
    const createdAt = (sample.record as { createdAt?: string }).createdAt
    const timeMs = sample.time_us ? Math.floor(sample.time_us / 1000) : undefined
    const timestamp = createdAt ?? (timeMs ? new Date(timeMs).toISOString() : undefined)

    const existing = nodes.get(did)
    if (existing) {
      existing.did = existing.did ?? did
      if (url) {
        existing.contributeUrl = existing.contributeUrl ?? url
        existing.hasFunding = true
      }
      if (timestamp) existing.createdAt = existing.createdAt ?? timestamp
      existing.source = existing.source === 'manual' ? 'both' : 'fund.at'
    } else {
      nodes.set(did, {
        id: did,
        did,
        displayName: did,
        hasFunding: !!url,
        contributeUrl: url,
        endorsementCount: 0,
        dependedOnBy: 0,
        dependsOn: 0,
        tags: [],
        source: 'fund.at',
        createdAt: timestamp,
      })
    }
  }
}

function enrichWithDependencySamples(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  samples: UfosRecordSample[],
): void {
  const edgeSet = new Set(edges.map((e) => `${e.source}→${e.target}`))

  for (const sample of samples) {
    const did = sample.did
    if (!did) continue

    const depUri = (sample.record as { uri?: string }).uri
    if (!depUri) continue

    const sourceId = did
    const targetId = normalizeStewardUri(depUri) ?? depUri
    const edgeKey = `${sourceId}→${targetId}`
    if (edgeSet.has(edgeKey)) continue
    edgeSet.add(edgeKey)

    const label = (sample.record as { label?: string }).label
    edges.push({ source: sourceId, target: targetId, label })

    // Ensure both nodes exist
    if (!nodes.has(sourceId)) {
      nodes.set(sourceId, {
        id: sourceId,
        did,
        displayName: did,
        hasFunding: false,
        endorsementCount: 0,
        dependedOnBy: 0,
        dependsOn: 0,
        tags: [],
        source: 'fund.at',
      })
    }
    if (!nodes.has(targetId)) {
      nodes.set(targetId, {
        id: targetId,
        displayName: targetId,
        hasFunding: false,
        endorsementCount: 0,
        dependedOnBy: 0,
        dependsOn: 0,
        tags: [],
        source: 'fund.at',
      })
    }
  }
}

function countEndorsementsFromSamples(
  nodes: Map<string, GraphNode>,
  samples: UfosRecordSample[],
): void {
  const counts = new Map<string, number>()
  for (const sample of samples) {
    const targetUri = (sample.record as { uri?: string }).uri
    if (!targetUri) continue
    const normalized = normalizeStewardUri(targetUri) ?? targetUri
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  for (const [targetId, count] of counts) {
    const node = nodes.get(targetId)
    if (node) {
      node.endorsementCount = Math.max(node.endorsementCount, count)
    }
  }
}

// ---------------------------------------------------------------------------
// Enrich with Constellation backlink counts
// ---------------------------------------------------------------------------

async function enrichWithConstellationCounts(
  nodes: Map<string, GraphNode>,
): Promise<void> {
  const nodesWithDid = [...nodes.values()].filter((n) => n.did)

  const BATCH = 10
  for (let i = 0; i < nodesWithDid.length; i += BATCH) {
    const batch = nodesWithDid.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (node) => {
        if (!node.did) return

        const cached = await getCachedEndorsements(node.did)
        if (cached !== null) {
          node.endorsementCount = Math.max(node.endorsementCount, cached)
          return
        }

        const counts = await safeGetAllLinksCounts(node.did)
        const endorseCount = counts['fund.at.endorse']?.['.uri'] ?? 0
        const depCount = counts['fund.at.dependency']?.['.uri'] ?? 0

        node.endorsementCount = Math.max(node.endorsementCount, endorseCount)
        node.dependedOnBy = Math.max(node.dependedOnBy, depCount)

        await setCachedEndorsements(node.did, endorseCount)
      }),
    )
  }
}

// ---------------------------------------------------------------------------
// Compute degree metrics from edges
// ---------------------------------------------------------------------------

function computeDegrees(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
): void {
  for (const node of nodes.values()) {
    node.dependedOnBy = Math.max(node.dependedOnBy, 0)
    node.dependsOn = 0
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    if (source) source.dependsOn += 1
    if (target) target.dependedOnBy += 1
  }
}

// ---------------------------------------------------------------------------
// Fetch UFOs aggregate stats (network-wide totals)
// ---------------------------------------------------------------------------

async function fetchUfosStats(): Promise<NetworkStats['ufos']> {
  const COLLECTIONS = ['fund.at.contribute', 'fund.at.dependency', 'fund.at.endorse']

  // Use /prefix for the summary, and /collections/stats for per-collection detail
  const [prefixData, statsData] = await Promise.all([
    safeListPrefix('fund.at'),
    safeGetCollectionStats(COLLECTIONS),
  ])

  const findChild = (nsid: string) =>
    prefixData.children.find((c) => c.nsid === nsid)

  const contributeInfo = findChild('fund.at.contribute')
  const dependencyInfo = findChild('fund.at.dependency')
  const endorseInfo = findChild('fund.at.endorse')

  // Stats data gives us creates/dids for the default time window (last 7d)
  // Prefix data gives us all-time creates
  // Use prefix for totals (all-time is more meaningful for the graph)
  return {
    contributeRecords: contributeInfo?.creates ?? statsData['fund.at.contribute']?.creates ?? 0,
    contributeDids: contributeInfo?.dids_estimate ?? statsData['fund.at.contribute']?.dids_estimate ?? 0,
    dependencyRecords: dependencyInfo?.creates ?? statsData['fund.at.dependency']?.creates ?? 0,
    dependencyDids: dependencyInfo?.dids_estimate ?? statsData['fund.at.dependency']?.dids_estimate ?? 0,
    endorseRecords: endorseInfo?.creates ?? statsData['fund.at.endorse']?.creates ?? 0,
    endorseDids: endorseInfo?.dids_estimate ?? statsData['fund.at.endorse']?.dids_estimate ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Main build function
// ---------------------------------------------------------------------------

export async function buildAnalyticsGraph(): Promise<AnalyticsGraph> {
  // Check cache first
  const cached = await getCachedGraph()
  if (cached) {
    return cached as unknown as AnalyticsGraph
  }

  logger.info('analytics-graph: building graph...')

  // 1. Start with catalog
  const { nodes, edges } = buildCatalogGraph()
  logger.info('analytics-graph: catalog loaded', {
    nodes: nodes.size,
    edges: edges.length,
  })

  // 2. Fetch UFOs samples + stats in parallel
  const [samples, ufosStats] = await Promise.all([
    fetchSamples(),
    fetchUfosStats(),
  ])

  logger.info('analytics-graph: UFOs data fetched', {
    contributeSamples: samples.contribute.length,
    dependencySamples: samples.dependency.length,
    endorseSamples: samples.endorse.length,
    ufosStats,
  })

  // 3. Merge sample data into graph
  enrichWithContributeSamples(nodes, samples.contribute)
  enrichWithDependencySamples(nodes, edges, samples.dependency)
  countEndorsementsFromSamples(nodes, samples.endorse)

  // 4. Compute edge-based degrees
  computeDegrees(nodes, edges)

  // 5. Enrich with Constellation backlink counts
  await enrichWithConstellationCounts(nodes)

  // 6. Compute stats
  const allNodes = [...nodes.values()]
  const totalWithFunding = allNodes.filter((n) => n.hasFunding).length
  const totalEndorsements = allNodes.reduce(
    (sum, n) => sum + n.endorsementCount,
    0,
  )

  const graph: AnalyticsGraph = {
    nodes: allNodes,
    edges,
    stats: {
      totalStewards: allNodes.length,
      totalWithFunding,
      totalDependencyLinks: edges.length,
      totalEndorsements,
      fundedPercentage:
        allNodes.length > 0
          ? Math.round((totalWithFunding / allNodes.length) * 100)
          : 0,
      ufos: ufosStats ?? undefined,
    },
    updatedAt: new Date().toISOString(),
  }

  // Cache the result
  await setCachedGraph(graph as unknown as StoredGraph)

  logger.info('analytics-graph: build complete', {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    stats: graph.stats,
  })

  return graph
}
