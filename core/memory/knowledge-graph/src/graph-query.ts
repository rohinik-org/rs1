import type { CapabilityGraph, CapabilityGraphNode, CapabilityGraphRelationship } from '@rohinik-org/compiler'

export class CapabilityGraphQuery {
  private readonly nodeMap: Map<string, CapabilityGraphNode>
  constructor(private readonly graph: CapabilityGraph) {
    this.nodeMap = new Map(graph.nodes.map(n => [n.nodeId, n]))
  }

  reachable(nodeId: string, relationship?: CapabilityGraphRelationship, depth = 10): CapabilityGraphNode[] {
    const visited = new Set<string>()
    const result: CapabilityGraphNode[] = []
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.d >= depth) continue
      for (const edge of this.graph.edges.filter(e => e.source === current.id && (!relationship || e.relationship === relationship))) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target)
          const node = this.nodeMap.get(edge.target)
          if (node) { result.push(node); queue.push({ id: edge.target, d: current.d + 1 }) }
        }
      }
    }
    return result
  }

  reverseReachable(nodeId: string, relationship?: CapabilityGraphRelationship): CapabilityGraphNode[] {
    return this.graph.edges.filter(e => e.target === nodeId && (!relationship || e.relationship === relationship)).map(e => this.nodeMap.get(e.source)).filter((n): n is CapabilityGraphNode => n !== undefined)
  }

  findDependencies(nodeId: string, depth?: number): CapabilityGraphNode[] { return this.reachable(nodeId, 'DEPENDS_ON', depth) }
  findDependents(nodeId: string): CapabilityGraphNode[] { return this.reverseReachable(nodeId, 'DEPENDS_ON') }
  findAlternatives(nodeId: string): CapabilityGraphNode[] { return this.reachable(nodeId, 'ALTERNATIVE_TO', 1) }
  findProviders(nodeId: string): CapabilityGraphNode[] { return this.reverseReachable(nodeId, 'USES_PROVIDER') }
  findHostRequirements(nodeId: string): CapabilityGraphNode[] { return this.reachable(nodeId, 'REQUIRES_HOST', 1) }
  findNeighbors(nodeId: string, relationship?: CapabilityGraphRelationship): CapabilityGraphNode[] {
    const seen = new Set<string>()
    return [...this.reachable(nodeId, relationship, 1), ...this.reverseReachable(nodeId, relationship)].filter(n => { if (seen.has(n.nodeId)) return false; seen.add(n.nodeId); return true })
  }

  shortestPath(fromId: string, toId: string): CapabilityGraphNode[] | null {
    if (fromId === toId) return [this.nodeMap.get(fromId)].filter(Boolean) as CapabilityGraphNode[]
    const visited = new Set<string>([fromId])
    const queue: string[][] = [[fromId]]
    while (queue.length > 0) {
      const path = queue.shift()!
      const current = path[path.length - 1]!
      if (path.length > 6) continue
      for (const next of this.graph.edges.filter(e => e.source === current).map(e => e.target)) {
        if (next === toId) return [...path, next].map(id => this.nodeMap.get(id)).filter(Boolean) as CapabilityGraphNode[]
        if (!visited.has(next)) { visited.add(next); queue.push([...path, next]) }
      }
    }
    return null
  }

  exists(nodeId: string): boolean { return this.nodeMap.has(nodeId) }

  subgraph(nodeId: string, depth = 2): CapabilityGraph {
    const reached = new Set([nodeId, ...this.reachable(nodeId, undefined, depth).map(n => n.nodeId), ...this.reverseReachable(nodeId).map(n => n.nodeId)])
    const nodes = this.graph.nodes.filter(n => reached.has(n.nodeId))
    const edges = this.graph.edges.filter(e => reached.has(e.source) && reached.has(e.target))
    return { ...this.graph, nodes, edges, nodeCount: nodes.length, edgeCount: edges.length }
  }

  validate(): readonly { edge: import('@rohinik-org/compiler').CapabilityGraphEdge; issue: string }[] {
    const nodeIds = new Set(this.graph.nodes.map(n => n.nodeId))
    return this.graph.edges.flatMap(edge => {
      const issues = []
      if (!nodeIds.has(edge.source)) issues.push({ edge, issue: `Missing source node: ${edge.source}` })
      if (!nodeIds.has(edge.target)) issues.push({ edge, issue: `Missing target node: ${edge.target}` })
      return issues
    })
  }
}
