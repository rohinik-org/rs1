import Anthropic from '@anthropic-ai/sdk'
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages.js'
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

export interface AnthropicConfig {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly model?: string
  readonly maxTokens?: number
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 4096
const INPUT_COST_PER_TOKEN = 0.000003   // $3 / 1M tokens (claude-sonnet-4-6 input)
const OUTPUT_COST_PER_TOKEN = 0.000015  // $15 / 1M tokens

export class AnthropicProvider implements ReasoningProvider {
  private readonly client: Anthropic
  private readonly config: Required<Omit<AnthropicConfig, 'baseUrl'>> & Pick<AnthropicConfig, 'baseUrl'>

  readonly metadata: ProviderMetadata = {
    providerId: 'anthropic',
    name: 'Anthropic Claude',
    environments: ['NETWORK'],
    capabilities: ['REASONING_ENGINE'],
    version: '0.1.0',
  }

  readonly capabilities: ReadonlySet<string> = new Set([
    'reasoning', 'planning', 'vision', 'streaming', 'tool_calling',
    'structured_output', 'long_context', 'multimodal',
  ])

  constructor(config: AnthropicConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
    })
  }

  hasCapability(key: ReasoningCapabilityKey | string): boolean {
    return this.capabilities.has(key)
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.config.apiKey)
  }

  async health(): Promise<ProviderHealth> {
    if (!this.config.apiKey) return { status: 'UNAVAILABLE', message: 'No API key configured' }
    return { status: 'HEALTHY' }
  }

  estimateCost(request: ReasoningRequest): ResourceCost {
    const inputTokens = Math.ceil(request.prompt.length / 4)
    const outputTokens = this.config.maxTokens
    const totalTokens = inputTokens + outputTokens
    return {
      estimated: {
        tokens: totalTokens,
        usd: inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN,
        cpuMs: 2000,
      },
    }
  }

  async reason(request: ReasoningRequest, ctx: ExecutionContext): Promise<ExecutionOutcome<string>> {
    const start = Date.now()
    try {
      const message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [{ role: 'user', content: request.prompt }],
      })
      const text = message.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
      const inputTokens = message.usage.input_tokens
      const outputTokens = message.usage.output_tokens
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS',
        result: text,
        skillId: 'anthropic',
        stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [],
        metrics: {
          durationMs,
          resourceCost: {
            estimated: {
              tokens: inputTokens + outputTokens,
              usd: inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN,
              cpuMs: durationMs,
            },
          },
          cacheHit: false,
        },
        cacheable: false,
        retryable: true,
      }
    } catch (error) {
      const durationMs = Date.now() - start
      return {
        status: 'FAILURE',
        result: undefined,
        skillId: 'anthropic',
        stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'ANTHROPIC_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false,
        retryable: true,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  async *stream(request: ReasoningRequest, _ctx: ExecutionContext): AsyncIterable<string> {
    const stream = await this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [{ role: 'user', content: request.prompt }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text
      }
    }
  }
}
