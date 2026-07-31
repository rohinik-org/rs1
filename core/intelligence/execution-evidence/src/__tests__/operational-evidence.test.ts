import { describe, it, expect } from 'vitest'
import { ExecutionAccumulator } from '../accumulator.js'
import { ExecutionEvidenceBuilder } from '../builder.js'
import {
  intelligentExecutionId,
  executionSessionId,
  retryId,
  fallbackId,
  invocationId,
  EvidenceOutcome,
  EvidenceErrorCode,
} from '@rohinik-org/execution-evidence-ir'

function makeAcc() {
  return ExecutionAccumulator.open({
    evidenceId:             'ev-1' as any,
    intelligentExecutionId: intelligentExecutionId('exec-1'),
    executionSessionId:     executionSessionId('sess-1'),
    operationKind:          'llm.invoke',
    startedAt:              new Date('2025-01-01T00:00:00.000Z'),
  })
}

function makeBuilder() {
  let seq = 0
  return new ExecutionEvidenceBuilder(
    { now: () => new Date('2025-01-01T00:00:00.000Z') },
    { generate: () => `id-${++seq}` },
    { hash: (s: string) => 'h:' + s.slice(0, 8) },
  )
}

// ── retry ──────────────────────────────────────────────────────────────────────

describe('Operational evidence — retry', () => {
  it('retryCount increments per appendRetry', () => {
    const acc = makeAcc()
    acc.appendRetry(retryId('r1'))
    acc.appendRetry(retryId('r2'))
    acc.appendRetry(retryId('r3'))
    expect(acc.retryCount).toBe(3)
  })

  it('duplicate retry ID throws EVIDENCE_DUPLICATE_EVENT', () => {
    const acc = makeAcc()
    acc.appendRetry(retryId('r1'))
    expect(() => acc.appendRetry(retryId('r1'))).toThrow(EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT)
  })

  it('retryCount preserved in sealed record', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordRetry(id, retryId('r1'))
    builder.recordRetry(id, retryId('r2'))
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.retryCount).toBe(2)
  })

  it('retry after fallback counted independently', () => {
    const acc = makeAcc()
    acc.appendFallback(fallbackId('f1'))
    acc.appendRetry(retryId('r1'))
    expect(acc.retryCount).toBe(1)
    expect(acc.fallbackCount).toBe(1)
  })
})

// ── fallback ──────────────────────────────────────────────────────────────────

describe('Operational evidence — fallback', () => {
  it('fallbackCount increments per appendFallback', () => {
    const acc = makeAcc()
    acc.appendFallback(fallbackId('f1'))
    acc.appendFallback(fallbackId('f2'))
    expect(acc.fallbackCount).toBe(2)
  })

  it('duplicate fallback ID throws EVIDENCE_DUPLICATE_EVENT', () => {
    const acc = makeAcc()
    acc.appendFallback(fallbackId('f1'))
    expect(() => acc.appendFallback(fallbackId('f1'))).toThrow(EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT)
  })

  it('fallbackCount preserved in sealed record', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordFallback(id, fallbackId('f1'))
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.fallbackCount).toBe(1)
  })
})

// ── timing ────────────────────────────────────────────────────────────────────

describe('Operational evidence — timing', () => {
  it('duration is non-negative', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const duration = record.completedAt.getTime() - record.startedAt.getTime()
    expect(duration).toBeGreaterThanOrEqual(0)
  })

  it('completedAt cannot precede startedAt', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    expect(() => builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2024-12-31T23:59:59.000Z')))
      .toThrow(EvidenceErrorCode.EVIDENCE_SEAL_FAILED)
  })
})

// ── usage observation ─────────────────────────────────────────────────────────

describe('Operational evidence — usage observation', () => {
  it('absent token measurements remain undefined, not zero', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.tokenUsage).toBeUndefined()
  })

  it('partial token observation preserved as-is (no fabrication)', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordTokenUsage(id, { inputTokens: 100 })  // outputTokens absent
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.tokenUsage?.inputTokens).toBe(100)
    expect(record.tokenUsage?.outputTokens).toBeUndefined()
    expect(record.tokenUsage?.totalTokens).toBeUndefined()
  })

  it('cost requires currency', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordCost(id, { estimatedCost: 0.001, currency: 'USD', confidence: 0.9 })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.cost?.currency).toBe('USD')
  })

  it('observed cost and estimated cost are distinct fields', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordCost(id, { estimatedCost: 0.001, observedCost: 0.0012, currency: 'USD', confidence: 0.9 })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.cost?.estimatedCost).toBe(0.001)
    expect(record.cost?.observedCost).toBe(0.0012)
    expect(record.cost?.observedCost).not.toBe(record.cost?.estimatedCost)
  })

  it('absent cost remains undefined, not zero', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.cost).toBeUndefined()
  })
})

// ── privacy boundary ──────────────────────────────────────────────────────────

describe('Operational evidence — privacy boundary', () => {
  it('privacy boundary false means boundary not preserved', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    builder.recordPrivacyBoundary(id, false)
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.privacyBoundaryPreserved).toBe(false)
  })

  it('absent privacy boundary remains undefined, not fabricated', () => {
    const builder = makeBuilder()
    const id = builder.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    const record = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.privacyBoundaryPreserved).toBeUndefined()
  })
})

// ── controller wiring ─────────────────────────────────────────────────────────

describe('Operational evidence — controller recordRetry/recordFallback', () => {
  it('controller.recordRetry increments retryCount in sealed record', async () => {
    const { ExecutionEvidenceController } = await import('../controller.js')
    const { MemoryEvidenceRepository } = await import('@rohinik-org/execution-evidence-store-memory')
    const { makeContextAdmissionRef } = await import('@rohinik-org/execution-evidence-ir')
    let seq = 0
    const repo = new MemoryEvidenceRepository()
    const ctrl = new ExecutionEvidenceController(
      repo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
    )
    const id = ctrl.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    ctrl.recordRetry(id, retryId('r1'))
    ctrl.recordRetry(id, retryId('r2'))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.retryCount).toBe(2)
  })

  it('controller.recordFallback increments fallbackCount in sealed record', async () => {
    const { ExecutionEvidenceController } = await import('../controller.js')
    const { MemoryEvidenceRepository } = await import('@rohinik-org/execution-evidence-store-memory')
    const { makeContextAdmissionRef } = await import('@rohinik-org/execution-evidence-ir')
    let seq = 0
    const repo = new MemoryEvidenceRepository()
    const ctrl = new ExecutionEvidenceController(
      repo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
    )
    const id = ctrl.open({ intelligentExecutionId: intelligentExecutionId('e'), executionSessionId: executionSessionId('s'), operationKind: 'llm.invoke' })
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    ctrl.recordFallback(id, fallbackId('f1'))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.fallbackCount).toBe(1)
  })
})
