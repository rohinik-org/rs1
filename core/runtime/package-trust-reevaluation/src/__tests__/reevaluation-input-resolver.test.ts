import { describe, it, expect } from 'vitest'
import { resolveInputs } from '../reevaluation-input-resolver.js'
import { InMemoryTrustRepositoryReader } from '../adapters/in-memory/in-memory-trust-repository-reader.js'
import type { PackageTrustReevaluationCandidate } from '../types.js'
import type { PackageTrustDecisionRecord, RepositoryRecordId, RepositoryRevision, OperationId } from '@rohinik-org/package-trust-repository'

function makeRecord(id: string): PackageTrustDecisionRecord {
  return {
    recordId: id as RepositoryRecordId,
    operationId: 'op-001' as OperationId,
    subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
    decision: 'trusted',
    assessmentReferences: [{ assessmentKind: 'source', assessmentId: 'ass-1', semanticHash: 'h1' }],
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    recordedAt: '2026-07-30T10:00:00Z',
    effectiveAt: '2026-07-30T10:00:00Z',
    repositoryRevision: 1 as RepositoryRevision,
    canonicalDigest: 'canonical-hash',
  }
}

function makeCandidate(recordId: string): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A',
    trustDecisionRecordId: recordId as RepositoryRecordId,
    subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
    currentDecision: 'trusted',
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: [],
    selectionReasons: [],
    repositoryRevision: 1,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

describe('ReevaluationInputResolver', () => {
  it('resolves input references from prior record', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    reader.addRecord(makeRecord('rec-A'))
    const result = await resolveInputs(makeCandidate('rec-A'), reader)
    expect(result.inputReferences.priorDecisionRecordId).toBe('rec-A')
    expect(result.inputReferences.assessmentReferences).toHaveLength(1)
    expect(result.priorRecord.decision).toBe('trusted')
  })

  it('throws referential-integrity-failure when prior record missing (L-9J-1227)', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    await expect(resolveInputs(makeCandidate('missing-rec'), reader)).rejects.toThrow('referential-integrity-failure')
  })

  it('does not perform trust evaluation (L-9J-1201)', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    reader.addRecord(makeRecord('rec-B'))
    // resolveInputs should not call any pipeline
    const result = await resolveInputs(makeCandidate('rec-B'), reader)
    expect(result.inputReferences.currentPolicyReference.policyId).toBe('pol-1')
  })
})
