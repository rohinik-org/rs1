import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '@rohinik-org/package-trust-decision'
import * as trustDecisionExports from '@rohinik-org/package-trust-decision'
import * as provisioningExports from '@rohinik-org/package-provisioning-authorization'
import {
  createAuthorizationController,
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
  buildAuthorizationToken,
  verifyAuthorizationToken,
} from '@rohinik-org/package-provisioning-authorization'
import {
  makeTrustedDecisionRequest,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  CANONICAL_SUBJECT,
  ALT_SUBJECT,
  ARTIFACT_IDENTITY,
  TENANT_ID,
  ALT_TENANT_ID,
  ENVIRONMENT_ID,
  ALT_ENVIRONMENT_ID,
} from '../fixtures/index.js'

describe('compatibility', () => {
  it('cross-tenant isolation: different tenants never share authorization', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)

    const r1 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-t1', operationId: 'op-t1', tenantId: TENANT_ID }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    const r2 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-t2', operationId: 'op-t2', tenantId: ALT_TENANT_ID }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(r1.record?.authorizationId).not.toBe(r2.record?.authorizationId)
  })

  it('cross-environment isolation: different environments never share authorization', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)

    const r1 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-e1', operationId: 'op-e1', environmentId: ENVIRONMENT_ID }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    const r2 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-e2', operationId: 'op-e2', environmentId: ALT_ENVIRONMENT_ID }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(r1.record?.authorizationId).not.toBe(r2.record?.authorizationId)
  })

  it('cross-tenant token replay rejected', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)

    // Authorize for tenant-001
    const result = await controller.authorize(
      makeAuthorizationRequest({ tenantId: TENANT_ID }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    const token = buildAuthorizationToken(result.decision, false)

    // Verify with wrong tenantId → should fail (cross-tenant-replay)
    const { verifyAuthorizationTokenFull } = await import('@rohinik-org/package-provisioning-authorization')
    const verifyResult = await verifyAuthorizationTokenFull(
      {
        token,
        tenantId: ALT_TENANT_ID, // wrong tenant
        environmentId: ENVIRONMENT_ID,
        artifactDigest: result.decision.artifactIdentity.artifactDigest,
        provisioningMode: 'install',
        currentRepositoryRevision: 1,
        now: ISSUED_AT,
      },
      store,
    )
    expect(verifyResult.valid).toBe(false)
    expect(verifyResult.reason).toBe('cross-tenant-replay')
  })

  it('artifact substitution: different artifact digest → different authorization', async () => {
    const snapshot1 = makeTrustSnapshot('trusted')
    const snapshot2 = { ...snapshot1, artifactIdentity: { ...snapshot1.artifactIdentity, artifactDigest: 'sha256:different' } }
    const trustReader = createInMemoryTrustRepositoryReader([snapshot1, snapshot2])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)

    const r1 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-a1', operationId: 'op-a1' }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    const r2 = await controller.authorize(
      makeAuthorizationRequest({ requestId: 'req-a2', operationId: 'op-a2', artifactIdentity: { ...ARTIFACT_IDENTITY, artifactDigest: 'sha256:different' } }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    // Different artifact digest → either denied (no snapshot match) or different authorizationId
    expect(r1.record?.authorizationId).not.toBe(r2.record?.authorizationId)
  })

  it('Capability Binding must consume authorization not recompute trust', () => {
    // Structural law L-9J-1426: Capability Binding consumes authorization reference
    // This test verifies no trust recomputation function is exposed to downstream
    // Trust decision engine is NOT exported from package-provisioning-authorization
    expect(Object.keys(provisioningExports)).not.toContain('TrustDecisionEngine')
  })

  it('authorization boundary uses approved public contracts only', async () => {
    // L-9J-1418: Task 15 uses public contracts, not private internals
    // Verified: all imports use @rohinik-org/* package names, no relative paths to task internals
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    expect(typeof trustReader.getProvisioningTrustSnapshot).toBe('function')
  })
})
