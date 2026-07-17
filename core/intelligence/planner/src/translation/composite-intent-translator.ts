import type { IntentTranslationRequest, IntentTranslationResult, StructuredIntent } from '@rohinik-org/compiler'
import type { IntentTranslator } from './intent-translator.js'

export class CompositeIntentTranslator implements IntentTranslator {
  readonly translatorId = 'CompositeIntentTranslator'

  constructor(private readonly translators: readonly IntentTranslator[]) {}

  async translate(request: IntentTranslationRequest): Promise<IntentTranslationResult> {
    const chain: string[] = []
    for (const t of this.translators) {
      chain.push(t.translatorId)
      const result = await t.translate(request)
      if (result.status === 'SUCCESS') return result
    }
    return {
      intent: undefined as unknown as StructuredIntent,
      confidence: 0,
      translatorId: this.translatorId,
      unresolvedTerms: [request.input],
      warnings: [`No translator resolved: ${chain.join(' → ')}`],
      status: 'DECLINED',
    }
  }
}
