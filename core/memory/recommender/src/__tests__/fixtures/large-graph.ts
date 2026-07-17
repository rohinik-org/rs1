import type { CapabilityGraph, CapabilityGraphNode, CapabilityGraphEdge } from '@rohinik-org/compiler'

// 80-node fixture for ranking and performance tests.
// 40 CAPABILITY nodes (skill-0..skill-39), 10 CONCEPT nodes (concept-0..concept-9),
// 5 HOST_RESOURCE nodes (host-0..host-4), 25 extra CAPABILITY nodes (tool-0..tool-24).
// Edges: each skill-N PRODUCES concept-(N%10), skill-(N+1)%40 CONSUMES same concept.

const now = '2026-07-13T00:00:00.000Z'

function mkNode(id: string, kind: string): CapabilityGraphNode {
  return { nodeId: id, nodeKind: kind as import('@rohinik-org/compiler').CapabilityGraphNodeKind, name: id, displayName: id, tags: [], metadata: {}, addedAt: now }
}
function mkEdge(id: string, src: string, tgt: string, rel: string): CapabilityGraphEdge {
  return { edgeId: id, source: src, target: tgt, relationship: rel as import('@rohinik-org/compiler').CapabilityGraphRelationship, certainty: 'DECLARED', confidence: 1.0, required: false, provenance: 'capability-compiler', addedAt: now }
}

const nodes: CapabilityGraphNode[] = []
const edges: CapabilityGraphEdge[] = []

for (let i = 0; i < 10; i++) nodes.push(mkNode(`concept://concept-${i}`, 'CONCEPT'))
for (let i = 0; i < 5; i++) nodes.push(mkNode(`rohinik://graph/host_resource/host-${i}`, 'HOST_RESOURCE'))
for (let i = 0; i < 40; i++) nodes.push(mkNode(`rohinik://graph/capability/skill-${i}`, 'CAPABILITY'))
for (let i = 0; i < 25; i++) nodes.push(mkNode(`rohinik://graph/capability/tool-${i}`, 'CAPABILITY'))

for (let i = 0; i < 40; i++) {
  const c = i % 10
  edges.push(mkEdge(`ep${i}`, `rohinik://graph/capability/skill-${i}`, `concept://concept-${c}`, 'PRODUCES'))
  edges.push(mkEdge(`ec${i}`, `rohinik://graph/capability/skill-${(i + 1) % 40}`, `concept://concept-${c}`, 'CONSUMES'))
}

export const LARGE_GRAPH: CapabilityGraph = {
  kind: 'CapabilityGraph', schemaVersion: '1.0', graphId: 'large-fixture',
  revision: 1, capturedAt: now, lastUpdatedAt: now,
  nodes, edges, nodeCount: nodes.length, edgeCount: edges.length,
}
