'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { GraphNode, GraphEdge } from '@/lib/analytics-graph'

// ---------------------------------------------------------------------------
// Types for D3 simulation
// ---------------------------------------------------------------------------

type SimNode = GraphNode & d3.SimulationNodeDatum
type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR = {
  funded: '#059669',    // --support (green)
  unfunded: '#d97706', // --discover (amber)
  network: '#7c3aed',  // --network (violet)
  edge: '#94a3b8',     // slate-400
  edgeHighlight: '#475569', // slate-600
  background: '#f8fafc', // slate-50
  text: '#1e293b',      // slate-800
  textMuted: '#64748b',  // slate-500
}

const MIN_RADIUS = 6
const MAX_RADIUS = 32

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type DependencyGraphProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (node: GraphNode) => void
  focusNodeId?: string | null
}

export function DependencyGraph({
  nodes,
  edges,
  onNodeClick,
  focusNodeId,
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const [tooltip, setTooltip] = useState<{
    node: GraphNode
    x: number
    y: number
  } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Observe container resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 400),
        })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Radius scale based on dependedOnBy
  const radiusScale = useCallback(() => {
    const maxDeg = Math.max(1, ...nodes.map((n) => n.dependedOnBy))
    return d3.scaleSqrt().domain([0, maxDeg]).range([MIN_RADIUS, MAX_RADIUS])
  }, [nodes])

  // Node color
  const nodeColor = useCallback((node: GraphNode) => {
    if (node.hasFunding) return COLOR.funded
    if (node.tags.includes('follow') || node.tags.includes('pds-host'))
      return COLOR.network
    return COLOR.unfunded
  }, [])

  // Build and run simulation
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || nodes.length === 0) return

    const { width, height } = dimensions
    const rScale = radiusScale()

    // Prepare data — D3 mutates these objects
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const nodeById = new Map(simNodes.map((n) => [n.id, n]))

    const simLinks: SimLink[] = []
    for (const e of edges) {
      const source = nodeById.get(e.source)
      const target = nodeById.get(e.target)
      if (source && target) {
        simLinks.push({ source, target, label: e.label })
      }
    }

    // Clear previous
    const svgSel = d3.select(svg)
    svgSel.selectAll('*').remove()

    // Container group for zoom
    const g = svgSel.append('g')

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svgSel.call(zoom)

    // Arrow marker
    g.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', COLOR.edge)

    // Edges
    const linkSel = g
      .append('g')
      .attr('class', 'links')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', COLOR.edge)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.4)
      .attr('marker-end', 'url(#arrowhead)')

    // Nodes
    const nodeSel = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => rScale(d.dependedOnBy))
      .attr('fill', (d) => nodeColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('mouseover', function (_event, d) {
        d3.select(this).attr('stroke', COLOR.text).attr('stroke-width', 2.5)
        // Highlight connected edges
        linkSel
          .attr('stroke', (l) => {
            const src = (l.source as SimNode).id
            const tgt = (l.target as SimNode).id
            return src === d.id || tgt === d.id
              ? COLOR.edgeHighlight
              : COLOR.edge
          })
          .attr('stroke-opacity', (l) => {
            const src = (l.source as SimNode).id
            const tgt = (l.target as SimNode).id
            return src === d.id || tgt === d.id ? 0.8 : 0.15
          })
          .attr('stroke-width', (l) => {
            const src = (l.source as SimNode).id
            const tgt = (l.target as SimNode).id
            return src === d.id || tgt === d.id ? 2 : 1
          })
      })
      .on('mousemove', function (event, d) {
        const [x, y] = d3.pointer(event, containerRef.current)
        setTooltip({ node: d, x, y })
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1.5)
        linkSel
          .attr('stroke', COLOR.edge)
          .attr('stroke-opacity', 0.4)
          .attr('stroke-width', 1)
        setTooltip(null)
      })
      .on('click', (_event, d) => {
        onNodeClick?.(d)
      })

    // Labels for high-degree nodes
    const labelThreshold = Math.max(2, d3.quantile(
      simNodes.map((n) => n.dependedOnBy).sort(d3.ascending),
      0.85,
    ) ?? 2)

    g.append('g')
      .attr('class', 'labels')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(simNodes.filter((n) => n.dependedOnBy >= labelThreshold))
      .join('text')
      .text((d) => d.displayName.length > 20 ? d.displayName.slice(0, 18) + '...' : d.displayName)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-geist-mono), monospace')
      .attr('fill', COLOR.text)
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => -(rScale(d.dependedOnBy) + 6))
      .attr('pointer-events', 'none')

    // Drag behavior
    const drag = d3
      .drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
    nodeSel.call(drag)

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(80),
      )
      .force('charge', d3.forceManyBody().strength((d) => {
        const node = d as SimNode
        return -100 - node.dependedOnBy * 30
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>((d) => rScale(d.dependedOnBy) + 4))
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0)

        nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)

        g.selectAll<SVGTextElement, SimNode>('.labels text')
          .attr('x', (d) => d.x ?? 0)
          .attr('y', (d) => d.y ?? 0)
      })

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, dimensions, radiusScale, nodeColor, onNodeClick])

  // Focus/zoom to a specific node
  useEffect(() => {
    if (!focusNodeId || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g')
    const nodeSel = g.selectAll<SVGCircleElement, SimNode>('circle')

    const targetData = nodeSel.data().find((d) => d.id === focusNodeId)
    if (!targetData || targetData.x == null || targetData.y == null) return

    const { width, height } = dimensions
    const scale = 2
    const tx = width / 2 - targetData.x * scale
    const ty = height / 2 - targetData.y * scale

    svg
      .transition()
      .duration(750)
      .call(
        d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.1, 8])
          .on('zoom', (event) => g.attr('transform', event.transform))
          .transform as never,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      )

    // Highlight
    nodeSel
      .attr('stroke', (d) => (d.id === focusNodeId ? COLOR.funded : '#fff'))
      .attr('stroke-width', (d) => (d.id === focusNodeId ? 3 : 1.5))
  }, [focusNodeId, dimensions])

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: '65vh', minHeight: 400 }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800"
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tooltip.node.displayName}
          </p>
          {tooltip.node.handle && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              @{tooltip.node.handle}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {tooltip.node.hasFunding ? (
                <span className="text-[var(--support)]">Funded</span>
              ) : (
                <span className="text-[var(--discover)]">Unfunded</span>
              )}
            </span>
            {tooltip.node.endorsementCount > 0 && (
              <span>{tooltip.node.endorsementCount} endorsements</span>
            )}
            {tooltip.node.dependedOnBy > 0 && (
              <span>{tooltip.node.dependedOnBy} depend on this</span>
            )}
            {tooltip.node.dependsOn > 0 && (
              <span>depends on {tooltip.node.dependsOn}</span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-4 rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-600 backdrop-blur dark:bg-slate-900/90 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLOR.funded }}
          />
          Funded
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLOR.unfunded }}
          />
          Unfunded
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLOR.network }}
          />
          Network
        </span>
        <span className="text-slate-400">Larger = more depended on</span>
      </div>
    </div>
  )
}
