import { describe, it, expect } from 'vitest'
import { ExecutionEngine } from '../engine/execution-engine.js'
import { NullExecutionStore } from '../store/null-execution-store.js'
import { SequentialExecutionScheduler } from '../scheduler/sequential-execution-scheduler.js'
import { DEFAULT_EXECUTION_POLICY } from '@rohinik-org/compiler'
import type { WorkflowPlan, WorkflowPlanCandidate, ProviderInvocation } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'

function makeResolver(outputs: Record<string, unknown> = {}): ExecutorCapabilityResolver {
  return {
    resolve: (skillId, input): ProviderInvocation => ({
      skillId, input,
      invoke: async () => ({
        output: outputs[skillId] ?? `output-of-${skillId}`,
        providerUsed: 'mock',
        latencyMs: 5,
      }),
    }),
  }
}

const EMPTY_CANDIDATE: WorkflowPlanCandidate = {
  candidateId: 'c1', origin: 'DISCOVERED',
  workflowReference: { kind: 'DISCOVERED', workflowId: 'wf-1' },
  scores: { planningConfidence: 0.9, evidenceConfidence: 0.9, provenanceWeight: 1.0, finalScore: 0.81 },
}

function makePlan(skillIds: string[]): WorkflowPlan {
  return {
    kind: 'WorkflowPlan', schemaVersion: '1.0',
    planId: 'plan-abc', planRevision: 1, status: 'EXECUTABLE',
    producedAt: '2026-01-01T00:00:00.000Z',
    graphRevision: 1, workflowRevision: 1, plannerVersion: '0.1.0',
    intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] },
    translationResult: { intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'static', translationConfidence: 1.0, unresolvedTerms: [] }, confidence: 1.0, translatorId: 'static', unresolvedTerms: [], warnings: [], status: 'SUCCESS' },
    selectedCandidate: EMPTY_CANDIDATE, alternatives: [],
    steps: skillIds.map((skillId, i) => ({ position: i, skillId, expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: i })),
    planningDecision: { decisionId: 'd1', selectedCandidateId: 'c1', rejectedCandidates: [], policyId: 'default-v1', plannerVersion: '0.1.0', timestamp: '2026-01-01T00:00:00.000Z' },
    simulation: { status: 'EXECUTABLE', warnings: [], errors: [], cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: skillIds.length, hasCycle: false, coverage: { matchedCapabilities: skillIds, missingCapabilities: [], optionalCapabilities: [], coverageScore: 1.0 }, simulatedWith: { capabilityRegistryRevision: 1, plannerVersion: '0.1.0' } },
  }
}

describe('ExecutionEngine — integration', () => {
  it('executes 3-step plan to SUCCESS', async () => {
    const engine = new ExecutionEngine(
      makeResolver({ 'skill-read': 'csv_data', 'skill-transform': 'transformed', 'skill-write': 'written' }),
      new SequentialExecutionScheduler(),
      new NullExecutionStore(),
    )
    const handle = await engine.execute(makePlan(['skill-read', 'skill-transform', 'skill-write']), DEFAULT_EXECUTION_POLICY)
    const result = await handle.wait()
    expect(result.termination.reason).toBe('SUCCESS')
    expect(result.stepRecords.length).toBe(3)
    expect(result.stepRecords.every(s => s.state === 'COMPLETED')).toBe(true)
    expect(result.outputs[0]).toBe('csv_data')
    expect(result.outputs[2]).toBe('written')
  })

  it('returns FAILED when a step provider throws', async () => {
    const resolver: ExecutorCapabilityResolver = {
      resolve: (skillId, input): ProviderInvocation => ({
        skillId, input,
        invoke: async () => {
          if (skillId === 'skill-fail') throw new Error('provider exploded')
          return { output: 'ok', providerUsed: 'mock', latencyMs: 5 }
        },
      }),
    }
    const engine = new ExecutionEngine(resolver, new SequentialExecutionScheduler(), new NullExecutionStore())
    const handle = await engine.execute(makePlan(['skill-ok', 'skill-fail', 'skill-ok2']), DEFAULT_EXECUTION_POLICY)
    const result = await handle.wait()
    expect(result.termination.reason).toBe('FAILED')
  })

  it('handle.events() emits EXECUTION_STARTED and EXECUTION_COMPLETED', async () => {
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), new NullExecutionStore())
    const handle = await engine.execute(makePlan(['skill-a']), DEFAULT_EXECUTION_POLICY)
    const events: string[] = []
    const drain = (async () => {
      for await (const ev of handle.events()) {
        events.push(ev.eventType)
      }
    })()
    await handle.wait()
    await drain
    expect(events).toContain('EXECUTION_STARTED')
    expect(events).toContain('EXECUTION_COMPLETED')
  })

  it('getResult returns result after execution completes', async () => {
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), new NullExecutionStore())
    const handle = await engine.execute(makePlan(['skill-a']), DEFAULT_EXECUTION_POLICY)
    await handle.wait()
    const result = await engine.getResult(handle.executionId)
    expect(result?.executionId).toBe(handle.executionId)
  })

  it('empty plan completes immediately with SUCCESS', async () => {
    const engine = new ExecutionEngine(makeResolver(), new SequentialExecutionScheduler(), new NullExecutionStore())
    const handle = await engine.execute(makePlan([]), DEFAULT_EXECUTION_POLICY)
    const result = await handle.wait()
    expect(result.termination.reason).toBe('SUCCESS')
    expect(result.stepRecords.length).toBe(0)
  })
})
