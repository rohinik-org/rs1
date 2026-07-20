import OpenAI from 'openai'
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

export interface OpenAIConfig {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly model?: string
  readonly maxTokens?: number
}

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_MAX_TOKENS = 4096
const INPUT_COST_PER_TOKEN = 0.0000025   // $2.50 / 1M tokens (gpt-4o input)
const OUTPUT_COST_PER_TOKEN = 0.00001    // $10 / 1M tokens

export class OpenAIProvider implements ReasoningProvider {
  private readonly client: OpenAI
  private readonly config: Required<Omit<OpenAIConfig, 'baseUrl'>> & Pick<OpenAIConfig, 'baseUrl'>

  readonly metadata: ProviderMetadata = {
    providerId: 'openai',
    name: 'OpenAI GPT',
    environments: ['NETWORK'],
    capabilities: ['REASONING_ENGINE'],
    version: '0.1.0',
  }

  readonly capabilities: ReadonlySet<string> = new Set([
    'reasoning', 'planning', 'vision', 'streaming', 'tool_calling',
    'structured_output', 'long_context', 'multimodal',
  ])

  constructor(config: OpenAIConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    this.client = new OpenAI({
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
    if (!this.config.apiKey) return { status: 'UNAVAILABLE', message: 'No API key' }
    return { status: 'HEALTHY' }
  }

  estimateCost(request: ReasoningRequest): ResourceCost {
    const inputTokens = Math.ceil(request.prompt.length / 4)
    const outputTokens = this.config.maxTokens
    return {
      estimated: {
        tokens: inputTokens + outputTokens,
        usd: inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN,
        cpuMs: 2000,
      },
    }
  }

  async reason(request: ReasoningRequest, ctx: ExecutionContext): Promise<ExecutionOutcome<string>> {
    const start = Date.now()
    try {
      const systemPrompt = request.context?.['systemPrompt'] as string | undefined
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          { role: 'user', content: request.prompt },
        ],
      })
      const text = completion.choices[0]?.message.content ?? ''
      const usage = completion.usage
      const inputTokens = usage?.prompt_tokens ?? 0
      const outputTokens = usage?.completion_tokens ?? 0
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS',
        result: text,
        skillId: 'openai',
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
        skillId: 'openai',
        stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'OPENAI_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false,
        retryable: true,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  async *stream(request: ReasoningRequest, _ctx: ExecutionContext): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: [{ role: 'user', content: request.prompt }],
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content
      if (delta) yield delta
    }
  }
}
