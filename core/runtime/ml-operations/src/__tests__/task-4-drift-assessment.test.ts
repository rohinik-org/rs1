import { describe, it, expect } from 'vitest'
import type { DeploymentId, IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  buildDriftAssessmentRecord,
  type DriftAssessmentRecord,
  type DriftAssessmentOutcome,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const SID  = 'sig-1' as DriftSignalId

function makeInput(overrides?: Partial<Parameters<typeof buildDriftAssessmentRecord>[0]>) {
  return {
    assessmentId: 'asmnt-1',
    signalId: SID,
    deploymentId: DEP,
    driftType: 'INPUT' as const,
    outcome: 'DRIFT_DETECTED' as DriftAssessmentOutcome,
    confidenceScore: 0.85,
    statisticsHash: HASH,
    evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    assessedAt: NOW,
    assessedBy: 'p',
    ...overrides,
  }
}

// ── buildDriftAssessmentRecord ────────────────────────────────────────────────

describe('buildDriftAssessmentRecord', () => {
  it('valid record has assessmentHash', () => {
    const r = buildDriftAssessmentRecord(makeInput())
    expect(r.assessmentId).toBe('asmnt-1')
    expect(r.assessmentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('assessmentHash is deterministic', () => {
    const input = makeInput()
    expect(buildDriftAssessmentRecord(input).assessmentHash)
      .toBe(buildDriftAssessmentRecord(input).assessmentHash)
  })

  it('all five drift types accepted', () => {
    for (const t of ['INPUT', 'FEATURE', 'OUTPUT', 'PERFORMANCE', 'CONCEPT'] as const) {
      const r = buildDriftAssessmentRecord(makeInput({ driftType: t, assessmentId: `a-${t}` }))
      expect(r.driftType).toBe(t)
    }
  })

  it('DRIFT_DETECTED outcome accepted', () => {
    const r = buildDriftAssessmentRecord(makeInput({ outcome: 'DRIFT_DETECTED' }))
    expect(r.outcome).toBe('DRIFT_DETECTED')
  })

  it('NO_DRIFT outcome accepted', () => {
    const r = buildDriftAssessmentRecord(makeInput({ outcome: 'NO_DRIFT' }))
    expect(r.outcome).toBe('NO_DRIFT')
  })

  it('INCONCLUSIVE outcome accepted — missing evidence is not NO_DRIFT', () => {
    const { statisticsHash: _omit, ...rest } = makeInput({ outcome: 'INCONCLUSIVE' })
    const r = buildDriftAssessmentRecord(rest)
    expect(r.outcome).toBe('INCONCLUSIVE')
  })

  it('NOT_EVALUATED outcome accepted — unavailable detector is not NO_DRIFT', () => {
    const { statisticsHash: _omit, ...rest } = makeInput({ outcome: 'NOT_EVALUATED' })
    const r = buildDriftAssessmentRecord(rest)
    expect(r.outcome).toBe('NOT_EVALUATED')
  })

  it('invalid confidenceScore throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => buildDriftAssessmentRecord(makeInput({ confidenceScore: 1.5 })))
      .toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })

  it('negative confidence throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => buildDriftAssessmentRecord(makeInput({ confidenceScore: -0.1 })))
      .toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildDriftAssessmentRecord(makeInput({ evidenceRef: undefined as any })))
      .toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('no recommendation fields in assessment', () => {
    const r = buildDriftAssessmentRecord(makeInput()) as any
    expect('recommendationType' in r).toBe(false)
    expect('recommendationId' in r).toBe(false)
    expect('executeRollback' in r).toBe(false)
  })

  it('idempotent: same assessmentId same input', () => {
    const store = new Map<string, DriftAssessmentRecord>()
    const input = makeInput()
    const r1 = buildDriftAssessmentRecord(input, store)
    const r2 = buildDriftAssessmentRecord(input, store)
    expect(r1.assessmentHash).toBe(r2.assessmentHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same assessmentId different outcome throws OPERATIONS_ASSESSMENT_NOT_FOUND', () => {
    const store = new Map<string, DriftAssessmentRecord>()
    buildDriftAssessmentRecord(makeInput({ outcome: 'DRIFT_DETECTED' }), store)
    expect(() => buildDriftAssessmentRecord(makeInput({ outcome: 'NO_DRIFT' }), store))
      .toThrow('OPERATIONS_ASSESSMENT_NOT_FOUND')
  })

  it('no rawPayload or secret fields', () => {
    const r = buildDriftAssessmentRecord(makeInput()) as any
    expect('rawPayload' in r).toBe(false)
    expect('secret' in r).toBe(false)
  })
})
