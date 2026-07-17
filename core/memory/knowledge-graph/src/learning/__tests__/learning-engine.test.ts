import { describe, it, expect } from 'vitest'
import { LearningEngine } from '../learning-engine.js'
import type { InferenceRule } from '../inference-rule.js'
import type { InferenceCandidate } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'

const stubCandidate: InferenceCandidate = {
  source: 'rohinik://graph/capability/skill-a',
  target: 'rohinik://graph/provider/anthropic',
  relationship: 'USES_PROVIDER',
  confidence: 0.85,
  inferenceRuleId: 'TestRule',
  evidence: { executions: 20, successes: 17, failures: 3, sources: 1 },
  stableEdgeId: 'edge://inferred/rohinik://graph/capability/skill-a/USES_PROVIDER/rohinik://graph/provider/anthropic',
}

const stubRule: InferenceRule = {
  ruleId: 'TestRule',
  infer: async () => [stubCandidate],
}

const emptyCorpus = { query: async () => [] } as unknown as CorpusQueryEngine

describe('LearningEngine', () => {
  it('produces InferenceSet with kind and schemaVersion', async () => {
    const engine = new LearningEngine([stubRule])
    const set = await engine.analyze(emptyCorpus)
    expect(set.kind).toBe('InferenceSet')
    expect(set.schemaVersion).toBe('1.0')
    expect(set.inferenceSetId).toBeTruthy()
    expect(set.producedAt).toBeTruthy()
  })

  it('collects candidates from all rules', async () => {
    const engine = new LearningEngine([stubRule, stubRule])
    const set = await engine.analyze(emptyCorpus)
    // Both rules return the same stableEdgeId; de-duplication keeps one
    expect(set.candidates.length).toBeGreaterThanOrEqual(1)
  })

  it('de-duplicates candidates by stableEdgeId (highest confidence wins)', async () => {
    const lowRule: InferenceRule = {
      ruleId: 'LowRule',
      infer: async () => [{ ...stubCandidate, confidence: 0.5, inferenceRuleId: 'LowRule' }],
    }
    const highRule: InferenceRule = {
      ruleId: 'HighRule',
      infer: async () => [{ ...stubCandidate, confidence: 0.9, inferenceRuleId: 'HighRule' }],
    }
    const engine = new LearningEngine([lowRule, highRule])
    const set = await engine.analyze(emptyCorpus)
    expect(set.candidates).toHaveLength(1)
    expect(set.candidates[0]!.confidence).toBe(0.9)
  })

  it('records corpus window in the InferenceSet', async () => {
    const engine = new LearningEngine([])
    const window = { start: '2026-01-01', end: '2026-07-01' }
    const set = await engine.analyze(emptyCorpus, window)
    expect(set.corpusWindow.start).toBe('2026-01-01')
    expect(set.corpusWindow.end).toBe('2026-07-01')
  })
})
