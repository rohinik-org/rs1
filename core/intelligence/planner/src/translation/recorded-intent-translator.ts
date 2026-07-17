import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { IntentTranslationRequest, IntentTranslationResult, StructuredIntent } from '@rohinik-org/compiler'
import type { IntentTranslator } from './intent-translator.js'

interface IntentFixture {
  readonly intentId: string
  readonly schemaVersion: '1.0'
  readonly input: string
  readonly concepts: readonly string[]
  readonly preferredSkills: readonly string[]
}

export class RecordedIntentTranslator implements IntentTranslator {
  readonly translatorId = 'RecordedIntentTranslator'
  private fixtures: IntentFixture[] | null = null

  constructor(private readonly projectRoot: string) {}

  private async loadFixtures(): Promise<IntentFixture[]> {
    if (this.fixtures !== null) return this.fixtures
    const dir = join(this.projectRoot, '.aios', 'intents')
    try {
      const files = await readdir(dir)
      const loaded: IntentFixture[] = []
      for (const f of files.filter(f => f.endsWith('.json'))) {
        try {
          const raw = await readFile(join(dir, f), 'utf-8')
          loaded.push(JSON.parse(raw) as IntentFixture)
        } catch { /* skip malformed fixture */ }
      }
      this.fixtures = loaded
      return loaded
    } catch {
      this.fixtures = []
      return []
    }
  }

  async translate(request: IntentTranslationRequest): Promise<IntentTranslationResult> {
    const fixtures = await this.loadFixtures()
    const fixture = fixtures.find(f => f.input === request.input)
    if (!fixture) {
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
      concepts: fixture.concepts,
      preferredSkills: fixture.preferredSkills,
      constraints: request.constraints ?? {},
      translatedBy: this.translatorId,
      translationConfidence: 1.0,
      unresolvedTerms: [],
    }
    return { intent, confidence: 1.0, translatorId: this.translatorId, unresolvedTerms: [], warnings: [], status: 'SUCCESS' }
  }
}
