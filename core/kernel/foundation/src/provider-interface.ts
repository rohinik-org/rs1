// Provider interface types for @rohinik-org/foundation — natively defined (not imported from kernel)

import type { ExecutionContext } from './skill-context.js'
import type { ExecutionOutcome } from './skill-result.js'
import type { ResourceCost } from './skill-resource.js'
import type { ReasoningRequirements } from './skill-interface.js'

export type ExecutionEnvironment = 'SHELL' | 'FILESYSTEM' | 'NETWORK' | 'GPU' | 'BROWSER' | 'MEMORY_STORE'

export type ProviderCapabilityType =
  | 'PYTHON_RUNTIME'
  | 'CONTAINER_RUNTIME'
  | 'REASONING_ENGINE'
  | 'BROWSER_ENGINE'
  | 'STORAGE_ENGINE'
  | 'SHELL_RUNTIME'

export interface ProviderMetadata {
  readonly providerId: string
  readonly name: string
  readonly environments: readonly ExecutionEnvironment[]
  readonly capabilities: readonly ProviderCapabilityType[]
  readonly version: string
}

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'

export interface ProviderHealth {
  readonly status: ProviderHealthStatus
  readonly latencyMs?: number
  readonly message?: string
}

export interface Provider {
  readonly metadata: ProviderMetadata
  isAvailable(): Promise<boolean>
  health(): Promise<ProviderHealth>
}

export const REASONING_CAPABILITY = {
  REASONING: 'reasoning',
  PLANNING: 'planning',
  VISION: 'vision',
  STREAMING: 'streaming',
  TOOL_CALLING: 'tool_calling',
  MULTIMODAL: 'multimodal',
  STRUCTURED_OUTPUT: 'structured_output',
  LONG_CONTEXT: 'long_context',
} as const

export type ReasoningCapabilityKey = typeof REASONING_CAPABILITY[keyof typeof REASONING_CAPABILITY]

export interface ReasoningRequest {
  readonly prompt: string
  readonly requiredCapabilities: ReasoningRequirements
  readonly context: Readonly<Record<string, unknown>>
}

export interface ReasoningProvider extends Provider {
  readonly capabilities: ReadonlySet<string>
  hasCapability(key: ReasoningCapabilityKey | string): boolean
  reason(request: ReasoningRequest, ctx: ExecutionContext): Promise<ExecutionOutcome<string>>
  stream(request: ReasoningRequest, ctx: ExecutionContext): AsyncIterable<string>
  estimateCost(request: ReasoningRequest): ResourceCost
}
