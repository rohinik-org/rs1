import { describe, it, expect } from 'vitest'
import {
  BudgetStatus,
  CONTEXT_PROTOCOL_OVERHEAD_TOKENS,
  CONTEXT_SAFETY_MARGIN_TOKENS,
  DEFAULT_QUALITY_WEIGHTS,
  QualityDimension,
} from '@rohinik-org/context-quality-ir'
import { BudgetGovernor } from '../budget/budget-governor.js'
import type { ContextBudget, ContextPackage, ConsumerContextProfile } from '@rohinik-org/context-quality-ir'

// ── Constitutional invariant: weights sum to 1.0 ──────────────────────────────
describe('DEFAULT_QUALITY_WEIGHTS', () => {
  it('sum to 1.0 within floating-point tolerance', () => {
    const sum = (Object.keys(DEFAULT_QUALITY_WEIGHTS) as QualityDimension[])
      .reduce((acc, k) => acc + DEFAULT_QUALITY_WEIGHTS[k], 0)
    expect(sum).toBeCloseTo(1.0, 12)
  })
})

function makeItem(tokens: number, id = 'item-1', sourceId = 'src-a') {
  return {
    itemId: id,
    estimatedTokens: tokens,
    provenance: { sourceId },
    representation: 'verbatim',
    security: { classification: 'internal', containsSecrets: false, externalDisclosureAllowed: true, redactionState: 'not-required' },
  } as any
}

function makeBudget(maxInput: number, reserved = 500, extras: Partial<ContextBudget> = {}): ContextBudget {
  return { maximumInputTokens: maxInput, reservedOutputTokens: reserved, ...extras }
}

function makeConsumer(maxUnits: number, unit: 'token' | 'item' = 'token'): ConsumerContextProfile {
  return {
    consumerKind: 'llm',
    maximumContextUnits: maxUnits,
    contextUnit: unit,
    supportedRepresentations: ['verbatim', 'extract', 'summary', 'structured', 'derived'],
    supportsStructuredContext: true,
    supportsSourceAnnotations: true,
    executionLocation: 'local',
  }
}

function makePkg(items: any[]): ContextPackage {
  return { items } as any
}

describe('BudgetGovernor', () => {
  const gov = new BudgetGovernor()

  it('within_budget when tokens fit', () => {
    const result = gov.assess(makePkg([makeItem(100)]), makeBudget(4096, 500), makeConsumer(8192))
    expect(result.status).toBe(BudgetStatus.WITHIN_BUDGET)
    expect(result.totalEstimatedTokens).toBe(100)
    expect(result.overageTokens).toBe(0)
  })

  it('hard_limit_exceeded when package exceeds effective token budget', () => {
    // effective = min(4096,8192) - 500 - 200 - 100 = 3296
    const result = gov.assess(makePkg([makeItem(4000)]), makeBudget(4096, 500), makeConsumer(8192))
    expect(result.status).toBe(BudgetStatus.HARD_LIMIT_EXCEEDED)
    expect(result.overageTokens).toBeGreaterThan(0)
  })

  it('consumer token limit binds when lower than contract max', () => {
    // effective = min(8192,1000) - 500 - 200 - 100 = 200
    const result = gov.assess(makePkg([makeItem(201)]), makeBudget(8192, 500), makeConsumer(1000))
    expect(result.status).toBe(BudgetStatus.HARD_LIMIT_EXCEEDED)
  })

  it('effectiveBudget accounts for overhead constants', () => {
    const result = gov.assess(makePkg([makeItem(1)]), makeBudget(4096, 500), makeConsumer(8192))
    expect(result.effectiveBudget).toBe(4096 - 500 - CONTEXT_PROTOCOL_OVERHEAD_TOKENS - CONTEXT_SAFETY_MARGIN_TOKENS)
  })

  it('soft_limit_exceeded when over softLimitRatio', () => {
    // effective = 3296; soft = 3296 * 0.9 = 2966.4; 3000 > 2966 so soft exceeded
    const result = gov.assess(makePkg([makeItem(3000)]), makeBudget(4096, 500, { softLimitRatio: 0.9 }), makeConsumer(8192))
    expect(result.status).toBe(BudgetStatus.SOFT_LIMIT_EXCEEDED)
  })

  it('respects maximumItems limit', () => {
    const result = gov.assess(
      makePkg([makeItem(10, 'a'), makeItem(10, 'b'), makeItem(10, 'c')]),
      makeBudget(8192, 0, { maximumItems: 2 }),
      makeConsumer(8192),
    )
    expect(result.status).toBe(BudgetStatus.HARD_LIMIT_EXCEEDED)
  })

  it('respects maximumSources limit using provenance.sourceId', () => {
    const result = gov.assess(
      makePkg([makeItem(10, 'a', 'src-x'), makeItem(10, 'b', 'src-y'), makeItem(10, 'c', 'src-z')]),
      makeBudget(8192, 0, { maximumSources: 2 }),
      makeConsumer(8192),
    )
    expect(result.status).toBe(BudgetStatus.HARD_LIMIT_EXCEEDED)
    expect(result.sourceCount).toBe(3)
  })

  it('non-token consumer unit (item) uses item count not tokens', () => {
    const result = gov.assess(
      makePkg([makeItem(999, 'a'), makeItem(999, 'b'), makeItem(999, 'c')]),
      makeBudget(8192, 0),
      makeConsumer(2, 'item'),
    )
    expect(result.status).toBe(BudgetStatus.HARD_LIMIT_EXCEEDED)
  })

  it('unsupported consumer unit returns consumer_unit_unsupported', () => {
    const consumer = { ...makeConsumer(100), contextUnit: 'byte' as any }
    const result = gov.assess(makePkg([makeItem(10)]), makeBudget(8192, 0), consumer)
    expect(result.status).toBe(BudgetStatus.CONSUMER_UNIT_UNSUPPORTED)
  })
})
