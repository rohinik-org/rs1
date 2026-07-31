import { describe, it, expect } from 'vitest'
import {
  intelligentExecutionId,
  executionSessionId,
  EvidenceOutcome,
  makeContextAdmissionRef,
} from '@rohinik-org/execution-evidence-ir'
import { ExecutionEvidenceBuilder } from '../builder.js'
import { buildRedactedView } from '../redaction.js'

function makeBuilder() {
  let seq = 0
  return new ExecutionEvidenceBuilder(
    { now: () => new Date('2025-01-01T00:00:00.000Z') },
    { generate: () => `id-${++seq}` },
    { hash: (s: string) => 'h:' + s.slice(0, 8) },
  )
}

function makeSealedRecord() {
  const builder = makeBuilder()
  const id = builder.open({
    intelligentExecutionId: intelligentExecutionId('exec-1'),
    executionSessionId:     executionSessionId('sess-1'),
    operationKind:          'llm.invoke',
  })
  builder.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
  return builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
}

const POLICY_REF = {
  kind:       'redaction-policy' as const,
  policyId:   'pol-1',
  policyHash: 'ph-1',
}

// ── view structure ─────────────────────────────────────────────────────────────

describe('buildRedactedView — structure', () => {
  it('produces a view with its own viewId and viewHash', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, ['tokenUsage', 'cost'])
    expect(typeof view.viewId).toBe('string')
    expect(view.viewId.length).toBeGreaterThan(0)
    expect(typeof view.viewHash).toBe('string')
    expect(view.viewHash.length).toBeGreaterThan(0)
  })

  it('view carries sourceEvidenceId and sourceEvidenceHash', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, [])
    expect(view.sourceEvidenceId).toBe(source.evidenceId)
    expect(view.sourceEvidenceHash).toBe(source.evidenceHash)
  })

  it('viewHash is not equal to sourceEvidenceHash', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, [])
    expect(view.viewHash).not.toBe(source.evidenceHash)
  })

  it('carries the redaction policy reference', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, [])
    expect(view.redactionPolicy).toEqual(POLICY_REF)
  })
})

// ── redaction fields ───────────────────────────────────────────────────────────

describe('buildRedactedView — field redaction', () => {
  it('redacted fields are absent from view', () => {
    const builder = makeBuilder()
    const id = builder.open({
      intelligentExecutionId: intelligentExecutionId('exec-2'),
      executionSessionId:     executionSessionId('sess-2'),
      operationKind:          'llm.invoke',
    })
    builder.recordContextAdmission(id, makeContextAdmissionRef('c-1', 'h-c', false))
    builder.recordTokenUsage(id, { inputTokens: 100, outputTokens: 50, totalTokens: 150 })
    const source = builder.seal(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))

    const view = buildRedactedView(source, POLICY_REF, ['tokenUsage'])
    expect((view.projection as Record<string, unknown>).tokenUsage).toBeUndefined()
  })

  it('non-redacted fields are present in view', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, ['tokenUsage'])
    expect((view.projection as Record<string, unknown>).operationKind).toBe('llm.invoke')
    expect((view.projection as Record<string, unknown>).outcome).toBe(EvidenceOutcome.SUCCESS)
  })

  it('redactedFields list is preserved in view', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, ['tokenUsage', 'cost'])
    expect(view.redactedFields).toEqual(['tokenUsage', 'cost'])
  })
})

// ── immutability ───────────────────────────────────────────────────────────────

describe('buildRedactedView — original immutability', () => {
  it('original source record is not modified', () => {
    const source = makeSealedRecord()
    const originalHash = source.evidenceHash
    const originalId   = source.evidenceId
    buildRedactedView(source, POLICY_REF, ['tokenUsage', 'cost'])
    expect(source.evidenceHash).toBe(originalHash)
    expect(source.evidenceId).toBe(originalId)
  })

  it('view projection does not expose evidenceHash of source as its own identity', () => {
    const source = makeSealedRecord()
    const view = buildRedactedView(source, POLICY_REF, [])
    // view integrity lives in viewHash, not evidenceHash
    expect((view as unknown as Record<string, unknown>).evidenceHash).toBeUndefined()
  })
})

// ── determinism ────────────────────────────────────────────────────────────────

describe('buildRedactedView — determinism', () => {
  it('same source and policy produce same viewHash', () => {
    const source = makeSealedRecord()
    const v1 = buildRedactedView(source, POLICY_REF, ['tokenUsage'])
    const v2 = buildRedactedView(source, POLICY_REF, ['tokenUsage'])
    expect(v1.viewHash).toBe(v2.viewHash)
  })

  it('different policy produces different viewHash', () => {
    const source = makeSealedRecord()
    const pol2 = { ...POLICY_REF, policyHash: 'ph-2' }
    const v1 = buildRedactedView(source, POLICY_REF, [])
    const v2 = buildRedactedView(source, pol2, [])
    expect(v1.viewHash).not.toBe(v2.viewHash)
  })

  it('different redacted fields produce different viewHash', () => {
    const source = makeSealedRecord()
    const v1 = buildRedactedView(source, POLICY_REF, [])
    const v2 = buildRedactedView(source, POLICY_REF, ['operationKind'])
    expect(v1.viewHash).not.toBe(v2.viewHash)
  })
})
