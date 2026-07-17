import { createHash } from 'node:crypto'
import type { IntentTranslationRequest, IntentTranslationResult, StructuredIntent } from '@rohinik-org/compiler'
import type { IntentTranslator } from './intent-translator.js'

interface StaticEntry {
  readonly input: string
  readonly concepts: readonly string[]
  readonly preferredSkills: readonly string[]
}

export class StaticIntentTranslator implements IntentTranslator {
  readonly translatorId = 'StaticIntentTranslator'

  constructor(private readonly entries: readonly StaticEntry[]) {}

  async translate(request: IntentTranslationRequest): Promise<IntentTranslationResult> {
    const entry = this.entries.find(e => e.input === request.input)
    if (!entry) {
      return {
        intent: undefined as unknown as StructuredIntent,
        confidence: 0,
        translatorId: this.translatorId,
        unresolvedTerms: [],
        warnings: [],
        status: 'DECLINED',
      }
    }
    const intentId = createHash('sha256')
      .update(JSON.stringify({ input: request.input, translatorId: this.translatorId }))
      .digest('hex')
    const intent: StructuredIntent = {
      intentId,
      schemaVersion: '1.0',
      rawInput: request.input,
      concepts: entry.concepts,
      preferredSkills: entry.preferredSkills,
      constraints: request.constraints ?? {},
      translatedBy: this.translatorId,
      translationConfidence: 1.0,
      unresolvedTerms: [],
    }
    return { intent, confidence: 1.0, translatorId: this.translatorId, unresolvedTerms: [], warnings: [], status: 'SUCCESS' }
  }
}
