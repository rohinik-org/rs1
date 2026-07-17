import type { ProviderInvocation, ProviderResult } from '@rohinik-org/compiler'

export interface Provider {
  readonly providerId: string
  readonly available: boolean
  invoke(request: { skillId: string; input: unknown }): Promise<ProviderResult>
}

export class NullProvider implements Provider {
  readonly providerId = 'null'
  readonly available = true

  async invoke(request: { skillId: string; input: unknown }): Promise<ProviderResult> {
    return { output: `[null output of ${request.skillId}]`, providerUsed: 'null', latencyMs: 0 }
  }
}

export class EchoProvider implements Provider {
  readonly providerId = 'echo'
  readonly available = true

  async invoke(request: { skillId: string; input: unknown }): Promise<ProviderResult> {
    return {
      output: typeof request.input === 'string' ? request.input : JSON.stringify(request.input),
      providerUsed: 'echo',
      latencyMs: 0,
    }
  }
}
