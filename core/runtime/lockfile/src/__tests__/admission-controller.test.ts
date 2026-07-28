import { describe, it, expect } from 'vitest'
import { LockAdmissionControllerImpl, LockfileLifecycleServiceImpl } from '../admission-controller.js'
import { LockDriftDetectorImpl } from '../drift-detector.js'
import { LockfileGeneratorImpl } from '../generator.js'
import type {
  DeliveredEnvironmentSnapshot,
  LockfileAuditMetadata,
  ObservedEnvironmentSnapshot,
} from '@rohinik-org/lockfile-ir'

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
    resolution: { proposedPlanId: 'p1', proposedPlanSemanticHash: 'psh', authorizedPlanSemanticHash: 'apsh', authorizationId: 'auth1', resolverIdentity: { implementationId: 'res', version: '1.0.0' }, resolutionPolicySemanticHash: 'rpsh', catalogSnapshots: [] },
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

describe('LockAdmissionControllerImpl', () => {
  it('compliant → admitted: true, status: compliant', () => {
    const lock = gen.generate(makeSnap(), AUDIT)
    const dec = controller.admit(lock, baseObs(), 'development')
    expect(dec.admitted).toBe(true)
    expect(dec.status).toBe('compliant')
  })

  it('development warnings → admitted: true with admitted-with-development-warnings', () => {
    const lock = gen.generate(makeSnap(), AUDIT)
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } }) // version drift → warning in dev
    const dec = controller.admit(lock, obs, 'development')
    expect(dec.admitted).toBe(true)
    expect(dec.status).toBe('admitted-with-development-warnings')
  })

  it('security conflict → never admitted', () => {
    const lock = gen.generate(makeSnap({
      packages: [{ packageId: 'pkg1', version: '1.0.0', integrity: PKG_INTEGRITY, source: PKG_SOURCE, packageStoreIdentity: {} }],
      providers: [{ providerId: 'prov1', version: '1.0.0', packageId: 'pkg1', packageVersion: '1.0.0', state: 'ready', registryPointer: 'reg', capabilityIds: [], validationEvidence: [] }],
    }), AUDIT)
    const obs = baseObs({ packages: [{ packageId: 'pkg1', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'evil' } }] })
    const dec = controller.admit(lock, obs, 'development')
    expect(dec.admitted).toBe(false)
    expect(dec.status).toBe('security-rejected')
  })

  it('ci mode: warnings → admitted: false', () => {
    const lock = gen.generate(makeSnap(), AUDIT)
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } })
    const dec = controller.admit(lock, obs, 'ci')
    expect(dec.admitted).toBe(false)
    expect(dec.status).toBe('drift-rejected')
  })

  it('immutable mode: any drift → admitted: false', () => {
    const lock = gen.generate(makeSnap(), AUDIT)
    const obs = baseObs({ runtime: { runtimeVersion: 'v18.0.0' } })
    const dec = controller.admit(lock, obs, 'immutable')
    expect(dec.admitted).toBe(false)
    expect(dec.status).toBe('drift-rejected')
  })
})
