import { describe, it, expect } from 'vitest'
import { ExecutionGraphBuilder } from '../egb.js'
import type { PlanIR } from '../../types/plan-ir.js'

function makePlanIR(steps: Array<{ id: string; action: string; semantics: string[]; dependsOn: string[] }>): PlanIR {
  return {
    meta: { artifactId: 'plan-1', schemaVersion: '1.0', kind: 'PlanIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [{ artifactId: 'intent-1', kind: 'IntentIR' }], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-p' },
    lifecycle: { state: 'ACTIVE' },
    capabilitySnapshotId: 'cap-snap-1',
    steps: steps.map((s, i) => ({
      stepId: s.id, ordinal: i, description: s.action, action: s.action,
      requiredSemantics: s.semantics, requirements: [],
      inputs: [], expectedOutput: { type: 'result' }, dependsOn: s.dependsOn,
    })),
  }
}

describe('ExecutionGraphBuilder', () => {
  it('produces transport-neutral operation kinds', () => {
    const graph = new ExecutionGraphBuilder().build(makePlanIR([{ id: 'step-1', action: 'sort', semantics: ['sort'], dependsOn: [] }]))
    expect(graph.meta.kind).toBe('ExecutionGraph')
    for (const node of graph.nodes) {
      expect(node.command.operation).not.toContain('/')
      expect(['SIMULATE', 'EXECUTE', 'GET_DECISION', 'LIST_CAPABILITIES']).toContain(node.command.operation)
    }
  })

  it('every step gets a SIMULATE node and an EXECUTE node', () => {
    const graph = new ExecutionGraphBuilder().build(makePlanIR([{ id: 'step-1', action: 'sort', semantics: ['sort'], dependsOn: [] }]))
    const ops = graph.nodes.map(n => n.command.operation)
    expect(ops).toContain('SIMULATE')
    expect(ops).toContain('EXECUTE')
  })

  it('EXECUTE node depends on SIMULATE node', () => {
    const graph = new ExecutionGraphBuilder().build(makePlanIR([{ id: 's1', action: 'sort', semantics: ['sort'], dependsOn: [] }]))
    const simNode = graph.nodes.find(n => n.command.operation === 'SIMULATE')!
    const execNode = graph.nodes.find(n => n.command.operation === 'EXECUTE')!
    const execEdges = graph.edges.filter(e => e.toNodeId === execNode.nodeId)
    expect(execEdges.map(e => e.fromNodeId)).toContain(simNode.nodeId)
  })

  it('provenance references PlanIR as parent', () => {
    const graph = new ExecutionGraphBuilder().build(makePlanIR([{ id: 's1', action: 'sort', semantics: ['sort'], dependsOn: [] }]))
    expect(graph.provenance.parentArtifacts.map(p => p.artifactId)).toContain('plan-1')
  })
})
