import { describe, it, expect } from 'vitest'
import {
  driftSignalId, retirementRecordId, deploymentId, modelId,
  contentHash, isoTimestamp,
  canonicalMlHash,
  type DriftType, type DriftSeverity, type AssessmentConfidence,
  type ObservationWindow,
  type DriftSignal, type DriftAssessment,
  type OperationalRecommendationType, type OperationalRecommendation,
  type ModelRetirementRecord,
  type RequestAssessmentRequest,
  isValidConfidence, isValidObservationWindow,
} from '../../src/index.js'

// ── DriftType ─────────────────────────────────────────────────────────────────

describe('DriftType', () => {
  it('all mandatory types exist', () => {
    const types: DriftType[] = ['INPUT', 'FEATURE', 'OUTPUT', 'PERFORMANCE', 'CONCEPT']
    expect(types).toHaveLength(5)
  })
})

// ── DriftSeverity ─────────────────────────────────────────────────────────────

describe('DriftSeverity', () => {
  it('severity levels exist', () => {
    const sevs: DriftSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    expect(sevs).toHaveLength(4)
  })
})

// ── AssessmentConfidence / isValidConfidence ───────────────────────────────────

describe('isValidConfidence', () => {
  it('0 is valid', () => { expect(isValidConfidence(0)).toBe(true) })
  it('1 is valid', () => { expect(isValidConfidence(1)).toBe(true) })
  it('0.5 is valid', () => { expect(isValidConfidence(0.5)).toBe(true) })
  it('-0.01 is invalid', () => { expect(isValidConfidence(-0.01)).toBe(false) })
  it('1.01 is invalid', () => { expect(isValidConfidence(1.01)).toBe(false) })
  it('NaN is invalid', () => { expect(isValidConfidence(NaN)).toBe(false) })
  it('Infinity is invalid', () => { expect(isValidConfidence(Infinity)).toBe(false) })
})

// ── ObservationWindow / isValidObservationWindow ──────────────────────────────

describe('isValidObservationWindow', () => {
  it('window with startAt before endAt is valid', () => {
    const w: ObservationWindow = {
      startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
      endAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    expect(isValidObservationWindow(w)).toBe(true)
  })

  it('window where startAt equals endAt is invalid', () => {
    const w: ObservationWindow = {
      startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
      endAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(isValidObservationWindow(w)).toBe(false)
  })

  it('window where startAt is after endAt is invalid', () => {
    const w: ObservationWindow = {
      startAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
      endAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(isValidObservationWindow(w)).toBe(false)
  })
})

// ── DriftSignal ───────────────────────────────────────────────────────────────

describe('DriftSignal', () => {
  it('constructs valid signal with all mandatory fields', () => {
    const s: DriftSignal = {
      driftSignalId: driftSignalId('dr-001'),
      deploymentId: deploymentId('dep-001'),
      driftType: 'INPUT',
      severity: 'HIGH',
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      baselineHash: contentHash('sha256:' + 'a'.repeat(64)),
      detectedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    expect(s.driftType).toBe('INPUT')
    expect(s.severity).toBe('HIGH')
  })

  it('canonical hash changes when severity changes', () => {
    const base: DriftSignal = {
      driftSignalId: driftSignalId('dr-001'),
      deploymentId: deploymentId('dep-001'),
      driftType: 'PERFORMANCE',
      severity: 'MEDIUM',
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      baselineHash: contentHash('sha256:' + 'a'.repeat(64)),
      detectedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    const changed: DriftSignal = { ...base, severity: 'CRITICAL' }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── DriftAssessment ───────────────────────────────────────────────────────────

describe('DriftAssessment', () => {
  it('assessment carries baseline window, observation window, evidence, and confidence', () => {
    const a: DriftAssessment = {
      assessmentId: 'asm-001',
      driftSignalId: driftSignalId('dr-001'),
      deploymentId: deploymentId('dep-001'),
      driftType: 'CONCEPT',
      confidence: 0.87 as AssessmentConfidence,
      baselineWindow: {
        startAt: isoTimestamp('2023-06-01T00:00:00.000Z'),
        endAt: isoTimestamp('2023-12-31T00:00:00.000Z'),
      },
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      evidenceHash: contentHash('sha256:' + 'b'.repeat(64)),
      assessedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    expect(a.confidence).toBe(0.87)
    expect(a.evidenceHash).toBeDefined()
    expect(a.baselineWindow).toBeDefined()
  })

  it('missing baseline is detectable: baselineWindow is required on DriftAssessment', () => {
    // TypeScript enforces baselineWindow is required — compile-time guarantee.
    // Runtime: construct with baseline present and verify it's not undefined.
    const a: DriftAssessment = {
      assessmentId: 'asm-002',
      driftSignalId: driftSignalId('dr-002'),
      deploymentId: deploymentId('dep-001'),
      driftType: 'FEATURE',
      confidence: 0.5 as AssessmentConfidence,
      baselineWindow: {
        startAt: isoTimestamp('2023-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2023-12-31T00:00:00.000Z'),
      },
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      evidenceHash: contentHash('sha256:' + 'c'.repeat(64)),
      assessedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    expect(a.baselineWindow).toBeDefined()
  })
})

// ── OperationalRecommendation: recommendation ≠ authorization ─────────────────

describe('OperationalRecommendation', () => {
  it('ROLL_BACK recommendation has no authorizationToken field', () => {
    const rec: OperationalRecommendation = {
      recommendationId: 'rec-001',
      deploymentId: deploymentId('dep-001'),
      recommendationType: 'ROLL_BACK',
      rationale: 'Input drift detected above threshold',
      driftSignalId: driftSignalId('dr-001'),
      issuedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    // No authorizationToken on OperationalRecommendation — recommendation ≠ RollbackDirective
    expect(Object.keys(rec)).not.toContain('authorizationToken')
    expect(rec.recommendationType).toBe('ROLL_BACK')
  })

  it('RETRAIN recommendation has no trainingRunId field', () => {
    const rec: OperationalRecommendation = {
      recommendationId: 'rec-002',
      deploymentId: deploymentId('dep-001'),
      recommendationType: 'RETRAIN',
      rationale: 'Concept drift above 30-day threshold',
      driftSignalId: driftSignalId('dr-002'),
      issuedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    // No trainingRunId — RETRAIN recommendation cannot create a training run
    expect(Object.keys(rec)).not.toContain('trainingRunId')
  })

  it('all recommendation types exist', () => {
    const types: OperationalRecommendationType[] = [
      'ROLL_BACK', 'RETRAIN', 'SCALE', 'ALERT', 'MONITOR_CLOSER', 'NO_ACTION',
    ]
    expect(types).toHaveLength(6)
  })

  it('canonical hash changes when recommendationType changes', () => {
    const base: OperationalRecommendation = {
      recommendationId: 'rec-001',
      deploymentId: deploymentId('dep-001'),
      recommendationType: 'ALERT',
      rationale: 'Elevated error rate',
      driftSignalId: driftSignalId('dr-001'),
      issuedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    const changed: OperationalRecommendation = { ...base, recommendationType: 'ROLL_BACK' }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── ModelRetirementRecord ─────────────────────────────────────────────────────

describe('ModelRetirementRecord', () => {
  it('retirement record captures active-deployment and retention constraints', () => {
    const r: ModelRetirementRecord = {
      retirementRecordId: retirementRecordId('ret-001'),
      modelId: modelId('m-001'),
      deploymentId: deploymentId('dep-001'),
      retiredAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      retentionUntil: isoTimestamp('2025-06-01T00:00:00.000Z'),
      reason: 'Replaced by m-002 with better accuracy',
    }
    expect(r.retirementRecordId).toBeDefined()
    expect(r.retentionUntil).toBeDefined()
  })

  it('canonical hash changes when retentionUntil changes', () => {
    const base: ModelRetirementRecord = {
      retirementRecordId: retirementRecordId('ret-001'),
      modelId: modelId('m-001'),
      deploymentId: deploymentId('dep-001'),
      retiredAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      retentionUntil: isoTimestamp('2025-06-01T00:00:00.000Z'),
      reason: 'Replaced',
    }
    const changed: ModelRetirementRecord = {
      ...base,
      retentionUntil: isoTimestamp('2026-06-01T00:00:00.000Z'),
    }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── RequestAssessmentRequest ──────────────────────────────────────────────────

describe('RequestAssessmentRequest', () => {
  it('constructs valid request', () => {
    const req: RequestAssessmentRequest = {
      deploymentId: deploymentId('dep-001'),
      driftSignalId: driftSignalId('dr-001'),
      requestedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    expect(req.driftSignalId).toBeDefined()
  })
})

// ── Immutability: records are not operations ──────────────────────────────────

describe('immutability: no record type has mutation methods', () => {
  it('DriftSignal has only readonly fields', () => {
    const s: DriftSignal = {
      driftSignalId: driftSignalId('dr-x'),
      deploymentId: deploymentId('dep-x'),
      driftType: 'OUTPUT',
      severity: 'LOW',
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      baselineHash: contentHash('sha256:' + 'd'.repeat(64)),
      detectedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    // All fields are readonly — TypeScript enforces at compile time.
    // Runtime check: value is plain object with expected shape.
    expect(typeof s.driftSignalId).toBe('string')
  })
})

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('round-trip JSON serialization', () => {
  it('DriftAssessment round-trips without loss', () => {
    const a: DriftAssessment = {
      assessmentId: 'asm-rt-001',
      driftSignalId: driftSignalId('dr-rt-001'),
      deploymentId: deploymentId('dep-rt-001'),
      driftType: 'PERFORMANCE',
      confidence: 0.92 as AssessmentConfidence,
      baselineWindow: {
        startAt: isoTimestamp('2023-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2023-12-31T00:00:00.000Z'),
      },
      observationWindow: {
        startAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
        endAt: isoTimestamp('2024-01-31T00:00:00.000Z'),
      },
      evidenceHash: contentHash('sha256:' + 'e'.repeat(64)),
      assessedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    const parsed = JSON.parse(JSON.stringify(a)) as DriftAssessment
    expect(parsed.confidence).toBe(0.92)
    expect(parsed.driftType).toBe('PERFORMANCE')
  })

  it('ModelRetirementRecord round-trips without loss', () => {
    const r: ModelRetirementRecord = {
      retirementRecordId: retirementRecordId('ret-rt-001'),
      modelId: modelId('m-rt-001'),
      deploymentId: deploymentId('dep-rt-001'),
      retiredAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      retentionUntil: isoTimestamp('2025-06-01T00:00:00.000Z'),
      reason: 'rt test',
    }
    const parsed = JSON.parse(JSON.stringify(r)) as ModelRetirementRecord
    expect(parsed.retirementRecordId).toBe(r.retirementRecordId)
    expect(parsed.retentionUntil).toBe(r.retentionUntil)
  })
})
