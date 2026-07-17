import { describe, it, expect } from 'vitest'
import { IntentValidator } from '../intent-validator.js'
import type { IntentCandidate } from '../intent-candidate.js'
import type { CompilerContext } from '../../types/compiler-context.js'

function makeCtx(threshold = 0.7): CompilerContext {
  return {
    session: { sessionId: 'sess-1', bindings: {}, activeArtifacts: [] },
    policy: { clarificationThreshold: threshold, maxPlanSteps: 20, allowedTiers: [], verificationMode: 'strict' },
    system: {
      snapshotId: 'snap-1', capturedAt: '2026-07-07T00:00:00Z',
      runtime: { runtimeId: 'rt-1', protocolVersion: '1.0', features: { memory: false, streaming: false, reasoning: false } },
      capabilities: {
        meta: { artifactId: 'c', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
        provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
        integrity: { checksum: 'x' }, lifecycle: { state: 'ACTIVE' },
        snapshotId: 'cs', capturedAt: '2026-07-07T00:00:00Z', runtimeId: 'rt-1',
        source: 'GET /v1/capabilities', fingerprint: 'fp', skills: [],
      },
    },
  }
}

describe('IntentValidator', () => {
  it('produces IntentIR from a high-confidence candidate', () => {
    const candidate: IntentCandidate = { rawText: 'sort files', rawConfidence: 0.92, parsedGoal: { action: 'sort', object: 'files' } }
    const result = new IntentValidator().validate(candidate, [], [], makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.intentIR.goal.action).toBe('sort')
      expect(result.intentIR.confidence).toBe(0.92)
    }
  })

  it('IntentIR is content-addressed — same inputs produce same artifactId', () => {
    const candidate: IntentCandidate = { rawText: 'sort', rawConfidence: 0.9, parsedGoal: { action: 'sort' } }
    const ctx = makeCtx()
    const r1 = new IntentValidator().validate(candidate, [], [], ctx)
    const r2 = new IntentValidator().validate(candidate, [], [], ctx)
    expect(r1.ok && r2.ok).toBe(true)
    if (r1.ok && r2.ok) expect(r1.intentIR.meta.artifactId).toBe(r2.intentIR.meta.artifactId)
  })

  it('emits ClarificationIR when confidence is below threshold', () => {
    const candidate: IntentCandidate = { rawText: '???', rawConfidence: 0.3, parsedGoal: { action: 'sort' } }
    const result = new IntentValidator().validate(candidate, [], [], makeCtx(0.7))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.clarification.reason.type).toBe('low_confidence')
  })
})
