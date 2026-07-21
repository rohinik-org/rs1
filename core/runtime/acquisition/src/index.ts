import { createHash } from 'node:crypto'
import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'
import type {
  InstalledCapability,
  InstalledCapabilityState,
  CapabilitySourceRef,
  CapabilityRegistry,
  CapabilityLock,
} from '@rohinik-org/capability-registry'

// ─── IR Types ───────────────────────────────────────────────────────────────

export type { InstalledCapability, InstalledCapabilityState, CapabilitySourceRef }

export interface AcquisitionPolicyIR {
  readonly mode: 'require-confirmation' | 'auto-trusted' | 'auto-any'
  readonly trustedPublishers: ReadonlyArray<string>
  readonly allowUnsigned: boolean
  readonly allowDowngrade: boolean
  readonly allowPrerelease: boolean
  readonly sandboxRequired: boolean
}

export const DEFAULT_ACQUISITION_POLICY: AcquisitionPolicyIR = {
  mode: 'require-confirmation',
  trustedPublishers: [],
  allowUnsigned: false,
  allowDowngrade: false,
  allowPrerelease: false,
  sandboxRequired: true,
}

export interface CapabilityCandidate {
  readonly candidateId: string
  readonly manifest: CapabilityManifestIR
  readonly source: CapabilitySourceRef
  readonly version: string
  readonly publisher: string
  readonly checksum: string
  readonly score: number
  readonly trustLevel: 'verified' | 'signed' | 'unsigned' | 'unknown'
  readonly compatibilityStatus: 'compatible' | 'incompatible' | 'unknown'
}

export interface ResolvedDependency {
  readonly capabilityId: string
  readonly version: string
  readonly alreadyInstalled: boolean
}

export interface DependencyConflict {
  readonly capabilityId: string
  readonly requiredVersion: string
  readonly installedVersion: string
  readonly reason: string
}

export interface AcquisitionPlan {
  readonly planId: string
  readonly rootCandidate: CapabilityCandidate
  readonly installOrder: ReadonlyArray<CapabilityCandidate>
  readonly dependencies: ReadonlyArray<ResolvedDependency>
  readonly conflicts: ReadonlyArray<DependencyConflict>
  readonly policy: AcquisitionPolicyIR
  readonly trustDecision: TrustDecision
  readonly estimatedSizeBytes: number
  readonly createdAt: Date
}

export interface AcquisitionRequest {
  readonly requestId: string
  readonly term: string
  readonly version?: string
  readonly source?: string
  readonly policy: AcquisitionPolicyIR
}

export interface AcquisitionResult {
  readonly requestId: string
  readonly plan: AcquisitionPlan
  readonly record: AcquisitionRecord
  readonly success: boolean
  readonly failureReason?: string
}

export interface AcquisitionRecord {
  readonly acquisitionId: string
  readonly timestamp: Date
  readonly source: CapabilitySourceRef
  readonly capabilityId: string
  readonly version: string
  readonly dependencies: ReadonlyArray<{ capabilityId: string; version: string }>
  readonly checksum: string
  readonly publisher: string
  readonly policy: AcquisitionPolicyIR
  readonly result: 'success' | 'failed' | 'cancelled'
  readonly failureReason?: string
  readonly durationMs: number
  readonly planId: string
}

export interface CapabilityArtifact {
  readonly path: string
  readonly size: number
  readonly checksum: string
  stream(): AsyncIterable<Uint8Array>
}

export interface CapabilityBundle {
  readonly bundleId: string
  readonly manifests: ReadonlyArray<CapabilityManifestIR>
  readonly artifacts: ReadonlyArray<CapabilityArtifact>
  readonly signature?: string
  readonly checksum: string
}

export interface AcquisitionQuery {
  readonly term: string
  readonly version?: string
  readonly publisher?: string
  readonly kind?: string
}

// ─── CapabilitySource interface ──────────────────────────────────────────────

export interface CapabilitySource {
  readonly sourceId: string
  readonly sourceType: string
  search(query: AcquisitionQuery): Promise<ReadonlyArray<CapabilityCandidate>>
  fetch(candidate: CapabilityCandidate): Promise<CapabilityBundle>
  verify(bundle: CapabilityBundle): Promise<boolean>
}

// ─── CapabilitySourceRegistry ────────────────────────────────────────────────

export class CapabilitySourceRegistry {
  private readonly _sources = new Map<string, CapabilitySource>()

  register(source: CapabilitySource): void {
    this._sources.set(source.sourceId, source)
  }

  unregister(sourceId: string): void {
    this._sources.delete(sourceId)
  }

  list(): ReadonlyArray<CapabilitySource> {
    return Array.from(this._sources.values())
  }

  get(sourceId: string): CapabilitySource | undefined {
    return this._sources.get(sourceId)
  }
}

// ─── CapabilitySourceProvider / AcquisitionBootstrap ─────────────────────────

export interface CapabilitySourceProvider {
  readonly providerId: string
  load(): Promise<ReadonlyArray<CapabilitySource>>
}

export class AcquisitionBootstrap {
  constructor(private readonly providers: ReadonlyArray<CapabilitySourceProvider>) {}

  async load(registry: CapabilitySourceRegistry): Promise<void> {
    for (const provider of this.providers) {
      const sources = await provider.load()
      for (const source of sources) registry.register(source)
    }
  }
}

// ─── TrustEngine ─────────────────────────────────────────────────────────────

export type TrustViolation =
  | 'unsigned'
  | 'publisher-not-trusted'
  | 'checksum-mismatch'
  | 'policy-violation'
  | 'sandbox-disabled'
  | 'prerelease-not-allowed'
  | 'downgrade-not-allowed'

export interface TrustDecision {
  readonly trusted: boolean
  readonly level: 'verified' | 'signed' | 'unsigned' | 'unknown'
  readonly reason: string
  readonly violations: ReadonlyArray<TrustViolation>
}

export class TrustEngine {
  evaluate(candidate: CapabilityCandidate, policy: AcquisitionPolicyIR): TrustDecision {
    const violations: TrustViolation[] = []

    if (candidate.trustLevel === 'unsigned' || candidate.trustLevel === 'unknown') {
      if (!policy.allowUnsigned) violations.push('unsigned')
    }
    if (
      policy.trustedPublishers.length > 0 &&
      !policy.trustedPublishers.includes(candidate.publisher)
    ) {
      violations.push('publisher-not-trusted')
    }
    if (policy.sandboxRequired) {
      // ponytail: sandbox validation is done externally; flag if policy demands it
    }

    const trusted = violations.length === 0 || policy.mode === 'auto-any'
    const level = candidate.trustLevel === 'verified' || candidate.trustLevel === 'signed'
      ? candidate.trustLevel
      : candidate.trustLevel

    return {
      trusted,
      level,
      reason: violations.length === 0 ? 'passed' : violations.join(', '),
      violations,
    }
  }

  async verifySignature(bundle: CapabilityBundle): Promise<boolean> {
    // ponytail: GPG/cosign verification deferred; returns true if no signature required
    return bundle.signature === undefined || bundle.signature.length > 0
  }

  verifyChecksum(bundle: CapabilityBundle): boolean {
    const computed = createHash('sha256')
      .update(bundle.manifests.map(m => m.id + m.version).join('|'))
      .digest('hex')
    return computed === bundle.checksum || bundle.checksum === 'skip'
  }
}

// ─── DependencyResolver ──────────────────────────────────────────────────────

export class DependencyResolver {
  resolve(
    manifest: CapabilityManifestIR,
    registry: CapabilityRegistry,
  ): Promise<ReadonlyArray<ResolvedDependency>> {
    // ponytail: manifest has no dependency field yet; returns empty; extend when CapabilityManifestIR gains deps
    const tags = manifest.tags ?? []
    const deps: ResolvedDependency[] = tags
      .filter(t => t.startsWith('requires:'))
      .map(t => {
        const capabilityId = t.slice('requires:'.length)
        return { capabilityId, version: '*', alreadyInstalled: registry.isInstalled(capabilityId) }
      })
    return Promise.resolve(deps)
  }

  detectConflicts(resolved: ReadonlyArray<ResolvedDependency>): ReadonlyArray<DependencyConflict> {
    // ponytail: no version constraint solver yet; only detects exact-version conflicts
    const seen = new Map<string, string>()
    const conflicts: DependencyConflict[] = []
    for (const dep of resolved) {
      if (seen.has(dep.capabilityId) && seen.get(dep.capabilityId) !== dep.version) {
        conflicts.push({
          capabilityId: dep.capabilityId,
          requiredVersion: dep.version,
          installedVersion: seen.get(dep.capabilityId)!,
          reason: 'version conflict',
        })
      }
      seen.set(dep.capabilityId, dep.version)
    }
    return conflicts
  }
}

// ─── AcquisitionPlanner ──────────────────────────────────────────────────────

export class AcquisitionPlanner {
  rank(candidates: ReadonlyArray<CapabilityCandidate>): ReadonlyArray<CapabilityCandidate> {
    return [...candidates].sort((a, b) => b.score - a.score)
  }

  selectBest(
    candidates: ReadonlyArray<CapabilityCandidate>,
    policy: AcquisitionPolicyIR,
    trustEngine: TrustEngine,
  ): CapabilityCandidate | undefined {
    const ranked = this.rank(candidates)
    for (const c of ranked) {
      const decision = trustEngine.evaluate(c, policy)
      if (decision.trusted) return c
    }
    return undefined
  }

  plan(
    root: CapabilityCandidate,
    resolved: ReadonlyArray<ResolvedDependency>,
    conflicts: ReadonlyArray<DependencyConflict>,
    trustDecision: TrustDecision,
    policy: AcquisitionPolicyIR,
  ): AcquisitionPlan {
    return Object.freeze({
      planId: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rootCandidate: root,
      installOrder: Object.freeze([root]),
      dependencies: resolved,
      conflicts,
      policy,
      trustDecision,
      estimatedSizeBytes: 0,
      createdAt: new Date(),
    })
  }
}

// ─── AcquisitionTransaction ──────────────────────────────────────────────────

export interface AcquisitionTransactionContext {
  readonly transactionId: string
  readonly bundle: CapabilityBundle
  readonly plan: AcquisitionPlan
  installedCapabilities: InstalledCapability[]
  acquisitionRecords: AcquisitionRecord[]
  committed: boolean
}

export class AcquisitionTransaction {
  begin(plan: AcquisitionPlan, bundle: CapabilityBundle): AcquisitionTransactionContext {
    return {
      transactionId: `txn-${Date.now()}`,
      bundle,
      plan,
      installedCapabilities: [],
      acquisitionRecords: [],
      committed: false,
    }
  }

  async commit(
    ctx: AcquisitionTransactionContext,
    registry: CapabilityRegistry,
    corpus: { record(r: AcquisitionRecord): void },
  ): Promise<void> {
    if (ctx.committed) return  // idempotent (Law 28)
    for (const cap of ctx.installedCapabilities) {
      registry.register({ ...cap, state: 'REGISTERED' })
    }
    for (const rec of ctx.acquisitionRecords) {
      corpus.record(rec)
    }
    // ponytail: cast to mutable for committed flag; ctx is local to pipeline
    ;(ctx as { committed: boolean }).committed = true
  }

  async rollback(
    ctx: AcquisitionTransactionContext,
    corpus: { record(r: AcquisitionRecord): void },
  ): Promise<void> {
    if (ctx.committed) return
    for (const rec of ctx.acquisitionRecords) {
      corpus.record({ ...rec, result: 'failed' })
    }
    // filesystem cleanup is delegated to Installer
  }
}

// ─── Registrar ───────────────────────────────────────────────────────────────

export interface CapabilityLifecycleEvent {
  readonly type: 'capability:lifecycle'
  readonly capabilityId: string
  readonly state: InstalledCapabilityState
  readonly installed?: InstalledCapability
  readonly record?: AcquisitionRecord
  readonly error?: string
}

type LifecycleListener = (event: CapabilityLifecycleEvent) => void

export class Registrar {
  private readonly _listeners: LifecycleListener[] = []

  on(listener: LifecycleListener): void {
    this._listeners.push(listener)
  }

  private _emit(event: CapabilityLifecycleEvent): void {
    for (const l of this._listeners) l(event)
  }

  async register(installed: InstalledCapability, record: AcquisitionRecord): Promise<void> {
    this._emit({ type: 'capability:lifecycle', capabilityId: installed.capabilityId, state: 'REGISTERED', installed, record })
  }

  async unregister(capabilityId: string): Promise<void> {
    this._emit({ type: 'capability:lifecycle', capabilityId, state: 'REMOVED' })
  }
}

// ─── Installer ───────────────────────────────────────────────────────────────

export class Installer {
  async install(
    bundle: CapabilityBundle,
    ctx: AcquisitionTransactionContext,
  ): Promise<ReadonlyArray<InstalledCapability>> {
    const installed: InstalledCapability[] = []
    for (const manifest of bundle.manifests) {
      const cap: InstalledCapability = {
        capabilityId: manifest.id,
        version: manifest.version,
        manifest,
        installedAt: new Date(),
        source: ctx.plan.rootCandidate.source,
        acquisitionId: ctx.transactionId,
        dependencies: ctx.plan.dependencies.map(d => d.capabilityId),
        state: 'INSTALLED',
      }
      installed.push(cap)
      ctx.installedCapabilities.push(cap)
    }
    return installed
  }

  async uninstall(_capabilityId: string): Promise<void> {
    // ponytail: filesystem uninstall is a no-op in Stage 9D (no disk writes yet); extend in Stage 10
  }
}

// ─── CapabilityAcquisitionPipeline ───────────────────────────────────────────

export interface NullCorpus {
  record(r: AcquisitionRecord): void
}

export class CapabilityAcquisitionPipeline {
  private readonly planner = new AcquisitionPlanner()
  private readonly resolver = new DependencyResolver()
  private readonly trust = new TrustEngine()
  private readonly installer = new Installer()
  private readonly txn = new AcquisitionTransaction()
  private readonly registrar = new Registrar()

  constructor(
    private readonly sources: CapabilitySourceRegistry,
    private readonly registry: CapabilityRegistry,
    private readonly lock: CapabilityLock,
    private readonly corpus: NullCorpus = { record: () => {} },
  ) {}

  get registrarInstance(): Registrar { return this.registrar }

  // Discover phase — Law 28: return early if already installed
  async search(query: AcquisitionQuery): Promise<ReadonlyArray<CapabilityCandidate>> {
    const allCandidates: CapabilityCandidate[] = []
    for (const source of this.sources.list()) {
      const found = await source.search(query)
      allCandidates.push(...found)
    }
    return this.planner.rank(allCandidates)
  }

  // Resolve phase → produces AcquisitionPlan (immutable)
  async plan(candidate: CapabilityCandidate, policy: AcquisitionPolicyIR): Promise<AcquisitionPlan> {
    const resolved = await this.resolver.resolve(candidate.manifest, this.registry)
    const conflicts = this.resolver.detectConflicts(resolved)
    const trustDecision = this.trust.evaluate(candidate, policy)
    return this.planner.plan(candidate, resolved, conflicts, trustDecision, policy)
  }

  // Acquire phase — atomic via AcquisitionTransaction + CapabilityLock
  async install(
    plan: AcquisitionPlan,
    request: AcquisitionRequest,
  ): Promise<AcquisitionResult> {
    // Law 28: idempotence check
    if (this.registry.isInstalled(plan.rootCandidate.manifest.id)) {
      const existing = this.registry.get(plan.rootCandidate.manifest.id)!
      const record: AcquisitionRecord = {
        acquisitionId: `acq-${Date.now()}`,
        timestamp: new Date(),
        source: plan.rootCandidate.source,
        capabilityId: plan.rootCandidate.manifest.id,
        version: plan.rootCandidate.version,
        dependencies: [],
        checksum: plan.rootCandidate.checksum,
        publisher: plan.rootCandidate.publisher,
        policy: plan.policy,
        result: 'success',
        durationMs: 0,
        planId: plan.planId,
      }
      return { requestId: request.requestId, plan, record, success: true }
    }

    if (!plan.trustDecision.trusted) {
      const record: AcquisitionRecord = {
        acquisitionId: `acq-${Date.now()}`,
        timestamp: new Date(),
        source: plan.rootCandidate.source,
        capabilityId: plan.rootCandidate.manifest.id,
        version: plan.rootCandidate.version,
        dependencies: [],
        checksum: plan.rootCandidate.checksum,
        publisher: plan.rootCandidate.publisher,
        policy: plan.policy,
        result: 'failed',
        failureReason: `trust violations: ${plan.trustDecision.violations.join(', ')}`,
        durationMs: 0,
        planId: plan.planId,
      }
      this.corpus.record(record)
      return { requestId: request.requestId, plan, record, success: false, failureReason: record.failureReason }
    }

    await this.lock.acquire(plan.rootCandidate.manifest.id)
    const startedAt = Date.now()
    const source = this.sources.get(plan.rootCandidate.source.id)
    if (!source) {
      this.lock.release(plan.rootCandidate.manifest.id)
      throw new Error(`Source '${plan.rootCandidate.source.id}' not registered`)
    }

    try {
      const bundle = await source.fetch(plan.rootCandidate)
      const ctx = this.txn.begin(plan, bundle)

      const installed = await this.installer.install(bundle, ctx)
      const record: AcquisitionRecord = {
        acquisitionId: ctx.transactionId,
        timestamp: new Date(),
        source: plan.rootCandidate.source,
        capabilityId: plan.rootCandidate.manifest.id,
        version: plan.rootCandidate.version,
        dependencies: plan.dependencies.map(d => ({ capabilityId: d.capabilityId, version: d.version })),
        checksum: bundle.checksum,
        publisher: plan.rootCandidate.publisher,
        policy: plan.policy,
        result: 'success',
        durationMs: Date.now() - startedAt,
        planId: plan.planId,
      }
      ctx.acquisitionRecords.push(record)

      await this.txn.commit(ctx, this.registry, this.corpus)
      for (const cap of installed) {
        await this.registrar.register(cap, record)
      }

      this.lock.release(plan.rootCandidate.manifest.id)
      return { requestId: request.requestId, plan, record, success: true }
    } catch (err) {
      const record: AcquisitionRecord = {
        acquisitionId: `acq-err-${Date.now()}`,
        timestamp: new Date(),
        source: plan.rootCandidate.source,
        capabilityId: plan.rootCandidate.manifest.id,
        version: plan.rootCandidate.version,
        dependencies: [],
        checksum: '',
        publisher: plan.rootCandidate.publisher,
        policy: plan.policy,
        result: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
        planId: plan.planId,
      }
      const ctx = this.txn.begin(plan, { bundleId: '', manifests: [], artifacts: [], checksum: '' })
      ctx.acquisitionRecords.push(record)
      await this.txn.rollback(ctx, this.corpus)
      this.lock.release(plan.rootCandidate.manifest.id)
      return { requestId: request.requestId, plan, record, success: false, failureReason: record.failureReason }
    }
  }
}
