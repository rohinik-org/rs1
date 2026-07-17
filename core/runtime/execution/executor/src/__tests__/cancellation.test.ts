import { describe, it, expect } from 'vitest'
import { ExecutionEngine } from '../engine/execution-engine.js'
import { NullExecutionStore } from '../store/null-execution-store.js'
import { SequentialExecutionScheduler } from '../scheduler/sequential-execution-scheduler.js'
import type { WorkflowPlan, WorkflowPlanCandidate, ExecutionPolicy, ProviderInvocation } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'

const CANDIDATE: WorkflowPlanCandidate = {
  candidateId: 'c1', origin: 'DISCOVERED',
  workflowReference: { kind: 'DISCOVERED', workflowId: 'wf-1' },
  scores: { planningConfidence: 0.9, evidenceConfidence: 0.9, provenanceWeight: 1.0, finalScore: 0.81 },
}

function makeResolver(): ExecutorCapabilityResolver {
  return {
    resolve: (skillId, input): ProviderInvocation => ({
      skillId, input,
      invoke: async () => ({ output: 'ok', providerUsed: 'mock', latencyMs: 5 }),
    }),
  }
}

function makePlan(skillIds: string[]): WorkflowPlan {
  return {
    kind: 'WorkflowPlan', schemaVersion: '1.0',
    planId: 'plan-cancel', planRevision: 1, status: 'EXECUTABLE',
    producedAt: '2026-01-01T00:00:00.000Z', graphRevision: 1, workflowRevision: 1, plannerVersion: '0.1.0',
    intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] },
    translationResult: { intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] }, confidence: 1.0, translatorId: 'static', unresolvedTerms: [], warnings: [], status: 'SUCCESS' },
    selectedCandidate: CANDIDATE, alternatives: [],
    steps: skillIds.map((skillId, i) => ({ position: i, skillId, expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: i })),
    planningDecision: { decisionId: 'd1', selectedCandidateId: 'c1', rejectedCandidates: [], policyId: 'p1', plannerVersion: '0.1.0', timestamp: '2026-01-01T00:00:00.000Z' },
    simulation: { status: 'EXECUTABLE', warnings: [], errors: [], cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: skillIds.length, hasCycle: false, coverage: { matchedCapabilities: skillIds, missingCapabilities: [], optionalCapabilities: [], coverageScore: 1.0 }, simulatedWith: { capabilityRegistryRevision: 1, plannerVersion: '0.1.0' } },
  }
}

describe('ExecutionHandle lifecycle', () => {
  it('handle.state is COMPLETED after wait() resolves', async () => {
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), new NullExecutionStore())
    const handle = await engine.execute(makePlan(['skill-a']), {})
    await handle.wait()
    expect(handle.state).toBe('COMPLETED')
  })

  it('continueOnFailure: false — stops at first failure', async () => {
    const resolver: ExecutorCapabilityResolver = {
      resolve: (skillId, input): ProviderInvocation => ({
        skillId, input,
        invoke: async () => {
          if (skillId === 'skill-fail') throw new Error('fail')
          return { output: 'ok', providerUsed: 'mock', latencyMs: 5 }
        },
      }),
    }
    const engine = new ExecutionEngine(resolver, new SequentialExecutionScheduler(), new NullExecutionStore())
    const policy: ExecutionPolicy = { continueOnFailure: false }
    const handle = await engine.execute(makePlan(['skill-ok', 'skill-fail', 'skill-never']), policy)
    const result = await handle.wait()
    expect(result.termination.reason).toBe('FAILED')
    // 'skill-never' should not have a completed record
    const neverRecord = result.stepRecords.find(r => r.skillId === 'skill-never')
    expect(neverRecord).toBeUndefined()
  })
})
