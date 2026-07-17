import type { ProviderResult } from '@rohinik-org/compiler'
import type { Provider } from '../provider/providers.js'
import { ResponseValidator } from '../validation/response-validator.js'

export interface FallbackResult {
  readonly result: ProviderResult
  readonly usedProviderId: string
  readonly fallbackHistory: readonly string[]
}

export class FallbackEngine {
  private readonly validator = new ResponseValidator()

  async invoke(
    providers: readonly Provider[],
    request: { skillId: string; input: unknown },
  ): Promise<FallbackResult> {
    const attempted: string[] = []

    for (const provider of providers) {
      try {
        const result = await provider.invoke(request)
        const validation = this.validator.validate(result.output)
        if (validation.valid) {
          return { result, usedProviderId: provider.providerId, fallbackHistory: attempted }
        }
      } catch { /* fall through to next */ }
      attempted.push(provider.providerId)
    }

    throw new Error(`All providers failed: ${attempted.join(', ')}`)
  }
}
