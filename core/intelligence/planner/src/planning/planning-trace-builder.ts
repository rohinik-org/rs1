import type {
  IntentTranslationRequest, IntentTranslationResult,
  WorkflowMatchEvidence, CapabilityPlanEvidence,
  WorkflowPlanCandidate, SimulationResult, PlanningDecision,
  PlanningTrace, PlanningPolicySnapshot,
} from '@rohinik-org/compiler'
import type { PlanningPolicy } from '../ranking/planning-policy.js'

export class PlanningTraceBuilder {
  build(params: {
    traceId: string
    plannerVersion: string
    request: IntentTranslationRequest
    translationResult: IntentTranslationResult
    translatorChain: readonly string[]
    matchEvidence: readonly WorkflowMatchEvidence[]
    synthesisEvidence: readonly CapabilityPlanEvidence[]
    allCandidates: readonly WorkflowPlanCandidate[]
    policy: PlanningPolicy
    tieBreaksApplied: number
    simulation: SimulationResult
    decision: PlanningDecision
  }): PlanningTrace {
    const policySnapshot: PlanningPolicySnapshot = {
      policyId: params.policy.policyId,
      planningWeight: params.policy.planningWeight,
      evidenceWeight: params.policy.evidenceWeight,
      provenanceWeight: params.policy.provenanceWeight,
      tieBreakRule: params.policy.tieBreakRule,
      optimizationGoal: params.policy.optimizationGoal,
    }
    return {
      kind: 'PlanningTrace',
      schemaVersion: '1.0',
      traceId: params.traceId,
      producedAt: new Date().toISOString(),
      plannerVersion: params.plannerVersion,
      translation: {
        request: params.request,
        result: params.translationResult,
        translatorChain: params.translatorChain,
      },
      matching: {
        workflowsExamined: params.matchEvidence.length,
        matches: params.matchEvidence,
      },
      synthesis: {
        graphPathsExplored: params.synthesisEvidence.reduce((s, e) => s + e.graphPaths.length, 0),
        evidence: params.synthesisEvidence,
      },
      ranking: {
        allCandidates: params.allCandidates,
        policyApplied: policySnapshot,
        tieBreaksApplied: params.tieBreaksApplied,
      },
      simulation: params.simulation,
      decision: params.decision,
    }
  }
}
