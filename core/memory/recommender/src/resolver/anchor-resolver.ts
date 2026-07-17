import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'

// Lexical lookup only: tokenise on spaces, match node.name or concept:// prefix.
// No NLP, no fuzzy matching, no embeddings — intentionally primitive.
export class LexicalAnchorResolver {
  async resolve(query: string, graphQuery: CapabilityGraphQuery): Promise<readonly CapabilityGraphNode[]> {
    const graph = (graphQuery as unknown as { graph: import('@rohinik-org/compiler').CapabilityGraph }).graph
    const terms = query.trim().split(/\s+/).filter(Boolean)
    const seen = new Set<string>()
    const results: CapabilityGraphNode[] = []

    for (const term of terms) {
      const lowerTerm = term.toLowerCase()
      for (const node of graph.nodes) {
        if (seen.has(node.nodeId)) continue
        const matchesName = node.name.toLowerCase() === lowerTerm
        const matchesId = node.nodeId.toLowerCase() === lowerTerm
        const matchesTag = node.tags.some(t => t.toLowerCase() === lowerTerm)

        if (matchesName || matchesId || matchesTag) {
          seen.add(node.nodeId)
          results.push(node)
        }
      }
    }
    return results
  }
}
