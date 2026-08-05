// ponytail: local structural aliases break the kernel→foundation→daemon→planner→planner-ir→kernel cycle
type RuntimeMode = 'STRICT' | 'FAST' | 'BALANCED' | 'QUALITY' | 'CUSTOM'
export type ExecutionBudget = { readonly maxTokens?: number; readonly maxCostUsd?: number; readonly maxLatencyMs?: number; readonly maxRetries: number; readonly allowReasoning: boolean; readonly allowNetwork: boolean; readonly allowDisk: boolean; readonly mode: RuntimeMode }
type ExecutionStep = { readonly skillId: string; readonly tierId: string; readonly [k: string]: unknown }
export type ExecutionPlan = { readonly planId: string; readonly requestId: string; readonly steps: readonly ExecutionStep[]; readonly budget: ExecutionBudget; readonly createdAt: Date }

import type { WorkingContextIR } from '@rohinik-org/working-context'
import type { PredictionBundle } from '@rohinik-org/prediction-ir'
import type { AcquisitionPolicyIR } from '@rohinik-org/capability-acquisition'

export type { WorkingContextIR, PredictionBundle, AcquisitionPolicyIR }

export interface Goal {
  readonly goalId: string
  readonly skillId: string
  readonly priority: number  // ascending: 0 = highest priority
  readonly source: 'intent' | 'knowledge'
}

export interface PlanningPolicyIR {
  readonly policyId: string
  readonly preferInstalledCapabilities: boolean
  readonly allowCapabilityAcquisition: boolean
  readonly preferDeterministic: boolean
  readonly preferLowerLatency: boolean
  readonly preferLowerCost: boolean
  readonly riskTolerance: number
  readonly maxAlternatives: number
  // Reserved for Stage 13 ML experiments — absent in 10C
  readonly experimentalWeights?: Readonly<Record<string, number>>
}

export const DEFAULT_PLANNING_POLICY: PlanningPolicyIR = Object.freeze({
  policyId: 'default',
  preferInstalledCapabilities: true,
  allowCapabilityAcquisition: false,
  preferDeterministic: true,
  preferLowerLatency: true,
  preferLowerCost: true,
  riskTolerance: 0.2,
  maxAlternatives: 3,
})

export interface PlanningRequest {
  readonly requestId: string
  readonly context: WorkingContextIR       // intent lives at context.intent
  readonly predictions: PredictionBundle
  readonly executionBudget: ExecutionBudget
  readonly acquisitionPolicy: AcquisitionPolicyIR
  readonly planningPolicy: PlanningPolicyIR
}

// Frozen const object — avoids TypeScript enum pitfalls, easily iterable
export const PlanningReason = Object.freeze({
  LOWER_COST:              'LOWER_COST',
  LOWER_LATENCY:           'LOWER_LATENCY',
  INSTALLED_CAPABILITY:    'INSTALLED_CAPABILITY',
  HIGHER_CONFIDENCE:       'HIGHER_CONFIDENCE',
  LOWER_FAILURE_RISK:      'LOWER_FAILURE_RISK',
  PREFERRED_POLICY:        'PREFERRED_POLICY',
  MULTI_OBJECTIVE_BALANCE: 'MULTI_OBJECTIVE_BALANCE',
  ONLY_CANDIDATE:          'ONLY_CANDIDATE',
  NO_CANDIDATES:           'NO_CANDIDATES',
} as const)
export type PlanningReason = typeof PlanningReason[keyof typeof PlanningReason]

export interface PlanningExplanation {
  readonly selectedReason: PlanningReason
  readonly selectedExplanation?: string
  readonly rejectedReasons: ReadonlyArray<{ candidateId: string; reason: PlanningReason; detail?: string }>
}

export interface PlanningMetrics {
  readonly planningDurationMs: number
  readonly candidateCount: number
  // Confidence that chosen plan is best available; Stage 10E learns this
  readonly decisionConfidence: number
  // winner.score - runnerUp.score; 0 when only one candidate
  readonly selectionMargin: number
  // Semver of planner logic — increments on heuristic/weight/ordering changes, NOT policy/package version
  readonly planningAlgorithmVersion: string
}

// Single canonical evaluated-candidate; 'selected: true' on exactly one entry
export interface EvaluatedPlan {
  readonly executionPlan: ExecutionPlan
  readonly score: number
  readonly selected: boolean
  readonly estimatedLatencyMs: number
  readonly estimatedCostUsd: number
  readonly predictedFailureProbability: number
  readonly rejectionReason?: PlanningReason
}

export interface PlanningDecision {
  // SHA256(requestId + context.contextId + predictions.predictionId + planningPolicy.policyId
  //        + planningAlgorithmVersion + installedCapabilitySnapshotHash)
  // producedAt intentionally excluded — same inputs at different times must yield same decisionId
  readonly decisionId: string
  readonly requestId: string
  readonly evaluations: ReadonlyArray<EvaluatedPlan>
  // Convenience: always equals evaluations.find(e => e.selected).{executionPlan,score}
  readonly selectedPlan: ExecutionPlan
  readonly selectedScore: number
  readonly explanation: PlanningExplanation
  readonly metrics: PlanningMetrics
  readonly producedAt: Date
  // Reserved: unused in 10C; later stages attach ML hints, audit annotations
  readonly annotations?: Readonly<Record<string, unknown>>
}
