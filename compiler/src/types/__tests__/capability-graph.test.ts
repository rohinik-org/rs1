import { describe, it, expect } from 'vitest'
import type {
  CapabilityGraph, CapabilityGraphNode, CapabilityGraphEdge,
  CapabilityGraphNodeKind, CapabilityGraphRelationship, EdgeCertainty, EdgeProvenance,
} from '../capability-graph.js'

describe('CapabilityGraph types', () => {
  it('accepts a minimal CapabilityGraph', () => {
    const graph: CapabilityGraph = {
      kind: 'CapabilityGraph', schemaVersion: '1.0',
      graphId: 'sha256-abc', revision: 1,
      capturedAt: '2026-07-10T00:00:00Z', lastUpdatedAt: '2026-07-10T00:00:00Z',
      nodes: [], edges: [], nodeCount: 0, edgeCount: 0,
    }
    expect(graph.kind).toBe('CapabilityGraph')
    expect(graph.revision).toBe(1)
  })

  it('accepts all CapabilityGraphNodeKind values', () => {
    const kinds: CapabilityGraphNodeKind[] = [
      'CAPABILITY', 'HOST_RESOURCE', 'PROVIDER', 'SEMANTIC_ASSET',
      'PACK', 'CONCEPT', 'WORKFLOW', 'EXECUTION', 'FEDERATION_NODE',
    ]
    for (const nodeKind of kinds) {
      const node: CapabilityGraphNode = {
        nodeId: `rohinik://graph/${nodeKind.toLowerCase()}/test`,
        nodeKind, name: 'test', displayName: 'Test',
        tags: [], metadata: {}, addedAt: '2026-07-10T00:00:00Z',
      }
      expect(node.nodeKind).toBe(nodeKind)
    }
  })

  it('accepts concept:// nodeId format', () => {
    const node: CapabilityGraphNode = {
      nodeId: 'concept://python', nodeKind: 'CONCEPT',
      name: 'python', displayName: 'Python',
      tags: [], metadata: {}, addedAt: '2026-07-10T00:00:00Z',
    }
    expect(node.nodeId).toBe('concept://python')
  })

  it('accepts all EdgeCertainty values', () => {
    const certainties: EdgeCertainty[] = ['DECLARED', 'OBSERVED', 'INFERRED']
    for (const certainty of certainties) {
      const edge: CapabilityGraphEdge = {
        edgeId: 'uuid', source: 'a', target: 'b',
        relationship: 'DEPENDS_ON', certainty,
        confidence: certainty === 'INFERRED' ? 0.8 : 1.0,
        required: true, provenance: 'ontology', addedAt: '2026-07-10T00:00:00Z',
      }
      expect(edge.certainty).toBe(certainty)
    }
  })

  it('accepts all CapabilityGraphRelationship values', () => {
    const relationships: CapabilityGraphRelationship[] = [
      'DEPENDS_ON', 'REQUIRES_HOST', 'PROVIDES_RUNTIME', 'USES_PROVIDER',
      'IMPLEMENTS', 'PRODUCES', 'CONSUMES', 'ALTERNATIVE_TO', 'RECOMMENDS',
      'GENERATED_FROM', 'COMPILES_TO', 'INSTALLED_BY', 'EXTENDS',
      'CONFLICTS_WITH', 'SUPERSEDES',
    ]
    for (const relationship of relationships) {
      const edge: CapabilityGraphEdge = {
        edgeId: 'uuid', source: 'a', target: 'b',
        relationship, certainty: 'DECLARED', confidence: 1.0,
        required: false, provenance: 'package-manifest', addedAt: '2026-07-10T00:00:00Z',
      }
      expect(edge.relationship).toBe(relationship)
    }
  })

  it('accepts all EdgeProvenance values', () => {
    const provenances: EdgeProvenance[] = [
      'capability-compiler', 'semantic-compiler', 'host-discovery',
      'package-manifest', 'ontology', 'execution-corpus', 'user-declared',
    ]
    for (const provenance of provenances) {
      const edge: CapabilityGraphEdge = {
        edgeId: 'uuid', source: 'a', target: 'b',
        relationship: 'DEPENDS_ON', certainty: 'DECLARED', confidence: 1.0,
        required: false, provenance, addedAt: '2026-07-10T00:00:00Z',
      }
      expect(edge.provenance).toBe(provenance)
    }
  })
})
