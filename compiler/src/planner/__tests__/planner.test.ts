import { describe, it, expect } from 'vitest'
import { SequentialPlanner } from '../planner.js'
import type { IntentIR } from '../../types/intent-ir.js'
import type { CapabilitySnapshot } from '../../types/capability-snapshot.js'

function makeIntentIR(action: string): IntentIR {
  return {
    meta: { artifactId: `intent-${action}`, schemaVersion: '1.0', kind: 'IntentIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-i' },
    lifecycle: { state: 'ACTIVE' },
    goal: { action, object: 'files' },
    entities: [{ name: 'source', type: 'directory', resolved: '/tmp/downloads', source: 'literal' }],
    constraints: [{ type: 'preserve', target: 'originals' }],
    confidence: 0.92,
  }
}

function makeCapSnapshot(skills: Array<{ id: string; semantics: string[] }>): CapabilitySnapshot {
  return {
    meta: { artifactId: 'cap-snap', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-cap' },
    lifecycle: { state: 'ACTIVE' },
    snapshotId: 'snap-123',
    capturedAt: '2026-07-07T00:00:00Z',
    runtimeId: 'rt-1',
    source: 'GET /v1/capabilities',
    fingerprint: 'fp-1',
    skills: skills.map(s => ({
      skillId: s.id, capabilityId: s.id.split('.')[0] ?? s.id,
      tierId: 'DETERMINISTIC', version: '1.0.0',
      semantics: s.semantics, requirements: [],
    })),
  }
}

describe('SequentialPlanner', () => {
  it('produces a PlanIR with no confidence field', async () => {
    const plan = await new SequentialPlanner().plan(
      makeIntentIR('sort'),
      makeCapSnapshot([{ id: 'sort.sort', semantics: ['sort', 'table.sort'] }])
    )
    expect(plan.meta.kind).toBe('PlanIR')
    expect('confidence' in plan).toBe(false)
  })

  it('references the capabilitySnapshotId from the snapshot (Law 16)', async () => {
    const plan = await new SequentialPlanner().plan(
      makeIntentIR('sort'),
      makeCapSnapshot([{ id: 'sort.sort', semantics: ['sort'] }])
    )
    expect(plan.capabilitySnapshotId).toBe('snap-123')
  })

  it('creates steps referencing matching semantics', async () => {
    const plan = await new SequentialPlanner().plan(
      makeIntentIR('sort'),
      makeCapSnapshot([{ id: 'sort.sort', semantics: ['sort', 'table.sort'] }])
    )
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.steps.some(s => s.requiredSemantics.includes('sort'))).toBe(true)
  })

  it('includes a discover step when there are path entities', async () => {
    const plan = await new SequentialPlanner().plan(
      makeIntentIR('organize'),
      makeCapSnapshot([{ id: 'filesystem.read', semantics: ['filesystem.read'] }])
    )
    expect(plan.steps.map(s => s.action)).toContain('discover')
  })

  it('provenance DAG: PlanIR references the IntentIR as parent', async () => {
    const intent = makeIntentIR('sort')
    const plan = await new SequentialPlanner().plan(
      intent,
      makeCapSnapshot([{ id: 'sort.sort', semantics: ['sort'] }])
    )
    expect(plan.provenance.parentArtifacts.map(p => p.artifactId)).toContain(intent.meta.artifactId)
  })
})
