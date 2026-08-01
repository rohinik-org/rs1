import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash, EvaluationId } from '@rohinik-org/ml-ir'
import {
  createEvaluationRun,
  transitionEvaluationRun,
  completeEvaluationRun,
  cancelEvaluationRun,
  type EvaluationRun,
  type EvaluationRunLifecycleState,
  type EvaluationRunTerminalOutcome,
  type EvaluationRunCompletionInput,
  makeEvaluationGovernanceError,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

function makeRun(overrides?: Partial<Parameters<typeof createEvaluationRun>[0]>): EvaluationRun {
  return createEvaluationRun({
    runId: 'run-1',
    evaluationId: 'eval-1' as EvaluationId,
    adapterId: 'stage11f-adapter',
    requestHash: HASH,
    createdAt: NOW,
    ...overrides,
  })
}

// ── initial state ─────────────────────────────────────────────────────────────

describe('createEvaluationRun', () => {
  it('creates run in DRAFT state', () => {
    const run = makeRun()
    expect(run.state).toBe('DRAFT')
    expect(run.runId).toBe('run-1')
    expect(run.evaluationId).toBe('eval-1')
    expect(run.adapterId).toBe('stage11f-adapter')
  })

  it('new run has no terminal outcome', () => {
    const run = makeRun()
    expect(run.terminalOutcome).toBeUndefined()
    expect('promotionDecision' in run).toBe(false)
  })

  it('runId is required — throws EVALUATION_INVALID_IDENTITY when empty', () => {
    expect(() => makeRun({ runId: '' })).toThrow('EVALUATION_INVALID_IDENTITY')
  })

  it('evaluationId is required — throws EVALUATION_INVALID_IDENTITY when empty', () => {
    expect(() => makeRun({ evaluationId: '' as EvaluationId })).toThrow('EVALUATION_INVALID_IDENTITY')
  })
})

// ── lifecycle transitions ─────────────────────────────────────────────────────

describe('transitionEvaluationRun: valid paths', () => {
  it('DRAFT → ADMITTED', () => {
    const run = makeRun()
    const next = transitionEvaluationRun(run, 'ADMITTED', NOW)
    expect(next.state).toBe('ADMITTED')
  })

  it('ADMITTED → QUEUED', () => {
    const run = transitionEvaluationRun(makeRun(), 'ADMITTED', NOW)
    const next = transitionEvaluationRun(run, 'QUEUED', NOW)
    expect(next.state).toBe('QUEUED')
  })

  it('QUEUED → RUNNING', () => {
    let run = transitionEvaluationRun(makeRun(), 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    const next = transitionEvaluationRun(run, 'RUNNING', NOW)
    expect(next.state).toBe('RUNNING')
  })

  it('QUEUED → CANCELLED', () => {
    let run = transitionEvaluationRun(makeRun(), 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    const next = transitionEvaluationRun(run, 'CANCELLED', NOW)
    expect(next.state).toBe('CANCELLED')
  })
})

// ── invalid transitions ───────────────────────────────────────────────────────

describe('transitionEvaluationRun: invalid transitions', () => {
  it('DRAFT → RUNNING throws EVALUATION_INVALID_TRANSITION', () => {
    expect(() => transitionEvaluationRun(makeRun(), 'RUNNING', NOW)).toThrow('EVALUATION_INVALID_TRANSITION')
  })

  it('DRAFT → PASSED throws EVALUATION_INVALID_TRANSITION', () => {
    expect(() => transitionEvaluationRun(makeRun(), 'PASSED', NOW)).toThrow('EVALUATION_INVALID_TRANSITION')
  })

  it('ADMITTED → RUNNING throws EVALUATION_INVALID_TRANSITION', () => {
    const run = transitionEvaluationRun(makeRun(), 'ADMITTED', NOW)
    expect(() => transitionEvaluationRun(run, 'RUNNING', NOW)).toThrow('EVALUATION_INVALID_TRANSITION')
  })
})

// ── terminal states: never reopen ─────────────────────────────────────────────

describe('terminal runs cannot transition', () => {
  const terminalStates: EvaluationRunTerminalOutcome[] = ['PASSED', 'FAILED', 'INCONCLUSIVE', 'CANCELLED']

  for (const terminal of terminalStates) {
    it(`${terminal} run throws EVALUATION_TERMINAL_RUN on any transition`, () => {
      let run = makeRun()
      run = transitionEvaluationRun(run, 'ADMITTED', NOW)
      run = transitionEvaluationRun(run, 'QUEUED', NOW)
      run = transitionEvaluationRun(run, 'RUNNING', NOW)
      const completed = completeEvaluationRun(run, { outcome: terminal, completedAt: NOW, providerRunRef: 'pr-1' })
      expect(() => transitionEvaluationRun(completed, 'ADMITTED', NOW)).toThrow('EVALUATION_TERMINAL_RUN')
    })
  }
})

// ── completeEvaluationRun ─────────────────────────────────────────────────────

describe('completeEvaluationRun', () => {
  function runningRun(): EvaluationRun {
    let run = makeRun()
    run = transitionEvaluationRun(run, 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    return transitionEvaluationRun(run, 'RUNNING', NOW)
  }

  it('PASSED outcome sets state to PASSED', () => {
    const run = completeEvaluationRun(runningRun(), { outcome: 'PASSED', completedAt: NOW, providerRunRef: 'pr-1' })
    expect(run.state).toBe('PASSED')
    expect(run.terminalOutcome).toBe('PASSED')
  })

  it('FAILED outcome sets state to FAILED', () => {
    const run = completeEvaluationRun(runningRun(), { outcome: 'FAILED', completedAt: NOW, providerRunRef: 'pr-1', failureCode: 'ERR_EVAL' })
    expect(run.state).toBe('FAILED')
    expect(run.terminalOutcome).toBe('FAILED')
  })

  it('INCONCLUSIVE outcome sets state to INCONCLUSIVE', () => {
    const run = completeEvaluationRun(runningRun(), { outcome: 'INCONCLUSIVE', completedAt: NOW, providerRunRef: 'pr-1' })
    expect(run.state).toBe('INCONCLUSIVE')
    expect(run.terminalOutcome).toBe('INCONCLUSIVE')
  })

  it('completion on non-RUNNING run throws EVALUATION_INVALID_TRANSITION', () => {
    const admitted = transitionEvaluationRun(makeRun(), 'ADMITTED', NOW)
    expect(() => completeEvaluationRun(admitted, { outcome: 'PASSED', completedAt: NOW, providerRunRef: 'pr-1' })).toThrow('EVALUATION_INVALID_TRANSITION')
  })

  it('completed run carries Stage 11F providerRunRef', () => {
    const run = completeEvaluationRun(runningRun(), { outcome: 'PASSED', completedAt: NOW, providerRunRef: 'stage11f-run-xyz' })
    expect(run.providerRunRef).toBe('stage11f-run-xyz')
  })

  it('no promotionDecision on completed run', () => {
    const run = completeEvaluationRun(runningRun(), { outcome: 'PASSED', completedAt: NOW, providerRunRef: 'pr-1' })
    expect('promotionDecision' in run).toBe(false)
  })
})

// ── cancelEvaluationRun ───────────────────────────────────────────────────────

describe('cancelEvaluationRun', () => {
  it('RUNNING run can be cancelled', () => {
    let run = makeRun()
    run = transitionEvaluationRun(run, 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    run = transitionEvaluationRun(run, 'RUNNING', NOW)
    const cancelled = cancelEvaluationRun(run, NOW, 'user-requested')
    expect(cancelled.state).toBe('CANCELLED')
    expect(cancelled.terminalOutcome).toBe('CANCELLED')
  })

  it('QUEUED run can be cancelled', () => {
    let run = makeRun()
    run = transitionEvaluationRun(run, 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    const cancelled = cancelEvaluationRun(run, NOW, 'user-requested')
    expect(cancelled.state).toBe('CANCELLED')
  })

  it('PASSED run cannot be cancelled — throws EVALUATION_TERMINAL_RUN', () => {
    let run = makeRun()
    run = transitionEvaluationRun(run, 'ADMITTED', NOW)
    run = transitionEvaluationRun(run, 'QUEUED', NOW)
    run = transitionEvaluationRun(run, 'RUNNING', NOW)
    run = completeEvaluationRun(run, { outcome: 'PASSED', completedAt: NOW, providerRunRef: 'pr-1' })
    expect(() => cancelEvaluationRun(run, NOW, 'late cancel')).toThrow('EVALUATION_TERMINAL_RUN')
  })
})

// ── result reference and integrity ───────────────────────────────────────────

describe('result integrity', () => {
  it('result hash on completed run is deterministic', () => {
    const input = { outcome: 'PASSED' as const, completedAt: NOW, providerRunRef: 'pr-1' }
    let run1 = makeRun()
    run1 = transitionEvaluationRun(run1, 'ADMITTED', NOW)
    run1 = transitionEvaluationRun(run1, 'QUEUED', NOW)
    run1 = transitionEvaluationRun(run1, 'RUNNING', NOW)
    const c1 = completeEvaluationRun(run1, input)

    let run2 = makeRun()
    run2 = transitionEvaluationRun(run2, 'ADMITTED', NOW)
    run2 = transitionEvaluationRun(run2, 'QUEUED', NOW)
    run2 = transitionEvaluationRun(run2, 'RUNNING', NOW)
    const c2 = completeEvaluationRun(run2, input)

    expect(c1.resultHash).toBe(c2.resultHash)
    expect(c1.resultHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('stale result hash detection: different providerRunRef produces different resultHash', () => {
    function runToComplete(ref: string): EvaluationRun {
      let run = makeRun()
      run = transitionEvaluationRun(run, 'ADMITTED', NOW)
      run = transitionEvaluationRun(run, 'QUEUED', NOW)
      run = transitionEvaluationRun(run, 'RUNNING', NOW)
      return completeEvaluationRun(run, { outcome: 'PASSED', completedAt: NOW, providerRunRef: ref })
    }
    expect(runToComplete('pr-1').resultHash).not.toBe(runToComplete('pr-2').resultHash)
  })
})

// ── no promotion authority ────────────────────────────────────────────────────

describe('no promotion authority on run', () => {
  it('EvaluationRun has no promotionDecision, deploymentId, or deploymentRef fields', () => {
    const run = makeRun()
    expect('promotionDecision' in run).toBe(false)
    expect('deploymentId' in run).toBe(false)
    expect('deploymentRef' in run).toBe(false)
  })
})
