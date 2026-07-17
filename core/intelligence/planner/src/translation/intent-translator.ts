import type { IntentTranslationRequest, IntentTranslationResult } from '@rohinik-org/compiler'

export interface IntentTranslator {
  readonly translatorId: string
  translate(request: IntentTranslationRequest): Promise<IntentTranslationResult>
}
