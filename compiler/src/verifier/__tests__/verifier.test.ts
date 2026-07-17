import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Verifier } from '../verifier.js'
import type { ExecutionGraph, ExecutionOperation } from '../../types/execution-graph.js'

function makeGraph(nodes: Array<{ id: string; op: string; stepId: string }>): ExecutionGraph {
  return {
    meta: { artifactId: 'g1', schemaVersion: '1.0', kind: 'ExecutionGraph', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [{ artifactId: 'plan-1', kind: 'PlanIR' }], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-g' },
    lifecycle: { state: 'ACTIVE' },
    nodes: nodes.map(n => ({
      nodeId: n.id, planStepId: n.stepId,
      command: { operation: n.op as ExecutionOperation, arguments: { content: 'test', contentType: 'TEXT', intentHint: 'sort' } },
    })),
    edges: [],
  }
}

describe('Verifier', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('produces PASSED when all SIMULATE nodes would route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'r1', wouldRoute: true, selectedTier: 'DETERMINISTIC',
        selectedSkill: 'sort.sort', confidence: 0.97, estimatedLatencyMs: 1,
        reasoningWouldBeInvoked: false, candidatesConsidered: [],
      }),
    } as Response)
    const v = new Verifier('http://localhost:8080')
    const graph = makeGraph([{ id: 'sim-1', op: 'SIMULATE', stepId: 's1' }, { id: 'exec-1', op: 'EXECUTE', stepId: 's1' }])
    const report = await v.verify(graph)
    expect(report.status).toBe('PASSED')
    expect(report.simulations).toHaveLength(1)
  })

  it('produces FAILED when a SIMULATE node would not route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'r1', wouldRoute: false, confidence: 0, estimatedLatencyMs: 0,
        reasoningWouldBeInvoked: false, candidatesConsidered: [],
      }),
    } as Response)
    const report = await new Verifier('http://localhost:8080').verify(
      makeGraph([{ id: 'sim-1', op: 'SIMULATE', stepId: 's1' }])
    )
    expect(report.status).toBe('FAILED')
    expect(report.findings.some(f => f.severity === 'ERROR')).toBe(true)
  })

  it('only calls simulate for SIMULATE nodes, not EXECUTE nodes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ requestId: 'r1', wouldRoute: true, confidence: 0.9, estimatedLatencyMs: 1, reasoningWouldBeInvoked: false, candidatesConsidered: [] }),
    } as Response)
    const v = new Verifier('http://localhost:8080')
    const graph = makeGraph([{ id: 'sim-1', op: 'SIMULATE', stepId: 's1' }, { id: 'exec-1', op: 'EXECUTE', stepId: 's1' }])
    await v.verify(graph)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
