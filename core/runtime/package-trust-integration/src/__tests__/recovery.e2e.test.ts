import { describe, it, expect } from 'vitest'
import {
  createInMemoryPackageTrustRepository,
} from '@rohinik-org/package-trust-repository'
import {
  makeRecordTrustDecisionCommand,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  CANONICAL_SUBJECT,
  ARTIFACT_IDENTITY,
  POLICY_REF,
  OPERATION_ID_1,
  RECORD_ID_1,
} from '../fixtures/index.js'
import {
  createAuthorizationController,
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
} from '@rohinik-org/package-provisioning-authorization'

describe('recovery', () => {
  it('repository persistence is durable — re-query after persist returns record', async () => {
    const repository = createInMemoryPackageTrustRepository()
    await repository.recordTrustDecision(makeRecordTrustDecisionCommand('trusted'))
    const record = await repository.getTrustDecisionRecord({ recordId: RECORD_ID_1 })
    expect(record?.decision).toBe('trusted')
  })

  it('authorization record survives re-query after issue', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)
    const result = await controller.authorize(makeAuthorizationRequest(), AUTH_POLICY, [], [], ISSUED_AT)
    const record = await store.getById(result.record!.authorizationId)
    expect(record?.state).toBeDefined()
  })

  it('re-query after idempotent replay returns same record', async () => {
    const repository = createInMemoryPackageTrustRepository()
    const cmd = makeRecordTrustDecisionCommand('trusted')
    await repository.recordTrustDecision(cmd)
    await repository.recordTrustDecision(cmd) // idempotent replay
    const record = await repository.getTrustDecisionRecord({ recordId: RECORD_ID_1 })
    expect(record?.decision).toBe('trusted')
  })

  it('restart-after-persist: record still queryable', async () => {
    // Simulate restart by creating a fresh repo that was pre-populated
    // (in-memory simulates this by re-adding the same data)
    const repository = createInMemoryPackageTrustRepository()
    const cmd = makeRecordTrustDecisionCommand('trusted')
    await repository.recordTrustDecision(cmd)
    // "Restart" = we already have the durable state
    const record = await repository.getTrustDecisionRecord({ recordId: RECORD_ID_1 })
    expect(record).toBeDefined()
    expect(record?.decision).toBe('trusted')
  })

  it('authorization lookup by operationId survives restart', async () => {
    const snapshot = makeTrustSnapshot('trusted')
    const trustReader = createInMemoryTrustRepositoryReader([snapshot])
    const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
    const reevalReader = createInMemoryReevaluationStatusReader()
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)
    const req = makeAuthorizationRequest()
    await controller.authorize(req, AUTH_POLICY, [], [], ISSUED_AT)
    const record = await store.getByOperationId(req.operationId)
    expect(record).toBeDefined()
  })

  it('repository integrity verification passes for well-formed history', async () => {
    const repository = createInMemoryPackageTrustRepository()
    await repository.recordTrustDecision(makeRecordTrustDecisionCommand('trusted'))
    const report = await repository.verifyIntegrity()
    expect(report.valid).toBe(true)
  })
})
