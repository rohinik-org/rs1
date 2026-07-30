import { describe, it, expect } from 'vitest'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeRecordTrustDecisionCommand,
  makeQuarantineRequest,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  OPERATION_ID_1,
  OPERATION_ID_2,
  RECORD_ID_1,
  CANONICAL_SUBJECT,
  ARTIFACT_IDENTITY,
  POLICY_REF,
} from '../fixtures/index.js'

describe('idempotency', () => {
  it('identical repository write returns same receipt with idempotent=true', async () => {
    const { harness } = buildStage9JTestSystem()
    const cmd = makeRecordTrustDecisionCommand('trusted')
    const r1 = await harness.persist(cmd)
    const r2 = await harness.persist(cmd)
    expect(r2.idempotent).toBe(true)
    expect(r1.revision).toBe(r2.revision)
  })

  it('Task 12 regression: revision not allocated before idempotency check', async () => {
    // If revision were allocated first, the replayed write would see a different revision
    // and produce a different digest → false idempotency-conflict. This must never happen.
    const { harness } = buildStage9JTestSystem()
    const cmd = makeRecordTrustDecisionCommand('trusted')
    const r1 = await harness.persist(cmd)
    const r2 = await harness.persist(cmd)
    // Same revision means idempotency check ran before revision increment
    expect(r1.revision).toBe(r2.revision)
    expect(r2.idempotent).toBe(true)
  })

  it('different payload same operationId → conflict error', async () => {
    const { harness } = buildStage9JTestSystem()
    const cmd1 = makeRecordTrustDecisionCommand('trusted')
    const cmd2 = makeRecordTrustDecisionCommand('denied')
    await harness.persist(cmd1)
    await expect(harness.persist(cmd2)).rejects.toThrow()
  })

  it('identical quarantine request is idempotent', async () => {
    const { harness } = buildStage9JTestSystem()
    const req = makeQuarantineRequest()
    const r1 = await harness.quarantine(req)
    const r2 = await harness.quarantine(req)
    expect(r1.operationId).toBe(r2.operationId)
  })

  it('identical authorization request is idempotent', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const req = makeAuthorizationRequest()
    const r1 = await harness.authorizeProvisioning(req, AUTH_POLICY, [], [], ISSUED_AT)
    const r2 = await harness.authorizeProvisioning(req, AUTH_POLICY, [], [], ISSUED_AT)
    expect(r1.record?.authorizationId).toBe(r2.record?.authorizationId)
  })

  it('system-wide idempotency: all boundaries stable under replay', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const { harness } = buildStage9JTestSystem([snapshot])

    // Repository: idempotent
    const cmd = makeRecordTrustDecisionCommand('trusted')
    await harness.persist(cmd)
    const r2 = await harness.persist(cmd)
    expect(r2.idempotent).toBe(true)

    // Authorization: idempotent
    const req = makeAuthorizationRequest()
    const a1 = await harness.authorizeProvisioning(req, AUTH_POLICY, [], [], ISSUED_AT)
    const a2 = await harness.authorizeProvisioning(req, AUTH_POLICY, [], [], ISSUED_AT)
    expect(a1.record?.authorizationId).toBe(a2.record?.authorizationId)
  })
})
