import { describe, it, expect } from 'vitest'
import { PredictionManager, RulesPredictionContributor } from '../index.js'
import type { PredictionContributor, MutablePredictionContext } from '../index.js'
import { DEFAULT_PREDICTION_POLICY } from '@rohinik-org/prediction-ir'
import type { PredictionRequest } from '@rohinik-org/prediction-ir'
import type { WorkingContextIR } from '@rohinik-org/working-context'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'
import type { StructuredIntent } from '@rohinik-org/working-context'
import type { KnowledgeFragment } from '@rohinik-org/knowledge'
import type { InstalledCapability } from '@rohinik-org/capability-registry'

const EMPTY_PROVENANCE = { observationIds: [], fragmentIds: [], workflowIds: [] }
const TEST_SOURCE = (id: string) => ({ type: 'memory' as const, id })

function makeIntent(concepts: string[] = [], skills: string[] = []): StructuredIntent {
  return {
    intentId: 'test-intent',
    schemaVersion: '1.0',
    rawInput: concepts.join(' '),
    concepts,
    preferredSkills: skills,
    constraints: {},
    translatedBy: 'test',
    translationConfidence: 0.9,
    unresolvedTerms: [],
  }
}

function makeCap(id: string, tags: string[] = []): InstalledCapability {
  return {
    capabilityId: id,
    version: '1.0.0',
    manifest: { id, name: id, description: `${id} capability`, manifestVersion: 1, version: '1.0.0', inputs: [], outputs: [], tier: 'local', tags, driverRef: 'test' },
    installedAt: new Date(),
    source: TEST_SOURCE('test'),
    acquisitionId: 'test-acq',
    dependencies: [],
    state: 'REGISTERED',
  }
}

function makeFragment(label: string): KnowledgeFragment {
  return {
    schemaVersion: 1,
    fragmentId: `frag-${label}`,
    source: TEST_SOURCE(`test-${label}`),
    provenance: EMPTY_PROVENANCE,
    extractedAt: new Date(),
    nodes: [{
      id: `n-${label}`,
      primitive: 'Entity',
      kind: 'Tool',
      label,
      source: TEST_SOURCE(`test-${label}`),
      certainty: 1,
      evidence: [],
      provenance: EMPTY_PROVENANCE,
      attributes: {},
    }],
    edges: [],
    procedures: [],
  }
}

function makeContext(
  concepts: string[] = [],
  caps: InstalledCapability[] = [],
  fragments: KnowledgeFragment[] = [],
): WorkingContextIR {
  return Object.freeze({
    contextId: 'test-ctx',
    requestId: 'test-req',
    intent: makeIntent(concepts),
    memories: Object.freeze([]),
    knowledgeFragments: Object.freeze(fragments),
    installedCapabilities: Object.freeze(caps),
    tokenBudget: DEFAULT_CONTEXT_POLICY.budget,
    confidence: 0.8,
    assembledAt: new Date(),
    contributors: Object.freeze([]),
    policy: DEFAULT_CONTEXT_POLICY,
  })
}

// ─── RulesPredictionContributor ───────────────────────────────────────────────

describe('RulesPredictionContributor', () => {
  it('capabilityPrediction ranks matched cap first', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['docker'], [makeCap('docker', ['docker']), makeCap('python', ['python'])])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.capabilityPrediction?.ranked[0]?.capabilityId).toBe('docker')
  })

  it('capabilityPrediction confidence > 0 for matched cap', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['docker'], [makeCap('docker', ['docker'])])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.capabilityPrediction?.ranked[0]?.confidence).toBeGreaterThan(0)
  })

  it('failurePrediction high when no capabilities match terms', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['docker'], [makeCap('python', ['python'])])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.failurePrediction?.failureProbability).toBeGreaterThan(0.5)
  })

  it('failurePrediction low when capability matches', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['docker'], [makeCap('docker', ['docker'])])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.failurePrediction?.failureProbability).toBeLessThan(0.2)
  })

  it('budgetPrediction returns static estimate', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['test'])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.budgetPrediction?.estimatedTokens).toBeGreaterThan(0)
    expect(bundle.budgetPrediction?.estimatedLatencyMs).toBe(DEFAULT_PREDICTION_POLICY.maxLatencyMs)
  })

  it('deterministic fallback — always produces a full bundle', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const bundle = await mgr.predict(makeContext([]))
    expect(bundle.intentPrediction).toBeDefined()
    expect(bundle.capabilityPrediction).toBeDefined()
    expect(bundle.budgetPrediction).toBeDefined()
    expect(bundle.failurePrediction).toBeDefined()
    expect(bundle.memoryPrediction).toBeDefined()
    expect(bundle.workflowPrediction).toBeDefined()
  })

  it('memoryPrediction importanceScore high when ≥3 fragments', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const ctx = makeContext(['x'], [], ['a', 'b', 'c'].map(makeFragment))
    const bundle = await mgr.predict(ctx)
    expect(bundle.memoryPrediction?.importanceScore).toBeGreaterThan(0.7)
  })
})

// ─── PredictionBundle ─────────────────────────────────────────────────────────

describe('PredictionBundle', () => {
  it('is frozen (Law 37)', async () => {
    const mgr = new PredictionManager()
    const bundle = await mgr.predict(makeContext([]))
    expect(Object.isFrozen(bundle)).toBe(true)
  })

  it('is JSON-serializable (Law 40)', async () => {
    const mgr = new PredictionManager()
    mgr.withContributor(new RulesPredictionContributor())
    const bundle = await mgr.predict(makeContext(['docker']))
    const json = JSON.stringify(bundle)
    const parsed = JSON.parse(json)
    expect(parsed.predictionId).toBe(bundle.predictionId)
    expect(parsed.contributors).toBeDefined()
  })
})

// ─── PredictionManager ────────────────────────────────────────────────────────

describe('PredictionManager', () => {
  it('no contributors → empty bundle with empty contributors', async () => {
    const mgr = new PredictionManager()
    const bundle = await mgr.predict(makeContext([]))
    expect(bundle.contributors).toHaveLength(0)
    expect(bundle.intentPrediction).toBeUndefined()
  })

  it('contributors run in priority order', async () => {
    const order: number[] = []
    const mgr = new PredictionManager()
    const c1: PredictionContributor = { contributorId: 'c1', priority: 20, async contribute() { order.push(20) } }
    const c2: PredictionContributor = { contributorId: 'c2', priority: 5,  async contribute() { order.push(5) } }
    mgr.withContributor(c1).withContributor(c2)
    await mgr.predict(makeContext([]))
    expect(order).toEqual([5, 20])
  })

  it('withContributor plugin point — custom contributor sets prediction', async () => {
    const mgr = new PredictionManager()
    const custom: PredictionContributor = {
      contributorId: 'custom',
      priority: 5,
      async contribute(_req: PredictionRequest, ctx: MutablePredictionContext) {
        ctx.intentPrediction = Object.freeze({ predictedIntent: 'test-intent', confidence: 0.99, alternatives: Object.freeze([]) })
      },
    }
    mgr.withContributor(custom)
    const bundle = await mgr.predict(makeContext([]))
    expect(bundle.intentPrediction?.predictedIntent).toBe('test-intent')
    expect(bundle.contributors).toContain('custom')
  })

  it('accepts PredictionRequest directly', async () => {
    const mgr = new PredictionManager()
    const ctx = makeContext(['docker'])
    const req: PredictionRequest = { predictionId: 'r1', workingContext: ctx, policy: DEFAULT_PREDICTION_POLICY }
    const bundle = await mgr.predict(req)
    expect(bundle.workingContextId).toBe(ctx.contextId)
  })

  it('accepts (workingContext, policy?) overload', async () => {
    const mgr = new PredictionManager()
    const ctx = makeContext(['docker'])
    const bundle = await mgr.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(bundle.workingContextId).toBe(ctx.contextId)
  })

  it('predictionId is deterministic for same inputs', async () => {
    const mgr1 = new PredictionManager()
    const mgr2 = new PredictionManager()
    const ctx = makeContext(['docker'])
    const b1 = await mgr1.predict(ctx, DEFAULT_PREDICTION_POLICY)
    const b2 = await mgr2.predict(ctx, DEFAULT_PREDICTION_POLICY)
    expect(b1.predictionId).toBe(b2.predictionId)
  })
})
