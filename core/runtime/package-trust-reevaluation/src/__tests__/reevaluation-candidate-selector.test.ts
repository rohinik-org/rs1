import { describe, it, expect } from 'vitest'
import { selectCandidates } from '../reevaluation-candidate-selector.js'
import type { PackageTrustReevaluationCandidate, PackageTrustReevaluationTrigger } from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeCandidate(id: string, revision = 1, decision: import('@rohinik-org/package-trust-ir').PackageTrustDecision = 'trusted'): PackageTrustReevaluationCandidate {
  return {
    candidateId: `cand-${id}`,
    trustDecisionRecordId: `rec-${id}` as RepositoryRecordId,
    subject: { subjectKind: 'rohinik-package', packageId: `pkg-${id}`, version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: id }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: `pkg-${id}`, version: '1.0.0', artifactDigest: 'sha256:abc' },
    currentDecision: decision,
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: [],
    selectionReasons: [],
    repositoryRevision: revision,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

function makeTrigger(type: string = 'policy-changed'): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001',
    triggerType: type as PackageTrustReevaluationTrigger['triggerType'],
    authority: 'system-policy',
    scope: {},
    reason: 'test',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:00Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'x' },
  }
}

describe('ReevaluationCandidateSelector', () => {
  it('returns candidates with selection reasons from trigger', () => {
    const result = selectCandidates([makeCandidate('A')], [makeTrigger()], '2026-07-30T10:00:00Z')
    expect(result).toHaveLength(1)
    expect(result[0]!.selectionReasons).toHaveLength(1)
  })

  it('populates matchedTriggerIds', () => {
    const result = selectCandidates([makeCandidate('A')], [makeTrigger()], '2026-07-30T10:00:00Z')
    expect(result[0]!.matchedTriggerIds).toContain('trig-001')
  })

  it('sorts by revision ASC when priorities equal', () => {
    const result = selectCandidates(
      [makeCandidate('B', 5), makeCandidate('A', 1)],
      [makeTrigger()],
      '2026-07-30T10:00:00Z',
    )
    expect(result[0]!.trustDecisionRecordId).toBe('rec-A')
    expect(result[1]!.trustDecisionRecordId).toBe('rec-B')
  })

  it('prioritizes emergency-recall above policy-changed', () => {
    const result = selectCandidates(
      [makeCandidate('A', 1), makeCandidate('B', 2)],
      [makeTrigger('emergency-recall')],
      '2026-07-30T10:00:00Z',
    )
    // Both should be present with emergency priority
    expect(result).toHaveLength(2)
  })

  it('returns empty for empty candidates', () => {
    expect(selectCandidates([], [makeTrigger()], '2026-07-30T10:00:00Z')).toHaveLength(0)
  })
})
