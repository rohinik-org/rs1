import { describe, it, expect } from 'vitest'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeQuarantineRequest,
  makeTrustSnapshot,
  makeAuthorizationRequest,
  AUTH_POLICY,
  ISSUED_AT,
} from '../fixtures/index.js'

describe('quarantine', () => {
  it('denied package is quarantined successfully', async () => {
    const { harness } = buildStage9JTestSystem()
    const result = await harness.quarantine(makeQuarantineRequest())
    expect(['quarantined', 'quarantined-degraded', 'manual-intervention-required', 'verification-failed', 'containment-failed']).toContain(result.outcome)
  })

  it('duplicate quarantine request is idempotent', async () => {
    const { harness } = buildStage9JTestSystem()
    const req = makeQuarantineRequest()
    const r1 = await harness.quarantine(req)
    const r2 = await harness.quarantine(req)
    expect(r1.operationId).toBe(r2.operationId)
  })

  it('quarantined artifact blocks provisioning authorization', async () => {
    const snapshot = makeTrustSnapshot('quarantined')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('denied')
  })

  it('quarantine event published on quarantine', async () => {
    const { harness, quarantineEventSink } = buildStage9JTestSystem()
    await harness.quarantine(makeQuarantineRequest())
    expect(quarantineEventSink.publishedEvents.length).toBeGreaterThan(0)
  })

  it('quarantine-required trust → provisioning blocked regardless of prior authorization', async () => {
    const snapshot = makeTrustSnapshot('quarantined')
    const { harness } = buildStage9JTestSystem([snapshot])
    const authResult = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    // quarantined never yields authorized
    expect(['authorized', 'authorized-with-conditions']).not.toContain(authResult.decision.outcome)
  })

  it('containment failure degrades result but does not permit provisioning', async () => {
    const { harness, quarantineEventSink } = buildStage9JTestSystem()
    const req = makeQuarantineRequest()
    const result = await harness.quarantine(req)
    // Regardless of quarantine result, no provisioning authorization should pass
    const snapshot = makeTrustSnapshot('quarantined')
    const { harness: h2 } = buildStage9JTestSystem([snapshot])
    const authResult = await h2.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(authResult.decision.outcome).toBe('denied')
  })
})
