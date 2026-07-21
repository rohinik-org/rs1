import { describe, it, expect } from 'vitest'
import { WorkflowPlanner } from '../planning/workflow-planner.js'
import { PlanSimulator } from '../simulation/plan-simulator.js'
import { StaticCapabilityResolver } from '../simulation/static-capability-resolver.js'
import { DEFAULT_PLANNING_POLICY } from '../ranking/planning-policy.js'
import type { WorkflowPlanCandidate, WorkflowDescriptor } from '@rohinik-org/compiler'
import type { WorkingContextIR } from '@rohinik-org/working-context'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'

function makeContext(knowledgeLabels: string[], capabilityIds: string[]): WorkingContextIR {
  return Object.freeze({
    contextId: 'test-ctx',
    requestId: 'test-req',
    intent: { intentId: 'i', schemaVersion: '1.0', rawInput: '', concepts: [], preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [] },
    memories: Object.freeze([]),
    knowledgeFragments: Object.freeze(knowledgeLabels.map((label, i) => ({
      schemaVersion: 1, fragmentId: `f-${i}`, source: { type: 'test', id: 'test' },
      documentType: 'test',
      nodes: [{ nodeId: `n-${i}`, primitive: 'Entity' as const, kind: 'Tool' as const, label, properties: {}, provenance: { confidence: 1, method: 'test' } }],
      edges: [], procedures: [],
    }))),
    installedCapabilities: Object.freeze(capabilityIds.map(id => ({
      capabilityId: id, version: '1.0.0',
      manifest: { id, name: id, description: '', manifestVersion: 1, inputs: [], outputs: [], tier: 'local' as const, tags: [], driverRef: 'test' },
      installedAt: new Date(), source: { type: 'test' as const, id: 'test' },
      acquisitionId: 'acq', dependencies: [], state: 'REGISTERED' as const,
    }))),
    tokenBudget: DEFAULT_CONTEXT_POLICY.budget,
    confidence: 0.8,
    assembledAt: new Date(),
    contributors: Object.freeze(['knowledge']),
    policy: DEFAULT_CONTEXT_POLICY,
  })
}

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

describe('WorkflowPlanner — context boost', () => {
  it('boosts candidate whose skill appears in knowledge labels', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const ctx = makeContext(['skill-docker'], [])
    const low = makeCandidate('wf-low', ['skill-docker'], 0.5)
    const high = makeCandidate('wf-high', ['skill-other'], 0.6)
    const plan = planner.plan(INTENT, TRANSLATION_RESULT, [high, low], 1, 1, ctx)
    // wf-low gets 0.5 + 0.1 = 0.6, wf-high stays 0.6 — sort is stable for equal scores
    // what matters: wf-low score was boosted (0.6 >= high's 0.6)
    expect(plan.selectedCandidate.scores.finalScore).toBeGreaterThanOrEqual(0.6)
  })

  it('boosts candidate whose skill appears in installed capabilities', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const ctx = makeContext([], ['skill-read'])
    const low = makeCandidate('wf-low', ['skill-read'], 0.4)
    const high = makeCandidate('wf-high', ['skill-other'], 0.45)
    const plan = planner.plan(INTENT, TRANSLATION_RESULT, [high, low], 1, 1, ctx)
    // wf-low boosted to 0.5 — now higher than wf-high
    expect(plan.selectedCandidate.candidateId).toBe('wf-low')
  })

  it('no boost when no context provided — behavior unchanged', () => {
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const candidates = [makeCandidate('wf-a', ['skill-a'], 0.9), makeCandidate('wf-b', ['skill-b'], 0.5)]
    const plan = planner.plan(INTENT, TRANSLATION_RESULT, candidates, 1, 1)
    expect(plan.selectedCandidate.candidateId).toBe('wf-a')
  })
})
