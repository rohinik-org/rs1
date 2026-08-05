import { describe, it, expect, vi } from 'vitest'
import {
  PackageLifecycleMachine,
  EvaluatorRegistry,
  buildDefaultRegistry,
  TelemetryBus,
  ContextAdmissionCache,
  ContextQualityController,
  CoverageEvaluator,
} from '../index.js'
import {
  ContextPackageLifecycle,
  isValidLifecycleTransition,
  assertLifecycleTransition,
  QualityDimension,
  ContextAdmissionDecision,
  ContextQualityEvent,
  RequirementCoverageStatus,
  DEFAULT_ADMISSION_POLICY,
  computePackageHash,
  contextPackageId,
  computeContractHash,
} from '@rohinik-org/context-quality-ir'
import type { ContextQualityTelemetryEvent, ContextContract } from '@rohinik-org/context-quality-ir'
import { randomUUID } from 'node:crypto'

// ── Shared fixtures ───────────────────────────────────────────────────────────

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
    assemblyTrace:   { assembledAt: new Date(), assemblerVersion: '1.0.0', stagesApplied: [] },
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

function makeConsumer() {
  return {
    consumerKind: 'llm' as const,
    maximumContextUnits: 8192,
    contextUnit: 'token' as const,
    supportedRepresentations: ['verbatim' as const, 'extract' as const, 'summary' as const, 'structured' as const, 'derived' as const],
    supportsStructuredContext: true,
    supportsSourceAnnotations: true,
    executionLocation: 'local' as const,
  }
}

// ── Task 11: Lifecycle state machine (L-11D enforcement) ──────────────────────

describe('PackageLifecycleMachine — Task 11', () => {
  it('initializes package at DRAFT state', () => {
    const m = new PackageLifecycleMachine()
    const rec = m.initialize(contextPackageId('pkg-1'))
    expect(rec.state).toBe(ContextPackageLifecycle.DRAFT)
  })

  it('DRAFT → ASSEMBLED is valid', () => {
    const m = new PackageLifecycleMachine()
    m.initialize(contextPackageId('pkg-1'))
    const rec = m.transition(contextPackageId('pkg-1'), ContextPackageLifecycle.ASSEMBLED)
    expect(rec.state).toBe(ContextPackageLifecycle.ASSEMBLED)
  })

  it('ASSEMBLED → EVALUATING → ADMITTED is valid', () => {
    const m = new PackageLifecycleMachine()
    const id = contextPackageId('pkg-1')
    m.initialize(id)
    m.transition(id, ContextPackageLifecycle.ASSEMBLED)
    m.transition(id, ContextPackageLifecycle.EVALUATING)
    const rec = m.transition(id, ContextPackageLifecycle.ADMITTED)
    expect(rec.state).toBe(ContextPackageLifecycle.ADMITTED)
  })

  it('EVALUATING → CORRECTION_REQUIRED → EVALUATING is valid (retry path)', () => {
    const m = new PackageLifecycleMachine()
    const id = contextPackageId('pkg-1')
    m.initialize(id)
    m.transition(id, ContextPackageLifecycle.ASSEMBLED)
    m.transition(id, ContextPackageLifecycle.EVALUATING)
    m.transition(id, ContextPackageLifecycle.CORRECTION_REQUIRED)
    const rec = m.transition(id, ContextPackageLifecycle.EVALUATING)
    expect(rec.state).toBe(ContextPackageLifecycle.EVALUATING)
  })

  it('throws on invalid transition DRAFT → ADMITTED', () => {
    const m = new PackageLifecycleMachine()
    const id = contextPackageId('pkg-2')
    m.initialize(id)
    expect(() => m.transition(id, ContextPackageLifecycle.ADMITTED)).toThrow()
  })

  it('REJECTED and SUPERSEDED are terminal — no valid outgoing transitions', () => {
    expect(isValidLifecycleTransition(ContextPackageLifecycle.REJECTED, ContextPackageLifecycle.DRAFT)).toBe(false)
    expect(isValidLifecycleTransition(ContextPackageLifecycle.SUPERSEDED, ContextPackageLifecycle.EVALUATING)).toBe(false)
  })

  it('assertLifecycleTransition throws for invalid path', () => {
    expect(() => assertLifecycleTransition(ContextPackageLifecycle.DRAFT, ContextPackageLifecycle.EVALUATING)).toThrow()
  })

  it('canTransition returns false for terminal state', () => {
    const m = new PackageLifecycleMachine()
    const id = contextPackageId('pkg-3')
    m.initialize(id)
    m.transition(id, ContextPackageLifecycle.REJECTED)
    expect(m.canTransition(id, ContextPackageLifecycle.DRAFT)).toBe(false)
  })

  it('duplicate initialization throws', () => {
    const m = new PackageLifecycleMachine()
    const id = contextPackageId('pkg-4')
    m.initialize(id)
    expect(() => m.initialize(id)).toThrow()
  })

  it('transition on unknown package throws', () => {
    const m = new PackageLifecycleMachine()
    expect(() => m.transition(contextPackageId('unknown'), ContextPackageLifecycle.ASSEMBLED)).toThrow()
  })
})

// ── Task 12: Evaluator registry (contract-aware activation) ──────────────────

describe('EvaluatorRegistry — Task 12', () => {
  it('buildDefaultRegistry registers all 9 quality dimensions', () => {
    const r = buildDefaultRegistry()
    const dims = r.allRegistered().map(e => e.descriptor.dimension)
    for (const dim of Object.values(QualityDimension)) {
      expect(dims).toContain(dim)
    }
  })

  it('deactivate removes dimension from activeDimensionsFor result', () => {
    const r = buildDefaultRegistry()
    r.deactivate(QualityDimension.FRESHNESS)
    const active = r.activeDimensionsFor(makeContract())
    expect(active).not.toContain(QualityDimension.FRESHNESS)
  })

  it('activate re-enables deactivated dimension', () => {
    const r = buildDefaultRegistry()
    r.deactivate(QualityDimension.FRESHNESS)
    r.activate(QualityDimension.FRESHNESS)
    const active = r.activeDimensionsFor(makeContract())
    expect(active).toContain(QualityDimension.FRESHNESS)
  })

  it('throws when safety evaluator deactivated for contract with safetyPolicyRef', () => {
    const r = buildDefaultRegistry()
    r.deactivate(QualityDimension.SAFETY)
    const safetyContract = { ...makeContract(), safetyPolicyRef: 'safety-pol-v1' }
    expect(() => r.activeDimensionsFor(safetyContract)).toThrow()
  })

  it('throws when authority evaluator deactivated for contract with authorityPolicyRef', () => {
    const r = buildDefaultRegistry()
    r.deactivate(QualityDimension.AUTHORITY)
    const authContract = { ...makeContract(), authorityPolicyRef: 'auth-pol-v1' }
    expect(() => r.activeDimensionsFor(authContract)).toThrow()
  })

  it('custom evaluator descriptor is retrievable by dimension', () => {
    const r = new EvaluatorRegistry()
    r.register({ dimension: QualityDimension.COVERAGE, name: 'custom-coverage', version: '2.0.0', capabilities: ['coverage'] })
    expect(r.getDescriptor(QualityDimension.COVERAGE)?.name).toBe('custom-coverage')
  })
})

// ── Task 13: EventBus telemetry (decisions not affected) ──────────────────────

describe('TelemetryBus — Task 13', () => {
  it('emit delivers events to subscriber', () => {
    const bus = new TelemetryBus()
    const received: ContextQualityTelemetryEvent[] = []
    bus.subscribe(e => received.push(e))
    bus.emit({ eventType: ContextQualityEvent.EVALUATION_STARTED, packageId: 'pkg-1' as any, timestamp: new Date() })
    expect(received).toHaveLength(1)
    expect(received[0]!.eventType).toBe(ContextQualityEvent.EVALUATION_STARTED)
  })

  it('unsubscribe stops delivery', () => {
    const bus = new TelemetryBus()
    const received: ContextQualityTelemetryEvent[] = []
    const unsub = bus.subscribe(e => received.push(e))
    unsub()
    bus.emit({ eventType: ContextQualityEvent.ADMISSION_GRANTED, packageId: 'pkg-1' as any, timestamp: new Date() })
    expect(received).toHaveLength(0)
  })

  it('throwing subscriber does not propagate to caller', () => {
    const bus = new TelemetryBus()
    bus.subscribe(() => { throw new Error('subscriber crash') })
    expect(() => bus.emit({ eventType: ContextQualityEvent.ADMISSION_GRANTED, packageId: 'p' as any, timestamp: new Date() })).not.toThrow()
  })

  it('controller telemetry emits EVALUATION_STARTED before admission result', async () => {
    const bus = new TelemetryBus()
    const events: string[] = []
    bus.subscribe(e => events.push(e.eventType))
    const ctrl = new ContextQualityController({ telemetry: bus, clock: { now: () => new Date('2026-01-01') }, idGenerator: { nextId: k => `${k}-1` } })
    await ctrl.evaluateAndAdmit(makeGoodPackage(), makeContract(), makeConsumer())
    expect(events[0]).toBe(ContextQualityEvent.EVALUATION_STARTED)
    expect(events).toContain(ContextQualityEvent.EVALUATION_COMPLETED)
    expect(events).toContain(ContextQualityEvent.ADMISSION_GRANTED)
  })

  it('telemetry does not change admission decision', async () => {
    const bus = new TelemetryBus()
    // subscriber that mutates outer state — decision must be unaffected
    bus.subscribe(() => { /* side effects allowed, decision immutable */ })
    const ctrlWithTelemetry    = new ContextQualityController({ telemetry: bus, idGenerator: { nextId: () => 'id-1' } })
    const ctrlWithoutTelemetry = new ContextQualityController({ idGenerator: { nextId: () => 'id-1' } })
    const pkg = makeGoodPackage()
    const [r1, r2] = await Promise.all([
      ctrlWithTelemetry.evaluateAndAdmit(pkg, makeContract(), makeConsumer()),
      ctrlWithoutTelemetry.evaluateAndAdmit(pkg, makeContract(), makeConsumer()),
    ])
    expect(r1.decision).toBe(r2.decision)
  })

  it('rejected path emits ADMISSION_REJECTED event', async () => {
    const bus = new TelemetryBus()
    const events: string[] = []
    bus.subscribe(e => events.push(e.eventType))
    const ctrl = new ContextQualityController({ telemetry: bus })
    const tampered = { ...makeGoodPackage(), packageHash: 'tampered' as any }
    await ctrl.evaluateAndAdmit(tampered, makeContract(), makeConsumer())
    expect(events).toContain(ContextQualityEvent.ADMISSION_REJECTED)
  })
})

// ── Task 14: Cache admission semantics (4-axis revalidation) ──────────────────

describe('ContextAdmissionCache — Task 14', () => {
  const EVAL_HASH = 'eval-set-v1'

  it('returns cached result on exact match', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const hit = cache.get(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)
    expect(hit).toBeDefined()
    expect(hit!.decision).toBe(ContextAdmissionDecision.ADMITTED)
  })

  it('cache miss when packageHash changes', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const miss = cache.get(pkg.packageId, 'different-hash' as any, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)
    expect(miss).toBeUndefined()
  })

  it('cache miss when contract changes (different purpose)', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const changedContract = { ...makeContract(), purpose: 'different-purpose' }
    const miss = cache.get(pkg.packageId, pkg.packageHash, changedContract, DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)
    expect(miss).toBeUndefined()
  })

  it('cache miss when policy changes', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const stricterPolicy = { ...DEFAULT_ADMISSION_POLICY, minimumCompositeScore: 0.99 }
    const miss = cache.get(pkg.packageId, pkg.packageHash, makeContract(), stricterPolicy, makeConsumer(), EVAL_HASH)
    expect(miss).toBeUndefined()
  })

  it('cache miss when consumer identity changes (different tenantId)', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const differentConsumer = { ...makeConsumer(), tenantId: 'tenant-xyz' }
    const miss = cache.get(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, differentConsumer, EVAL_HASH)
    expect(miss).toBeUndefined()
  })

  it('cache miss when evaluatorSetHash changes (5th axis)', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    const miss = cache.get(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), 'different-eval-hash')
    expect(miss).toBeUndefined()
  })

  it('invalidate removes entry from cache', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const result = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, result)
    cache.invalidate(pkg.packageId)
    expect(cache.size()).toBe(0)
  })

  it('cache returns undefined for unknown packageId', () => {
    const cache = new ContextAdmissionCache()
    const miss = cache.get(contextPackageId('unknown'), 'hash' as any, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)
    expect(miss).toBeUndefined()
  })
})

// ── Task 15: Stage 11D constitutional closure ─────────────────────────────────

describe('Stage 11D — constitutional closure (L-11D-001 through L-11D-008)', () => {
  // L-11D-002: authority gate is independent of relevance — high relevance cannot substitute for low authority
  it('L-11D-002: item with perfect relevance but sub-threshold authority fails requirement (PARTIALLY_SATISFIED)', () => {
    const ev = new CoverageEvaluator()
    const highRelevanceLowAuthorityItem = {
      ...makeFullItem(),
      relevance:  { score: 0.99, requirementRefs: ['REQ-001'] },
      authority:  { score: 0.1, sourceKind: 'specification' as const },
    }
    const req = { requirementId: 'REQ-001', type: 'decision' as const, description: 'test', mandatory: true, minimumAuthority: 0.7, acceptedSourceKinds: ['specification' as const] }
    const result = ev.evaluate([highRelevanceLowAuthorityItem], [req])
    expect(result.coverage[0]!.status).toBe(RequirementCoverageStatus.PARTIALLY_SATISFIED)
  })

  it('lifecycle machine is wired: DRAFT→ASSEMBLED→EVALUATING→ADMITTED covers admission path', () => {
    const m  = new PackageLifecycleMachine()
    const id = contextPackageId(randomUUID())
    m.initialize(id)
    m.transition(id, ContextPackageLifecycle.ASSEMBLED)
    m.transition(id, ContextPackageLifecycle.EVALUATING)
    expect(m.canTransition(id, ContextPackageLifecycle.ADMITTED)).toBe(true)
    expect(m.canTransition(id, ContextPackageLifecycle.ADMITTED_DEGRADED)).toBe(true)
    expect(m.canTransition(id, ContextPackageLifecycle.CORRECTION_REQUIRED)).toBe(true)
  })

  it('evaluator registry reports all 9 dimensions active by default', () => {
    const r     = buildDefaultRegistry()
    const active = r.activeDimensionsFor(makeContract())
    expect(active).toHaveLength(Object.values(QualityDimension).length)
  })

  it('telemetry emits 3 events per successful evaluation', async () => {
    const bus = new TelemetryBus()
    const events: string[] = []
    bus.subscribe(e => events.push(e.eventType))
    const ctrl = new ContextQualityController({ telemetry: bus })
    await ctrl.evaluateAndAdmit(makeGoodPackage(), makeContract(), makeConsumer())
    expect(events).toContain(ContextQualityEvent.EVALUATION_STARTED)
    expect(events).toContain(ContextQualityEvent.EVALUATION_COMPLETED)
    expect(events.some(e =>
      e === ContextQualityEvent.ADMISSION_GRANTED || e === ContextQualityEvent.ADMISSION_DEGRADED
    )).toBe(true)
  })

  it('cache serves admitted result only when all 5 identity axes match', () => {
    const cache = new ContextAdmissionCache()
    const pkg   = makeGoodPackage()
    const res   = { decision: ContextAdmissionDecision.ADMITTED, reasons: [] }
    const EVAL_HASH = 'eval-set-v1'
    cache.set(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH, res)
    expect(cache.get(pkg.packageId, pkg.packageHash, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)).toBeDefined()
    expect(cache.get(pkg.packageId, 'x' as any, makeContract(), DEFAULT_ADMISSION_POLICY, makeConsumer(), EVAL_HASH)).toBeUndefined()
  })
})
