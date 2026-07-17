import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StaticIntentTranslator } from '../translation/static-intent-translator.js'
import { CompositeIntentTranslator } from '../translation/composite-intent-translator.js'
import { WorkflowMatcher } from '../matching/workflow-matcher.js'
import { CapabilityPlanner } from '../synthesis/capability-planner.js'
import { WorkflowRanker } from '../ranking/workflow-ranker.js'
import { WorkflowPlanner } from '../planning/workflow-planner.js'
import { PlanSimulator } from '../simulation/plan-simulator.js'
import { StaticCapabilityResolver } from '../simulation/static-capability-resolver.js'
import { JsonPlanStore } from '../store/json-plan-store.js'
import { DEFAULT_PLANNING_POLICY } from '../ranking/planning-policy.js'
import type { WorkflowRepository } from '../matching/workflow-repository.js'
import type { CapabilityGraphQuery } from '../synthesis/capability-graph-query.js'
import type { WorkflowDescriptor } from '@rohinik-org/compiler'

function makeDescriptor(id: string, skills: string[]): WorkflowDescriptor {
  return {
    kind: 'WorkflowDescriptor', schemaVersion: '1.0', workflowId: id, version: 1, status: 'ACTIVE',
    definition: { name: id, steps: skills.map((skillId, i) => ({ skillId, position: i, statistics: { executionCount: 10, outcomeDistribution: { SUCCESS: 10, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 100 } })) },
    statistics: { confidence: 0.9, successRate: 1.0, averageLatencyMs: 300, evidence: { executionCount: 10, successfulExecutions: 10, failedExecutions: 0, uniqueSessions: 5 } },
    lineage: { derivedFromCandidateSetId: 'cs', approvalId: 'ap', approvalPolicyId: 'pol', graphRevision: 1, corpusRevision: 1, discoveredAt: '2026-01-01T00:00:00.000Z' },
  }
}

let tmpDir = ''
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
})

describe('Full planning pipeline', () => {
  it('produces EXECUTABLE plan from known workflow', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'aios-planner-integration-'))

    const descriptors = [makeDescriptor('wf-read-transform', ['skill-read', 'skill-transform'])]
    const repo: WorkflowRepository = {
      findAll: async () => descriptors,
      findBySkill: async (s) => descriptors.filter(d => d.definition.steps.some(st => st.skillId === s)),
      findById: async (id) => descriptors.find(d => d.workflowId === id),
    }
    const graph: CapabilityGraphQuery = {
      reachable: async () => [],
      shortestPath: async () => null,
      findNeighbors: async () => [],
      findAlternatives: async () => [],
    }

    const translator = new CompositeIntentTranslator([
      new StaticIntentTranslator([
        { input: 'read and transform data', concepts: ['read', 'transform'], preferredSkills: [] },
      ]),
    ])
    const matcher = new WorkflowMatcher(repo)
    const synth = new CapabilityPlanner(graph)
    const ranker = new WorkflowRanker(DEFAULT_PLANNING_POLICY)
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
    const resolver = new StaticCapabilityResolver(new Set(['skill-read', 'skill-transform']), 1)
    const simulator = new PlanSimulator(resolver, '0.1.0')
    const store = new JsonPlanStore(tmpDir)

    const translationResult = await translator.translate({ input: 'read and transform data' })
    expect(translationResult.status).toBe('SUCCESS')

    const intent = translationResult.intent
    const [matchEvidence, synthesisEvidence] = await Promise.all([
      matcher.match(intent),
      synth.synthesize(intent),
    ])

    const candidates = ranker.rank(matchEvidence, synthesisEvidence)
    expect(candidates.length).toBeGreaterThan(0)

    const draft = planner.plan(intent, translationResult, candidates, 1, 1)
    expect(draft.status).toBe('DRAFT')
    expect(draft.steps.length).toBe(2)

    const final = simulator.simulate(draft)
    expect(final.status).toBe('EXECUTABLE')
    expect(final.simulation.status).toBe('EXECUTABLE')

    await store.savePlan(final)
    const loaded = await store.loadPlan(final.planId)
    expect(loaded?.planId).toBe(final.planId)
  })

  it('produces DRAFT plan with empty steps when no candidates found', async () => {
    const repo: WorkflowRepository = { findAll: async () => [], findBySkill: async () => [], findById: async () => undefined }
    const graph: CapabilityGraphQuery = { reachable: async () => [], shortestPath: async () => null, findNeighbors: async () => [], findAlternatives: async () => [] }

    const translator = new CompositeIntentTranslator([
      new StaticIntentTranslator([{ input: 'completely unknown task', concepts: ['unknown'], preferredSkills: [] }]),
    ])
    const translationResult = await translator.translate({ input: 'completely unknown task' })
    const intent = translationResult.intent

    const candidates = new WorkflowRanker(DEFAULT_PLANNING_POLICY).rank(
      await new WorkflowMatcher(repo).match(intent),
      await new CapabilityPlanner(graph).synthesize(intent),
    )

    const plan = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0').plan(intent, translationResult, candidates, 1, 1)
    expect(plan.steps.length).toBe(0)
    expect(plan.status).toBe('DRAFT')
  })
})
