import { describe, it, expect } from 'vitest'
import { EvidenceCollector } from '../evidence/evidence-collector.js'
import { CapabilityFailureRule } from '../inference/inference-rules.js'
import { InferenceEngine } from '../inference/inference-engine.js'
import { HypothesisGenerator, HypothesisRanker } from '../hypothesis/hypothesis-generator.js'
import type { Hypothesis } from '@rohinik-org/compiler'

const collector = new EvidenceCollector()
const generator = new HypothesisGenerator()
const ranker = new HypothesisRanker()

describe('HypothesisGenerator', () => {
  it('generates one hypothesis per inference chain', () => {
    const set = collector.collect({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    const chains = new CapabilityFailureRule().apply(set)
    const hypotheses = generator.generate(chains)
    expect(hypotheses.length).toBe(1)
    expect(hypotheses[0]?.category).toBe('CAPABILITY_FAILURE')
  })

  it('hypothesis has non-empty hypothesisId and statement', () => {
    const set = collector.collect({ capabilities: [{ id: 'c1', successRate: 0.2 }] })
    const chains = new CapabilityFailureRule().apply(set)
    const h = generator.generate(chains)[0]!
    expect(h.hypothesisId).toBeTruthy()
    expect(h.statement.length).toBeGreaterThan(0)
  })

  it('confidence is between 0 and 1', () => {
    const set = collector.collect({ capabilities: [{ id: 'c2', successRate: 0.3 }] })
    const chains = new CapabilityFailureRule().apply(set)
    const h = generator.generate(chains)[0]!
    expect(h.confidence).toBeGreaterThan(0)
    expect(h.confidence).toBeLessThanOrEqual(1)
  })
})

describe('HypothesisRanker', () => {
  it('rank returns sorted descending by score', () => {
    const high: Hypothesis = { hypothesisId: 'h1', statement: 'high', category: 'PROVIDER_DEGRADATION', confidence: 0.9, supportingEvidence: [{ artifactType: 'OBSERVATION', artifactId: 'o1', confidence: 0.9 }, { artifactType: 'OBSERVATION', artifactId: 'o2', confidence: 0.9 }, { artifactType: 'OBSERVATION', artifactId: 'o3', confidence: 0.9 }], contradictingEvidence: [] }
    const low: Hypothesis = { hypothesisId: 'h2', statement: 'low', category: 'UNKNOWN', confidence: 0.2, supportingEvidence: [], contradictingEvidence: [] }
    const ranked = ranker.rank([low, high])
    expect(ranked[0]?.hypothesisId).toBe('h1')
  })

  it('contradiction penalty reduces score', () => {
    const noContra: Hypothesis = { hypothesisId: 'h1', statement: '', category: 'UNKNOWN', confidence: 0.8, supportingEvidence: [{ artifactType: 'OBSERVATION', artifactId: 'o1', confidence: 0.8 }], contradictingEvidence: [] }
    const withContra: Hypothesis = { hypothesisId: 'h2', statement: '', category: 'UNKNOWN', confidence: 0.8, supportingEvidence: [{ artifactType: 'OBSERVATION', artifactId: 'o1', confidence: 0.8 }], contradictingEvidence: [{ artifactType: 'OBSERVATION', artifactId: 'o2', confidence: 0.5 }] }
    expect(ranker.score(noContra)).toBeGreaterThan(ranker.score(withContra))
  })

  it('empty hypotheses returns empty array', () => {
    expect(ranker.rank([])).toEqual([])
  })

  it('full pipeline: engine → generator → ranker', () => {
    const set = collector.collect({ capabilities: [{ id: 'c1', successRate: 0.1 }, { id: 'c2', successRate: 0.2 }] })
    const chains = new InferenceEngine().run(set)
    const hypotheses = generator.generate(chains)
    const ranked = ranker.rank(hypotheses)
    expect(ranked.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranker.score(ranked[i]!)).toBeGreaterThanOrEqual(ranker.score(ranked[i + 1]!))
    }
  })
})
