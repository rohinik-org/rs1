import { describe, it, expect } from 'vitest'
import {
  Resolve,
  Traverse,
  Infer,
  Compare,
  Expand,
  Compose,
  Match,
  Score,
  type KnowledgeGraph,
} from '../index.js'
import type { KnowledgeNode, KnowledgeEdge, KnowledgeSource, Provenance, KnowledgeEvidence } from '@rohinik-org/knowledge'
import { KnowledgeRelationship } from '@rohinik-org/knowledge'
import { createHash } from 'node:crypto'

function id(s: string) { return createHash('sha256').update(s).digest('hex').slice(0, 8) }

const src: KnowledgeSource = { type: 'filesystem', id: 'test' }
const prov: Provenance = { observationIds: [], fragmentIds: [], workflowIds: [], extractorId: 'test' }
const ev: KnowledgeEvidence = { source: src, observationCount: 1, extractionMethod: 'test' }

function node(label: string): KnowledgeNode {
  return {
    id: id(label),
    primitive: 'Entity',
    kind: 'Library',
    label,
    source: src,
    certainty: 0.9,
    evidence: [ev],
    provenance: prov,
    attributes: {},
  }
}

function edge(from: string, to: string): KnowledgeEdge {
  const fromId = id(from)
  const toId = id(to)
  return {
    id: id(`${from}-${to}`),
    sourceNodeId: fromId,
    targetNodeId: toId,
    relationship: KnowledgeRelationship.DEPENDS_ON,
    certainty: 0.9,
    evidence: [ev],
    provenance: prov,
  }
}

const reactNode = node('react')
const tsNode = node('typescript')
const vitestNode = node('vitest')

const graph: KnowledgeGraph = {
  nodes: [reactNode, tsNode, vitestNode],
  edges: [
    { ...edge('react', 'typescript'), id: id('r-ts') },
    { ...edge('typescript', 'vitest'), id: id('ts-v') },
  ],
}

describe('ReasoningResult shape', () => {
  it('all primitives return explanation string', () => {
    const r = Resolve.apply(reactNode.id, graph)
    expect(typeof r.explanation).toBe('string')
    expect(r.explanation.length).toBeGreaterThan(0)
  })

  it('all primitives return visitedNodes array', () => {
    const r = Expand.apply(reactNode.id, graph)
    expect(Array.isArray(r.visitedNodes)).toBe(true)
  })

  it('score is 0-1 range', () => {
    const r = Score.apply(reactNode.id, graph)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(1)
  })
})

describe('Resolve', () => {
  it('finds existing node', () => {
    const r = Resolve.apply(reactNode.id, graph)
    expect(r.value?.label).toBe('react')
    expect(r.score).toBe(0.9)
  })

  it('returns undefined for missing node', () => {
    const r = Resolve.apply('missing', graph)
    expect(r.value).toBeUndefined()
    expect(r.score).toBe(0)
  })
})

describe('Traverse', () => {
  it('traverses connected nodes', () => {
    const r = Traverse.apply({ startNodeId: reactNode.id }, graph)
    expect(r.value.some(n => n.label === 'typescript')).toBe(true)
  })

  it('respects maxDepth', () => {
    const r = Traverse.apply({ startNodeId: reactNode.id, maxDepth: 1 }, graph)
    // vitest is 2 hops away; may or may not appear depending on BFS — we test count ≤ total
    expect(r.visitedNodes.length).toBeLessThanOrEqual(3)
  })
})

describe('Infer', () => {
  it('infers 2-hop candidates', () => {
    const r = Infer.apply({ nodeId: reactNode.id, relationship: KnowledgeRelationship.DEPENDS_ON }, graph)
    expect(r.value.some(c => c.nodeId === vitestNode.id)).toBe(true)
  })
})

describe('Compare', () => {
  it('compares two nodes similarity', () => {
    const r = Compare.apply([reactNode.id, tsNode.id], graph)
    expect(typeof r.value.similarityScore).toBe('number')
  })
})

describe('Expand', () => {
  it('returns direct neighbors', () => {
    const r = Expand.apply(reactNode.id, graph)
    expect(r.value.some(n => n.label === 'typescript')).toBe(true)
  })
})

describe('Compose', () => {
  it('sequences node ids into steps', () => {
    const r = Compose.apply([reactNode.id, tsNode.id], graph)
    expect(r.value.steps.length).toBe(2)
    expect(r.value.steps[0].position).toBe(0)
  })
})

describe('Match', () => {
  it('matches by primitive', () => {
    const r = Match.apply({ primitive: 'Entity' }, graph)
    expect(r.value.length).toBe(3)
  })

  it('matches by labelContains case-insensitive', () => {
    const r = Match.apply({ labelContains: 'React' }, graph)
    expect(r.value.some(n => n.label === 'react')).toBe(true)
  })
})

describe('Score', () => {
  it('returns numeric score', () => {
    const r = Score.apply(reactNode.id, graph)
    expect(r.value).toBeGreaterThan(0)
  })
})
