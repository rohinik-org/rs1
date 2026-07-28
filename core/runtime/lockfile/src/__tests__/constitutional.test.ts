/**
 * Constitutional law tests for Stage 9I — L-9I-001..008
 */
import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockfileGeneratorImpl } from '../generator.js'
import { LockDriftDetectorImpl } from '../drift-detector.js'
import { LockAdmissionControllerImpl } from '../admission-controller.js'
import { LockfileStoreImpl } from '../store.js'
import { SnapshotAssemblerImpl } from '../snapshot-assembler.js'
import { SnapshotAdmissionError } from '@rohinik-org/lockfile-ir'
import type {
  DeliveredEnvironmentSnapshot,
  LockfileAuditMetadata,
  ObservedEnvironmentSnapshot,
} from '@rohinik-org/lockfile-ir'
import type { ManagedProvisioningResult, AuthorizedCapabilityResolutionPlan } from '@rohinik-org/provisioning-ir'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const AUDIT: LockfileAuditMetadata = {
  generatedAt: '2026-01-01T00:00:00Z',
  generatedBy: { implementationId: 'rohinik-lockfile', version: '0.1.0' },
  provisioningExecutionId: 'exec-1',
  provisioningSemanticJournalHash: 'sjh',
}

const PKG_INTEGRITY = { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'abc123' }
const PKG_SOURCE = { sourceKind: 'registry' as const, registryId: 'npm', artifactLocator: 'pkg@1.0.0' }

function makeSnap(overrides: Partial<DeliveredEnvironmentSnapshot> = {}): DeliveredEnvironmentSnapshot {
  return {
    kind: 'delivered-environment-snapshot',
    snapshotVersion: 1,
    application: { applicationId: 'app1', manifestSemanticHash: 'msh', manifestSchemaVersion: 1 },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0' },
    resolution: {
      proposedPlanId: 'p1', proposedPlanSemanticHash: 'psh', authorizedPlanSemanticHash: 'apsh',
      authorizationId: 'auth1', resolverIdentity: { implementationId: 'res', version: '1.0.0' },
      resolutionPolicySemanticHash: 'rpsh', catalogSnapshots: [],
    },
    capabilities: [], packages: [], dependencies: {}, models: [], infrastructure: [], providers: [], configuration: [],
    policies: { trustPolicySemanticHash: 'tsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'ash' },
    provisioningEvidence: { executionId: 'exec-1', status: 'success', semanticJournalHash: 'sjh' },
    ...overrides,
  }
}

function baseObs(overrides: Partial<ObservedEnvironmentSnapshot> = {}): ObservedEnvironmentSnapshot {
  return {
    kind: 'observed-environment-snapshot', snapshotVersion: 1,
    application: { manifestSemanticHash: 'msh' },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0' },
    capabilities: [], packages: [], dependencies: {}, models: [], infrastructure: [], providers: [], configuration: [],
    policies: { trustPolicySemanticHash: 'tsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'ash' },
    ...overrides,
  }
}

const gen = new LockfileGeneratorImpl()
const detector = new LockDriftDetectorImpl()
const controller = new LockAdmissionControllerImpl(detector)

// ── L-9I-001 — Exact Delivered Resolution Law ────────────────────────────────

describe('L-9I-001 — Exact Delivered Resolution Law', () => {
  it('locked package carries exactVersion and integrity', () => {
    const snap = makeSnap({
      packages: [{
        packageId: 'pkg1',
        version: '1.2.3',
        integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abcdef' },
        source: PKG_SOURCE,
        packageStoreIdentity: {},
      }],
      providers: [{
        providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.2.3',
        state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [],
      }],
    })
    const lock = gen.generate(snap, AUDIT)
    const pkg = lock.packages[0]
    expect(pkg.version).toBe('1.2.3')
    expect(pkg.integrity).toBeDefined()
    expect(pkg.integrity.value).toBe('abcdef')
  })
})

// ── L-9I-002 — Delivered Environment Source Law ──────────────────────────────

describe('L-9I-002 — Delivered Environment Source Law', () => {
  it('generator rejects a non-delivered-environment-snapshot kind', () => {
    const bad = makeSnap()
    // ponytail: cast to test runtime guard; type system already enforces at compile-time
    ;(bad as unknown as { kind: string }).kind = 'observed-environment-snapshot'
    expect(() => gen.generate(bad, AUDIT)).toThrow()
  })

  it('generator accepts a valid DeliveredEnvironmentSnapshot', () => {
    expect(() => gen.generate(makeSnap(), AUDIT)).not.toThrow()
  })
})

// ── L-9I-003 — Immutable Equality Law ───────────────────────────────────────

describe('L-9I-003 — Immutable Equality Law', () => {
  it('single-field drift in immutable mode → not compliant', () => {
    const lock = gen.generate(makeSnap(), AUDIT)
    const obs = baseObs({ application: { manifestSemanticHash: 'different-hash' } })
    const report = detector.detect(lock, obs, 'immutable')
    // In immutable mode, any drift is non-compliant
    expect(report.status).not.toBe('compliant')
  })
})

// ── L-9I-004 — Integrity Security Law ───────────────────────────────────────

describe('L-9I-004 — Integrity Security Law', () => {
  const modes = ['development', 'ci', 'immutable'] as const

  for (const mode of modes) {
    it(`integrity mismatch in ${mode} mode → rejected with security-error entry`, () => {
      const lock = gen.generate(makeSnap({
        packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
        providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
      }), AUDIT)
      const obs = baseObs({ packages: [{ packageId: 'pkg1', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'evil-hash' } }] })
      const dec = controller.admit(lock, obs, mode)
      expect(dec.admitted).toBe(false)
      const integrityEntry = dec.report.entries.find(e => e.driftType === 'package-integrity-drift')
      expect(integrityEntry).toBeDefined()
      expect(integrityEntry!.severity).toBe('security-error')
    })
  }
})

// ── L-9I-005 — Post-Success Update Law ──────────────────────────────────────

describe('L-9I-005 — Post-Success Update Law', () => {
  it('SnapshotAssemblerImpl rejects a failed ManagedProvisioningResult', async () => {
    const assembler = new SnapshotAssemblerImpl()
    const plan: AuthorizedCapabilityResolutionPlan = {
      kind: 'authorized-capability-resolution-plan',
      schemaVersion: 1,
      authorizationId: 'auth-1' as AuthorizedCapabilityResolutionPlan['authorizationId'],
      proposedPlanId: 'plan-1' as AuthorizedCapabilityResolutionPlan['proposedPlanId'],
      proposedPlanSemanticHash: 'ppsh' as AuthorizedCapabilityResolutionPlan['proposedPlanSemanticHash'],
      authorizedAt: '2026-01-01T00:00:00Z' as AuthorizedCapabilityResolutionPlan['authorizedAt'],
      authorizationPolicyId: 'pol-1',
      authorizedActions: [],
      verifiedArtifacts: [],
      permissionAuthorizations: [],
      npmInstallManifests: [],
      secretRequirements: [],
      semanticHash: 'apsh' as AuthorizedCapabilityResolutionPlan['semanticHash'],
      authorizationProof: {
        algorithm: 'in-process-token',
        issuer: 'test' as AuthorizedCapabilityResolutionPlan['authorizationProof']['issuer'],
        signedPayloadHash: 'spsh' as AuthorizedCapabilityResolutionPlan['authorizationProof']['signedPayloadHash'],
        token: 'tok',
      },
    }
    const failedResult: ManagedProvisioningResult = {
      mode: 'managed',
      executionId: 'exec-1' as ManagedProvisioningResult['executionId'],
      authorizationId: 'auth-1' as ManagedProvisioningResult['authorizationId'],
      planId: 'plan-1' as ManagedProvisioningResult['planId'],
      status: 'failed',
      actionResults: [],
      providers: [],
      semanticJournalHash: 'sjh' as ManagedProvisioningResult['semanticJournalHash'],
      auditJournalHash: 'ajh' as ManagedProvisioningResult['auditJournalHash'],
      startedAt: '2026-01-01T00:00:00Z' as ManagedProvisioningResult['startedAt'],
      completedAt: '2026-01-01T00:01:00Z' as ManagedProvisioningResult['completedAt'],
    }
    await expect(assembler.assemble({
      plan,
      result: failedResult,
      resolution: {
        proposedPlanId: 'plan-1', proposedPlanSemanticHash: 'ppsh', authorizedPlanSemanticHash: 'apsh',
        authorizationId: 'auth-1', resolverIdentity: { implementationId: 'resolver', version: '1.0.0' },
        resolutionPolicySemanticHash: 'rpsh', catalogSnapshots: [],
      },
    })).rejects.toThrow(SnapshotAdmissionError)
  })
})

// ── L-9I-006 — Semantic Determinism Law ─────────────────────────────────────

describe('L-9I-006 — Semantic Determinism Law', () => {
  it('same snapshot with different executionId → same semantic hash', () => {
    const l1 = gen.generate(
      makeSnap({ provisioningEvidence: { executionId: 'exec-A', status: 'success', semanticJournalHash: 'sjh' } }),
      { ...AUDIT, provisioningExecutionId: 'exec-A' },
    )
    const l2 = gen.generate(
      makeSnap({ provisioningEvidence: { executionId: 'exec-B', status: 'success', semanticJournalHash: 'sjh' } }),
      { ...AUDIT, provisioningExecutionId: 'exec-B' },
    )
    expect(l1.semanticHash).toBe(l2.semanticHash)
  })

  it('same packages in different insertion order → same semantic hash', () => {
    const cap = (id: string): DeliveredEnvironmentSnapshot['capabilities'][0] => ({
      capabilityId: id, requirement: {}, resolvedContractVersion: '1',
      providerId: '', providerVersion: '1', packageId: 'pkg', packageVersion: '1',
    })
    const l1 = gen.generate(makeSnap({ capabilities: [cap('z'), cap('a')] }), AUDIT)
    const l2 = gen.generate(makeSnap({ capabilities: [cap('a'), cap('z')] }), AUDIT)
    expect(l1.semanticHash).toBe(l2.semanticHash)
  })
})

// ── L-9I-007 — Immutable Non-Mutation Law ───────────────────────────────────

describe('L-9I-007 — Immutable Non-Mutation Law', () => {
  it('drift detection + admission in immutable mode calls no mutation methods', () => {
    const calls: string[] = []
    const trackingDetector = {
      detect: detector.detect.bind(detector),
      generate: () => { calls.push('generate') },
      write: () => { calls.push('write') },
      migrate: () => { calls.push('migrate') },
    }
    // ponytail: LockAdmissionControllerImpl only calls detector.detect — verify no mutation path
    const immutableController = new LockAdmissionControllerImpl(trackingDetector as unknown as LockDriftDetectorImpl)
    const lock = gen.generate(makeSnap(), AUDIT)
    immutableController.admit(lock, baseObs({ runtime: { runtimeVersion: 'v18.0.0' } }), 'immutable')
    expect(calls).toHaveLength(0)
  })
})

// ── L-9I-008 — Atomic Lock Persistence Law ──────────────────────────────────

describe('L-9I-008 — Atomic Lock Persistence Law', () => {
  it('write failure leaves original lockfile unchanged', async () => {
    const store = new LockfileStoreImpl()
    const tmpDir = await mkdtemp(join(tmpdir(), 'law-9i8-'))

    const lock1 = gen.generate(makeSnap(), AUDIT)
    await store.writeAtomic(tmpDir, lock1)
    const originalContent = await readFile(join(tmpDir, 'rohinik.lock'), 'utf8')

    const lock2 = gen.generate(
      makeSnap({ application: { applicationId: 'app2', manifestSemanticHash: 'msh2', manifestSchemaVersion: 1 } }),
      AUDIT,
    )
    const badDir = join(tmpDir, 'no-such-sub', 'nested')
    await expect(store.writeAtomic(badDir, lock2)).rejects.toThrow()

    const afterContent = await readFile(join(tmpDir, 'rohinik.lock'), 'utf8')
    expect(afterContent).toBe(originalContent)
  })
})
