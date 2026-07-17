import { describe, it, expect } from 'vitest'
import { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import { LexicalAnchorResolver } from '../resolver/anchor-resolver.js'
import { SMALL_GRAPH, NODES } from './fixtures/small-graph.js'

const graphQuery = new CapabilityGraphQuery(SMALL_GRAPH)
const resolver = new LexicalAnchorResolver()

describe('LexicalAnchorResolver', () => {
  it('resolves node by exact name', async () => {
    const nodes = await resolver.resolve('pandas', graphQuery)
    expect(nodes.map(n => n.nodeId)).toContain(NODES.pandas.nodeId)
  })

  it('resolves concept:// prefix directly', async () => {
    const nodes = await resolver.resolve('concept://dataframe', graphQuery)
    expect(nodes.map(n => n.nodeId)).toContain(NODES.dfConcept.nodeId)
  })

  it('returns empty array for unknown term, does not throw', async () => {
    const nodes = await resolver.resolve('unknownxyz123', graphQuery)
    expect(nodes).toHaveLength(0)
  })

  it('resolves multi-term query to multiple anchors', async () => {
    const nodes = await resolver.resolve('pandas matplotlib', graphQuery)
    const ids = nodes.map(n => n.nodeId)
    expect(ids).toContain(NODES.pandas.nodeId)
    expect(ids).toContain(NODES.matplotlib.nodeId)
  })

  it('eliminates duplicate nodes when same term matches multiple times', async () => {
    const nodes = await resolver.resolve('pandas pandas', graphQuery)
    const ids = nodes.map(n => n.nodeId)
    const pandasCount = ids.filter(id => id === NODES.pandas.nodeId).length
    expect(pandasCount).toBe(1)
  })
})
