export type { AiosManifest, ManifestType, ManifestCompatibility, ManifestCapabilityDep } from './manifest.js'

// Minimal interfaces for extension authors.
// Extensions depend ONLY on @rohinik-org/foundation — never on @rohinik-org/kernel.

import type { SdkCapabilityMetadata } from './metadata.js'

export interface SdkCapability {
  readonly metadata: SdkCapabilityMetadata
  readonly skills: readonly SdkSkill[]
}

export interface SdkSkill {
  readonly metadata: { readonly skillId: string; readonly name: string; readonly version: string }
}

export interface SdkProvider {
  readonly metadata: { readonly providerId: string; readonly name: string; readonly version: string }
  isAvailable(): Promise<boolean>
}

export interface SdkServices {
  readonly logger: { info(msg: string, data?: Record<string, unknown>): void; error(msg: string, data?: Record<string, unknown>): void }
}

export interface Runtime {
  registerCapability(capability: SdkCapability): void
  registerProvider(provider: SdkProvider): void
  readonly services: SdkServices
  readonly version: string
  onShutdown(fn: () => void | Promise<void>): void
}

export type ActivateFn = (runtime: Runtime) => void | Promise<void>
export type DeactivateFn = () => void | Promise<void>

export type {
  CapabilityCategory,
  CostTier,
  LatencyTier,
  SdkSkillMetadata,
  SdkCapabilityMetadata,
  CapabilityExecutionMetadata,
} from './metadata.js'

// Skill execution interfaces for capability packages
export type {
  ExecutionContext,
  Logger,
  MetricsCollector,
  ConfigService,
  CacheService,
  EventBus,
  RuntimeServices,
  CancellationToken,
  RuntimeMode,
  ScoringWeights,
  RuntimeModePolicy,
  ContentType,
  ExecutionBudget,
  RoutingRequest,
  DecisionTraceBuilder,
  DecisionTrace,
} from './skill-context.js'

export type {
  ExecutionModel,
  ScoreComponent,
  SkillScore,
  SkillEvaluation,
  SkillMetadata,
  ExecutionRequirements,
  ReasoningRequirements,
  Skill,
} from './skill-interface.js'

export type {
  ExecutionOutcome,
  ExecutionStatus,
  DiagnosticInfo,
  ExecutionMetrics,
} from './skill-result.js'

export type {
  ResourceCost,
  ResourceCostMeasure,
  ResolvedProviders,
  ProviderResolution,
} from './skill-resource.js'

export type {
  ExecutionEnvironment,
  ProviderCapabilityType,
  ProviderMetadata,
  ProviderHealthStatus,
  ProviderHealth,
  Provider,
  ReasoningCapabilityKey,
  ReasoningRequest,
  ReasoningProvider,
} from './provider-interface.js'

export { REASONING_CAPABILITY } from './provider-interface.js'

// Matcher abstraction — capability packages declare skill matching
// metadata as data (composition, not inheritance) using these types.
export type {
  Matcher,
  MatcherId,
  MatchResult,
  MatchExplanation,
  MatchExplanationCode,
  MatchContext,
  MatcherRoutingRequest,
  SkillMatchingMetadata,
} from './matching.js'

export type { Tokenizer, Token, KeywordTarget, ExactTarget } from './matchers.js'
export {
  EnglishTokenizer,
  DEFAULT_TOKENIZER,
  KeywordMatcher,
  ExactMatcher,
  ContentTypeMatcher,
  AllOfMatcher,
  AnyOfMatcher,
} from './matchers.js'

// RADK — Application Development Kit
export { RohinikApplication, ApplicationBuilder } from './application/rohinik-application.js'
export type { FullApplicationOptions } from './application/rohinik-application.js'
export type { PlanningFacade, ExecutionFacade, MemoryFacade, ReasoningFacade, ReflectionFacade, ObservationFacade, ClusterFacade, CertifyFacade } from './facades/facade-types.js'
export { ApplicationEventBus } from './events/application-event-bus.js'
export { Capability } from './plugins/capability-base.js'
export { buildManifest } from './manifest/application-manifest.js'
export { getDiagnostics, resolveEnabledFacades } from './diagnostics/application-diagnostics.js'
export { createTestApplication } from './testing/test-application.js'
