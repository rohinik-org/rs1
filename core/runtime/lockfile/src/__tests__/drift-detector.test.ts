import { describe, it, expect } from 'vitest'
import { LockDriftDetectorImpl } from '../drift-detector.js'
import { LockfileGeneratorImpl } from '../generator.js'
import type {
  DeliveredEnvironmentSnapshot,
  LockfileAuditMetadata,
  ObservedEnvironmentSnapshot,
  RohinikLockfileV1,
} from '@rohinik-org/lockfile-ir'

const AUDIT: LockfileAuditMetadata = {
  generatedAt: '2026-01-01T00:00:00Z',
  generatedBy: { implementationId: 'rohinik-lockfile', version: '0.1.0' },
  provisioningExecutionId: 'exec-1',
  provisioningSemanticJournalHash: 'sjh',
}

const PKG_INTEGRITY = { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'abc123' }
const PKG_SOURCE = { sourceKind: 'registry' as const, registryId: 'npm', artifactLocator: 'pkg@1.0.0' }

function makeSnapshot(overrides: Partial<DeliveredEnvironmentSnapshot> = {}): DeliveredEnvironmentSnapshot {
  return {
    kind: 'delivered-environment-snapshot',
    snapshotVersion: 1,
    application: { applicationId: 'app1', manifestSemanticHash: 'msh', manifestSchemaVersion: 1 },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0', runtimeAbi: '115', packageManager: { kind: 'npm', version: '10.0.0' } },
    resolution: {
      proposedPlanId: 'plan1', proposedPlanSemanticHash: 'psh', authorizedPlanSemanticHash: 'apsh',
      authorizationId: 'auth1', resolverIdentity: { implementationId: 'res', version: '1.0.0' },
      resolutionPolicySemanticHash: 'rpsh', catalogSnapshots: [],
    },
    capabilities: [],
    packages: [],
    dependencies: {},
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: { trustPolicySemanticHash: 'tsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'ash' },
    provisioningEvidence: { executionId: 'exec-1', status: 'success', semanticJournalHash: 'sjh' },
    ...overrides,
  }
}

const gen = new LockfileGeneratorImpl()
const detector = new LockDriftDetectorImpl()

function baseLock(overrides: Partial<DeliveredEnvironmentSnapshot> = {}): RohinikLockfileV1 {
  return gen.generate(makeSnapshot(overrides), AUDIT)
}

function baseObs(overrides: Partial<ObservedEnvironmentSnapshot> = {}): ObservedEnvironmentSnapshot {
  return {
    kind: 'observed-environment-snapshot',
    snapshotVersion: 1,
    application: { manifestSemanticHash: 'msh' },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0', runtimeAbi: '115', packageManager: { kind: 'npm', version: '10.0.0' } },
    capabilities: [],
    packages: [],
    dependencies: {},
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: { trustPolicySemanticHash: 'tsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'ash' },
    ...overrides,
  }
}

describe('LockDriftDetectorImpl', () => {

  it('compliant result when nothing drifted', () => {
    const report = detector.detect(baseLock(), baseObs(), 'development')
    expect(report.status).toBe('compliant')
    expect(report.entries.filter(e => e.driftType !== 'lock-semantic-hash-invalid' && e.driftType !== 'lock-audit-hash-invalid')).toHaveLength(0)
  })

  it('application-manifest-drift', () => {
    const lock = baseLock()
    const obs = baseObs({ application: { manifestSemanticHash: 'different' } })
    const report = detector.detect(lock, obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'application-manifest-drift')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('warning')
  })

  it('capability-provider-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg/prov1', capabilityIds: ['cap1'], validationEvidence: [] }],
      capabilities: [{ capabilityId: 'cap1', requirement: {}, resolvedContractVersion: '1.0.0', providerId: 'prov1', providerVersion: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0' }],
    })
    const obs = baseObs({
      capabilities: [{ capabilityId: 'cap1', providerId: 'prov2' }],
    })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'capability-provider-drift')).toBeDefined()
  })

  it('package-missing', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ packages: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'package-missing')).toBeDefined()
  })

  it('package-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ packages: [{ packageId: 'pkg-new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'package-unexpected')).toBeDefined()
  })

  it('package-version-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ packages: [{ packageId: 'pkg1', version: '2.0.0' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'package-version-drift')).toBeDefined()
  })

  it('package-integrity-drift is security-error', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ packages: [{ packageId: 'pkg1', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'tampered' } }] })
    const report = detector.detect(lock, obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'package-integrity-drift')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('security-error')
    expect(report.status).toBe('security-conflict')
  })

  it('package-source-identity-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ packages: [{ packageId: 'pkg1', source: { sourceKind: 'registry', registryId: 'other', artifactLocator: 'pkg@1.0.0' } }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'package-source-identity-drift')).toBeDefined()
  })

  it('dependency-missing', () => {
    const lock = baseLock({
      dependencies: { npm: { packageJsonSemanticHash: 'pjsh', packageLockSemanticHash: 'plsh', lockfileVersion: 3, nodeVersion: 'v20.0.0', npmVersion: '10.0.0', packages: [{ packagePath: 'node_modules/foo', name: 'foo', version: '1.0.0', disposition: 'installed', optional: false, dev: false }] } }
    })
    const obs = baseObs({ dependencies: { npm: { packages: [] } } })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'dependency-missing')).toBeDefined()
  })

  it('dependency-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ dependencies: { npm: { packages: [{ packagePath: 'node_modules/bar', version: '2.0.0' }] } } })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'dependency-unexpected')).toBeDefined()
  })

  it('dependency-version-drift', () => {
    const lock = baseLock({
      dependencies: { npm: { packageJsonSemanticHash: 'pjsh', packageLockSemanticHash: 'plsh', lockfileVersion: 3, nodeVersion: 'v20', npmVersion: '10', packages: [{ packagePath: 'node_modules/foo', name: 'foo', version: '1.0.0', disposition: 'installed', optional: false, dev: false }] } }
    })
    const obs = baseObs({ dependencies: { npm: { packages: [{ packagePath: 'node_modules/foo', version: '2.0.0' }] } } })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'dependency-version-drift')).toBeDefined()
  })

  it('dependency-integrity-drift is security-error', () => {
    const lock = baseLock({
      dependencies: { npm: { packageJsonSemanticHash: 'pjsh', packageLockSemanticHash: 'plsh', lockfileVersion: 3, nodeVersion: 'v20', npmVersion: '10', packages: [{ packagePath: 'node_modules/foo', name: 'foo', version: '1.0.0', integrity: PKG_INTEGRITY, disposition: 'installed', optional: false, dev: false }] } }
    })
    const obs = baseObs({ dependencies: { npm: { packages: [{ packagePath: 'node_modules/foo', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'evil' } }] } } })
    const report = detector.detect(lock, obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'dependency-integrity-drift')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('security-error')
  })

  it('model-integrity-drift is security-error', () => {
    const lock = baseLock({
      models: [{ modelId: 'model1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, files: [] }],
    })
    const obs = baseObs({ models: [{ modelId: 'model1', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'tampered' } }] })
    const report = detector.detect(lock, obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'model-integrity-drift')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('security-error')
  })

  it('provider-registry-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg/prov1', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ providers: [{ providerId: 'prov1', registryPointer: 'reg/other' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'provider-registry-drift')).toBeDefined()
  })

  it('provider-not-ready is always error', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ providers: [{ providerId: 'prov1', state: 'degraded' }] })
    const report = detector.detect(lock, obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'provider-not-ready')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('error')
  })

  it('runtime-version-drift', () => {
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'runtime-version-drift')).toBeDefined()
  })

  it('runtime-abi-drift', () => {
    const obs = baseObs({ runtime: { runtimeAbi: '108', runtimeVersion: 'v20.0.0', os: 'linux', architecture: 'x64' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'runtime-abi-drift')).toBeDefined()
  })

  it('platform-os-drift', () => {
    const obs = baseObs({ runtime: { os: 'darwin' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'platform-os-drift')).toBeDefined()
  })

  it('platform-architecture-drift', () => {
    const obs = baseObs({ runtime: { architecture: 'arm64' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'platform-architecture-drift')).toBeDefined()
  })

  it('platform-libc-drift', () => {
    // Lock needs libc set; override directly
    const lock = baseLock()
    const lockWithLibc = { ...lock, runtime: { ...lock.runtime, libc: 'glibc' } }
    const obs = baseObs({ runtime: { libc: 'musl' } })
    const report = detector.detect(lockWithLibc as RohinikLockfileV1, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'platform-libc-drift')).toBeDefined()
  })

  it('package-manager-version-drift', () => {
    const obs = baseObs({ runtime: { packageManager: { kind: 'npm', version: '9.0.0' } } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'package-manager-version-drift')).toBeDefined()
  })

  it('infrastructure-strategy-drift', () => {
    const lock = baseLock({
      infrastructure: [{ serviceId: 'svc1', serviceType: 'db', strategy: 'reuse-existing' }],
    })
    const obs = baseObs({ infrastructure: [{ serviceId: 'svc1', strategy: 'provision-embedded' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'infrastructure-strategy-drift')).toBeDefined()
  })

  it('configuration-content-drift', () => {
    const lock = baseLock({
      configuration: [{ configurationKey: 'cfg1', templateId: 'tpl1', destination: '/etc/cfg', contentSemanticHash: 'csh1', writePolicy: 'create-if-absent', requiredSecretNames: [] }],
    })
    const obs = baseObs({ configuration: [{ configurationKey: 'cfg1', destination: '/etc/cfg', contentSemanticHash: 'csh2' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'configuration-content-drift')).toBeDefined()
  })

  it('trust-policy-drift', () => {
    const obs = baseObs({ policies: { trustPolicySemanticHash: 'changed' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'trust-policy-drift')).toBeDefined()
  })

  it('permission-policy-drift', () => {
    const obs = baseObs({ policies: { permissionPolicySemanticHash: 'changed' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'permission-policy-drift')).toBeDefined()
  })

  it('authorization-policy-drift', () => {
    const obs = baseObs({ policies: { authorizationPolicySemanticHash: 'changed' } })
    const report = detector.detect(baseLock(), obs, 'development')
    expect(report.entries.find(e => e.driftType === 'authorization-policy-drift')).toBeDefined()
  })

  // ── Capability binding missing/unexpected/contract-version ──────────────────

  it('capability-binding-missing', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: ['cap1'], validationEvidence: [] }],
      capabilities: [{ capabilityId: 'cap1', requirement: {}, resolvedContractVersion: '1.0.0', providerId: 'prov1', providerVersion: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0' }],
    })
    const obs = baseObs({ capabilities: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'capability-binding-missing')).toBeDefined()
  })

  it('capability-binding-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ capabilities: [{ capabilityId: 'cap-new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'capability-binding-unexpected')).toBeDefined()
  })

  it('capability-contract-version-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: ['cap1'], validationEvidence: [] }],
      capabilities: [{ capabilityId: 'cap1', requirement: {}, resolvedContractVersion: '1.0.0', providerId: 'prov1', providerVersion: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0' }],
    })
    const obs = baseObs({ capabilities: [{ capabilityId: 'cap1', resolvedContractVersion: '2.0.0' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'capability-contract-version-drift')).toBeDefined()
  })

  // ── Model missing/unexpected/version ────────────────────────────────────────

  it('model-missing', () => {
    const lock = baseLock({
      models: [{ modelId: 'model1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, files: [] }],
    })
    const obs = baseObs({ models: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'model-missing')).toBeDefined()
  })

  it('model-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ models: [{ modelId: 'model-new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'model-unexpected')).toBeDefined()
  })

  it('model-version-drift', () => {
    const lock = baseLock({
      models: [{ modelId: 'model1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, files: [] }],
    })
    const obs = baseObs({ models: [{ modelId: 'model1', version: '2.0.0' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'model-version-drift')).toBeDefined()
  })

  // ── Provider missing/unexpected/version/package ──────────────────────────────

  it('provider-missing', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ providers: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'provider-missing')).toBeDefined()
  })

  it('provider-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ providers: [{ providerId: 'prov-new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'provider-unexpected')).toBeDefined()
  })

  it('provider-version-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ providers: [{ providerId: 'prov1', version: '2.0.0' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'provider-version-drift')).toBeDefined()
  })

  it('provider-package-drift', () => {
    const lock = baseLock({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    })
    const obs = baseObs({ providers: [{ providerId: 'prov1', packageId: 'pkg-other' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'provider-package-drift')).toBeDefined()
  })

  // ── Infrastructure missing/unexpected/identity/configuration ─────────────────

  it('infrastructure-missing', () => {
    const lock = baseLock({
      infrastructure: [{ serviceId: 'svc1', serviceType: 'db', strategy: 'reuse-existing' }],
    })
    const obs = baseObs({ infrastructure: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'infrastructure-missing')).toBeDefined()
  })

  it('infrastructure-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ infrastructure: [{ serviceId: 'svc-new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'infrastructure-unexpected')).toBeDefined()
  })

  it('infrastructure-identity-drift', () => {
    const lock = baseLock({
      infrastructure: [{ serviceId: 'svc1', serviceType: 'db', strategy: 'reuse-existing', observedIdentity: 'id-a' }],
    })
    const obs = baseObs({ infrastructure: [{ serviceId: 'svc1', observedIdentity: 'id-b' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'infrastructure-identity-drift')).toBeDefined()
  })

  it('infrastructure-configuration-drift', () => {
    const lock = baseLock({
      infrastructure: [{ serviceId: 'svc1', serviceType: 'db', strategy: 'reuse-existing', configurationSemanticHash: 'csh-a' }],
    })
    const obs = baseObs({ infrastructure: [{ serviceId: 'svc1', configurationSemanticHash: 'csh-b' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'infrastructure-configuration-drift')).toBeDefined()
  })

  // ── Configuration missing/unexpected/provenance ───────────────────────────────

  it('configuration-missing', () => {
    const lock = baseLock({
      configuration: [{ configurationKey: 'cfg1', templateId: 'tpl1', destination: '/etc/cfg', contentSemanticHash: 'csh1', writePolicy: 'create-if-absent', requiredSecretNames: [] }],
    })
    const obs = baseObs({ configuration: [] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'configuration-missing')).toBeDefined()
  })

  it('configuration-unexpected', () => {
    const lock = baseLock()
    const obs = baseObs({ configuration: [{ configurationKey: 'cfg-new', destination: '/etc/new' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'configuration-unexpected')).toBeDefined()
  })

  it('configuration-provenance-drift', () => {
    const lock = baseLock({
      configuration: [{ configurationKey: 'cfg1', templateId: 'tpl1', destination: '/etc/cfg', contentSemanticHash: 'csh1', writePolicy: 'create-if-absent', requiredSecretNames: [] }],
    })
    const obs = baseObs({ configuration: [{ configurationKey: 'cfg1', destination: '/etc/cfg', writePolicy: 'replace-authorized-generated-file' }] })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'configuration-provenance-drift')).toBeDefined()
  })

  // ── Dependency lockfile drift ─────────────────────────────────────────────────

  it('dependency-lockfile-drift', () => {
    const lock = baseLock({
      dependencies: { npm: { packageJsonSemanticHash: 'pjsh', packageLockSemanticHash: 'plsh-a', lockfileVersion: 3, nodeVersion: 'v20', npmVersion: '10', packages: [] } }
    })
    const obs = baseObs({ dependencies: { npm: { packageLockSemanticHash: 'plsh-b', packages: [] } } })
    const report = detector.detect(lock, obs, 'development')
    expect(report.entries.find(e => e.driftType === 'dependency-lockfile-drift')).toBeDefined()
  })

  // ── Hash integrity (security-error) ──────────────────────────────────────────

  it('lock-semantic-hash-invalid is security-error', () => {
    const lock = baseLock()
    const tampered = { ...lock, semanticHash: 'bad-hash' as typeof lock.semanticHash }
    const report = detector.detect(tampered, baseObs(), 'development')
    const entry = report.entries.find(e => e.driftType === 'lock-semantic-hash-invalid')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('security-error')
    expect(report.status).toBe('security-conflict')
  })

  it('lock-audit-hash-invalid is security-error', () => {
    const lock = baseLock()
    const tampered = { ...lock, auditHash: 'bad-audit-hash' as typeof lock.auditHash }
    const report = detector.detect(tampered, baseObs(), 'development')
    const entry = report.entries.find(e => e.driftType === 'lock-audit-hash-invalid')
    expect(entry).toBeDefined()
    expect(entry!.severity).toBe('security-error')
    expect(report.status).toBe('security-conflict')
  })

  it('development mode: non-security drift is warning', () => {
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } })
    const report = detector.detect(baseLock(), obs, 'development')
    const entry = report.entries.find(e => e.driftType === 'runtime-version-drift')
    expect(entry!.severity).toBe('warning')
    expect(report.status).toBe('warning')
  })

  it('ci mode: non-security drift is error', () => {
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } })
    const report = detector.detect(baseLock(), obs, 'ci')
    const entry = report.entries.find(e => e.driftType === 'runtime-version-drift')
    expect(entry!.severity).toBe('error')
    expect(report.status).toBe('conflict')
  })
})
