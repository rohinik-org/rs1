import { describe, it, expect } from 'vitest'
import {
  buildAuthorizationToken,
  verifyAuthorizationToken,
  computeTokenDigest,
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
  createAuthorizationController,
  invalidateAuthorization,
} from '@rohinik-org/package-provisioning-authorization'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  PACKAGE_ID,
  PACKAGE_VERSION,
  ARTIFACT_DIGEST,
  TENANT_ID,
  ENVIRONMENT_ID,
} from '../fixtures/index.js'

describe('authorization', () => {
  it('trusted snapshot → authorization issued', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['authorized', 'authorized-with-conditions']).toContain(result.decision.outcome)
  })

  it('stale snapshot (repositoryRevision mismatch) → stale-snapshot or denied', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    // Request asks for revision 5 but snapshot is at revision 1
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest({ expectedRepositoryRevision: 5 }),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['denied', 'stale-snapshot']).toContain(result.decision.outcome)
  })

  it('quarantined artifact → authorization denied', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)
    const result = await controller.authorize(makeAuthorizationRequest(), AUTH_POLICY, [], [], ISSUED_AT)
    expect(result.decision.outcome).toBe('denied')
  })

  it('reevaluation-required state → deferred or denied', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader(
      { trustDecisionRecordId: '', state: 'required', asOf: ISSUED_AT },
    )
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const policy = { ...AUTH_POLICY, requireCurrentReevaluation: true }
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)
    const result = await controller.authorize(makeAuthorizationRequest(), policy, [], [], ISSUED_AT)
    expect(['deferred', 'denied']).toContain(result.decision.outcome)
  })

  it('scope escalation blocked — capability not in authorized set', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest({
        requestedCapabilities: [{ capabilityId: 'cap-read' }, { capabilityId: 'cap-write' }],
      }),
      { ...AUTH_POLICY, maxCapabilityScope: [{ capabilityId: 'cap-read' }] },
      ['cap-read', 'cap-write'], // cap-write declared but exceeds maxCapabilityScope
      [],
      ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('denied')
  })

  it('token tampering detected', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(), AUTH_POLICY, [], [], ISSUED_AT,
    )
    const token = buildAuthorizationToken(result.decision, false)
    // Tamper the payload
    const [ver, payload, sig] = token.split('.')
    const tamperedToken = `${ver}.${payload}tampered.${sig}` as import('@rohinik-org/package-provisioning-authorization').AuthorizationToken
    const verified = verifyAuthorizationToken(tamperedToken, result.record!, 1, ISSUED_AT)
    expect(verified.valid).toBe(false)
  })

  it('token invalidation transitions record to INVALIDATED', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { authRecordStore, authEventSink } = buildStage9JTestSystem([snapshot])
    // Build controller with store exposed
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const lock = createInMemoryAuthorizationLock()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, authRecordStore, lock, authEventSink)
    const result = await controller.authorize(makeAuthorizationRequest(), AUTH_POLICY, [], [], ISSUED_AT)

    const receipt = await invalidateAuthorization(
      result.record!.authorizationId,
      'manual-operator-action',
      ISSUED_AT,
      authRecordStore,
      authEventSink,
    )
    expect(receipt.state).toBe('INVALIDATED')
  })

  it('authorization event published on authorize', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { authEventSink, harness } = buildStage9JTestSystem([snapshot])
    await harness.authorizeProvisioning(makeAuthorizationRequest(), AUTH_POLICY, [], [], ISSUED_AT)
    expect(authEventSink.events.length).toBeGreaterThan(0)
  })
})
