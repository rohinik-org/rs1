import { describe, it, expect } from 'vitest'
import { WorkflowPlanner } from '../planning/workflow-planner.js'
import { PlanSimulator } from '../simulation/plan-simulator.js'
import { StaticCapabilityResolver } from '../simulation/static-capability-resolver.js'
import { DEFAULT_PLANNING_POLICY } from '../ranking/planning-policy.js'
import type { WorkflowPlanCandidate, WorkflowDescriptor } from '@rohinik-org/compiler'

function makeDescriptor(id: string, skills: string[]): WorkflowDescriptor {
  return {
    kind: 'WorkflowDescriptor', schemaVersion: '1.0', workflowId: id, version: 1, status: 'ACTIVE',
    definition: { name: id, steps: skills.map((skillId, i) => ({ skillId, position: i, statistics: { executionCount: 5, outcomeDistribution: { SUCCESS: 5, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 200 } })) },
    statistics: { confidence: 0.9, successRate: 1.0, averageLatencyMs: 600, evidence: { executionCount: 5, successfulExecutions: 5, failedExecutions: 0, uniqueSessions: 3 } },
    lineage: { derivedFromCandidateSetId: 'cs', approvalId: 'ap', approvalPolicyId: 'pol', graphRevision: 1, corpusRevision: 1, discoveredAt: '2026-01-01T00:00:00.000Z' },
  }
}

function makeCandidate(id: string, skills: string[], finalScore: number): WorkflowPlanCandidate {
  return {
    candidateId: id,
    origin: 'DISCOVERED',
    workflowReference: { kind: 'DISCOVERED', workflowId: id, descriptor: makeDescriptor(id, skills) },
    scores: { planningConfidence: finalScore, evidenceConfidence: 1.0, provenanceWeight: 1.0, finalScore },
  }
}

const INTENT = {
  intentId: 'test-intent', schemaVersion: '1.0' as const, rawInput: 'read and write',
  concepts: ['read', 'write'], preferredSkills: [],
  constraints: {}, translatedBy: 'StaticIntentTranslator', translationConfidence: 1.0, unresolvedTerms: [],
}
const TRANSLATION_RESULT = {
  intent: INTENT, confidence: 1.0, translatorId: 'StaticIntentTranslator',
  unresolvedTerms: [], warnings: [], status: 'SUCCESS' as const,
}

describe('WorkflowPlanner', () => {
  it('selects highest-scored candidate and builds WorkflowPlan', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [
      makeCandidate('wf-low', ['skill-a'], 0.5),
      makeCandidate('wf-high', ['skill-read', 'skill-write'], 0.9),
    ]
    const plan = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    expect(plan.selectedCandidate.candidateId).toBe('wf-high')
    expect(plan.status).toBe('DRAFT')
    expect(plan.steps.length).toBe(2)
    expect(plan.planningDecision.rejectedCandidates.length).toBe(1)
  })

  it('plan steps have sourceWorkflowPosition backlinks', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-1', ['skill-a', 'skill-b'], 0.9)]
    const plan = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    expect(plan.steps[0]!.sourceWorkflowPosition).toBe(0)
    expect(plan.steps[1]!.sourceWorkflowPosition).toBe(1)
  })

  it('planId is deterministic — same inputs → same planId', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-1', ['skill-a'], 0.9)]
    const plan1 = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    const plan2 = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    expect(plan1.planId).toBe(plan2.planId)
  })
})

describe('PlanSimulator', () => {
  it('returns EXECUTABLE when all skills resolve', () => {
    const resolver = new StaticCapabilityResolver(new Set(['skill-read', 'skill-write']), 1)
    const simulator = new PlanSimulator(resolver, '0.1.0')
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-1', ['skill-read', 'skill-write'], 0.9)]
    const draft = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    const final = simulator.simulate(draft)
    expect(final.simulation.status).toBe('EXECUTABLE')
    expect(final.status).toBe('EXECUTABLE')
  })

  it('returns PARTIALLY_EXECUTABLE when a skill does not resolve', () => {
    const resolver = new StaticCapabilityResolver(new Set(['skill-read']), 1)
    const simulator = new PlanSimulator(resolver, '0.1.0')
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-1', ['skill-read', 'skill-missing'], 0.9)]
    const draft = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    const final = simulator.simulate(draft)
    expect(final.simulation.status).toBe('PARTIALLY_EXECUTABLE')
    expect(final.status).toBe('DRAFT')
  })

  it('returns INVALID with hasCycle=true for cyclic plan', () => {
    const resolver = new StaticCapabilityResolver(new Set(['skill-read', 'skill-transform']), 1)
    const simulator = new PlanSimulator(resolver, '0.1.0')
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-1', ['skill-read', 'skill-transform', 'skill-read'], 0.9)]
    const draft = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    const final = simulator.simulate(draft)
    expect(final.simulation.hasCycle).toBe(true)
    expect(final.simulation.status).toBe('INVALID')
  })
})
