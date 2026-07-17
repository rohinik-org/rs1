import type { CapabilityGraph } from '@rohinik-org/compiler'

// 8-node deterministic graph covering all relationship types used by Stage 5B strategies.
//
// Nodes: pandas, matplotlib, numpy, jupyter, python, concept://dataframe, concept://chart, gh-cli
// Edges:
//   pandas      -PRODUCES->   concept://dataframe   (DECLARED)
//   matplotlib  -CONSUMES->   concept://dataframe   (DECLARED)
//   matplotlib  -PRODUCES->   concept://chart       (DECLARED)
//   numpy       -CONSUMES->   concept://dataframe   (DECLARED)
//   python      -RECOMMENDS-> jupyter               (DECLARED)
//   pandas      -ALTERNATIVE_TO-> numpy             (DECLARED, symmetric — two edges)
//   numpy       -ALTERNATIVE_TO-> pandas            (DECLARED)

const now = '2026-07-13T00:00:00.000Z'

function node(name: string, kind: string, extra: Record<string, unknown> = {}): import('@rohinik-org/compiler').CapabilityGraphNode {
  return {
    nodeId: kind === 'CONCEPT' ? `concept://${name}` : `rohinik://graph/${kind.toLowerCase()}/${name}`,
    nodeKind: kind as import('@rohinik-org/compiler').CapabilityGraphNodeKind,
    name,
    displayName: name,
    tags: [],
    metadata: {},
    addedAt: now,
    ...extra,
  }
}

function edge(id: string, src: string, tgt: string, rel: string): import('@rohinik-org/compiler').CapabilityGraphEdge {
  return {
    edgeId: id, source: src, target: tgt,
    relationship: rel as import('@rohinik-org/compiler').CapabilityGraphRelationship,
    certainty: 'DECLARED', confidence: 1.0, required: false,
    provenance: 'capability-compiler', addedAt: now,
  }
}

const pandas      = node('pandas', 'CAPABILITY')
const matplotlib  = node('matplotlib', 'CAPABILITY')
const numpy       = node('numpy', 'CAPABILITY')
const jupyter     = node('jupyter', 'CAPABILITY')
const python      = node('python', 'HOST_RESOURCE')
const dfConcept   = node('dataframe', 'CONCEPT')
const chartConcept = node('chart', 'CONCEPT')
const ghCli       = node('gh-cli', 'CAPABILITY')

export const SMALL_GRAPH: CapabilityGraph = {
  kind: 'CapabilityGraph', schemaVersion: '1.0', graphId: 'small-fixture',
  revision: 1, capturedAt: now, lastUpdatedAt: now,
  nodes: [pandas, matplotlib, numpy, jupyter, python, dfConcept, chartConcept, ghCli],
  edges: [
    edge('e1', pandas.nodeId,     dfConcept.nodeId,    'PRODUCES'),
    edge('e2', matplotlib.nodeId, dfConcept.nodeId,    'CONSUMES'),
    edge('e3', matplotlib.nodeId, chartConcept.nodeId, 'PRODUCES'),
    edge('e4', numpy.nodeId,      dfConcept.nodeId,    'CONSUMES'),
    edge('e5', python.nodeId,     jupyter.nodeId,      'RECOMMENDS'),
    edge('e6', pandas.nodeId,     numpy.nodeId,        'ALTERNATIVE_TO'),
    edge('e7', numpy.nodeId,      pandas.nodeId,       'ALTERNATIVE_TO'),
  ],
  nodeCount: 8, edgeCount: 7,
}

export const NODES = { pandas, matplotlib, numpy, jupyter, python, dfConcept, chartConcept, ghCli }
