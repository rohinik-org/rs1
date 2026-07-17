import type { TierId } from '../interfaces/tier.js'
import type { ExecutionModel } from '../interfaces/skill.js'

export type RuntimeMode = 'STRICT' | 'FAST' | 'BALANCED' | 'QUALITY' | 'CUSTOM'

export interface ScoringWeights {
  readonly confidence: number
  readonly cost: number
  readonly latency: number
  readonly reliability: number
}

export interface RuntimeModePolicy {
  readonly allowedTiers: readonly TierId[]
  readonly allowedExecutionModels: readonly ExecutionModel[]
  readonly scoringWeights: ScoringWeights
  readonly skipHealthChecks: boolean
  readonly aggressiveCache: boolean
  readonly maxReasoningAttempts: number
}

const ALL_TIERS: readonly TierId[] = ['MEMORY', 'DETERMINISTIC', 'LOCAL_TOOL', 'EXTERNAL', 'REASONING']
const ALL_MODELS: readonly ExecutionModel[] = ['DETERMINISTIC', 'HEURISTIC', 'REASONING']
const NON_REASONING_TIERS: readonly TierId[] = ['MEMORY', 'DETERMINISTIC', 'LOCAL_TOOL', 'EXTERNAL']
const NON_REASONING_MODELS: readonly ExecutionModel[] = ['DETERMINISTIC', 'HEURISTIC']

const DEFAULT_WEIGHTS: ScoringWeights = { confidence: 0.60, cost: 0.20, latency: 0.10, reliability: 0.10 }

export const RUNTIME_MODE_POLICIES: Record<RuntimeMode, RuntimeModePolicy> = {
  STRICT: {
    allowedTiers: NON_REASONING_TIERS,
    allowedExecutionModels: NON_REASONING_MODELS,
    scoringWeights: DEFAULT_WEIGHTS,
    skipHealthChecks: false,
    aggressiveCache: false,
    maxReasoningAttempts: 0,
  },
  FAST: {
    allowedTiers: ALL_TIERS,
    allowedExecutionModels: ALL_MODELS,
    scoringWeights: { confidence: 0.40, cost: 0.40, latency: 0.15, reliability: 0.05 },
    skipHealthChecks: true,
    aggressiveCache: true,
    maxReasoningAttempts: 1,
  },
  BALANCED: {
    allowedTiers: ALL_TIERS,
    allowedExecutionModels: ALL_MODELS,
    scoringWeights: DEFAULT_WEIGHTS,
    skipHealthChecks: false,
    aggressiveCache: false,
    maxReasoningAttempts: 1,
  },
  QUALITY: {
    allowedTiers: ALL_TIERS,
    allowedExecutionModels: ALL_MODELS,
    scoringWeights: { confidence: 0.70, cost: 0.05, latency: 0.05, reliability: 0.20 },
    skipHealthChecks: false,
    aggressiveCache: false,
    maxReasoningAttempts: 3,
  },
  CUSTOM: {
    allowedTiers: ALL_TIERS,
    allowedExecutionModels: ALL_MODELS,
    scoringWeights: DEFAULT_WEIGHTS,
    skipHealthChecks: false,
    aggressiveCache: false,
    maxReasoningAttempts: 1,
  },
}
