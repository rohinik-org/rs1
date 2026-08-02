import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationAdmission,
  type AdaptationAdmissionInput,
  type AdaptationAdmissionOutcome,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const EV   = { evidenceId: 'ev-1', evidenceHash: HASH }

function makeAdmInput(overrides?: Partial<AdaptationAdmissionInput>): AdaptationAdmissionInput {
  return {
    admissionId: 'adm-1' as any,
    proposalId: 'prop-1' as any,
    proposalHash: HASH,
    candidateVersionId: 'ver-1' as any,
    evaluationId: 'eval-1' as any,
    evaluationHash: HASH,
    evaluationStatus: 'PASSED',
    baselineId: 'bl-1' as any,
    baselineHash: HASH,
    corpusId: 'corpus-1',
    corpusAuthoritative: true,
    rollbackAvailable: true,
    scopeExpansion: false,
    policyViolation: false,
    selfEvidenceViolation: false,
    protectedInvariantsIntact: true,
    requiresReview: false,
    decidedAt: NOW,
    decidedBy: 'admission-gate',
    ...overrides,
  }
}

// ── buildAdaptationAdmission ──────────────────────────────────────────────────

describe('buildAdaptationAdmission', () => {
  it('all checks pass → ADMITTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput())
    expect(a.outcome).toBe('ADMITTED')
    expect(a.admissionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('missing proposal hash → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ proposalHash: undefined as any }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('non-authoritative corpus → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ corpusAuthoritative: false }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_INCOMPLETE_CORPUS')
  })

  it('missing baseline hash → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ baselineHash: undefined as any }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_MISSING_BASELINE')
  })

  it('evaluation not PASSED → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ evaluationStatus: 'FAILED' }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_EVALUATION_REQUIRED')
  })

  it('self-evidence violation → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ selfEvidenceViolation: true }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_SELF_EVIDENCE')
  })

  it('policy violation → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ policyViolation: true }))
    expect(a.outcome).toBe('REJECTED')
  })

  it('scope expansion → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ scopeExpansion: true }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_SCOPE_EXPANSION')
  })

  it('rollback unavailable → REJECTED', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ rollbackAvailable: false }))
    expect(a.outcome).toBe('REJECTED')
    expect(a.rejectionCode).toBe('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
  })

  it('requiresReview → REQUIRES_REVIEW outcome', () => {
    const a = buildAdaptationAdmission(makeAdmInput({ requiresReview: true }))
    expect(a.outcome).toBe('REQUIRES_REVIEW')
  })

  it('admissionHash is deterministic', () => {
    const input = makeAdmInput()
    expect(buildAdaptationAdmission(input).admissionHash)
      .toBe(buildAdaptationAdmission(input).admissionHash)
  })

  it('ADMITTED record has no activation fields', () => {
    const a = buildAdaptationAdmission(makeAdmInput()) as any
    expect('activate' in a).toBe(false)
    expect('activationId' in a).toBe(false)
  })

  it('idempotent: same admissionId same input', () => {
    const store = new Map()
    const input = makeAdmInput()
    const a1 = buildAdaptationAdmission(input, store)
    const a2 = buildAdaptationAdmission(input, store)
    expect(a1.admissionHash).toBe(a2.admissionHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same admissionId different proposal → throws', () => {
    const store = new Map()
    buildAdaptationAdmission(makeAdmInput({ proposalId: 'prop-1' as any }), store)
    expect(() => buildAdaptationAdmission(makeAdmInput({ proposalId: 'prop-2' as any }), store))
      .toThrow()
  })
})
