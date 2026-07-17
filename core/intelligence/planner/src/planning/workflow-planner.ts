import { createHash, randomUUID } from 'node:crypto'
import type {
  StructuredIntent, IntentTranslationResult, WorkflowPlanCandidate,
  WorkflowPlan, WorkflowPlanStep, PlanningDecision,
} from '@rohinik-org/compiler'
import type { PlanningPolicy } from '../ranking/planning-policy.js'

export class WorkflowPlanner {
  constructor(
    private readonly policy: PlanningPolicy,
    private readonly plannerVersion: string,
  ) {}

  plan(
    intent: StructuredIntent,
    translationResult: IntentTranslationResult,
    candidates: readonly WorkflowPlanCandidate[],
    graphRevision: number,
    workflowRevision: number,
  ): WorkflowPlan {
    if (candidates.length === 0) {
      return this.emptyPlan(intent, translationResult, graphRevision, workflowRevision)
    }

    const sorted = [...candidates].sort((a, b) => {
      const diff = b.scores.finalScore - a.scores.finalScore
      if (Math.abs(diff) < 0.001) {
        if (a.origin === 'DISCOVERED' && b.origin === 'SYNTHESIZED') return -1
        if (a.origin === 'SYNTHESIZED' && b.origin === 'DISCOVERED') return 1
      }
      return diff
    })

    const selected = sorted[0]!
    const rejected = sorted.slice(1)
    const steps: WorkflowPlanStep[] = this.buildSteps(selected)

    const planningDecision: PlanningDecision = {
      decisionId: randomUUID(),
      selectedCandidateId: selected.candidateId,
      rejectedCandidates: rejected.map(c => ({ candidateId: c.candidateId, reason: 'LOW_SCORE' as const })),
      policyId: this.policy.policyId,
      plannerVersion: this.plannerVersion,
      timestamp: new Date().toISOString(),
    }

    const planId = createHash('sha256')
      .update(JSON.stringify({
        intentId: intent.intentId,
        selectedWorkflowId: selected.workflowReference.workflowId,
        plannerVersion: this.plannerVersion,
        policyId: this.policy.policyId,
        graphRevision,
      }))
      .digest('hex')

    // ponytail: simulation placeholder; PlanSimulator fills this
    const placeholderSimulation = {
      status: 'VALID_STRUCTURE' as const,
      warnings: [],
      errors: [],
      cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 },
      estimatedSteps: steps.length,
      hasCycle: false,
      coverage: { matchedCapabilities: [], missingCapabilities: [], optionalCapabilities: [], coverageScore: 0 },
      simulatedWith: { capabilityRegistryRevision: 0, plannerVersion: this.plannerVersion },
    }

    return {
      kind: 'WorkflowPlan',
      schemaVersion: '1.0',
      planId,
      planRevision: 1,
      status: 'DRAFT',
      producedAt: new Date().toISOString(),
      graphRevision,
      workflowRevision,
      plannerVersion: this.plannerVersion,
      intent,
      translationResult,
      selectedCandidate: selected,
      alternatives: rejected,
      steps,
      planningDecision,
      simulation: placeholderSimulation,
    }
  }

  private buildSteps(candidate: WorkflowPlanCandidate): WorkflowPlanStep[] {
    const descriptor = candidate.workflowReference.descriptor
    if (descriptor) {
      return descriptor.definition.steps.map((s, i) => ({
        position: i,
        skillId: s.skillId,
        expectedInputType: 'unknown',
        expectedOutputType: 'unknown',
        sourceWorkflowPosition: s.position,
      }))
    }
    const synth = candidate.workflowReference.synthesisEvidence
    if (synth) {
      return synth.synthesizedSteps.map((s, i) => ({
        position: i,
        skillId: s.skillId,
        expectedInputType: 'unknown',
        expectedOutputType: 'unknown',
        sourceWorkflowPosition: i,
      }))
    }
    return []
  }

  private emptyPlan(
    intent: StructuredIntent,
    translationResult: IntentTranslationResult,
    graphRevision: number,
    workflowRevision: number,
  ): WorkflowPlan {
    const planId = createHash('sha256')
      .update(JSON.stringify({ intentId: intent.intentId, selectedWorkflowId: 'none', plannerVersion: this.plannerVersion, policyId: this.policy.policyId, graphRevision }))
      .digest('hex')
    const decision: PlanningDecision = {
      decisionId: randomUUID(),
      selectedCandidateId: '',
      rejectedCandidates: [],
      policyId: this.policy.policyId,
      plannerVersion: this.plannerVersion,
      timestamp: new Date().toISOString(),
    }
    const emptySim = {
      status: 'INVALID' as const,
      warnings: [],
      errors: ['No candidates available'],
      cost: { estimatedLatencyMs: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedMemoryMb: 0 },
      estimatedSteps: 0,
      hasCycle: false,
      coverage: { matchedCapabilities: [], missingCapabilities: intent.concepts as string[], optionalCapabilities: [], coverageScore: 0 },
      simulatedWith: { capabilityRegistryRevision: 0, plannerVersion: this.plannerVersion },
    }
    const emptyCandidate: WorkflowPlanCandidate = {
      candidateId: '',
      origin: 'SYNTHESIZED',
      workflowReference: { kind: 'SYNTHESIZED', workflowId: 'none' },
      scores: { planningConfidence: 0, evidenceConfidence: 0, provenanceWeight: 0, finalScore: 0 },
    }
    return {
      kind: 'WorkflowPlan', schemaVersion: '1.0', planId, planRevision: 1, status: 'DRAFT',
      producedAt: new Date().toISOString(), graphRevision, workflowRevision, plannerVersion: this.plannerVersion,
      intent, translationResult, selectedCandidate: emptyCandidate, alternatives: [], steps: [],
      planningDecision: decision, simulation: emptySim,
    }
  }
}
