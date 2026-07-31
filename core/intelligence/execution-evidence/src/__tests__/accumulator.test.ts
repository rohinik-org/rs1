import { describe, it, expect } from 'vitest'
import { ExecutionAccumulator } from '../accumulator.js'
import {
  intelligentExecutionId,
  executionEvidenceId,
  executionSessionId,
  invocationId,
  retryId,
  fallbackId,
  contentHash,
  EvidenceOutcome,
  EvidenceCompletionState,
} from '@rohinik-org/execution-evidence-ir'

function makeParams() {
  return {
    evidenceId:             executionEvidenceId('ev-1'),
    intelligentExecutionId: intelligentExecutionId('exec-1'),
    executionSessionId:     executionSessionId('sess-1'),
    operationKind:          'llm.invoke',
    startedAt:              new Date('2025-01-01T00:00:00.000Z'),
  }
}

// ── open ──────────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator.open', () => {
  it('creates accumulator in OPEN state', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    expect(acc.completionState).toBe(EvidenceCompletionState.OPEN)
  })

  it('carries evidenceId', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    expect(acc.evidenceId).toBe('ev-1')
  })

  it('carries operationKind', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    expect(acc.operationKind).toBe('llm.invoke')
  })
})

// ── appendInvocation ──────────────────────────────────────────────────────────

describe('ExecutionAccumulator — appendInvocation', () => {
  it('appends an invocation event', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendInvocation(invocationId('inv-1'))
    expect(acc.invocationIds).toContain('inv-1')
  })

  it('rejects duplicate invocation ID', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendInvocation(invocationId('inv-1'))
    expect(() => acc.appendInvocation(invocationId('inv-1'))).toThrow()
  })

  it('rejects append after seal', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    acc.seal(new Date('2025-01-01T00:00:01.000Z'))
    expect(() => acc.appendInvocation(invocationId('inv-2'))).toThrow()
  })
})

// ── setOutcome ────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator — setOutcome', () => {
  it('sets outcome once', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    expect(acc.outcome).toBe(EvidenceOutcome.SUCCESS)
  })

  it('rejects second outcome set', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    expect(() => acc.setOutcome(EvidenceOutcome.FAILURE)).toThrow()
  })
})

// ── retries ───────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator — retries', () => {
  it('retry count increments monotonically', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendRetry(retryId('r-1'))
    acc.appendRetry(retryId('r-2'))
    expect(acc.retryCount).toBe(2)
  })

  it('rejects duplicate retry ID', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendRetry(retryId('r-1'))
    expect(() => acc.appendRetry(retryId('r-1'))).toThrow()
  })
})

// ── fallbacks ─────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator — fallbacks', () => {
  it('fallback count increments monotonically', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendFallback(fallbackId('f-1'))
    acc.appendFallback(fallbackId('f-2'))
    expect(acc.fallbackCount).toBe(2)
  })

  it('rejects duplicate fallback ID', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.appendFallback(fallbackId('f-1'))
    expect(() => acc.appendFallback(fallbackId('f-1'))).toThrow()
  })
})

// ── seal ──────────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator — seal', () => {
  it('transitions to SEALED', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    acc.seal(new Date('2025-01-01T00:00:01.000Z'))
    expect(acc.completionState).toBe(EvidenceCompletionState.SEALED)
  })

  it('rejects seal without outcome', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    expect(() => acc.seal(new Date('2025-01-01T00:00:01.000Z'))).toThrow()
  })

  it('rejects double seal', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    acc.seal(new Date('2025-01-01T00:00:01.000Z'))
    expect(() => acc.seal(new Date('2025-01-01T00:00:02.000Z'))).toThrow()
  })

  it('rejects completedAt before startedAt', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    expect(() => acc.seal(new Date('2024-12-31T23:59:59.999Z'))).toThrow()
  })

  it('records completedAt after seal', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutcome(EvidenceOutcome.SUCCESS)
    const completedAt = new Date('2025-01-01T00:00:01.000Z')
    acc.seal(completedAt)
    expect(acc.completedAt).toEqual(completedAt)
  })
})

// ── hashes ────────────────────────────────────────────────────────────────────

describe('ExecutionAccumulator — hashes', () => {
  it('records inputHash', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setInputHash(contentHash('abc123'))
    expect(acc.inputHash).toBe('abc123')
  })

  it('records outputHash', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    acc.setOutputHash(contentHash('def456'))
    expect(acc.outputHash).toBe('def456')
  })
})

// ── accumulator is not exported as a public artifact ─────────────────────────

describe('ExecutionAccumulator — not a public immutable artifact', () => {
  it('is a mutable class, not frozen', () => {
    const acc = ExecutionAccumulator.open(makeParams())
    // Cannot produce a SealedExecutionEvidence directly — only builder does that
    expect(typeof acc.seal).toBe('function')
  })
})
