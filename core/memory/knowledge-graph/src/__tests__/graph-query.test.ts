import { describe, it, expect } from 'vitest'
import { CapabilityGraphQuery } from '../graph-query.js'
import { GraphValidator } from '../graph-validator.js'
import type { CapabilityGraph } from '@rohinik-org/compiler'

function makeGraph(): CapabilityGraph {
  const now = new Date().toISOString()
  return {
    kind: 'CapabilityGraph', schemaVersion: '1.0', graphId: 'test', revision: 1, capturedAt: now, lastUpdatedAt: now,
    nodes: [
      { nodeId: 'rohinik://graph/capability/pandas', nodeKind: 'CAPABILITY', name: 'pandas', displayName: 'Pandas', tags: [], metadata: {}, addedAt: now },
      { nodeId: 'concept://python', nodeKind: 'CONCEPT', name: 'python', displayName: 'Python', tags: [], metadata: {}, addedAt: now },
      { nodeId: 'concept://csv', nodeKind: 'CONCEPT', name: 'csv', displayName: 'CSV', tags: [], metadata: {}, addedAt: now },
      { nodeId: 'rohinik://graph/host-resource/python', nodeKind: 'HOST_RESOURCE', name: 'python', displayName: 'Python 3.12', tags: [], metadata: {}, addedAt: now },
    ],
    edges: [
      { edgeId: 'e1', source: 'rohinik://graph/capability/pandas', target: 'concept://python', relationship: 'REQUIRES_HOST', certainty: 'DECLARED', confidence: 1, required: true, provenance: 'package-manifest', addedAt: now },
      { edgeId: 'e2', source: 'rohinik://graph/capability/pandas', target: 'concept://csv', relationship: 'CONSUMES', certainty: 'DECLARED', confidence: 1, required: false, provenance: 'package-manifest', addedAt: now },
      { edgeId: 'e3', source: 'rohinik://graph/host-resource/python', target: 'concept://python', relationship: 'PROVIDES_RUNTIME', certainty: 'OBSERVED', confidence: 1, required: false, provenance: 'host-discovery', addedAt: now },
    ],
    nodeCount: 4, edgeCount: 3,
  }
}

describe('CapabilityGraphQuery', () => {
  it('reachable returns nodes reachable via outgoing edges', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    const reached = q.reachable('rohinik://graph/capability/pandas')
    const ids = reached.map(n => n.nodeId)
    expect(ids).toContain('concept://python')
    expect(ids).toContain('concept://csv')
  })

  it('reverseReachable returns nodes that reach this node', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    const sources = q.reverseReachable('concept://python')
    const ids = sources.map(n => n.nodeId)
    expect(ids).toContain('rohinik://graph/capability/pandas')
    expect(ids).toContain('rohinik://graph/host-resource/python')
  })

  it('findDependencies is a wrapper around reachable DEPENDS_ON', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    expect(Array.isArray(q.findDependencies('rohinik://graph/capability/pandas'))).toBe(true)
  })

  it('findHostRequirements returns REQUIRES_HOST targets', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    const hostReqs = q.findHostRequirements('rohinik://graph/capability/pandas')
    expect(hostReqs.map(n => n.nodeId)).toContain('concept://python')
  })

  it('shortestPath finds path between connected nodes', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    const path = q.shortestPath('rohinik://graph/capability/pandas', 'concept://python')
    expect(path).not.toBeNull()
    expect(path?.some(n => n.nodeId === 'concept://python')).toBe(true)
  })

  it('shortestPath returns null for unconnected nodes', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    expect(q.shortestPath('rohinik://graph/capability/pandas', 'concept://cuda')).toBeNull()
  })

  it('exists returns true/false correctly', () => {
    const q = new CapabilityGraphQuery(makeGraph())
    expect(q.exists('rohinik://graph/capability/pandas')).toBe(true)
    expect(q.exists('rohinik://graph/unknown/x')).toBe(false)
  })
})

describe('GraphValidator', () => {
  it('returns no issues for a valid graph', () => {
    const validator = new GraphValidator()
    expect(validator.validate(makeGraph())).toHaveLength(0)
  })

  it('detects broken edges with missing source', () => {
    const graph = makeGraph()
    const broken = { ...graph, edges: [...graph.edges, { edgeId: 'broken', source: 'rohinik://graph/capability/MISSING', target: 'concept://python', relationship: 'DEPENDS_ON' as const, certainty: 'DECLARED' as const, confidence: 1.0, required: true, provenance: 'ontology' as const, addedAt: new Date().toISOString() }] }
    const validator = new GraphValidator()
    const issues = validator.validate(broken)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.issue).toMatch(/missing source/i)
  })
})
