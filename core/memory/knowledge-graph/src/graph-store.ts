import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CapabilityGraph, CapabilityGraphNode, CapabilityGraphEdge } from '@rohinik-org/compiler'

export class GraphStore {
  private readonly path: string
  constructor(root: string) { this.path = join(root, '.aios', 'capability-graph.json') }

  empty(): CapabilityGraph {
    const now = new Date().toISOString()
    return { kind: 'CapabilityGraph', schemaVersion: '1.0', graphId: createHash('sha256').update(now).digest('hex'), revision: 0, capturedAt: now, lastUpdatedAt: now, nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }
  }

  async read(): Promise<CapabilityGraph> {
    if (!existsSync(this.path)) return this.empty()
    try { return JSON.parse(await readFile(this.path, 'utf-8')) as CapabilityGraph } catch { return this.empty() }
  }

  async write(graph: CapabilityGraph): Promise<void> {
    await mkdir(join(this.path, '..'), { recursive: true })
    await writeFile(this.path, JSON.stringify(graph, null, 2), 'utf-8')
  }

  merge(base: CapabilityGraph, newNodes: readonly CapabilityGraphNode[], newEdges: readonly CapabilityGraphEdge[]): CapabilityGraph {
    const existingNodeIds = new Set(base.nodes.map(n => n.nodeId))
    const existingEdgeIds = new Set(base.edges.map(e => e.edgeId))
    const addedNodes = newNodes.filter(n => !existingNodeIds.has(n.nodeId))
    const addedEdges = newEdges.filter(e => !existingEdgeIds.has(e.edgeId))
    const nodes = [...base.nodes, ...addedNodes]
    const edges = [...base.edges, ...addedEdges]
    const changed = addedNodes.length + addedEdges.length > 0
    const graphId = createHash('sha256').update(JSON.stringify({ nodes, edges })).digest('hex')
    return { ...base, graphId, revision: base.revision + (changed ? 1 : 0), lastUpdatedAt: new Date().toISOString(), nodes, edges, nodeCount: nodes.length, edgeCount: edges.length }
  }

  isStale(graph: CapabilityGraph, maxAgeHours = 24): boolean {
    return Date.now() - new Date(graph.lastUpdatedAt).getTime() > maxAgeHours * 3_600_000
  }
}
