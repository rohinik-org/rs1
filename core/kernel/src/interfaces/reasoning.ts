import type { Provider } from './provider.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { ResourceCost } from '../domain/cost.js'
import type { ReasoningRequirements } from './skill.js'

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
