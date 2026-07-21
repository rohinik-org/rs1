import type {
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeRelationship,
  KnowledgePrimitive,
  EntityKind,
  ProcedureDefinition,
} from '@rohinik-org/knowledge'

export interface ReasoningResult<T> {
  readonly value: T
  readonly visitedNodes: ReadonlyArray<string>
  readonly path: ReadonlyArray<string>
  readonly score: number
  readonly explanation: string
}

export interface KnowledgeGraph {
  readonly nodes: ReadonlyArray<KnowledgeNode>
  readonly edges: ReadonlyArray<KnowledgeEdge>
}

export interface ReasoningPrimitive<TInput, TOutput> {
  readonly name: string
  apply(input: TInput, graph: KnowledgeGraph): ReasoningResult<TOutput>
}

export interface TraverseInput {
  readonly startNodeId: string
  readonly relationship?: KnowledgeRelationship
  readonly maxDepth?: number
}

export interface InferInput {
  readonly nodeId: string
  readonly relationship: KnowledgeRelationship
}

export interface InferenceCandidate {
  readonly nodeId: string
  readonly certainty: number
  readonly via: string
}

export interface ComparisonResult {
  readonly shared: ReadonlyArray<string>
  readonly onlyInA: ReadonlyArray<string>
  readonly onlyInB: ReadonlyArray<string>
  readonly similarityScore: number
}

export interface ComposedProcedure {
  readonly steps: ReadonlyArray<{ nodeId: string; label: string; position: number }>
  readonly totalCertainty: number
}

export interface MatchInput {
  readonly primitive?: KnowledgePrimitive
  readonly kind?: EntityKind
  readonly labelContains?: string
}

// ── Pure graph helpers ─────────────────────────────────────────────────────

function nodeById(graph: KnowledgeGraph, id: string): KnowledgeNode | undefined {
  return graph.nodes.find(n => n.id === id)
}

function neighborsOf(graph: KnowledgeGraph, nodeId: string, rel?: KnowledgeRelationship): string[] {
  return graph.edges
    .filter(e => e.sourceNodeId === nodeId && (!rel || e.relationship === rel))
    .map(e => e.targetNodeId)
}

// ── Resolve ────────────────────────────────────────────────────────────────

export const Resolve: ReasoningPrimitive<string, KnowledgeNode | undefined> = {
  name: 'Resolve',
  apply(nodeId, graph) {
    const node = nodeById(graph, nodeId)
    return {
      value: node,
      visitedNodes: [nodeId],
      path: [nodeId],
      score: node ? node.certainty : 0,
      explanation: node ? `Resolved node '${node.label}' by id` : `Node '${nodeId}' not found`,
    }
  },
}

// ── Traverse ────────────────────────────────────────────────────────────────

export const Traverse: ReasoningPrimitive<TraverseInput, KnowledgeNode[]> = {
  name: 'Traverse',
  apply({ startNodeId, relationship, maxDepth = 10 }, graph) {
    const visited = new Set<string>()
    const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: startNodeId, depth: 0, path: [startNodeId] }]
    const result: KnowledgeNode[] = []
    let bestPath: string[] = [startNodeId]

    while (queue.length > 0) {
      const item = queue.shift()!
      if (visited.has(item.id) || item.depth > maxDepth) continue
      visited.add(item.id)
      const node = nodeById(graph, item.id)
      if (node && item.id !== startNodeId) result.push(node)
      if (item.depth < maxDepth) {
        for (const n of neighborsOf(graph, item.id, relationship)) {
          if (!visited.has(n)) queue.push({ id: n, depth: item.depth + 1, path: [...item.path, n] })
        }
      }
      if (item.path.length > bestPath.length) bestPath = item.path
    }

    const totalCertainty = result.reduce((sum, n) => sum + n.certainty, 0)
    return {
      value: result,
      visitedNodes: [...visited],
      path: bestPath,
      score: result.length > 0 ? totalCertainty / result.length : 0,
      explanation: `Traversed ${visited.size} nodes from '${startNodeId}'${relationship ? ` via ${relationship}` : ''}`,
    }
  },
}

// ── Infer ────────────────────────────────────────────────────────────────

export const Infer: ReasoningPrimitive<InferInput, InferenceCandidate[]> = {
  name: 'Infer',
  apply({ nodeId, relationship }, graph) {
    const direct = neighborsOf(graph, nodeId, relationship)
    const candidates: InferenceCandidate[] = []

    // one-hop inference: A→B→C implies A→C with reduced certainty
    for (const mid of direct) {
      for (const target of neighborsOf(graph, mid, relationship)) {
        if (target !== nodeId && !direct.includes(target)) {
          const midNode = nodeById(graph, mid)
          const targetNode = nodeById(graph, target)
          const certainty = (midNode?.certainty ?? 0.5) * (targetNode?.certainty ?? 0.5)
          candidates.push({ nodeId: target, certainty, via: mid })
        }
      }
    }

    return {
      value: candidates,
      visitedNodes: [nodeId, ...direct],
      path: [nodeId],
      score: candidates.length > 0 ? candidates.reduce((sum, c) => sum + c.certainty, 0) / candidates.length : 0,
      explanation: `Inferred ${candidates.length} candidates from '${nodeId}' via ${relationship}`,
    }
  },
}

// ── Compare ────────────────────────────────────────────────────────────────

export const Compare: ReasoningPrimitive<[string, string], ComparisonResult> = {
  name: 'Compare',
  apply([nodeAId, nodeBId], graph) {
    const aNeighbors = new Set(neighborsOf(graph, nodeAId))
    const bNeighbors = new Set(neighborsOf(graph, nodeBId))
    const shared = [...aNeighbors].filter(n => bNeighbors.has(n))
    const onlyInA = [...aNeighbors].filter(n => !bNeighbors.has(n))
    const onlyInB = [...bNeighbors].filter(n => !aNeighbors.has(n))
    const total = new Set([...aNeighbors, ...bNeighbors]).size
    const similarityScore = total > 0 ? shared.length / total : 0

    return {
      value: { shared, onlyInA, onlyInB, similarityScore },
      visitedNodes: [nodeAId, nodeBId],
      path: [nodeAId, nodeBId],
      score: similarityScore,
      explanation: `Compared '${nodeAId}' and '${nodeBId}': ${shared.length} shared, ${onlyInA.length}/${onlyInB.length} unique`,
    }
  },
}

// ── Expand ────────────────────────────────────────────────────────────────

export const Expand: ReasoningPrimitive<string, KnowledgeNode[]> = {
  name: 'Expand',
  apply(nodeId, graph) {
    const neighborIds = neighborsOf(graph, nodeId)
    const nodes = neighborIds.flatMap(id => {
      const n = nodeById(graph, id)
      return n ? [n] : []
    })
    return {
      value: nodes,
      visitedNodes: [nodeId, ...neighborIds],
      path: [nodeId],
      score: nodes.length > 0 ? nodes.reduce((sum, n) => sum + n.certainty, 0) / nodes.length : 0,
      explanation: `Expanded '${nodeId}' to ${nodes.length} direct neighbors`,
    }
  },
}

// ── Compose ────────────────────────────────────────────────────────────────

export const Compose: ReasoningPrimitive<string[], ComposedProcedure> = {
  name: 'Compose',
  apply(nodeIds, graph) {
    const steps = nodeIds.flatMap((id, i) => {
      const n = nodeById(graph, id)
      return n ? [{ nodeId: id, label: n.label, position: i }] : []
    })
    const certainties = steps.map(s => nodeById(graph, s.nodeId)?.certainty ?? 0)
    const totalCertainty = certainties.length > 0 ? Math.min(...certainties) : 0

    return {
      value: { steps, totalCertainty },
      visitedNodes: nodeIds,
      path: nodeIds,
      score: totalCertainty,
      explanation: `Composed ${steps.length} steps from ${nodeIds.length} node ids`,
    }
  },
}

// ── Match ────────────────────────────────────────────────────────────────

export const Match: ReasoningPrimitive<MatchInput, KnowledgeNode[]> = {
  name: 'Match',
  apply({ primitive, kind, labelContains }, graph) {
    const matched = graph.nodes.filter(n => {
      if (primitive && n.primitive !== primitive) return false
      if (kind && n.kind !== kind) return false
      if (labelContains && !n.label.toLowerCase().includes(labelContains.toLowerCase())) return false
      return true
    })
    return {
      value: matched,
      visitedNodes: matched.map(n => n.id),
      path: [],
      score: matched.length > 0 ? matched.reduce((sum, n) => sum + n.certainty, 0) / matched.length : 0,
      explanation: `Matched ${matched.length} nodes with filter: ${JSON.stringify({ primitive, kind, labelContains })}`,
    }
  },
}

// ── Score ────────────────────────────────────────────────────────────────

export const Score: ReasoningPrimitive<string, number> = {
  name: 'Score',
  apply(nodeId, graph) {
    const node = nodeById(graph, nodeId)
    const edgeCount = graph.edges.filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId).length
    const neighborCertainties = neighborsOf(graph, nodeId).map(id => nodeById(graph, id)?.certainty ?? 0)
    const networkScore = neighborCertainties.length > 0
      ? neighborCertainties.reduce((sum, c) => sum + c, 0) / neighborCertainties.length
      : 0
    const score = node ? (node.certainty * 0.6 + networkScore * 0.4) : 0

    return {
      value: score,
      visitedNodes: [nodeId, ...neighborsOf(graph, nodeId)],
      path: [nodeId],
      score,
      explanation: `Scored '${nodeId}': certainty=${node?.certainty ?? 0}, edges=${edgeCount}, network=${networkScore.toFixed(2)}`,
    }
  },
}
