import { describe, it, expect } from 'vitest'
import { runPipeline } from '../reevaluation-pipeline-runner.js'
import { InMemoryTrustPipeline } from '../adapters/in-memory/in-memory-trust-pipeline.js'
import type { PackageTrustReevaluationWorkItem } from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeWorkItem(): PackageTrustReevaluationWorkItem {
  return {
    workItemId: 'wi-op-001-rec-A',
    operationId: 'op-001',
    candidate: {
      candidateId: 'cand-A',
      trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
      subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
      artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
      currentDecision: 'trusted',
      currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
      matchedTriggerIds: [],
      selectionReasons: [],
      repositoryRevision: 1,
      selectedAt: '2026-07-30T10:00:00Z',
    },
    triggerIds: ['trig-001'],
    reevaluationPolicy: {
      policyId: 'pol-1',
      policyVersion: '1.0',
      allowedTriggerTypes: ['policy-changed'],
      maxBatchSize: 10,
      maxRetryCount: 3,
      requireReacquisitionFor: [],
      allowAssessmentReuseFor: [],
      quarantineOnPendingDowngrade: false,
      quarantineOnPipelineFailure: false,
      allowPartialBatchSuccess: true,
      requireAtomicSuccessorPersistence: false,
      priorityRules: [],
    },
    assessmentPlan: { planKind: 'full-recompute', reuseableAssessmentKinds: [], requiresReacquisition: false, reason: 'full-recompute' },
    inputReferences: {
      priorDecisionRecordId: 'rec-A' as RepositoryRecordId,
      assessmentReferences: [],
      evidenceReference: undefined,
      currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    },
    requestedAt: '2026-07-30T10:00:00Z',
    expectedRepositoryRevision: 1,
  }
}

describe('ReevaluationPipelineRunner', () => {
  it('invokes pipeline and returns result unchanged (L-9J-1209)', async () => {
    const pipeline = new InMemoryTrustPipeline()
    pipeline.simulatedDecision = 'conditionally-trusted'
    const result = await runPipeline(makeWorkItem(), pipeline)
    expect(result.decision).toBe('conditionally-trusted')
    expect(result.workItemId).toBe('wi-op-001-rec-A')
  })

  it('calls pipeline exactly once', async () => {
    const pipeline = new InMemoryTrustPipeline()
    await runPipeline(makeWorkItem(), pipeline)
    expect(pipeline.calls).toHaveLength(1)
  })

  it('propagates pipeline errors (L-9J-1220)', async () => {
    const pipeline = new InMemoryTrustPipeline()
    pipeline.simulateFailure = true
    await expect(runPipeline(makeWorkItem(), pipeline)).rejects.toThrow('pipeline-unavailable')
  })

  it('does not invent a decision on failure (L-9J-1220)', async () => {
    const pipeline = new InMemoryTrustPipeline()
    pipeline.simulateFailure = true
    let caught: Error | undefined
    try {
      await runPipeline(makeWorkItem(), pipeline)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    // No decision returned
    expect(caught!.message).toBe('pipeline-unavailable')
  })
})
