import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SequentialPlanner } from '../planner/planner.js'
import { ExecutionGraphBuilder } from '../egb/egb.js'
import { Verifier } from '../verifier/verifier.js'
import type { IntentIR } from '../types/intent-ir.js'
import type { CapabilitySnapshot } from '../types/capability-snapshot.js'

function makeIntentIR(): IntentIR {
  return {
    meta: { artifactId: 'intent-sort', schemaVersion: '1.0', kind: 'IntentIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'sys-snap', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-i' },
    lifecycle: { state: 'ACTIVE' },
    goal: { action: 'sort', object: 'files' },
    entities: [],
    constraints: [],
    confidence: 0.94,
  }
}

function makeCapSnapshot(): CapabilitySnapshot {
  return {
    meta: { artifactId: 'cap', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'sys-snap', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-cap' },
    lifecycle: { state: 'ACTIVE' },
    snapshotId: 'snap-xyz',
    capturedAt: '2026-07-07T00:00:00Z',
    runtimeId: 'rt-1',
    source: 'GET /v1/capabilities',
    fingerprint: 'fp-1',
    skills: [
      {
        skillId: 'sort.sort', capabilityId: 'capability-core',
        tierId: 'DETERMINISTIC', version: '1.0.0',
        semantics: ['sort', 'table.sort'], requirements: [],
      },
    ],
  }
}

describe('Deterministic pipeline: Planner → EGB → Verifier', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('produces a PASSED VerificationReport for a routable sort intent', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'sim-req-1', wouldRoute: true,
        selectedTier: 'DETERMINISTIC', selectedSkill: 'sort.sort',
        confidence: 0.97, estimatedLatencyMs: 1,
        reasoningWouldBeInvoked: false,
        candidatesConsidered: [{ skillId: 'sort.sort', tierId: 'DETERMINISTIC', score: 0.97 }],
      }),
    } as Response)

    const planner = new SequentialPlanner()
    const egb = new ExecutionGraphBuilder()
    const verifier = new Verifier('http://localhost:8080')

    const intent = makeIntentIR()
    const caps = makeCapSnapshot()

    const plan = await planner.plan(intent, caps)
    expect(plan.capabilitySnapshotId).toBe('snap-xyz')
    expect('confidence' in plan).toBe(false)

    const graph = egb.build(plan)
    expect(graph.nodes.some(n => n.command.operation === 'SIMULATE')).toBe(true)
    expect(graph.nodes.some(n => n.command.operation === 'EXECUTE')).toBe(true)

    const report = await verifier.verify(graph)
    expect(report.status).toBe('PASSED')
    expect(report.simulations.length).toBeGreaterThan(0)

    // Provenance chain
    expect(report.provenance.parentArtifacts.map(p => p.artifactId)).toContain(graph.meta.artifactId)
    expect(graph.provenance.parentArtifacts.map(p => p.artifactId)).toContain(plan.meta.artifactId)
    expect(plan.provenance.parentArtifacts.map(p => p.artifactId)).toContain(intent.meta.artifactId)
  })

  it('PlanIR is deterministic: same inputs produce same artifactId', async () => {
    const planner = new SequentialPlanner()
    const intent = makeIntentIR()
    const caps = makeCapSnapshot()
    const plan1 = await planner.plan(intent, caps)
    const plan2 = await planner.plan(intent, caps)
    // PlanIR is content-addressed: same inputs = same artifactId
    expect(plan1.meta.artifactId).toBe(plan2.meta.artifactId)
  })
})
