/**
 * Graph data aggregation for the public analytics page.
 *
 * Merges three data sources into a unified dependency graph:
 *   1. Manual catalog (src/data/catalog/*.json)
 *   2. UFOs network-wide fund.at.* records
 *   3. Constellation backlink counts (endorsements, dependency in-degree)
 */

import fs from 'node:fs'
import path from 'node:path'
import { logger } from '@/lib/logger'
import { normalizeStewardUri } from '@/lib/steward-uri'
import {
  safeFetchAllRecords,
  safeGetAllLinksCounts,
  type UfosRecord,
} from '@/lib/microcosm'
import {
  getCachedGraph,
  setCachedGraph,
  getCachedRecords,
  setCachedRecords,
  getCursor,
  setCursor,
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
// Enrich with UFOs records
// ---------------------------------------------------------------------------

/** Extract DID from an AT URI (at://did:plc:.../collection/rkey → did:plc:...) */
function didFromAtUri(atUri: string): string | null {
  if (!atUri.startsWith('at://')) return null
  const authority = atUri.slice(5).split('/')[0]
  return authority?.startsWith('did:') ? authority : null
}

/** Best-effort steward URI from a DID — just the DID itself for now */
function stewardIdFromDid(did: string): string {
  return did
}

async function fetchFundAtRecords(nsid: string): Promise<UfosRecord[]> {
  // Check cache first
  const cached = await getCachedRecords(nsid)
  if (cached) return cached

  // Fetch from UFOs with incremental cursor
  const startCursor = await getCursor(nsid) ?? undefined
  const result = await safeFetchAllRecords(nsid, { startCursor })

  // Merge with any cached records
  const merged = cached ? [...cached, ...result.records] : result.records
  await setCachedRecords(nsid, merged)
  if (result.lastCursor) {
    await setCursor(nsid, result.lastCursor)
  }

  return merged
}

function enrichWithContributeRecords(
  nodes: Map<string, GraphNode>,
  records: UfosRecord[],
): void {
  for (const rec of records) {
    const did = rec.did ?? didFromAtUri(rec.uri)
    if (!did) continue

    const id = stewardIdFromDid(did)
    const url = (rec.value as { url?: string }).url
    const createdAt = (rec.value as { createdAt?: string }).createdAt ?? rec.indexedAt

    const existing = nodes.get(id)
    if (existing) {
      existing.did = existing.did ?? did
      if (url) {
        existing.contributeUrl = existing.contributeUrl ?? url
        existing.hasFunding = true
      }
      if (createdAt) {
        existing.createdAt = existing.createdAt ?? createdAt
      }
      existing.source = existing.source === 'manual' ? 'both' : 'fund.at'
    } else {
      nodes.set(id, {
        id,
        did,
        displayName: did,
        hasFunding: !!url,
        contributeUrl: url,
        endorsementCount: 0,
        dependedOnBy: 0,
        dependsOn: 0,
        tags: [],
        source: 'fund.at',
        createdAt,
      })
    }
  }
}

function enrichWithDependencyRecords(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  records: UfosRecord[],
): void {
  const edgeSet = new Set(edges.map((e) => `${e.source}→${e.target}`))

  for (const rec of records) {
    const did = rec.did ?? didFromAtUri(rec.uri)
    if (!did) continue

    const sourceId = stewardIdFromDid(did)
    const depUri = (rec.value as { uri?: string }).uri
    if (!depUri) continue

    const targetId = normalizeStewardUri(depUri) ?? depUri
    const edgeKey = `${sourceId}→${targetId}`
    if (edgeSet.has(edgeKey)) continue
    edgeSet.add(edgeKey)

    const label = (rec.value as { label?: string }).label
    edges.push({ source: sourceId, target: targetId, label })

    // Ensure source node exists
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

    // Ensure target node exists
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

function countEndorsementsFromRecords(
  nodes: Map<string, GraphNode>,
  records: UfosRecord[],
): void {
  // Count endorsements per target URI
  const counts = new Map<string, number>()
  for (const rec of records) {
    const targetUri = (rec.value as { uri?: string }).uri
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
  // Only query Constellation for nodes that have a DID (needed as target)
  const nodesWithDid = [...nodes.values()].filter((n) => n.did)

  // Batch in parallel, but limit concurrency
  const BATCH = 10
  for (let i = 0; i < nodesWithDid.length; i += BATCH) {
    const batch = nodesWithDid.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (node) => {
        if (!node.did) return

        // Check cache
        const cached = await getCachedEndorsements(node.did)
        if (cached !== null) {
          node.endorsementCount = Math.max(node.endorsementCount, cached)
          return
        }

        const counts = await safeGetAllLinksCounts(node.did)
        const endorseCount =
          counts['fund.at.endorse']?.['.uri'] ?? 0
        const depCount =
          counts['fund.at.dependency']?.['.uri'] ?? 0

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
  // Reset
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

  // 2. Fetch fund.at.* records from UFOs
  const [contributeRecords, dependencyRecords, endorseRecords] =
    await Promise.all([
      fetchFundAtRecords('fund.at.contribute'),
      fetchFundAtRecords('fund.at.dependency'),
      fetchFundAtRecords('fund.at.endorse'),
    ])

  logger.info('analytics-graph: UFOs records fetched', {
    contribute: contributeRecords.length,
    dependency: dependencyRecords.length,
    endorse: endorseRecords.length,
  })

  // 3. Merge UFOs data into graph
  enrichWithContributeRecords(nodes, contributeRecords)
  enrichWithDependencyRecords(nodes, edges, dependencyRecords)
  countEndorsementsFromRecords(nodes, endorseRecords)

  // 4. Compute edge-based degrees
  computeDegrees(nodes, edges)

  // 5. Enrich with Constellation backlink counts (supplements edge-based)
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
