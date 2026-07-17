import type {
  ReasoningProvider,
  ProviderMetadata,
  ProviderHealth,
  ReasoningRequest,
  ExecutionContext,
  ExecutionOutcome,
  ResourceCost,
  ReasoningCapabilityKey,
} from '@rohinik-org/foundation'

const NULL_MESSAGE = 'Reasoning is disabled in this environment.'

export class NullReasoningProvider implements ReasoningProvider {
  readonly metadata: ProviderMetadata = {
    providerId: 'null-reasoning',
    name: 'Null Reasoning Provider',
    environments: [],
    capabilities: ['REASONING_ENGINE'],
    version: '0.1.0',
  }

  readonly capabilities: ReadonlySet<string> = new Set([
    'reasoning', 'planning', 'streaming', 'tool_calling', 'structured_output',
  ])

  hasCapability(key: ReasoningCapabilityKey | string): boolean {
    return this.capabilities.has(key)
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'HEALTHY', message: 'Null provider always available' }
  }

  async reason(_request: ReasoningRequest, ctx: ExecutionContext): Promise<ExecutionOutcome<string>> {
    return {
      status: 'SUCCESS',
      result: NULL_MESSAGE,
      skillId: 'null-reasoning',
      stepId: ctx.currentStepId ?? 'step-0',
      diagnostics: [],
      metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
      cacheable: false,
      retryable: false,
    }
  }

  async *stream(_request: ReasoningRequest, _ctx: ExecutionContext): AsyncIterable<string> {
    yield NULL_MESSAGE
  }

  estimateCost(_request: ReasoningRequest): ResourceCost {
    return { estimated: { cpuMs: 0 } }
  }
}
