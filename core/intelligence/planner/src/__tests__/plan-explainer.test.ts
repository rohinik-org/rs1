import { describe, it, expect } from 'vitest'
import { PlanExplainer } from '../explanation/plan-explainer.js'
import type { WorkflowPlan, WorkflowPlanCandidate, WorkflowDescriptor } from '@rohinik-org/compiler'

function makePlan(): WorkflowPlan {
  const descriptor: WorkflowDescriptor = {
    kind: 'WorkflowDescriptor', schemaVersion: '1.0', workflowId: 'wf-1', version: 1, status: 'ACTIVE',
    definition: { name: 'skill-read → skill-write', steps: [
      { skillId: 'skill-read', position: 0, statistics: { executionCount: 5, outcomeDistribution: { SUCCESS: 5, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 200 } },
      { skillId: 'skill-write', position: 1, statistics: { executionCount: 5, outcomeDistribution: { SUCCESS: 5, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 100 } },
    ]},
    statistics: { confidence: 0.9, successRate: 1.0, averageLatencyMs: 300, evidence: { executionCount: 5, successfulExecutions: 5, failedExecutions: 0, uniqueSessions: 3 } },
    lineage: { derivedFromCandidateSetId: 'cs', approvalId: 'ap', approvalPolicyId: 'pol', graphRevision: 1, corpusRevision: 1, discoveredAt: '2026-01-01T00:00:00.000Z' },
  }
  const candidate: WorkflowPlanCandidate = {
    candidateId: 'c1', origin: 'DISCOVERED',
    workflowReference: { kind: 'DISCOVERED', workflowId: 'wf-1', descriptor },
    scores: { planningConfidence: 0.9, evidenceConfidence: 0.9, provenanceWeight: 1.0, finalScore: 0.81 },
  }
  return {
    kind: 'WorkflowPlan', schemaVersion: '1.0', planId: 'p1', planRevision: 1, status: 'EXECUTABLE',
    producedAt: '2026-01-01T00:00:00.000Z', graphRevision: 1, workflowRevision: 1, plannerVersion: '0.1.0',
    intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'read and write', concepts: ['read', 'write'], preferredSkills: [], constraints: {}, translatedBy: 'StaticIntentTranslator', translationConfidence: 1.0, unresolvedTerms: [] },
    translationResult: { intent: { intentId: 'i1', schemaVersion: '1.0', rawInput: 'read and write', concepts: ['read', 'write'], preferredSkills: [], constraints: {}, translatedBy: 'StaticIntentTranslator', translationConfidence: 1.0, unresolvedTerms: [] }, confidence: 1.0, translatorId: 'StaticIntentTranslator', unresolvedTerms: [], warnings: [], status: 'SUCCESS' },
    selectedCandidate: candidate,
    alternatives: [],
    steps: [
      { position: 0, skillId: 'skill-read', expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: 0 },
      { position: 1, skillId: 'skill-write', expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: 1 },
    ],
    planningDecision: { decisionId: 'd1', selectedCandidateId: 'c1', rejectedCandidates: [], policyId: 'default-v1', plannerVersion: '0.1.0', timestamp: '2026-01-01T00:00:00.000Z' },
    simulation: { status: 'EXECUTABLE', warnings: [], errors: [], cost: { estimatedLatencyMs: 300, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: 2, hasCycle: false, coverage: { matchedCapabilities: ['skill-read', 'skill-write'], missingCapabilities: [], optionalCapabilities: [], coverageScore: 1.0 }, simulatedWith: { capabilityRegistryRevision: 1, plannerVersion: '0.1.0' } },
  }
}

describe('PlanExplainer', () => {
  const explainer = new PlanExplainer()

  it('returns a non-empty string', () => {
    const text = explainer.explain(makePlan())
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })

  it('includes skill names in explanation', () => {
    const text = explainer.explain(makePlan())
    expect(text).toContain('skill-read')
    expect(text).toContain('skill-write')
  })

  it('includes origin in explanation', () => {
    const text = explainer.explain(makePlan())
    expect(text.toUpperCase()).toContain('DISCOVERED')
  })
})
