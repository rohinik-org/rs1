import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp } from '@rohinik-org/ml-ir'
import {
  registerBaseline,
  BaselineRegistryService,
  type BaselineRecord,
  type BaselineKind,
  type ComparisonPolicy,
  type BaselineExceptionRequest,
  type BaselineExceptionDecision,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash

function makeEvidence(): { evidenceId: string; evidenceHash: ContentHash } {
  return { evidenceId: 'ev-1', evidenceHash: HASH }
}

function makeBaseline(overrides?: Partial<{
  baselineId: string
  kind: BaselineKind
  modelVersionId: string
  evidenceRef: { evidenceId: string; evidenceHash: ContentHash }
  registeredAt: IsoTimestamp
  registeredBy: string
}>): Parameters<typeof registerBaseline>[0] {
  return {
    baselineId: 'bl-1',
    kind: 'current-production' as BaselineKind,
    modelVersionId: 'mv-1',
    evidenceRef: makeEvidence(),
    registeredAt: NOW,
    registeredBy: 'principal-1',
    ...overrides,
  }
}

// ── valid baseline registration ───────────────────────────────────────────────

describe('registerBaseline: valid', () => {
  it('returns BaselineRecord with deterministic hash', () => {
    const store = new Map<string, BaselineRecord>()
    const bl = registerBaseline(makeBaseline(), store)
    expect(bl.baselineId).toBe('bl-1')
    expect(bl.kind).toBe('current-production')
    expect(bl.modelVersionId).toBe('mv-1')
    expect(bl.baselineHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('same input produces same hash (deterministic)', () => {
    const store = new Map<string, BaselineRecord>()
    const bl1 = registerBaseline(makeBaseline(), store)
    const store2 = new Map<string, BaselineRecord>()
    const bl2 = registerBaseline(makeBaseline(), store2)
    expect(bl1.baselineHash).toBe(bl2.baselineHash)
  })

  it('different modelVersionId produces different hash', () => {
    const store1 = new Map<string, BaselineRecord>()
    const store2 = new Map<string, BaselineRecord>()
    const bl1 = registerBaseline(makeBaseline({ modelVersionId: 'mv-1' }), store1)
    const bl2 = registerBaseline(makeBaseline({ modelVersionId: 'mv-2' }), store2)
    expect(bl1.baselineHash).not.toBe(bl2.baselineHash)
  })

  it('all four baseline kinds are accepted', () => {
    const kinds: BaselineKind[] = ['current-production', 'approved-reference', 'previous-version', 'deterministic-reference']
    for (const kind of kinds) {
      const store = new Map<string, BaselineRecord>()
      const bl = registerBaseline(makeBaseline({ kind, baselineId: `bl-${kind}` }), store)
      expect(bl.kind).toBe(kind)
    }
  })
})

// ── missing evidence ──────────────────────────────────────────────────────────

describe('registerBaseline: missing evidence', () => {
  it('throws EVALUATION_MISSING_BASELINE when evidenceHash is empty', () => {
    expect(() => {
      const store = new Map<string, BaselineRecord>()
      registerBaseline(makeBaseline({ evidenceRef: { evidenceId: 'ev-1', evidenceHash: '' as ContentHash } }), store)
    }).toThrow('EVALUATION_MISSING_BASELINE')
  })

  it('throws EVALUATION_MISSING_BASELINE when evidenceId is empty', () => {
    expect(() => {
      const store = new Map<string, BaselineRecord>()
      registerBaseline(makeBaseline({ evidenceRef: { evidenceId: '', evidenceHash: HASH } }), store)
    }).toThrow('EVALUATION_MISSING_BASELINE')
  })
})

// ── self-baseline rejection ───────────────────────────────────────────────────

describe('registerBaseline: self-baseline rejection', () => {
  it('throws EVALUATION_SELF_BASELINE_REJECTED when modelVersionId matches candidateVersionId', () => {
    expect(() => {
      const store = new Map<string, BaselineRecord>()
      registerBaseline(makeBaseline({ modelVersionId: 'candidate-mv-1' }), store, 'candidate-mv-1')
    }).toThrow('EVALUATION_SELF_BASELINE_REJECTED')
  })
})

// ── replay / conflict ─────────────────────────────────────────────────────────

describe('registerBaseline: replay/conflict', () => {
  it('same input twice is idempotent', () => {
    const store = new Map<string, BaselineRecord>()
    const bl1 = registerBaseline(makeBaseline(), store)
    const bl2 = registerBaseline(makeBaseline(), store)
    expect(bl1.baselineHash).toBe(bl2.baselineHash)
    expect(store.size).toBe(1)
  })

  it('same id different modelVersionId throws EVALUATION_SELF_BASELINE_REJECTED or conflict', () => {
    const store = new Map<string, BaselineRecord>()
    registerBaseline(makeBaseline({ modelVersionId: 'mv-1' }), store)
    expect(() => registerBaseline(makeBaseline({ modelVersionId: 'mv-2' }), store)).toThrow()
  })
})

// ── comparison policy ─────────────────────────────────────────────────────────

describe('ComparisonPolicy validation', () => {
  it('valid policy accepted', () => {
    const policy: ComparisonPolicy = {
      policyId: 'pol-1',
      metricId: 'accuracy',
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.01,
      nonRegressionThreshold: 0.0,
    }
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    expect(() => registry.validatePolicy(policy)).not.toThrow()
  })

  it('negative minimumImprovementAbsolute with HIGHER_IS_BETTER throws', () => {
    const policy: ComparisonPolicy = {
      policyId: 'pol-1',
      metricId: 'accuracy',
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: -0.05,
      nonRegressionThreshold: 0.0,
    }
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    expect(() => registry.validatePolicy(policy)).toThrow()
  })
})

// ── exception approve / deny ──────────────────────────────────────────────────

describe('BaselineExceptionDecision', () => {
  it('approved exception allows promotion without baseline', () => {
    const req: BaselineExceptionRequest = {
      exceptionId: 'exc-1',
      reason: 'first deployment, no production baseline exists',
      requestedAt: NOW,
      requestedBy: 'principal-1',
    }
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    const decision = registry.decideException(req, 'APPROVED', 'approved by governance board')
    expect(decision.outcome).toBe('APPROVED')
    expect(decision.exceptionId).toBe('exc-1')
    expect(decision.decidedAt).toBeDefined()
  })

  it('denied exception does not allow promotion bypass', () => {
    const req: BaselineExceptionRequest = {
      exceptionId: 'exc-2',
      reason: 'lazy shortcut',
      requestedAt: NOW,
      requestedBy: 'principal-1',
    }
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    const decision = registry.decideException(req, 'DENIED', 'no valid justification')
    expect(decision.outcome).toBe('DENIED')
  })

  it('exception requires non-empty reason', () => {
    const req: BaselineExceptionRequest = {
      exceptionId: 'exc-3',
      reason: '',
      requestedAt: NOW,
      requestedBy: 'principal-1',
    }
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    expect(() => registry.decideException(req, 'APPROVED', 'ok')).toThrow()
  })
})

// ── supersession ──────────────────────────────────────────────────────────────

describe('baseline supersession', () => {
  it('superseded baseline is preserved with supersededBy link', () => {
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    const bl1 = registerBaseline(makeBaseline({ baselineId: 'bl-1', modelVersionId: 'mv-1' }), store)
    const bl2 = registerBaseline(makeBaseline({ baselineId: 'bl-2', modelVersionId: 'mv-2' }), store)
    registry.supersede('bl-1', 'bl-2', NOW, 'principal-1')
    const updated = store.get('bl-1')
    expect(updated?.supersededBy).toBe('bl-2')
    expect(updated?.supersededAt).toBeDefined()
  })

  it('supersession history is queryable', () => {
    const store = new Map<string, BaselineRecord>()
    const registry = BaselineRegistryService({ store })
    registerBaseline(makeBaseline({ baselineId: 'bl-1', modelVersionId: 'mv-1' }), store)
    registerBaseline(makeBaseline({ baselineId: 'bl-2', modelVersionId: 'mv-2' }), store)
    registry.supersede('bl-1', 'bl-2', NOW, 'principal-1')
    const chain = registry.getSupersessionChain('bl-1')
    expect(chain.length).toBeGreaterThanOrEqual(1)
    expect(chain[0]?.baselineId).toBe('bl-1')
  })
})
