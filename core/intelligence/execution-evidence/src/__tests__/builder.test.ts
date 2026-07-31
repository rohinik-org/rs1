import { describe, it, expect } from 'vitest'
import { ExecutionEvidenceBuilder } from '../builder.js'
import {
  intelligentExecutionId,
  executionEvidenceId,
  executionSessionId,
  contentHash,
  makeContextAdmissionRef,
  EvidenceCompletionState,
  EvidenceOutcome,
  EvidenceSchemaVersion,
  CANONICALIZATION_VERSION,
  verifyEvidenceHash,
} from '@rohinik-org/execution-evidence-ir'
import type { Clock, IdGenerator, ContentHasher } from '@rohinik-org/execution-evidence-ir'

// ── Test doubles ──────────────────────────────────────────────────────────────

function makeClock(iso = '2025-01-01T00:00:00.000Z'): Clock {
  return { now: () => new Date(iso) }
}

let idSeq = 0
function makeIdGen(): IdGenerator {
  idSeq = 0
  return { generate: () => `gen-${++idSeq}` }
}

function makeHasher(): ContentHasher {
  return { hash: (s: string) => 'sha256:' + s.slice(0, 8) }
}

function makeBuilder(clockIso = '2025-01-01T00:00:00.000Z') {
  return new ExecutionEvidenceBuilder(makeClock(clockIso), makeIdGen(), makeHasher())
}

// ── open ──────────────────────────────────────────────────────────────────────

describe('ExecutionEvidenceBuilder.open', () => {
  it('returns an ExecutionEvidenceId', () => {
    const b = makeBuilder()
    const id = b.open({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
    })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('generates distinct IDs for distinct executions', () => {
    const b = makeBuilder()
    const id1 = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    const id2 = b.open({ intelligentExecutionId: intelligentExecutionId('exec-2'), executionSessionId: executionSessionId('sess-2'), operationKind: 'llm.invoke' })
    expect(id1).not.toBe(id2)
  })
})

// ── seal ──────────────────────────────────────────────────────────────────────

describe('ExecutionEvidenceBuilder.seal', () => {
  it('produces a SealedExecutionEvidence with SEALED state', () => {
    const b = makeBuilder()
    const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'hash-c', false))
    const record = b.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.completionState).toBe(EvidenceCompletionState.SEALED)
  })

  it('sealed record passes integrity verification', () => {
    const b = makeBuilder()
    const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'hash-c', false))
    const record = b.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(verifyEvidenceHash(record)).toBe(true)
  })

  it('sealed record carries schemaVersion and canonicalizationVersion', () => {
    const b = makeBuilder()
    const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'hash-c', false))
    const record = b.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.schemaVersion).toBe(EvidenceSchemaVersion)
    expect(record.canonicalizationVersion).toBe(CANONICALIZATION_VERSION)
  })

  it('deterministic — same injected deps produce same evidenceHash', () => {
    const b1 = new ExecutionEvidenceBuilder(makeClock(), { generate: () => 'fixed-id' }, makeHasher())
    const b2 = new ExecutionEvidenceBuilder(makeClock(), { generate: () => 'fixed-id' }, makeHasher())
    const admissionRef = makeContextAdmissionRef('c-1', 'hash-c', false)
    const completedAt = new Date('2025-01-01T00:00:01.000Z')

    const id1 = b1.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b1.recordContextAdmission(id1, admissionRef)
    const r1 = b1.seal(id1, EvidenceOutcome.SUCCESS, completedAt)

    const id2 = b2.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b2.recordContextAdmission(id2, admissionRef)
    const r2 = b2.seal(id2, EvidenceOutcome.SUCCESS, completedAt)

    expect(r1.evidenceHash).toBe(r2.evidenceHash)
  })

  it('rejects seal of unknown evidenceId', () => {
    const b = makeBuilder()
    expect(() => b.seal(executionEvidenceId('unknown'), EvidenceOutcome.SUCCESS, new Date())).toThrow()
  })

  it('rejects context-required success without context admission reference', () => {
    const b = makeBuilder()
    const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke', requiresContextAdmission: true })
    expect(() => b.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))).toThrow()
  })

  it('context-required failure without admission ref seals as FAILURE', () => {
    const b = makeBuilder()
    const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke', requiresContextAdmission: true })
    const record = b.seal(id, EvidenceOutcome.FAILURE, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.outcome).toBe(EvidenceOutcome.FAILURE)
  })

  it('all terminal outcomes are sealable', () => {
    const outcomes = [EvidenceOutcome.SUCCESS, EvidenceOutcome.FAILURE, EvidenceOutcome.TIMEOUT, EvidenceOutcome.CANCELLED, EvidenceOutcome.ABORTED] as const
    for (const outcome of outcomes) {
      const b = makeBuilder()
      const id = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'test' })
      const record = b.seal(id, outcome, new Date('2025-01-01T00:00:01.000Z'))
      expect(record.outcome).toBe(outcome)
    }
  })
})

// ── supersession ──────────────────────────────────────────────────────────────

describe('ExecutionEvidenceBuilder — supersession', () => {
  it('new sealed record carries supersedesEvidenceId', () => {
    const b = makeBuilder()
    const id1 = b.open({ intelligentExecutionId: intelligentExecutionId('exec-1'), executionSessionId: executionSessionId('sess-1'), operationKind: 'llm.invoke' })
    b.recordContextAdmission(id1, makeContextAdmissionRef('c-1', 'hash-c', false))
    const r1 = b.seal(id1, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))

    const id2 = b.openCorrection({
      intelligentExecutionId: intelligentExecutionId('exec-1'),
      executionSessionId:     executionSessionId('sess-1'),
      operationKind:          'llm.invoke',
      supersedesEvidenceId:   r1.evidenceId,
      supersedesEvidenceHash: r1.evidenceHash,
      correctionReason:       'data entry error',
    })
    b.recordContextAdmission(id2, makeContextAdmissionRef('c-1', 'hash-c', false))
    const r2 = b.seal(id2, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:02.000Z'))

    expect(r2.supersedes?.supersedesEvidenceId).toBe(r1.evidenceId)
    expect(r2.supersedes?.supersedesEvidenceHash).toBe(r1.evidenceHash)
  })
})
