import type { WorkflowPlan, StructuredIntent } from '@rohinik-org/compiler'
import type { PlanningFacade } from './facade-types.js'
import {
  CompositeIntentTranslator, StaticIntentTranslator,
  WorkflowMatcher, CapabilityPlanner, WorkflowRanker, WorkflowPlanner, PlanSimulator,
  DEFAULT_PLANNING_POLICY, PLANNER_VERSION,
} from '@rohinik-org/planner'

const _nullRepo = { findAll: async () => [], findBySkill: async () => [], findById: async () => undefined }
const _nullGraph = { reachable: async () => [], shortestPath: async () => null, findNeighbors: async () => [], findAlternatives: async () => [] }
const _nullResolver = { registryRevision: 0, resolveSkill: () => true, resolve: () => [] }

export class DefaultPlanningFacade implements PlanningFacade {
  private readonly translator = new CompositeIntentTranslator([new StaticIntentTranslator([])])
  private readonly matcher = new WorkflowMatcher(_nullRepo)
  private readonly synthesizer = new CapabilityPlanner(_nullGraph)
  private readonly ranker = new WorkflowRanker(DEFAULT_PLANNING_POLICY)
  private readonly planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, PLANNER_VERSION)
  private readonly simulator = new PlanSimulator(_nullResolver, PLANNER_VERSION)

  async plan(goal: string): Promise<WorkflowPlan> {
    const translationResult = await this.translator.translate({ input: goal })
    if (translationResult.status === 'DECLINED' || !translationResult.intent) {
      return new NoopPlanningFacade().plan(goal)
    }
    const intent = translationResult.intent
    const [matchEvidence, synthesisEvidence] = await Promise.all([
      this.matcher.match(intent),
      this.synthesizer.synthesize(intent),
    ])
    const candidates = this.ranker.rank(matchEvidence, synthesisEvidence)
    const draft = this.planner.plan(intent, translationResult, candidates, 0, 0)
    return this.simulator.simulate(draft)
  }
}

export class NoopPlanningFacade implements PlanningFacade {
  async plan(_goal: string): Promise<WorkflowPlan> {
    const noopIntent: StructuredIntent = {
      intentId: '', schemaVersion: '1.0', rawInput: _goal, concepts: [],
      preferredSkills: [], constraints: {}, translatedBy: 'noop',
      translationConfidence: 0, unresolvedTerms: [],
    }
    return {
      kind: 'WorkflowPlan', schemaVersion: '1.0', planId: '', planRevision: 1, status: 'DRAFT',
      producedAt: new Date().toISOString(), graphRevision: 0, workflowRevision: 0,
      plannerVersion: '0.0.0',
      intent: noopIntent,
      translationResult: { status: 'DECLINED', translatorId: 'noop', confidence: 0, intent: noopIntent, unresolvedTerms: [], warnings: [] },
      selectedCandidate: { candidateId: '', origin: 'SYNTHESIZED', workflowReference: { kind: 'SYNTHESIZED', workflowId: 'none' }, scores: { planningConfidence: 0, evidenceConfidence: 0, provenanceWeight: 0, finalScore: 0 } },
      alternatives: [], steps: [],
      planningDecision: { decisionId: '', selectedCandidateId: '', rejectedCandidates: [], policyId: 'noop', plannerVersion: '0.0.0', timestamp: new Date().toISOString() },
      simulation: { status: 'INVALID', warnings: [], errors: ['planning not enabled'], cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 }, estimatedSteps: 0, hasCycle: false, coverage: { matchedCapabilities: [], missingCapabilities: [], optionalCapabilities: [], coverageScore: 0 }, simulatedWith: { capabilityRegistryRevision: 0, plannerVersion: '0.0.0' } },
    }
  }
}
