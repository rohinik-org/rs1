import { describe, it, expect } from 'vitest'
import { DefaultExecutionFacade, NoopExecutionFacade } from '../facades/execution-facade.js'
import type { WorkflowPlan } from '@rohinik-org/compiler'

const emptyPlan: WorkflowPlan = {
  kind: 'WorkflowPlan', schemaVersion: '1.0', planId: 'p1', planRevision: 1, status: 'DRAFT',
  producedAt: new Date().toISOString(), graphRevision: 0, workflowRevision: 0, plannerVersion: '0.1.0',
  intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [] },
  translationResult: { status: 'TRANSLATED', translatorId: 'test', confidence: 1, intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'test', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [] }, unresolvedTerms: [], warnings: [] },
  selectedCandidate: { candidateId: 'c1', origin: 'SYNTHESIZED', workflowReference: { kind: 'SYNTHESIZED', workflowId: 'none' }, scores: { planningConfidence: 1, evidenceConfidence: 1, provenanceWeight: 1, finalScore: 1 } },
  alternatives: [], steps: [],
  planningDecision: { decisionId: 'd1', selectedCandidateId: 'c1', rejectedCandidates: [], policyId: 'default', plannerVersion: '0.1.0', timestamp: new Date().toISOString() },
  simulation: { status: 'VALID_STRUCTURE', warnings: [], errors: [], cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: 0, hasCycle: false, coverage: { matchedCapabilities: [], missingCapabilities: [], optionalCapabilities: [], coverageScore: 0 }, simulatedWith: { capabilityRegistryRevision: 0, plannerVersion: '0.1.0' } },
}

describe('DefaultExecutionFacade', () => {
  it('execute() returns an ExecutionHandle', async () => {
    const facade = new DefaultExecutionFacade()
    const handle = await facade.execute(emptyPlan)
    expect(handle.executionId).toBeDefined()
  })

  it('handle.wait() resolves to ExecutionResult', async () => {
    const facade = new DefaultExecutionFacade()
    const handle = await facade.execute(emptyPlan)
    const result = await handle.wait()
    expect(result.kind).toBe('ExecutionResult')
  })

  it('getResult() returns null for unknown executionId', async () => {
    const facade = new DefaultExecutionFacade()
    const result = await facade.getResult('unknown-id')
    expect(result).toBeNull()
  })

  it('getResult() returns result after execution', async () => {
    const facade = new DefaultExecutionFacade()
    const handle = await facade.execute(emptyPlan)
    await handle.wait()
    const result = await facade.getResult(handle.executionId)
    expect(result).not.toBeNull()
  })

  it('handles empty plan steps without throwing', async () => {
    const facade = new DefaultExecutionFacade()
    const handle = await facade.execute(emptyPlan)
    await expect(handle.wait()).resolves.toBeDefined()
  })
})

describe('NoopExecutionFacade', () => {
  it('execute() returns handle without throwing', async () => {
    const facade = new NoopExecutionFacade()
    const handle = await facade.execute(emptyPlan)
    expect(handle.executionId).toBe('')
  })
})
