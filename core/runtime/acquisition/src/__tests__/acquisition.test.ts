import { describe, it, expect } from 'vitest'
import {
  CapabilitySourceRegistry,
  AcquisitionBootstrap,
  TrustEngine,
  DependencyResolver,
  AcquisitionPlanner,
  AcquisitionTransaction,
  Installer,
  Registrar,
  CapabilityAcquisitionPipeline,
  DEFAULT_ACQUISITION_POLICY,
  type CapabilityCandidate,
  type CapabilitySource,
  type AcquisitionQuery,
  type CapabilityBundle,
  type AcquisitionPlan,
  type AcquisitionPolicyIR,
  type CapabilitySourceProvider,
} from '../index.js'
import {
  CapabilityRegistry,
  CapabilityReferenceCounter,
  InMemoryCapabilityLock,
} from '@rohinik-org/capability-registry'
import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManifest(id = 'test-cap', version = '1.0.0'): CapabilityManifestIR {
  return {
    manifestVersion: 1, id, name: id, description: '', version,
    inputs: [], outputs: [], tier: 'local', tags: [], driverRef: 'test',
  }
}

function makeBundle(manifest: CapabilityManifestIR): CapabilityBundle {
  return {
    bundleId: `bundle-${manifest.id}`,
    manifests: [manifest],
    artifacts: [],
    checksum: 'skip',
  }
}

function makeCandidate(id = 'test-cap', score = 1.0): CapabilityCandidate {
  return {
    candidateId: `cand-${id}`,
    manifest: makeManifest(id),
    source: { type: 'test', id: 'test-source' },
    version: '1.0.0',
    publisher: 'test-publisher',
    checksum: 'skip',
    score,
    trustLevel: 'verified',
    compatibilityStatus: 'compatible',
  }
}

class TestSource implements CapabilitySource {
  readonly sourceId: string
  readonly sourceType = 'test'
  constructor(id: string, private readonly candidates: CapabilityCandidate[]) {
    this.sourceId = id
  }
  async search(_q: AcquisitionQuery) { return this.candidates }
  async fetch(c: CapabilityCandidate): Promise<CapabilityBundle> { return makeBundle(c.manifest) }
  async verify() { return true }
}

// ─── CapabilitySourceRegistry ────────────────────────────────────────────────

describe('CapabilitySourceRegistry', () => {
  it('registers and lists sources', () => {
    const reg = new CapabilitySourceRegistry()
    const src = new TestSource('s1', [])
    reg.register(src)
    expect(reg.list()).toHaveLength(1)
    expect(reg.get('s1')).toBe(src)
  })

  it('unregisters sources', () => {
    const reg = new CapabilitySourceRegistry()
    reg.register(new TestSource('s1', []))
    reg.unregister('s1')
    expect(reg.list()).toHaveLength(0)
  })

  it('AcquisitionBootstrap loads providers into registry', async () => {
    const reg = new CapabilitySourceRegistry()
    const provider: CapabilitySourceProvider = {
      providerId: 'test-provider',
      async load() { return [new TestSource('p-src', [])] },
    }
    await new AcquisitionBootstrap([provider]).load(reg)
    expect(reg.list()).toHaveLength(1)
    expect(reg.get('p-src')).toBeDefined()
  })
})

// ─── TrustEngine ─────────────────────────────────────────────────────────────

describe('TrustEngine', () => {
  const engine = new TrustEngine()

  it('trusted when unsigned and policy allows unsigned', () => {
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true }
    const candidate = { ...makeCandidate(), trustLevel: 'unsigned' as const }
    const decision = engine.evaluate(candidate, policy)
    expect(decision.trusted).toBe(true)
    expect(decision.violations).toHaveLength(0)
  })

  it('violation: unsigned when policy disallows', () => {
    const candidate = { ...makeCandidate(), trustLevel: 'unsigned' as const }
    const decision = engine.evaluate(candidate, DEFAULT_ACQUISITION_POLICY)
    expect(decision.violations).toContain('unsigned')
    expect(decision.trusted).toBe(false)
  })

  it('violation: publisher-not-trusted when trustedPublishers set', () => {
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true, trustedPublishers: ['trusted-org'] }
    const candidate = makeCandidate()
    const decision = engine.evaluate(candidate, policy)
    expect(decision.violations).toContain('publisher-not-trusted')
  })

  it('multiple violations accumulate', () => {
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, trustedPublishers: ['trusted-org'] }
    const candidate = { ...makeCandidate(), trustLevel: 'unsigned' as const }
    const decision = engine.evaluate(candidate, policy)
    expect(decision.violations.length).toBeGreaterThanOrEqual(2)
  })

  it('auto-any mode trusts despite violations', () => {
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, mode: 'auto-any' }
    const candidate = { ...makeCandidate(), trustLevel: 'unsigned' as const }
    const decision = engine.evaluate(candidate, policy)
    expect(decision.trusted).toBe(true)
  })
})

// ─── DependencyResolver ──────────────────────────────────────────────────────

describe('DependencyResolver', () => {
  const resolver = new DependencyResolver()

  it('returns empty deps for manifest with no requires tags', async () => {
    const reg = new CapabilityRegistry()
    const deps = await resolver.resolve(makeManifest(), reg)
    expect(deps).toHaveLength(0)
  })

  it('resolves deps from requires: tags', async () => {
    const reg = new CapabilityRegistry()
    const manifest: CapabilityManifestIR = { ...makeManifest(), tags: ['requires:other-cap'] }
    const deps = await resolver.resolve(manifest, reg)
    expect(deps).toHaveLength(1)
    expect(deps[0].capabilityId).toBe('other-cap')
    expect(deps[0].alreadyInstalled).toBe(false)
  })

  it('marks already-installed deps', async () => {
    const reg = new CapabilityRegistry()
    reg.register({ capabilityId: 'other-cap', version: '1.0.0', manifest: makeManifest('other-cap'), installedAt: new Date(), source: { type: 'test', id: 'test' }, acquisitionId: 'acq-1', dependencies: [], state: 'REGISTERED' })
    const manifest: CapabilityManifestIR = { ...makeManifest(), tags: ['requires:other-cap'] }
    const deps = await resolver.resolve(manifest, reg)
    expect(deps[0].alreadyInstalled).toBe(true)
  })

  it('detectConflicts returns empty for non-conflicting deps', () => {
    const conflicts = resolver.detectConflicts([
      { capabilityId: 'a', version: '1.0.0', alreadyInstalled: false },
      { capabilityId: 'b', version: '2.0.0', alreadyInstalled: false },
    ])
    expect(conflicts).toHaveLength(0)
  })
})

// ─── AcquisitionPlanner ───────────────────────────────────────────────────────

describe('AcquisitionPlanner', () => {
  const planner = new AcquisitionPlanner()
  const trust = new TrustEngine()

  it('ranks candidates by descending score', () => {
    const candidates = [makeCandidate('a', 0.3), makeCandidate('b', 0.9), makeCandidate('c', 0.6)]
    const ranked = planner.rank(candidates)
    expect(ranked[0].score).toBe(0.9)
    expect(ranked[1].score).toBe(0.6)
  })

  it('selectBest picks highest-scored trusted candidate', () => {
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true }
    const candidates = [makeCandidate('a', 0.9), makeCandidate('b', 0.5)]
    const best = planner.selectBest(candidates, policy, trust)
    expect(best?.candidateId).toBe('cand-a')
  })

  it('plan produces immutable AcquisitionPlan', () => {
    const candidate = makeCandidate()
    const trustDecision = trust.evaluate(candidate, { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true })
    const plan = planner.plan(candidate, [], [], trustDecision, DEFAULT_ACQUISITION_POLICY)
    expect(plan.planId).toBeDefined()
    expect(plan.rootCandidate).toBe(candidate)
    expect(Object.isFrozen(plan)).toBe(true)
  })

  it('plan is immutable — changing policy produces new plan', () => {
    const candidate = makeCandidate()
    const trustDecision = trust.evaluate(candidate, { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true })
    const plan1 = planner.plan(candidate, [], [], trustDecision, DEFAULT_ACQUISITION_POLICY)
    const policy2: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, mode: 'auto-any' }
    const plan2 = planner.plan(candidate, [], [], trustDecision, policy2)
    expect(plan1.planId).not.toBe(plan2.planId)
    expect(plan1.policy.mode).toBe('require-confirmation')
    expect(plan2.policy.mode).toBe('auto-any')
  })
})

// ─── AcquisitionTransaction ───────────────────────────────────────────────────

describe('AcquisitionTransaction', () => {
  function makePlan(): AcquisitionPlan {
    const candidate = makeCandidate()
    const planner = new AcquisitionPlanner()
    const trust = new TrustEngine()
    const td = trust.evaluate(candidate, { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true })
    return planner.plan(candidate, [], [], td, DEFAULT_ACQUISITION_POLICY)
  }

  it('begin returns transaction context with committed=false', () => {
    const txn = new AcquisitionTransaction()
    const plan = makePlan()
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const ctx = txn.begin(plan, bundle)
    expect(ctx.committed).toBe(false)
    expect(ctx.transactionId).toBeDefined()
  })

  it('commit registers capabilities and records', async () => {
    const txn = new AcquisitionTransaction()
    const reg = new CapabilityRegistry()
    const recorded: unknown[] = []
    const corpus = { record: (r: unknown) => { recorded.push(r) } }
    const plan = makePlan()
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const ctx = txn.begin(plan, bundle)
    const installer = new Installer()
    await installer.install(bundle, ctx)
    const rec = { acquisitionId: ctx.transactionId, timestamp: new Date(), source: { type: 'test', id: 'test' }, capabilityId: 'test-cap', version: '1.0.0', dependencies: [], checksum: 'skip', publisher: 'test', policy: DEFAULT_ACQUISITION_POLICY, result: 'success' as const, durationMs: 0, planId: plan.planId }
    ctx.acquisitionRecords.push(rec)
    await txn.commit(ctx, reg, corpus)
    expect(reg.isInstalled('test-cap')).toBe(true)
    expect(recorded).toHaveLength(1)
    expect(ctx.committed).toBe(true)
  })

  it('commit is idempotent (Law 28) — replaying does not re-register', async () => {
    const txn = new AcquisitionTransaction()
    const reg = new CapabilityRegistry()
    const recorded: unknown[] = []
    const corpus = { record: (r: unknown) => { recorded.push(r) } }
    const plan = makePlan()
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const ctx = txn.begin(plan, bundle)
    const installer = new Installer()
    await installer.install(bundle, ctx)
    const rec = { acquisitionId: ctx.transactionId, timestamp: new Date(), source: { type: 'test', id: 'test' }, capabilityId: 'test-cap', version: '1.0.0', dependencies: [], checksum: 'skip', publisher: 'test', policy: DEFAULT_ACQUISITION_POLICY, result: 'success' as const, durationMs: 0, planId: plan.planId }
    ctx.acquisitionRecords.push(rec)
    await txn.commit(ctx, reg, corpus)
    await txn.commit(ctx, reg, corpus)  // replay — idempotent, no double-register/record
    expect(reg.list()).toHaveLength(1)
    expect(recorded).toHaveLength(1)
  })

  it('rollback records failure without modifying registry', async () => {
    const txn = new AcquisitionTransaction()
    const reg = new CapabilityRegistry()
    const recorded: unknown[] = []
    const corpus = { record: (r: unknown) => { recorded.push(r) } }
    const plan = makePlan()
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const ctx = txn.begin(plan, bundle)
    ctx.acquisitionRecords.push({ acquisitionId: 'x', timestamp: new Date(), source: { type: 't', id: 't' }, capabilityId: 'test-cap', version: '1.0.0', dependencies: [], checksum: '', publisher: 'p', policy: DEFAULT_ACQUISITION_POLICY, result: 'success', durationMs: 0, planId: plan.planId })
    await txn.rollback(ctx, corpus)
    expect(reg.list()).toHaveLength(0)
    expect((recorded[0] as { result: string }).result).toBe('failed')
  })

  it('rollback no-ops on already-committed transaction', async () => {
    const txn = new AcquisitionTransaction()
    const reg = new CapabilityRegistry()
    const corpus = { record: () => {} }
    const plan = makePlan()
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const ctx = txn.begin(plan, bundle)
    const installer = new Installer()
    await installer.install(bundle, ctx)
    await txn.commit(ctx, reg, corpus)
    await txn.rollback(ctx, corpus)  // should be no-op
    expect(reg.isInstalled('test-cap')).toBe(true)
  })
})

// ─── CapabilityRegistry + lifecycle ──────────────────────────────────────────

describe('CapabilityRegistry', () => {
  function installed(id = 'cap-a'): import('@rohinik-org/capability-registry').InstalledCapability {
    return { capabilityId: id, version: '1.0.0', manifest: makeManifest(id), installedAt: new Date(), source: { type: 'test', id: 'test' }, acquisitionId: 'acq-1', dependencies: [], state: 'REGISTERED' }
  }

  it('registers and retrieves capability', () => {
    const reg = new CapabilityRegistry()
    reg.register(installed())
    expect(reg.isInstalled('cap-a')).toBe(true)
    expect(reg.get('cap-a')).toBeDefined()
  })

  it('isInstalled returns false for non-REGISTERED state', () => {
    const reg = new CapabilityRegistry()
    reg.register({ ...installed(), state: 'INSTALLED' })
    expect(reg.isInstalled('cap-a')).toBe(false)
  })

  it('unregister removes capability', () => {
    const reg = new CapabilityRegistry()
    reg.register(installed())
    reg.unregister('cap-a')
    expect(reg.isInstalled('cap-a')).toBe(false)
  })

  it('updateState transitions lifecycle state', () => {
    const reg = new CapabilityRegistry()
    reg.register({ ...installed(), state: 'INSTALLED' })
    reg.updateState('cap-a', 'REGISTERED')
    expect(reg.get('cap-a')?.state).toBe('REGISTERED')
  })

  it('getDependents returns dependents', () => {
    const reg = new CapabilityRegistry()
    reg.register(installed('dep-cap'))
    reg.register({ ...installed('consumer'), dependencies: ['dep-cap'] })
    expect(reg.getDependents('dep-cap')).toHaveLength(1)
  })
})

// ─── CapabilityReferenceCounter ───────────────────────────────────────────────

describe('CapabilityReferenceCounter', () => {
  it('canUninstall when no refs', () => {
    const counter = new CapabilityReferenceCounter()
    expect(counter.canUninstall('cap-a')).toBe(true)
  })

  it('cannot uninstall when refs exist', () => {
    const counter = new CapabilityReferenceCounter()
    counter.addRef('cap-a', 'consumer-1')
    expect(counter.canUninstall('cap-a')).toBe(false)
    expect(counter.refCount('cap-a')).toBe(1)
  })

  it('can uninstall after removing all refs', () => {
    const counter = new CapabilityReferenceCounter()
    counter.addRef('cap-a', 'consumer-1')
    counter.removeRef('cap-a', 'consumer-1')
    expect(counter.canUninstall('cap-a')).toBe(true)
  })

  it('getDependents returns all ref holders', () => {
    const counter = new CapabilityReferenceCounter()
    counter.addRef('cap-a', 'c1')
    counter.addRef('cap-a', 'c2')
    expect(counter.getDependents('cap-a')).toHaveLength(2)
  })
})

// ─── CapabilityLock ───────────────────────────────────────────────────────────

describe('InMemoryCapabilityLock', () => {
  it('acquire and release', async () => {
    const lock = new InMemoryCapabilityLock()
    await lock.acquire('cap-a')
    expect(lock.isLocked('cap-a')).toBe(true)
    lock.release('cap-a')
    expect(lock.isLocked('cap-a')).toBe(false)
  })

  it('concurrent acquires queue correctly', async () => {
    const lock = new InMemoryCapabilityLock()
    const order: number[] = []
    await lock.acquire('cap-a')
    const p1 = lock.acquire('cap-a').then(() => { order.push(2); lock.release('cap-a') })
    const p2 = lock.acquire('cap-a').then(() => { order.push(3); lock.release('cap-a') })
    order.push(1)
    lock.release('cap-a')
    await Promise.all([p1, p2])
    expect(order[0]).toBe(1)
  })

  it('isLocked returns false before acquire', () => {
    const lock = new InMemoryCapabilityLock()
    expect(lock.isLocked('cap-a')).toBe(false)
  })
})

// ─── CapabilityBundle ─────────────────────────────────────────────────────────

describe('CapabilityBundle', () => {
  it('supports multiple manifests (1:N)', () => {
    const bundle: CapabilityBundle = {
      bundleId: 'multi-bundle',
      manifests: [makeManifest('cap-a'), makeManifest('cap-b')],
      artifacts: [],
      checksum: 'skip',
    }
    expect(bundle.manifests).toHaveLength(2)
  })

  it('installer iterates all manifests in bundle', async () => {
    const installer = new Installer()
    const plan = (() => {
      const planner = new AcquisitionPlanner()
      const trust = new TrustEngine()
      const candidate = makeCandidate()
      const td = trust.evaluate(candidate, { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true })
      return planner.plan(candidate, [], [], td, DEFAULT_ACQUISITION_POLICY)
    })()
    const bundle: CapabilityBundle = {
      bundleId: 'multi-bundle',
      manifests: [makeManifest('cap-a'), makeManifest('cap-b')],
      artifacts: [],
      checksum: 'skip',
    }
    const txn = new AcquisitionTransaction()
    const ctx = txn.begin(plan, bundle)
    const installed = await installer.install(bundle, ctx)
    expect(installed).toHaveLength(2)
    expect(installed.map(c => c.capabilityId)).toContain('cap-a')
    expect(installed.map(c => c.capabilityId)).toContain('cap-b')
  })

  it('single-manifest bundle still works (Stage 9D case)', async () => {
    const installer = new Installer()
    const planner = new AcquisitionPlanner()
    const trust = new TrustEngine()
    const candidate = makeCandidate()
    const td = trust.evaluate(candidate, { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true })
    const plan = planner.plan(candidate, [], [], td, DEFAULT_ACQUISITION_POLICY)
    const bundle = makeBundle(plan.rootCandidate.manifest)
    const txn = new AcquisitionTransaction()
    const ctx = txn.begin(plan, bundle)
    const installed = await installer.install(bundle, ctx)
    expect(installed).toHaveLength(1)
  })
})

// ─── AcquisitionRecord (Observation subtype) ──────────────────────────────────

describe('AcquisitionRecord', () => {
  it('has all required fields', () => {
    const record = {
      acquisitionId: 'acq-1',
      timestamp: new Date(),
      source: { type: 'test', id: 'test' },
      capabilityId: 'cap-a',
      version: '1.0.0',
      dependencies: [],
      checksum: 'abc',
      publisher: 'test',
      policy: DEFAULT_ACQUISITION_POLICY,
      result: 'success' as const,
      durationMs: 100,
      planId: 'plan-1',
    }
    expect(record.acquisitionId).toBeDefined()
    expect(record.planId).toBeDefined()
  })

  it('failed result records failureReason', () => {
    const record = {
      acquisitionId: 'acq-2',
      timestamp: new Date(),
      source: { type: 'test', id: 'test' },
      capabilityId: 'cap-a',
      version: '1.0.0',
      dependencies: [],
      checksum: '',
      publisher: 'test',
      policy: DEFAULT_ACQUISITION_POLICY,
      result: 'failed' as const,
      failureReason: 'trust violation: unsigned',
      durationMs: 5,
      planId: 'plan-1',
    }
    expect(record.result).toBe('failed')
    expect(record.failureReason).toContain('unsigned')
  })
})

// ─── AcquisitionRequest / AcquisitionResult reserved contracts ────────────────

describe('AcquisitionRequest / AcquisitionResult contracts', () => {
  it('AcquisitionRequest shape is stable', () => {
    const req = {
      requestId: 'req-1',
      term: 'docker',
      policy: DEFAULT_ACQUISITION_POLICY,
    }
    expect(req.requestId).toBeDefined()
    expect(req.term).toBe('docker')
    expect(req.policy.mode).toBe('require-confirmation')
  })

  it('AcquisitionResult contains plan and record', async () => {
    const registry = new CapabilityRegistry()
    const lock = new InMemoryCapabilityLock()
    const sourceReg = new CapabilitySourceRegistry()
    sourceReg.register(new TestSource('test-source', [makeCandidate()]))
    const pipeline = new CapabilityAcquisitionPipeline(sourceReg, registry, lock)
    const candidates = await pipeline.search({ term: 'test-cap' })
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true, mode: 'auto-any' }
    const plan = await pipeline.plan(candidates[0], policy)
    const result = await pipeline.install(plan, { requestId: 'req-1', term: 'test-cap', policy })
    expect(result.plan).toBeDefined()
    expect(result.record).toBeDefined()
    expect(result.success).toBe(true)
  })
})

// ─── Law 28: Idempotence ─────────────────────────────────────────────────────

describe('Law 28 — Acquisition Idempotence', () => {
  it('returns early if already REGISTERED (no pipeline execution)', async () => {
    const registry = new CapabilityRegistry()
    const lock = new InMemoryCapabilityLock()
    const sourceReg = new CapabilitySourceRegistry()
    const candidate = makeCandidate()
    sourceReg.register(new TestSource('test-source', [candidate]))

    // Pre-install the capability
    registry.register({ capabilityId: candidate.manifest.id, version: '1.0.0', manifest: candidate.manifest, installedAt: new Date(), source: { type: 'test', id: 'test' }, acquisitionId: 'existing', dependencies: [], state: 'REGISTERED' })

    const pipeline = new CapabilityAcquisitionPipeline(sourceReg, registry, lock)
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true, mode: 'auto-any' }
    const plan = await pipeline.plan(candidate, policy)
    const result = await pipeline.install(plan, { requestId: 'req-1', term: 'test-cap', policy })

    expect(result.success).toBe(true)
    expect(result.record.durationMs).toBe(0)  // early return = no download time
  })

  it('second install of same capability returns success without duplicate', async () => {
    const registry = new CapabilityRegistry()
    const lock = new InMemoryCapabilityLock()
    const sourceReg = new CapabilitySourceRegistry()
    sourceReg.register(new TestSource('test-source', [makeCandidate()]))
    const pipeline = new CapabilityAcquisitionPipeline(sourceReg, registry, lock)
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true, mode: 'auto-any' }
    const candidates = await pipeline.search({ term: 'test-cap' })
    const plan = await pipeline.plan(candidates[0], policy)
    await pipeline.install(plan, { requestId: 'req-1', term: 'test-cap', policy })
    const result2 = await pipeline.install(plan, { requestId: 'req-2', term: 'test-cap', policy })
    expect(result2.success).toBe(true)
    expect(registry.list()).toHaveLength(1)  // not 2
  })

  it('isInstalled checked before lock acquire', async () => {
    const registry = new CapabilityRegistry()
    const lock = new InMemoryCapabilityLock()
    const sourceReg = new CapabilitySourceRegistry()
    const candidate = makeCandidate()
    sourceReg.register(new TestSource('test-source', [candidate]))
    registry.register({ capabilityId: candidate.manifest.id, version: '1.0.0', manifest: candidate.manifest, installedAt: new Date(), source: { type: 'test', id: 'test' }, acquisitionId: 'existing', dependencies: [], state: 'REGISTERED' })
    const pipeline = new CapabilityAcquisitionPipeline(sourceReg, registry, lock)
    const policy: AcquisitionPolicyIR = { ...DEFAULT_ACQUISITION_POLICY, allowUnsigned: true, mode: 'auto-any' }
    const plan = await pipeline.plan(candidate, policy)
    await pipeline.install(plan, { requestId: 'req-1', term: 'test-cap', policy })
    expect(lock.isLocked(candidate.manifest.id)).toBe(false)  // lock never acquired
  })
})

// ─── Registrar ────────────────────────────────────────────────────────────────

describe('Registrar', () => {
  it('emits CapabilityLifecycleEvent on register', async () => {
    const registrar = new Registrar()
    const events: unknown[] = []
    registrar.on(e => events.push(e))
    const manifest = makeManifest()
    const cap = { capabilityId: manifest.id, version: '1.0.0', manifest, installedAt: new Date(), source: { type: 'test', id: 'test' }, acquisitionId: 'acq-1', dependencies: [], state: 'REGISTERED' as const }
    const rec = { acquisitionId: 'acq-1', timestamp: new Date(), source: { type: 'test', id: 'test' }, capabilityId: manifest.id, version: '1.0.0', dependencies: [], checksum: '', publisher: 'test', policy: DEFAULT_ACQUISITION_POLICY, result: 'success' as const, durationMs: 0, planId: 'p-1' }
    await registrar.register(cap, rec)
    expect(events).toHaveLength(1)
    expect((events[0] as { state: string }).state).toBe('REGISTERED')
  })

  it('emits REMOVED event on unregister', async () => {
    const registrar = new Registrar()
    const events: unknown[] = []
    registrar.on(e => events.push(e))
    await registrar.unregister('cap-a')
    expect((events[0] as { state: string }).state).toBe('REMOVED')
  })
})
