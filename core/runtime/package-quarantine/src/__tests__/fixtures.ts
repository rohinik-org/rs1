import type {
  PackageTrustSubject,
  PackageTrustDecision,
  PackageQuarantineRequest,
  QuarantineArtifactRef,
  PackageQuarantinePolicy,
} from '../types.js'
import { InMemoryArtifactStorage } from '../adapters/in-memory/in-memory-artifact-storage.js'
import { InMemoryQuarantineStorage } from '../adapters/in-memory/in-memory-quarantine-storage.js'
import { InMemoryQuarantineLock } from '../adapters/in-memory/in-memory-quarantine-lock.js'
import { InMemoryQuarantineEventSink } from '../adapters/in-memory/in-memory-quarantine-event-sink.js'

export function makeSubject(packageId = 'test-pkg', version = '1.0.0'): PackageTrustSubject {
  return {
    subjectKind: 'rohinik-package',
    packageId,
    version,
    sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws1', artifactId: 'art1' },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
  }
}

export function makeArtifactRef(packageId = 'test-pkg', version = '1.0.0'): QuarantineArtifactRef {
  return {
    artifactId: 'art-1',
    packageId,
    version,
    sourceLocation: 'quarantine-staging/art-1.tgz',
  }
}

export function makePolicy(overrides: Partial<PackageQuarantinePolicy> = {}): PackageQuarantinePolicy {
  return {
    policyId: 'p1',
    policyVersion: '1',
    quarantineDenied: true,
    quarantineManualReview: true,
    quarantineConditionallyTrusted: false,
    allowedModes: ['isolate', 'copy-and-seal', 'seal', 'deny-activation'],
    defaultMode: 'isolate',
    requireSourceSeal: true,
    requireDestinationVerification: true,
    requireIdentityContinuity: true,
    requireAtomicMove: false,
    allowCopyFallback: true,
    allowDegradedContainment: false,
    allowManualContainment: false,
    locationRules: [],
    retentionPolicy: {},
    ...overrides,
  }
}

export function makeRequest(decision: PackageTrustDecision, overrides: Partial<PackageQuarantineRequest> = {}): PackageQuarantineRequest {
  const subject = makeSubject()
  return {
    subject,
    trustDecision: decision,
    trustDecisionId: 'td-1',
    artifact: makeArtifactRef(),
    policy: makePolicy(),
    context: {},
    requestedAt: '2026-07-30T00:00:00.000Z',
    operationId: 'op-1',
    ...overrides,
  }
}

export function makeStorageWithArtifact(ref = 'quarantine-staging/art-1.tgz', packageId = 'test-pkg', version = '1.0.0') {
  return new InMemoryArtifactStorage({
    [ref]: { sizeBytes: 1024, activatable: true, packageId, version, digest: 'abc123' },
  })
}

export function makeAdapters(storageInit?: Record<string, { sizeBytes?: number; activatable?: boolean; packageId?: string; version?: string }>) {
  return {
    artifactStorage: new InMemoryArtifactStorage(
      storageInit ?? { 'quarantine-staging/art-1.tgz': { sizeBytes: 1024, activatable: true, packageId: 'test-pkg', version: '1.0.0', digest: 'abc123' } },
    ),
    quarantineStorage: new InMemoryQuarantineStorage(),
    lock: new InMemoryQuarantineLock(),
    eventSink: new InMemoryQuarantineEventSink(),
  }
}
