import { describe, it, expect } from 'vitest'
import { deduplicateCandidates } from '../candidate-deduplicator.js'
import type { PackageTrustReevaluationCandidate, PackageTrustReevaluationTrigger } from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeCandidate(id: string, triggerIds: string[] = [], reasons: string[] = []): PackageTrustReevaluationCandidate {
  return {
    candidateId: `cand-${id}`,
    trustDecisionRecordId: `rec-${id}` as RepositoryRecordId,
    subject: { subjectKind: 'rohinik-package', packageId: `pkg-${id}`, version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: id }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: `pkg-${id}`, version: '1.0.0', artifactDigest: 'sha256:abc' },
    currentDecision: 'trusted',
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: triggerIds,
    selectionReasons: reasons.map(r => ({ reasonType: 'policy-changed' as const, triggerId: r, description: r })),
    repositoryRevision: 1,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

describe('CandidateDeduplicator', () => {
  it('returns single entry for unique candidates', () => {
    const result = deduplicateCandidates([makeCandidate('A'), makeCandidate('B')], [])
    expect(result).toHaveLength(2)
  })

  it('merges duplicate candidates for same record ID', () => {
    const a1 = makeCandidate('A', ['t1'], ['t1'])
    const a2 = makeCandidate('A', ['t2'], ['t2'])
    const result = deduplicateCandidates([a1, a2], [])
    expect(result).toHaveLength(1)
    expect(result[0]!.mergedTriggerIds).toContain('t1')
    expect(result[0]!.mergedTriggerIds).toContain('t2')
  })

  it('preserves all selection reasons when merging', () => {
    const a1 = makeCandidate('A', ['t1'], ['t1'])
    const a2 = makeCandidate('A', ['t2'], ['t2'])
    const result = deduplicateCandidates([a1, a2], [])
    expect(result[0]!.mergedSelectionReasons).toHaveLength(2)
  })

  it('does not duplicate reasons for same trigger', () => {
    const a1 = makeCandidate('A', ['t1'], ['t1'])
    const a2 = makeCandidate('A', ['t1'], ['t1'])
    const result = deduplicateCandidates([a1, a2], [])
    expect(result[0]!.mergedSelectionReasons).toHaveLength(1)
  })
})
