import { describe, it, expect } from 'vitest'
import { NullExecutionStore } from '../store/null-execution-store.js'
import { SequentialExecutionScheduler } from '../scheduler/sequential-execution-scheduler.js'
import { ExecutionEngine } from '../engine/execution-engine.js'
import { DEFAULT_EXECUTION_POLICY } from '@rohinik-org/compiler'
import type { WorkflowPlan, WorkflowPlanCandidate, ProviderInvocation } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'

function makeResolver(): ExecutorCapabilityResolver {
  return {
    resolve: (skillId, input): ProviderInvocation => ({
      skillId, input,
      invoke: async () => ({ output: `out-${skillId}`, providerUsed: 'mock', latencyMs: 5 }),
    }),
  }
}

const CANDIDATE: WorkflowPlanCandidate = {
  candidateId: 'c1', origin: 'DISCOVERED',
  workflowReference: { kind: 'DISCOVERED', workflowId: 'wf-1' },
  scores: { planningConfidence: 0.9, evidenceConfidence: 0.9, provenanceWeight: 1.0, finalScore: 0.81 },
}

function makePlan(skillIds: string[]): WorkflowPlan {
  return {
    kind: 'WorkflowPlan', schemaVersion: '1.0',
    planId: 'plan-resume', planRevision: 1, status: 'EXECUTABLE',
    producedAt: '2026-01-01T00:00:00.000Z', graphRevision: 1, workflowRevision: 1, plannerVersion: '0.1.0',
    intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] },
    translationResult: { intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] }, confidence: 1.0, translatorId: 'static', unresolvedTerms: [], warnings: [], status: 'SUCCESS' },
    selectedCandidate: CANDIDATE, alternatives: [],
    steps: skillIds.map((skillId, i) => ({ position: i, skillId, expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: i })),
    planningDecision: { decisionId: 'd1', selectedCandidateId: 'c1', rejectedCandidates: [], policyId: 'p1', plannerVersion: '0.1.0', timestamp: '2026-01-01T00:00:00.000Z' },
    simulation: { status: 'EXECUTABLE', warnings: [], errors: [], cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: skillIds.length, hasCycle: false, coverage: { matchedCapabilities: skillIds, missingCapabilities: [], optionalCapabilities: [], coverageScore: 1.0 }, simulatedWith: { capabilityRegistryRevision: 1, plannerVersion: '0.1.0' } },
  }
}

describe('Checkpoint + Resume', () => {
  it('checkpoint is saved after each step', async () => {
    const store = new NullExecutionStore()
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), store)
    const handle = await engine.execute(makePlan(['skill-a', 'skill-b', 'skill-c']), DEFAULT_EXECUTION_POLICY)
    await handle.wait()
    const checkpoint = await store.loadCheckpoint(handle.executionId)
    expect(checkpoint).toBeDefined()
    expect(checkpoint!.completedSteps).toContain(2)  // all 3 steps done
  })

  it('executionRevision is 1 on first execution', async () => {
    const store = new NullExecutionStore()
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), store)
    const handle = await engine.execute(makePlan(['skill-a']), DEFAULT_EXECUTION_POLICY)
    const result = await handle.wait()
    expect(result.executionRevision).toBe(1)

    const checkpoint = await store.loadCheckpoint(handle.executionId)
    expect(checkpoint!.executionRevision).toBe(1)
  })
})
