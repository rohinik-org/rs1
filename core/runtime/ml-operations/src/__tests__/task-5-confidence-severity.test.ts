import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  normalizeConfidence,
  deriveSeverity,
  resolveContradiction,
  buildAssessmentDisposition,
  type AssessmentDisposition,
  type ContradictionResolution,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const SID  = 'sig-1' as DriftSignalId

// ── normalizeConfidence ───────────────────────────────────────────────────────

describe('normalizeConfidence', () => {
  it('0.5 stays 0.5', () => {
    expect(normalizeConfidence(0.5)).toBe(0.5)
  })

  it('0 is valid', () => {
    expect(normalizeConfidence(0)).toBe(0)
  })

  it('1 is valid', () => {
    expect(normalizeConfidence(1)).toBe(1)
  })

  it('1.5 throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => normalizeConfidence(1.5)).toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })

  it('-0.1 throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => normalizeConfidence(-0.1)).toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })

  it('NaN throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => normalizeConfidence(NaN)).toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })

  it('Infinity throws OPERATIONS_INVALID_CONFIDENCE', () => {
    expect(() => normalizeConfidence(Infinity)).toThrow('OPERATIONS_INVALID_CONFIDENCE')
  })
})

// ── deriveSeverity ────────────────────────────────────────────────────────────

describe('deriveSeverity', () => {
  it('high confidence + high provider severity → HIGH', () => {
    expect(deriveSeverity({ providerSeverity: 'HIGH', confidence: 0.9 })).toBe('HIGH')
  })

  it('low confidence → caps at LOW regardless of provider severity', () => {
    const s = deriveSeverity({ providerSeverity: 'CRITICAL', confidence: 0.2 })
    expect(s).not.toBe('CRITICAL')
  })

  it('missing evidence → severity is LOW (cannot be CRITICAL without evidence)', () => {
    const s = deriveSeverity({})
    expect(s).toBe('LOW')
  })

  it('CRITICAL provider severity + confidence 1.0 → CRITICAL', () => {
    expect(deriveSeverity({ providerSeverity: 'CRITICAL', confidence: 1.0 })).toBe('CRITICAL')
  })
})

// ── resolveContradiction ──────────────────────────────────────────────────────

describe('resolveContradiction', () => {
  it('no contradiction signals → CONSISTENT', () => {
    const r = resolveContradiction({ outcomes: ['DRIFT_DETECTED', 'DRIFT_DETECTED'] })
    expect(r.resolution).toBe('CONSISTENT')
  })

  it('mixed DRIFT_DETECTED and NO_DRIFT → CONTRADICTORY requires review', () => {
    const r = resolveContradiction({ outcomes: ['DRIFT_DETECTED', 'NO_DRIFT'] })
    expect(r.resolution).toBe('CONTRADICTORY')
    expect(r.requiresReview).toBe(true)
  })

  it('contradiction does not fabricate certainty', () => {
    const r = resolveContradiction({ outcomes: ['DRIFT_DETECTED', 'NO_DRIFT'] })
    expect(r.resolution).not.toBe('CONSISTENT')
    expect(r.fabricatedCertainty).toBeFalsy()
  })

  it('all INCONCLUSIVE → INCONCLUSIVE', () => {
    const r = resolveContradiction({ outcomes: ['INCONCLUSIVE', 'INCONCLUSIVE'] })
    expect(r.resolution).toBe('INCONCLUSIVE')
  })
})

// ── buildAssessmentDisposition ────────────────────────────────────────────────

describe('buildAssessmentDisposition', () => {
  it('DRIFT_DETECTED + high confidence → CONFIRM disposition', () => {
    const d = buildAssessmentDisposition({
      outcome: 'DRIFT_DETECTED', confidence: 0.9,
      contradiction: { resolution: 'CONSISTENT', requiresReview: false },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    })
    expect(d.disposition).toBe('CONFIRM')
  })

  it('INCONCLUSIVE → DEFER disposition', () => {
    const d = buildAssessmentDisposition({
      outcome: 'INCONCLUSIVE', confidence: 0.4,
      contradiction: { resolution: 'INCONCLUSIVE', requiresReview: false },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    })
    expect(d.disposition).toBe('DEFER')
  })

  it('CONTRADICTORY → MANUAL_REVIEW disposition', () => {
    const d = buildAssessmentDisposition({
      outcome: 'CONTRADICTORY', confidence: 0.5,
      contradiction: { resolution: 'CONTRADICTORY', requiresReview: true },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    })
    expect(d.disposition).toBe('MANUAL_REVIEW')
  })

  it('NOT_EVALUATED → DEFER disposition', () => {
    const d = buildAssessmentDisposition({
      outcome: 'NOT_EVALUATED',
      contradiction: { resolution: 'INCONCLUSIVE', requiresReview: false },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    })
    expect(d.disposition).toBe('DEFER')
  })

  it('disposition has summaryHash', () => {
    const d = buildAssessmentDisposition({
      outcome: 'NO_DRIFT', confidence: 0.95,
      contradiction: { resolution: 'CONSISTENT', requiresReview: false },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    })
    expect(d.summaryHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('summaryHash is deterministic', () => {
    const input = {
      outcome: 'DRIFT_DETECTED' as const, confidence: 0.8,
      contradiction: { resolution: 'CONSISTENT' as const, requiresReview: false },
      signalId: SID, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, disposedAt: NOW,
    }
    expect(buildAssessmentDisposition(input).summaryHash)
      .toBe(buildAssessmentDisposition(input).summaryHash)
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildAssessmentDisposition({
      outcome: 'DRIFT_DETECTED', confidence: 0.9,
      contradiction: { resolution: 'CONSISTENT', requiresReview: false },
      signalId: SID, evidenceRef: undefined as any, disposedAt: NOW,
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })
})
