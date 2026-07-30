import { describe, it, expect } from 'vitest'
import { buildCandidateQuery } from '../candidate-query-builder.js'
import type { PackageTrustReevaluationTrigger } from '../types.js'

function trigger(overrides: Partial<PackageTrustReevaluationTrigger> = {}): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001',
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'policy updated',
    changedReferences: [{ referenceKind: 'policy', referenceId: 'pol-2' }],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
    ...overrides,
  }
}

describe('CandidateQueryBuilder', () => {
  it('extracts policyIds from changed references', () => {
    const query = buildCandidateQuery(trigger(), '2026-07-30T10:00:00Z')
    expect(query.policyIds).toContain('pol-2')
  })

  it('extracts advisoryIds from changed references', () => {
    const t = trigger({
      triggerType: 'vulnerability-advisory-changed',
      changedReferences: [{ referenceKind: 'advisory', referenceId: 'adv-1' }],
    })
    const query = buildCandidateQuery(t, '2026-07-30T10:00:00Z')
    expect(query.advisoryIds).toContain('adv-1')
  })

  it('extracts publisherIds from changed references', () => {
    const t = trigger({
      triggerType: 'publisher-trust-changed',
      changedReferences: [{ referenceKind: 'publisher', referenceId: 'pub-1' }],
    })
    const query = buildCandidateQuery(t, '2026-07-30T10:00:00Z')
    expect(query.publisherIds).toContain('pub-1')
  })

  it('uses scope packageIds when present', () => {
    const t = trigger({ scope: { packageIds: ['pkg-A'] } })
    const query = buildCandidateQuery(t, '2026-07-30T10:00:00Z')
    expect(query.packageIds).toContain('pkg-A')
  })

  it('uses scope tenantIds when present', () => {
    const t = trigger({ scope: { tenantIds: ['tenant-1'] } })
    const query = buildCandidateQuery(t, '2026-07-30T10:00:00Z')
    expect(query.tenantIds).toContain('tenant-1')
  })

  it('passes asOf parameter', () => {
    const asOf = '2026-07-30T12:00:00Z'
    const query = buildCandidateQuery(trigger(), asOf)
    expect(query.asOf).toBe(asOf)
  })

  it('uses provided limit', () => {
    const query = buildCandidateQuery(trigger(), '2026-07-30T10:00:00Z', 50)
    expect(query.limit).toBe(50)
  })

  it('defaults limit to 100', () => {
    const query = buildCandidateQuery(trigger(), '2026-07-30T10:00:00Z')
    expect(query.limit).toBe(100)
  })
})
