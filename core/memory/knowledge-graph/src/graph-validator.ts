import type { CapabilityGraph, CapabilityGraphEdge } from '@rohinik-org/compiler'

export interface ValidationIssue { readonly edge: CapabilityGraphEdge; readonly issue: string }

export class GraphValidator {
  validate(graph: CapabilityGraph): readonly ValidationIssue[] {
    const nodeIds = new Set(graph.nodes.map(n => n.nodeId))
    return graph.edges.flatMap(edge => {
      const issues: ValidationIssue[] = []
      if (!nodeIds.has(edge.source)) issues.push({ edge, issue: `Missing source node: ${edge.source}` })
      if (!nodeIds.has(edge.target)) issues.push({ edge, issue: `Missing target node: ${edge.target}` })
      return issues
    })
  }
}
