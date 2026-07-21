import type { WorkingContextIR } from '@rohinik-org/working-context'

export type { WorkingContextIR }

export type PredictorKind = 'intent' | 'capability' | 'budget' | 'failure' | 'memory' | 'workflow'

export interface IntentPrediction {
  readonly predictedIntent: string
  readonly confidence: number
  readonly alternatives: ReadonlyArray<{ intent: string; confidence: number }>
}

export interface CapabilityPrediction {
  readonly ranked: ReadonlyArray<{ capabilityId: string; confidence: number }>
}

export interface BudgetPrediction {
  readonly estimatedLatencyMs: number
  readonly estimatedTokens: number
  readonly estimatedCostUsd: number
}

export interface FailurePrediction {
  readonly failureProbability: number
  readonly confidence: number
  readonly reasons: ReadonlyArray<string>
}

export interface MemoryPrediction {
  readonly importanceScore: number
  readonly confidence: number
}

export interface WorkflowPrediction {
  readonly likelyNextSteps: ReadonlyArray<{ skillId: string; confidence: number }>
}

export interface PredictionBundle {
  readonly predictionId: string
  readonly workingContextId: string
  readonly intentPrediction?: IntentPrediction
  readonly capabilityPrediction?: CapabilityPrediction
  readonly budgetPrediction?: BudgetPrediction
  readonly failurePrediction?: FailurePrediction
  readonly memoryPrediction?: MemoryPrediction
  readonly workflowPrediction?: WorkflowPrediction
  readonly producedAt: Date
  readonly contributors: ReadonlyArray<string>
}

export interface PredictionPolicyIR {
  readonly policyId: string
  readonly allowRemote: boolean
  readonly maxLatencyMs: number
  readonly minimumConfidence: number
}

export const DEFAULT_PREDICTION_POLICY: PredictionPolicyIR = Object.freeze({
  policyId: 'default',
  allowRemote: false,
  maxLatencyMs: 50,
  minimumConfidence: 0.5,
})

export interface PredictionRequest {
  readonly predictionId: string
  readonly workingContext: WorkingContextIR
  readonly policy: PredictionPolicyIR
}
