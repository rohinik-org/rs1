import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationEvaluation,
  transitionEvaluationStatus,
  type AdaptationEvaluationInput,
  type AdaptationEvaluationStatus,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makeEvalInput(overrides?: Partial<AdaptationEvaluationInput>): AdaptationEvaluationInput {
  return {
    evaluationId: 'eval-1' as any,
    proposalId: 'prop-1' as any,
    proposalHash: HASH,
    candidateVersionId: 'ver-1' as any,
    baselineId: 'bl-1' as any,
    baselineHash: HASH,
    evaluatorId: 'evaluator-external',
    proposedById: 'proposer-a',
    requestedAt: NOW,
    requestedBy: 'admission-gate',
    ...overrides,
  }
}

// ── buildAdaptationEvaluation ─────────────────────────────────────────────────

describe('buildAdaptationEvaluation', () => {
  it('valid evaluation starts DRAFT with evaluationHash', () => {
    const e = buildAdaptationEvaluation(makeEvalInput())
    expect(e.evaluationId).toBe('eval-1')
    expect(e.status).toBe('DRAFT')
    expect(e.evaluationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('evaluationHash is deterministic', () => {
    const input = makeEvalInput()
    expect(buildAdaptationEvaluation(input).evaluationHash)
      .toBe(buildAdaptationEvaluation(input).evaluationHash)
  })

  it('missing proposal throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationEvaluation(makeEvalInput({ proposalHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing baseline throws GOVERNED_LEARNING_MISSING_BASELINE', () => {
    expect(() => buildAdaptationEvaluation(makeEvalInput({ baselineHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_BASELINE')
  })

  it('self-evaluation throws GOVERNED_LEARNING_SELF_EVALUATION', () => {
    expect(() => buildAdaptationEvaluation(makeEvalInput({
      evaluatorId: 'proposer-a',
      proposedById: 'proposer-a',
    }))).toThrow('GOVERNED_LEARNING_SELF_EVALUATION')
  })

  it('no admission/deployment fields on evaluation record', () => {
    const e = buildAdaptationEvaluation(makeEvalInput()) as any
    expect('admissionId' in e).toBe(false)
    expect('deploymentId' in e).toBe(false)
    expect('activate' in e).toBe(false)
  })

  it('idempotent: same evaluationId same input', () => {
    const store = new Map()
    const input = makeEvalInput()
    const e1 = buildAdaptationEvaluation(input, store)
    const e2 = buildAdaptationEvaluation(input, store)
    expect(e1.evaluationHash).toBe(e2.evaluationHash)
    expect(store.size).toBe(1)
  })
})

// ── transitionEvaluationStatus ────────────────────────────────────────────────

describe('transitionEvaluationStatus', () => {
  it('DRAFT → ADMITTED is valid', () => {
    const e = buildAdaptationEvaluation(makeEvalInput())
    const next = transitionEvaluationStatus(e, 'ADMITTED', NOW)
    expect(next.status).toBe('ADMITTED')
  })

  it('ADMITTED → QUEUED is valid', () => {
    const e = buildAdaptationEvaluation(makeEvalInput())
    const admitted = transitionEvaluationStatus(e, 'ADMITTED', NOW)
    const queued = transitionEvaluationStatus(admitted, 'QUEUED', NOW)
    expect(queued.status).toBe('QUEUED')
  })

  it('QUEUED → RUNNING is valid', () => {
    const e = buildAdaptationEvaluation(makeEvalInput())
    const running = transitionEvaluationStatus(
      transitionEvaluationStatus(transitionEvaluationStatus(e, 'ADMITTED', NOW), 'QUEUED', NOW),
      'RUNNING', NOW,
    )
    expect(running.status).toBe('RUNNING')
  })

  it('RUNNING → PASSED is valid terminal', () => {
    const e = buildAdaptationEvaluation(makeEvalInput())
    let ev = transitionEvaluationStatus(e, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    const passed = transitionEvaluationStatus(ev, 'PASSED', NOW)
    expect(passed.status).toBe('PASSED')
  })

  it('RUNNING → FAILED is valid terminal', () => {
    let ev = buildAdaptationEvaluation(makeEvalInput())
    ev = transitionEvaluationStatus(ev, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    expect(transitionEvaluationStatus(ev, 'FAILED', NOW).status).toBe('FAILED')
  })

  it('PASSED terminal record cannot be mutated', () => {
    let ev = buildAdaptationEvaluation(makeEvalInput())
    ev = transitionEvaluationStatus(ev, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    ev = transitionEvaluationStatus(ev, 'PASSED', NOW)
    expect(() => transitionEvaluationStatus(ev, 'FAILED', NOW))
      .toThrow('GOVERNED_LEARNING_TERMINAL_RECORD')
  })

  it('FAILED terminal record cannot be mutated', () => {
    let ev = buildAdaptationEvaluation(makeEvalInput())
    ev = transitionEvaluationStatus(ev, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    ev = transitionEvaluationStatus(ev, 'FAILED', NOW)
    expect(() => transitionEvaluationStatus(ev, 'PASSED', NOW))
      .toThrow('GOVERNED_LEARNING_TERMINAL_RECORD')
  })

  it('evaluation PASSED does not admit or deploy', () => {
    let ev = buildAdaptationEvaluation(makeEvalInput())
    ev = transitionEvaluationStatus(ev, 'ADMITTED', NOW)
    ev = transitionEvaluationStatus(ev, 'QUEUED', NOW)
    ev = transitionEvaluationStatus(ev, 'RUNNING', NOW)
    const passed = transitionEvaluationStatus(ev, 'PASSED', NOW) as any
    expect('deploymentId' in passed).toBe(false)
    expect('activationId' in passed).toBe(false)
  })
})
