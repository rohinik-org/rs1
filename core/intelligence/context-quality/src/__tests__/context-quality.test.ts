import { describe, it, expect } from 'vitest'
import { ContextQualityController } from '../controller/context-quality-controller.js'
import {
  BudgetStatus,
  CONTEXT_PROTOCOL_OVERHEAD_TOKENS,
  CONTEXT_SAFETY_MARGIN_TOKENS,
  DEFAULT_QUALITY_WEIGHTS,
  QualityDimension,
} from '@rohinik-org/context-quality-ir'
import { BudgetGovernor } from '../budget/budget-governor.js'
import type { ContextBudget, ContextPackage, ConsumerContextProfile } from '@rohinik-org/context-quality-ir'
import { CoverageEvaluator } from '../evaluators/coverage-evaluator.js'
import { AuthorityEvaluator } from '../evaluators/authority-evaluator.js'
import { FreshnessEvaluator } from '../evaluators/freshness-evaluator.js'
import { ProvenanceEvaluator } from '../evaluators/provenance-evaluator.js'
import { CoherenceEvaluator } from '../evaluators/coherence-evaluator.js'
import { ConsistencyEvaluator } from '../evaluators/consistency-evaluator.js'
import { EfficiencyEvaluator } from '../evaluators/efficiency-evaluator.js'
import { SafetyEvaluator } from '../evaluators/safety-evaluator.js'
import { QualityReportBuilder } from '../report/quality-report-builder.js'
import type {
  ContextItem,
  ContextRequirement,
  ContextRelationship,
} from '@rohinik-org/context-quality-ir'
import { RequirementCoverageStatus, DEFAULT_ADMISSION_POLICY } from '@rohinik-org/context-quality-ir'
import { ContextManifestBuilder } from '../manifest/manifest-builder.js'
import {
  ContextAdmissionDecision,
  ContextQualityErrorCode,
  computeContractHash,
  computePolicyHash,
  computePackageHash,
  contextPackageId,
} from '@rohinik-org/context-quality-ir'
import { AdmissionPolicyEngine } from '../admission/admission-policy-engine.js'
import type { ContextContract, ContextQualityReport } from '@rohinik-org/context-quality-ir'
import { randomUUID } from 'node:crypto'
import { assertInvocationContextAdmitted, makeContextFreeDeclaration } from '../invocation/invocation-context.js'
import { ContextQualityError } from '@rohinik-org/context-quality-ir'
import type { InvocationContext } from '@rohinik-org/context-quality-ir'

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

// ── Test helpers (evaluators) ─────────────────────────────────────────────────
function makeCtxItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    itemId: 'item-1' as any,
    sourceRef: 'spec/AFS-0001',
    content: { text: 'content' },
    contentHash: 'abc123' as any,
    representation: 'verbatim',
    provenance: {
      sourceId: 'spec/AFS-0001',
      sourceKind: 'specification',
      transformations: [],
      capturedAt: new Date(),
    },
    authority: { score: 0.9, sourceKind: 'specification' },
    relevance: { score: 0.85, requirementRefs: ['REQ-001'] },
    security: {
      classification: 'internal',
      containsSecrets: false,
      externalDisclosureAllowed: true,
      redactionState: 'not-required',
    },
    temporalValidity: { validFrom: new Date(Date.now() - 1000), ageMs: 1000 },
    conflictState: 'none',
    estimatedTokens: 50,
    ...overrides,
  }
}

function makeCtxReq(mandatory = true, overrides: Partial<ContextRequirement> = {}): ContextRequirement {
  return {
    requirementId: 'REQ-001',
    type: 'decision',
    description: 'Architecture decisions',
    mandatory,
    minimumAuthority: 0.7,
    acceptedSourceKinds: ['specification', 'adr'],
    ...overrides,
  }
}

// ── CoverageEvaluator ─────────────────────────────────────────────────────────
describe('CoverageEvaluator', () => {
  const ev = new CoverageEvaluator()

  it('satisfied when item covers requirement', () => {
    const result = ev.evaluate([makeCtxItem()], [makeCtxReq()])
    expect(result.score).toBeGreaterThan(0.8)
    expect(result.coverage[0]!.status).toBe(RequirementCoverageStatus.SATISFIED)
    expect(result.coverage[0]!.mandatory).toBe(true)
  })

  it('unsatisfied when no item covers mandatory requirement', () => {
    const item = makeCtxItem({ relevance: { score: 0.85, requirementRefs: [] } })
    const result = ev.evaluate([item], [makeCtxReq(true)])
    expect(result.coverage[0]!.status).toBe(RequirementCoverageStatus.UNSATISFIED)
    expect(result.score).toBeLessThan(0.5)
  })

  it('partially_satisfied when authority below minimum', () => {
    const item = makeCtxItem({ authority: { score: 0.3, sourceKind: 'comment' } })
    const result = ev.evaluate([item], [makeCtxReq()])
    expect(result.coverage[0]!.status).toBe(RequirementCoverageStatus.PARTIALLY_SATISFIED)
  })

  it('optional unsatisfied requirement does not tank score below 0.5', () => {
    const result = ev.evaluate([], [makeCtxReq(false)])
    expect(result.score).toBeGreaterThanOrEqual(0.5)
  })

  it('cardinality.minimum=2 not met with one item marks partially_satisfied', () => {
    const req = makeCtxReq(true, { cardinality: { minimum: 2 } })
    const result = ev.evaluate([makeCtxItem()], [req])
    expect(result.coverage[0]!.cardinalityMet).toBe(false)
    expect(result.coverage[0]!.status).toBe(RequirementCoverageStatus.PARTIALLY_SATISFIED)
  })

  it('cardinality.maximum=1 exceeded with two items marks partially_satisfied', () => {
    const req = makeCtxReq(true, { cardinality: { maximum: 1 } })
    const item2 = makeCtxItem({ itemId: 'item-2' as any })
    const result = ev.evaluate([makeCtxItem(), item2], [req])
    expect(result.coverage[0]!.cardinalityMet).toBe(false)
  })
})

// ── AuthorityEvaluator ────────────────────────────────────────────────────────
describe('AuthorityEvaluator', () => {
  const ev = new AuthorityEvaluator()

  it('high score for high-authority items', () => {
    expect(ev.evaluate([makeCtxItem(), makeCtxItem({ itemId: 'item-2' as any })])).toBeGreaterThan(0.8)
  })

  it('low score for low-authority items', () => {
    expect(ev.evaluate([makeCtxItem({ authority: { score: 0.1, sourceKind: 'chat' } })])).toBeLessThan(0.3)
  })

  it('empty items returns 1.0 (no violations)', () => {
    expect(ev.evaluate([])).toBe(1.0)
  })
})

// ── FreshnessEvaluator ────────────────────────────────────────────────────────
describe('FreshnessEvaluator', () => {
  const ev = new FreshnessEvaluator()

  it('fresh item scores near 1.0', () => {
    const req = makeCtxReq(true, { maximumAgeMs: 3_600_000 })
    const item = makeCtxItem({ temporalValidity: { validFrom: new Date(), ageMs: 100 } })
    expect(ev.evaluate([item], [req])).toBeGreaterThan(0.95)
  })

  it('stale item (24h) against 1h requirement scores 0', () => {
    const ageMs = 24 * 60 * 60 * 1000
    const req = makeCtxReq(true, { maximumAgeMs: 3_600_000 })
    const item = makeCtxItem({ temporalValidity: { validFrom: new Date(Date.now() - ageMs), ageMs } })
    expect(ev.evaluate([item], [req])).toBe(0)
  })

  it('item with no temporalValidity scores 0.5 (unknown freshness)', () => {
    expect(ev.evaluate([makeCtxItem({ temporalValidity: undefined })], [])).toBe(0.5)
  })

  it('per-requirement evaluation: item subject to tightest requirement it supports', () => {
    const ageMs = 10 * 60 * 1000
    const reqA = makeCtxReq(true, { requirementId: 'REQ-A', maximumAgeMs: 5 * 60 * 1000 })
    const reqB = makeCtxReq(true, { requirementId: 'REQ-B', maximumAgeMs: 30 * 24 * 60 * 60 * 1000 })
    const item = makeCtxItem({
      temporalValidity: { validFrom: new Date(Date.now() - ageMs), ageMs },
      relevance: { score: 0.9, requirementRefs: ['REQ-A', 'REQ-B'] },
    })
    const score = ev.evaluate([item], [reqA, reqB])
    expect(score).toBeGreaterThan(0.3)
    expect(score).toBeLessThan(0.7)
  })
})

// ── ProvenanceEvaluator ───────────────────────────────────────────────────────
describe('ProvenanceEvaluator', () => {
  const ev = new ProvenanceEvaluator()

  it('full verbatim provenance scores high', () => {
    const item = makeCtxItem({
      provenance: { sourceId: 'spec/AFS', sourceKind: 'specification', transformations: [], capturedAt: new Date() },
    })
    expect(ev.evaluate([item])).toBeGreaterThan(0.8)
  })

  it('derived item with empty transformations is a hard violation (score 0)', () => {
    const item = makeCtxItem({
      representation: 'derived',
      provenance: { sourceId: 'src-x', sourceKind: 'generated', transformations: [], capturedAt: new Date() },
    })
    expect(ev.evaluate([item])).toBe(0)
  })

  it('summary item with empty transformations is a hard violation (score 0)', () => {
    const item = makeCtxItem({
      representation: 'summary',
      provenance: { sourceId: 'src-x', sourceKind: 'specification', transformations: [], capturedAt: new Date() },
    })
    expect(ev.evaluate([item])).toBe(0)
  })

  it('derived item with transformations scores acceptably', () => {
    const item = makeCtxItem({
      representation: 'derived',
      provenance: { sourceId: 'src-x', sourceKind: 'specification', transformations: ['extract', 'summarize'], capturedAt: new Date() },
    })
    expect(ev.evaluate([item])).toBeGreaterThan(0.6)
  })

  it('item with no sourceId scores 0', () => {
    const item = makeCtxItem({
      provenance: { sourceId: '', sourceKind: 'specification', transformations: [], capturedAt: new Date() },
    })
    expect(ev.evaluate([item])).toBe(0)
  })
})

// ── CoherenceEvaluator ────────────────────────────────────────────────────────
describe('CoherenceEvaluator', () => {
  const ev = new CoherenceEvaluator()

  it('perfect score for items with no relationships', () => {
    expect(ev.evaluate([makeCtxItem()], [])).toBe(1.0)
  })

  it('penalizes broken relationship references', () => {
    const rel: ContextRelationship = { fromItemId: 'item-1' as any, toItemId: 'nonexistent' as any, kind: 'supports' }
    const score = ev.evaluate([makeCtxItem()], [rel])
    expect(score).toBeLessThan(1.0)
  })

  it('penalizes self-reference relationships', () => {
    const rel: ContextRelationship = { fromItemId: 'item-1' as any, toItemId: 'item-1' as any, kind: 'supports' }
    const score = ev.evaluate([makeCtxItem()], [rel])
    expect(score).toBeLessThan(1.0)
  })

  it('penalizes unresolved contradicts relationships', () => {
    const item1 = makeCtxItem({ itemId: 'item-1' as any, conflictState: 'unresolved' })
    const item2 = makeCtxItem({ itemId: 'item-2' as any, conflictState: 'unresolved' })
    const rel: ContextRelationship = { fromItemId: 'item-1' as any, toItemId: 'item-2' as any, kind: 'contradicts' }
    const score = ev.evaluate([item1, item2], [rel])
    expect(score).toBeLessThan(0.8)
  })
})

// ── ConsistencyEvaluator ──────────────────────────────────────────────────────
describe('ConsistencyEvaluator', () => {
  const ev = new ConsistencyEvaluator()

  it('perfect score for items with no conflicts', () => {
    expect(ev.evaluate([makeCtxItem(), makeCtxItem({ itemId: 'item-2' as any })], [])).toBe(1.0)
  })

  it('penalizes unresolved conflicts', () => {
    const item = makeCtxItem({ conflictState: 'unresolved' })
    const score = ev.evaluate([item], [])
    expect(score).toBeLessThan(0.7)
  })

  it('penalizes stale superseded items still present', () => {
    const item1 = makeCtxItem({ itemId: 'item-1' as any })
    const item2 = makeCtxItem({ itemId: 'item-2' as any })
    const rel: ContextRelationship = { fromItemId: 'item-2' as any, toItemId: 'item-1' as any, kind: 'supersedes' }
    const score = ev.evaluate([item1, item2], [rel])
    expect(score).toBeLessThan(1.0)
  })
})

// ── EfficiencyEvaluator ───────────────────────────────────────────────────────
describe('EfficiencyEvaluator', () => {
  const ev = new EfficiencyEvaluator()

  it('perfect score for unique items', () => {
    const item1 = makeCtxItem({ contentHash: 'hash-a' as any })
    const item2 = makeCtxItem({ itemId: 'item-2' as any, contentHash: 'hash-b' as any })
    expect(ev.evaluate([item1, item2])).toBe(1.0)
  })

  it('lower score for duplicate content hashes', () => {
    const item1 = makeCtxItem({ contentHash: 'same-hash' as any })
    const item2 = makeCtxItem({ itemId: 'item-2' as any, contentHash: 'same-hash' as any })
    const score = ev.evaluate([item1, item2])
    expect(score).toBeLessThan(1.0)
  })

  it('returns 1.0 for single item', () => {
    expect(ev.evaluate([makeCtxItem()])).toBe(1.0)
  })
})

// ── SafetyEvaluator ───────────────────────────────────────────────────────────
describe('SafetyEvaluator', () => {
  const ev = new SafetyEvaluator()

  it('passes clean item with no consumer', () => {
    const result = ev.evaluate([makeCtxItem()], null)
    expect(result.blocked).toBe(false)
    expect(result.score).toBe(1.0)
  })

  it('blocks item with containsSecrets=true', () => {
    const item = makeCtxItem({ security: { classification: 'restricted', containsSecrets: true, externalDisclosureAllowed: false, redactionState: 'incomplete' } })
    const result = ev.evaluate([item], null)
    expect(result.blocked).toBe(true)
    expect(result.score).toBe(0.0)
  })

  it('blocks item with redactionState=incomplete', () => {
    const item = makeCtxItem({ security: { classification: 'internal', containsSecrets: false, externalDisclosureAllowed: true, redactionState: 'incomplete' } })
    const result = ev.evaluate([item], null)
    expect(result.blocked).toBe(true)
  })

  it('blocks when consumer residency not in allowed residency', () => {
    const item = makeCtxItem({ security: { classification: 'internal', containsSecrets: false, externalDisclosureAllowed: true, redactionState: 'not-required', residency: ['eu'] } })
    const consumer = {
      consumerKind: 'llm' as const, maximumContextUnits: 8192, contextUnit: 'token' as const,
      supportedRepresentations: ['verbatim' as const], supportsStructuredContext: true,
      supportsSourceAnnotations: true, executionLocation: 'local' as const,
      residency: 'us',
    }
    const result = ev.evaluate([item], consumer)
    expect(result.blocked).toBe(true)
  })

  it('blocks when item classification exceeds consumer maximum', () => {
    const item = makeCtxItem({ security: { classification: 'confidential', containsSecrets: false, externalDisclosureAllowed: true, redactionState: 'not-required' } })
    const consumer = {
      consumerKind: 'llm' as const, maximumContextUnits: 8192, contextUnit: 'token' as const,
      supportedRepresentations: ['verbatim' as const], supportsStructuredContext: true,
      supportsSourceAnnotations: true, executionLocation: 'local' as const,
      maximumClassification: 'internal' as const,
    }
    const result = ev.evaluate([item], consumer)
    expect(result.blocked).toBe(true)
  })

  it('warns (does not block) for suspicious path pattern', () => {
    const item = makeCtxItem({ sourceRef: 'secrets/api-keys/config' })
    const result = ev.evaluate([item], null)
    expect(result.blocked).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

// ── QualityReportBuilder ──────────────────────────────────────────────────────
describe('QualityReportBuilder', () => {
  const builder = new QualityReportBuilder({ idGenerator: { nextId: () => 'test-id' }, clock: { now: () => new Date('2026-01-01') } })

  it('builds report with no violations when all scores pass floors', () => {
    const vector = {
      relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    }
    const report = builder.build('pkg-1' as any, vector, [], [], [], '1.0.0', DEFAULT_ADMISSION_POLICY)
    expect(report.violations).toHaveLength(0)
    expect(report.compositeScore).toBeGreaterThan(0.9)
  })

  it('builds violations for dimensions below floor', () => {
    const vector = {
      relevance: 0.9, authority: 0.3, coverage: 0.9, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    }
    const report = builder.build('pkg-1' as any, vector, [], [], [], '1.0.0', DEFAULT_ADMISSION_POLICY)
    const authorityViolation = report.violations.find(v => v.dimension === 'authority')
    expect(authorityViolation).toBeDefined()
  })

  it('builds warning for optional missing coverage', () => {
    const vector = {
      relevance: 0.9, authority: 0.9, coverage: 0.7, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    }
    const optionalUnsatisfied = [{
      requirementId: 'REQ-OPT', mandatory: false,
      status: RequirementCoverageStatus.UNSATISFIED,
      supportingItemIds: [], score: 0, cardinalityMet: false,
    }]
    const report = builder.build('pkg-1' as any, vector, optionalUnsatisfied as any, [], [], '1.0.0', DEFAULT_ADMISSION_POLICY)
    expect(report.warnings.some(w => w.dimension === 'coverage')).toBe(true)
  })

  it('report has no decision field', () => {
    const vector = {
      relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    }
    const report = builder.build('pkg-1' as any, vector, [], [], [], '1.0.0', DEFAULT_ADMISSION_POLICY)
    expect((report as any).decision).toBeUndefined()
  })

  it('report has policyId and policyHash', () => {
    const vector = {
      relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    }
    const report = builder.build('pkg-1' as any, vector, [], [], [], '1.0.0', DEFAULT_ADMISSION_POLICY)
    expect(report.policyId).toBeDefined()
    expect(report.policyHash).toBeDefined()
  })
})

// ── Shared test fixtures ──────────────────────────────────────────────────────
function makeFullItem() {
  return {
    itemId: 'item-1' as any,
    sourceRef: 'spec/AFS-0001',
    content: { text: 'content' },
    contentHash: 'abc123' as any,
    representation: 'verbatim' as const,
    provenance: { sourceId: 'spec/AFS-0001', sourceKind: 'specification' as const, transformations: [], capturedAt: new Date() },
    authority: { score: 0.9, sourceKind: 'specification' as const },
    relevance: { score: 0.85, requirementRefs: ['REQ-001'] },
    security: { classification: 'internal' as const, containsSecrets: false, externalDisclosureAllowed: true, redactionState: 'not-required' as const },
    temporalValidity: { validFrom: new Date(), ageMs: 100 },
    conflictState: 'none' as const,
    estimatedTokens: 50,
  }
}

function makeGoodPackage() {
  const base = {
    packageId:       randomUUID() as any,
    operationId:     'op-1' as any,
    contractId:      'contract-1' as any,
    createdAt:       new Date(),
    assemblyVersion: '1.0.0',
    items:           [makeFullItem()],
    relationships:   [],
    estimatedUsage:  { estimatedInputTokens: 50, estimatedOutputTokens: 500, estimatedItems: 1 },
    assemblyTrace:   { assembledAt: new Date(), assemblerVersion: '1.0.0', stagesApplied: ['11A','11B','11C'] },
  }
  return { ...base, packageHash: computePackageHash(base) }
}

function makeContract(): ContextContract {
  return {
    contractId:         'contract-1' as any,
    operationId:        'op-1' as any,
    purpose:            'test',
    requirements:       [{ requirementId: 'REQ-001', type: 'decision' as const, description: 'test', mandatory: true, minimumAuthority: 0.7, acceptedSourceKinds: ['specification' as const] }],
    budget:             { maximumInputTokens: 4096, reservedOutputTokens: 500 },
    admissionPolicy:    DEFAULT_ADMISSION_POLICY,
    contextRequirement: 'required' as const,
    deterministic:      true,
  }
}

function makeReport(overrides: Partial<ContextQualityReport> = {}): ContextQualityReport {
  return {
    reportId:  'report-1' as any,
    packageId: 'pkg-1' as any,
    vector: {
      relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9,
      consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0,
    },
    compositeScore:   0.9,
    coverage:         [],
    violations:       [],
    warnings:         [],
    evaluatedAt:      new Date(),
    evaluatorVersion: '1.0.0',
    policyId:         'default-v1' as any,
    policyHash:       'policy-hash-1' as any,
    ...overrides,
  }
}

const testClock = { now: () => new Date('2026-01-01T00:00:00.000Z') }
const testIds   = { nextId: (kind: string) => `test-${kind}-001` }

// ── ContextManifestBuilder ────────────────────────────────────────────────────
describe('ContextManifestBuilder', () => {
  const builder = new ContextManifestBuilder(testIds)

  it('manifest packageHash matches input pkg.packageHash', () => {
    const pkg = makeGoodPackage()
    const manifest = builder.build(
      pkg,
      makeReport(),
      ContextAdmissionDecision.ADMITTED,
      computeContractHash(makeContract()),
      computePolicyHash(DEFAULT_ADMISSION_POLICY),
      [],
    )
    expect(manifest.packageHash).toBe(pkg.packageHash)
  })

  it('manifest has admissionDecision field', () => {
    const pkg      = makeGoodPackage()
    const manifest = builder.build(pkg, makeReport(), ContextAdmissionDecision.ADMITTED, 'ch' as any, 'ph' as any, [])
    expect(manifest.admissionDecision).toBe(ContextAdmissionDecision.ADMITTED)
  })

  it('degraded manifest populates degradationReasons', () => {
    const pkg      = makeGoodPackage()
    const manifest = builder.build(pkg, makeReport(), ContextAdmissionDecision.ADMITTED_DEGRADED, 'ch' as any, 'ph' as any, ['coherence', 'freshness'])
    expect(manifest.degradationReasons).toContain('coherence')
    expect(manifest.degradationReasons).toContain('freshness')
  })

  it('totalSources counts unique provenance.sourceId values', () => {
    const item1 = makeFullItem()
    const item2 = { ...makeFullItem(), itemId: 'item-2' as any, provenance: { ...makeFullItem().provenance, sourceId: 'other-source' } }
    const base = {
      packageId: randomUUID() as any, operationId: 'op-1' as any, contractId: 'contract-1' as any,
      createdAt: new Date(), assemblyVersion: '1.0.0',
      items: [item1, item2], relationships: [],
      estimatedUsage: { estimatedInputTokens: 100, estimatedOutputTokens: 500, estimatedItems: 2 },
      assemblyTrace: { assembledAt: new Date(), assemblerVersion: '1.0.0', stagesApplied: [] },
    }
    const pkg = { ...base, packageHash: computePackageHash(base) }
    const manifest = builder.build(pkg as any, makeReport(), ContextAdmissionDecision.ADMITTED, 'ch' as any, 'ph' as any, [])
    expect(manifest.totalUsage.totalSources).toBe(2)
  })
})

// ── AdmissionPolicyEngine ─────────────────────────────────────────────────────
describe('AdmissionPolicyEngine', () => {
  const engine = new AdmissionPolicyEngine(new ContextManifestBuilder(testIds))
  const pkg    = makeGoodPackage()

  it('admits when all gates pass', async () => {
    const result = await engine.decide(makeReport(), DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.ADMITTED)
    expect(result.admittedManifest).toBeDefined()
  })

  it('manifest contractHash matches computeContractHash(contract)', async () => {
    const contract = makeContract()
    const result   = await engine.decide(makeReport(), DEFAULT_ADMISSION_POLICY, pkg, contract, 0)
    expect(result.admittedManifest!.contractHash).toBe(computeContractHash(contract))
  })

  it('rejects when safety = 0', async () => {
    const report = makeReport({
      vector: { relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9, consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 0.0 },
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.SAFETY_POLICY_VIOLATION)).toBe(true)
  })

  it('uses COMPOSITE_SCORE_BELOW_THRESHOLD code when composite fails', async () => {
    const report = makeReport({ compositeScore: 0.50 })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.COMPOSITE_SCORE_BELOW_THRESHOLD)).toBe(true)
  })

  it('uses QUALITY_DIMENSION_BELOW_THRESHOLD code for failed dimension floor', async () => {
    const report = makeReport({
      vector: { relevance: 0.9, authority: 0.3, coverage: 0.9, coherence: 0.9, consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.9, safety: 1.0 },
      compositeScore: 0.80,
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.QUALITY_DIMENSION_BELOW_THRESHOLD)).toBe(true)
  })

  it('admits degraded when non-mandatory dims fail but mandatory pass', async () => {
    const report = makeReport({
      vector: { relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.3, consistency: 0.9, freshness: 0.3, provenance: 0.9, efficiency: 0.9, safety: 1.0 },
      compositeScore: 0.83,
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.ADMITTED_DEGRADED)
    expect(result.admittedManifest?.degradationReasons?.length).toBeGreaterThan(0)
  })

  it('retry when mandatory coverage unsatisfied and attempts remain', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-001', mandatory: true, status: RequirementCoverageStatus.UNSATISFIED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.RETRY_REQUIRED)
    expect(result.retryDirective).toBeDefined()
  })

  it('conflicted mandatory requirement also triggers retry', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-001', mandatory: true, status: RequirementCoverageStatus.CONFLICTED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.RETRY_REQUIRED)
  })

  it('rejects after retry limit exhausted', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-001', mandatory: true, status: RequirementCoverageStatus.UNSATISFIED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    const result = await engine.decide(report, { ...DEFAULT_ADMISSION_POLICY, maximumRetries: 2 }, pkg, makeContract(), 2)
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
  })

  it('optional unsatisfied requirement does not trigger retry', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-OPT', mandatory: false, status: RequirementCoverageStatus.UNSATISFIED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    const result = await engine.decide(report, DEFAULT_ADMISSION_POLICY, pkg, makeContract(), 0)
    expect([ContextAdmissionDecision.ADMITTED, ContextAdmissionDecision.ADMITTED_DEGRADED]).toContain(result.decision)
  })
})

// ── ContextQualityController — integration ───────────────────────────────────
describe('ContextQualityController — integration', () => {
  const ctrl = new ContextQualityController({ clock: testClock, idGenerator: testIds })

  it('admits a well-formed context package', async () => {
    const result = await ctrl.evaluateAndAdmit(makeGoodPackage(), makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.ADMITTED)
    expect(result.admittedManifest).toBeDefined()
    expect(result.admittedManifest!.packageHash).toBeTruthy()
  })

  it('INV-11D-008: manifest packageHash equals input pkg.packageHash', async () => {
    const pkg    = makeGoodPackage()
    const result = await ctrl.evaluateAndAdmit(pkg, makeContract(), makeConsumer(8192))
    expect(result.admittedManifest!.packageHash).toBe(pkg.packageHash)
  })

  it('rejects mutated package (INV-11D-002)', async () => {
    const pkg     = makeGoodPackage()
    const mutated = { ...pkg, packageHash: 'tampered' as any }
    const result  = await ctrl.evaluateAndAdmit(mutated, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.PACKAGE_MUTATED)).toBe(true)
  })

  it('rejects package exceeding token budget', async () => {
    const base    = makeGoodPackage()
    const bigItem = { ...makeFullItem(), estimatedTokens: 5000 }
    const bigBase = { ...base, items: [bigItem] }
    const bigPkg  = { ...bigBase, packageHash: computePackageHash(bigBase) }
    const result  = await ctrl.evaluateAndAdmit(bigPkg, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.BUDGET_EXCEEDED)).toBe(true)
  })

  it('rejects when item containsSecrets=true', async () => {
    const base    = makeGoodPackage()
    const badItem = { ...makeFullItem(), security: { classification: 'restricted', containsSecrets: true, externalDisclosureAllowed: false, redactionState: 'incomplete' } }
    const badBase = { ...base, items: [badItem] }
    const badPkg  = { ...badBase, packageHash: computePackageHash(badBase) }
    const result  = await ctrl.evaluateAndAdmit(badPkg, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
  })

  it('rejects required contract with empty items (contextRequirement=required)', async () => {
    const emptyBase = { ...makeGoodPackage(), items: [] }
    const emptyPkg  = { ...emptyBase, packageHash: computePackageHash(emptyBase) }
    const result    = await ctrl.evaluateAndAdmit(emptyPkg, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.REQUIRED_ITEM_MISSING)).toBe(true)
  })
})

// ── assertInvocationContextAdmitted (L-11D-001) ───────────────────────────────
describe('assertInvocationContextAdmitted (L-11D-001)', () => {
  const admittedContract = makeContract()  // contextRequirement: 'required'
  const noneContract     = { ...makeContract(), contractId: 'c-free' as any, contextRequirement: 'none' as const }

  it('passes for contextual invocation with admitted manifest', () => {
    const pkg = makeGoodPackage()
    const ctx: InvocationContext = {
      kind:     'contextual',
      manifest: {
        manifestId: 'm1' as any, packageId: pkg.packageId, reportId: 'r1' as any,
        itemEntries: [], totalUsage: { totalTokens: 0, totalItems: 0, totalSources: 0 },
        qualityVector: { relevance:1, authority:1, coverage:1, coherence:1, consistency:1, freshness:1, provenance:1, efficiency:1, safety:1 },
        admissionDecision: 'admitted', contractHash: 'ch' as any, packageHash: pkg.packageHash, policyHash: 'polh' as any,
      },
      pkg,
    }
    expect(() => assertInvocationContextAdmitted(ctx, admittedContract)).not.toThrow()
  })

  it('passes for context-free declaration when contract requires none', () => {
    const ctx: InvocationContext = {
      kind:        'context-free',
      declaration: makeContextFreeDeclaration('op-1' as any, 'c-free' as any, noneContract),
    }
    expect(() => assertInvocationContextAdmitted(ctx, noneContract)).not.toThrow()
  })

  it('throws ContextQualityError for contextual with rejected manifest decision', () => {
    const pkg = makeGoodPackage()
    const ctx: InvocationContext = {
      kind:     'contextual',
      manifest: {
        manifestId: 'm1' as any, packageId: pkg.packageId, reportId: 'r1' as any,
        itemEntries: [], totalUsage: { totalTokens: 0, totalItems: 0, totalSources: 0 },
        qualityVector: { relevance:1, authority:1, coverage:1, coherence:1, consistency:1, freshness:1, provenance:1, efficiency:1, safety:1 },
        admissionDecision: 'rejected', contractHash: 'ch' as any, packageHash: pkg.packageHash, policyHash: 'polh' as any,
      },
      pkg,
    }
    expect(() => assertInvocationContextAdmitted(ctx, admittedContract)).toThrow(ContextQualityError)
  })

  it('throws INVOCATION_WITHOUT_ADMISSION for rejected contextual decision', () => {
    const pkg = makeGoodPackage()
    const ctx: InvocationContext = {
      kind:     'contextual',
      manifest: {
        manifestId: 'm1' as any, packageId: pkg.packageId, reportId: 'r1' as any,
        itemEntries: [], totalUsage: { totalTokens: 0, totalItems: 0, totalSources: 0 },
        qualityVector: { relevance:1, authority:1, coverage:1, coherence:1, consistency:1, freshness:1, provenance:1, efficiency:1, safety:1 },
        admissionDecision: 'rejected', contractHash: 'ch' as any, packageHash: pkg.packageHash, policyHash: 'polh' as any,
      },
      pkg,
    }
    try {
      assertInvocationContextAdmitted(ctx, admittedContract)
    } catch (e) {
      expect((e as ContextQualityError).code).toBe(ContextQualityErrorCode.INVOCATION_WITHOUT_ADMISSION)
    }
  })

  it('throws for context-free declaration with contractHash mismatch (Fix 16)', () => {
    const mutatedContract = { ...noneContract, purpose: 'mutated' }
    const ctx: InvocationContext = {
      kind:        'context-free',
      declaration: makeContextFreeDeclaration('op-1' as any, 'c-free' as any, noneContract),
    }
    expect(() => assertInvocationContextAdmitted(ctx, mutatedContract)).toThrow(ContextQualityError)
  })

  it('throws when context-free invocation used against required-context contract', () => {
    const ctx: InvocationContext = {
      kind:        'context-free',
      declaration: makeContextFreeDeclaration('op-1' as any, 'c-free' as any, noneContract),
    }
    expect(() => assertInvocationContextAdmitted(ctx, admittedContract)).toThrow(ContextQualityError)
  })
})

// ── Constitutional laws (L-11D-001 through L-11D-008) ─────────────────────────
describe('Constitutional laws (L-11D-001 through L-11D-008)', () => {
  const ctrl   = new ContextQualityController({ clock: testClock, idGenerator: testIds })
  const engine = new AdmissionPolicyEngine(new ContextManifestBuilder(testIds))

  // L-11D-001: Provider invocation blocked without admission manifest
  it('L-11D-001: assertInvocationContextAdmitted throws for non-admitted manifest', () => {
    const pkg = makeGoodPackage()
    const manifest = {
      manifestId: 'm' as any, packageId: pkg.packageId, reportId: 'r' as any,
      itemEntries: [], totalUsage: { totalTokens: 0, totalItems: 0, totalSources: 0 },
      qualityVector: { relevance:1,authority:1,coverage:1,coherence:1,consistency:1,freshness:1,provenance:1,efficiency:1,safety:1 },
      admissionDecision: ContextAdmissionDecision.REJECTED,
      contractHash: 'c' as any, packageHash: pkg.packageHash, policyHash: 'po' as any,
    }
    expect(() => assertInvocationContextAdmitted({ kind: 'contextual', manifest, pkg }, makeContract()))
      .toThrow(ContextQualityError)
  })

  // L-11D-002: Authority evaluator is independent of relevance
  it('L-11D-002: authority score does not change when relevance changes', () => {
    const ev = new AuthorityEvaluator()
    const itemHighRelevance = makeFullItem()
    const itemLowRelevance  = { ...makeFullItem(), relevance: { score: 0.1, requirementRefs: [] } }
    expect(ev.evaluate([itemHighRelevance])).toBeCloseTo(ev.evaluate([itemLowRelevance]))
  })

  // L-11D-003: Admitted package has no unsatisfied mandatory requirements
  it('L-11D-003: unsatisfied mandatory coverage emits MANDATORY_COVERAGE_FAILED on first retry path', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-001', mandatory: true, status: RequirementCoverageStatus.UNSATISFIED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    // attemptCount=0 < maximumRetries=1 → RETRY_REQUIRED with MANDATORY_COVERAGE_FAILED reason
    const policy = { ...DEFAULT_ADMISSION_POLICY, maximumRetries: 1 }
    const result = await engine.decide(report, policy, makeGoodPackage(), makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.RETRY_REQUIRED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.MANDATORY_COVERAGE_FAILED)).toBe(true)
  })

  // L-11D-004: Safety gate precedes composite score
  it('L-11D-004: package with containsSecrets=true is rejected even with high composite score', async () => {
    const base    = makeGoodPackage()
    const badItem = { ...makeFullItem(), security: { classification: 'restricted', containsSecrets: true, externalDisclosureAllowed: false, redactionState: 'incomplete' } }
    const badBase = { ...base, items: [badItem] }
    const badPkg  = { ...badBase, packageHash: computePackageHash(badBase) }
    const result  = await ctrl.evaluateAndAdmit(badPkg, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.SAFETY_POLICY_VIOLATION)).toBe(true)
  })

  // L-11D-005: Derived representation preserves provenance chain
  it('L-11D-005: derived item with empty transformations gets provenance score 0', () => {
    const ev   = new ProvenanceEvaluator()
    const item = { ...makeFullItem(), representation: 'derived' as const, provenance: { sourceId: 'src', sourceKind: 'specification' as const, transformations: [], capturedAt: new Date() } }
    expect(ev.evaluate([item])).toBe(0)
  })

  // L-11D-006: Retry attempts bounded by maximumRetries
  it('L-11D-006: retry_required not issued when attemptCount >= maximumRetries', async () => {
    const report = makeReport({
      coverage: [{ requirementId: 'REQ-001', mandatory: true, status: RequirementCoverageStatus.UNSATISFIED, supportingItemIds: [], score: 0, cardinalityMet: false }],
    })
    const result = await engine.decide(report, { ...DEFAULT_ADMISSION_POLICY, maximumRetries: 2 }, makeGoodPackage(), makeContract(), 2)
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.decision).not.toBe(ContextAdmissionDecision.RETRY_REQUIRED)
  })

  // L-11D-007: Degraded admission preserved — not silently upgraded to normal
  it('L-11D-007: ADMITTED_DEGRADED manifest contains degradationReasons', async () => {
    const report = makeReport({
      vector: { relevance: 0.9, authority: 0.9, coverage: 0.9, coherence: 0.9, consistency: 0.9, freshness: 0.9, provenance: 0.9, efficiency: 0.1, safety: 0.9 },
    })
    const policy = {
      ...DEFAULT_ADMISSION_POLICY,
      allowDegraded: true,
      mandatoryDimensions: ['safety', 'coverage'] as any,
      degradedDimensionFloors: { efficiency: 0.5 },
    } as any
    const result = await engine.decide(report, policy, makeGoodPackage(), makeContract(), 0)
    expect(result.decision).toBe(ContextAdmissionDecision.ADMITTED_DEGRADED)
    expect(result.admittedManifest!.degradationReasons).toContain('efficiency')
  })

  // L-11D-008: Package delivered equals package evaluated (hash match)
  it('L-11D-008: manifest.packageHash equals pkg.packageHash', async () => {
    const pkg    = makeGoodPackage()
    const result = await ctrl.evaluateAndAdmit(pkg, makeContract(), makeConsumer(8192))
    if (result.admittedManifest) {
      expect(result.admittedManifest.packageHash).toBe(pkg.packageHash)
    }
  })

  it('L-11D-008: mutated package rejected (hash mismatch)', async () => {
    const pkg    = makeGoodPackage()
    const tamper = { ...pkg, packageHash: 'tampered-hash' as any }
    const result = await ctrl.evaluateAndAdmit(tamper, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.PACKAGE_MUTATED)).toBe(true)
  })
})

// ── Deterministic replay ──────────────────────────────────────────────────────
describe('Deterministic replay', () => {
  it('two controllers with same clock + idGenerator produce identical manifests', async () => {
    const fixedClock = { now: () => new Date('2026-01-01T00:00:00.000Z') }
    let counter = 0
    const deterministicIds = { nextId: (kind: string) => `${kind}-${++counter}` }

    const ctrlA  = new ContextQualityController({ clock: fixedClock, idGenerator: deterministicIds })
    const pkg     = makeGoodPackage()
    const resultA = await ctrlA.evaluateAndAdmit(pkg, makeContract(), makeConsumer(8192))

    counter = 0
    const ctrlB  = new ContextQualityController({ clock: fixedClock, idGenerator: deterministicIds })
    const resultB = await ctrlB.evaluateAndAdmit(pkg, makeContract(), makeConsumer(8192))

    expect(resultA.admittedManifest!.manifestId).toBe(resultB.admittedManifest!.manifestId)
    expect(resultA.admittedManifest!.packageHash).toBe(resultB.admittedManifest!.packageHash)
    expect(resultA.admittedManifest!.contractHash).toBe(resultB.admittedManifest!.contractHash)
  })
})

// ── Content mutation detection ────────────────────────────────────────────────
describe('Content mutation detection (P0-3)', () => {
  it('package with changed content.text but stale packageHash is rejected as PACKAGE_MUTATED', async () => {
    const original    = makeGoodPackage()
    const mutatedItems = original.items.map(i => ({ ...i, content: { ...i.content, text: 'INJECTED_CONTENT' } }))
    const mutated      = { ...original, items: mutatedItems }
    const ctrl2        = new ContextQualityController({ clock: testClock, idGenerator: testIds })
    const result       = await ctrl2.evaluateAndAdmit(mutated, makeContract(), makeConsumer(8192))
    expect(result.decision).toBe(ContextAdmissionDecision.REJECTED)
    expect(result.reasons.some(r => r.code === ContextQualityErrorCode.PACKAGE_MUTATED)).toBe(true)
  })
})

// ── Policy canonicalization ───────────────────────────────────────────────────
describe('Policy canonicalization (computePolicyHash)', () => {
  it('different insertion order of dimensionFloors → same hash', () => {
    const policyA = { ...DEFAULT_ADMISSION_POLICY, dimensionFloors: { coverage: 0.7, authority: 0.6 } } as any
    const policyB = { ...DEFAULT_ADMISSION_POLICY, dimensionFloors: { authority: 0.6, coverage: 0.7 } } as any
    expect(computePolicyHash(policyA)).toBe(computePolicyHash(policyB))
  })

  it('different dimensionFloor value → different hash', () => {
    const policyA = { ...DEFAULT_ADMISSION_POLICY, dimensionFloors: { coverage: 0.7 } } as any
    const policyB = { ...DEFAULT_ADMISSION_POLICY, dimensionFloors: { coverage: 0.8 } } as any
    expect(computePolicyHash(policyA)).not.toBe(computePolicyHash(policyB))
  })

  it('different retryStrategies order → different hash (order = execution priority)', () => {
    const policyA = { ...DEFAULT_ADMISSION_POLICY, retryStrategies: ['retrieve_missing', 'compress_items'] } as any
    const policyB = { ...DEFAULT_ADMISSION_POLICY, retryStrategies: ['compress_items', 'retrieve_missing'] } as any
    expect(computePolicyHash(policyA)).not.toBe(computePolicyHash(policyB))
  })
})
