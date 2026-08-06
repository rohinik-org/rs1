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

export interface MockProviderConfig {
  readonly delayMs?: number
  readonly shouldThrow?: boolean
  readonly throwMessage?: string
}

export class MockReasoningProvider implements ReasoningProvider {
  readonly metadata: ProviderMetadata = {
    providerId: 'mock-reasoning',
    name: 'Mock Reasoning Provider',
    environments: [],
    capabilities: ['REASONING_ENGINE'],
    version: '0.1.0',
  }

  readonly capabilities: ReadonlySet<string> = new Set([
    'reasoning', 'planning', 'streaming', 'tool_calling', 'structured_output',
  ])

  private _invocationCount = 0

  get invocationCount(): number {
    return this._invocationCount
  }

  constructor(private readonly config: MockProviderConfig = {}) {}

  hasCapability(key: ReasoningCapabilityKey | string): boolean {
    return this.capabilities.has(key)
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'HEALTHY', message: 'Mock provider always available' }
  }

  async reason(request: ReasoningRequest, ctx: ExecutionContext): Promise<ExecutionOutcome<string>> {
    this._invocationCount++

    if (this.config.delayMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.config.delayMs))
    }

    if (this.config.shouldThrow) {
      throw new Error(this.config.throwMessage ?? 'MockReasoningProvider configured to throw')
    }

    return {
      status: 'SUCCESS',
      result: `[mock] echo: ${request.prompt}`,
      skillId: 'mock-reasoning',
      stepId: ctx.currentStepId ?? 'step-0',
      diagnostics: [],
      metrics: { durationMs: this.config.delayMs ?? 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
      cacheable: false,
      retryable: false,
    }
  }

  async *stream(request: ReasoningRequest, _ctx: ExecutionContext): AsyncIterable<string> {
    if (this.config.shouldThrow) {
      throw new Error(this.config.throwMessage ?? 'MockReasoningProvider configured to throw')
    }
    yield `[mock] echo: ${request.prompt}`
  }

  estimateCost(_request: ReasoningRequest): ResourceCost {
    return { estimated: { cpuMs: 0 } }
  }
}
