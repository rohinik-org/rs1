import { describe, it, expect } from 'vitest'
import { QuarantineController } from '../quarantine-controller.js'
import { makeRequest, makeAdapters, makePolicy, makeSubject, makeArtifactRef } from './fixtures.js'
import { InMemoryArtifactStorage } from '../adapters/in-memory/in-memory-artifact-storage.js'
import type { QuarantineLock, QuarantineLockHandle } from '../ports/quarantine-lock.js'

describe('QuarantineController', () => {
  it('quarantines a denied package', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const result = await controller.quarantine(makeRequest('denied'))
    expect(['quarantined', 'quarantined-degraded']).toContain(result.outcome)
  })

  it('returns not-required for trusted without emergency rule', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const policy = makePolicy({ quarantineDenied: false, quarantineManualReview: false, quarantineConditionallyTrusted: false, emergencyRules: [] })
    const result = await controller.quarantine(makeRequest('trusted', { policy, operationId: 'op-trusted' }))
    expect(result.outcome).toBe('not-required')
  })

  it('returns invalid-request on bad input', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const result = await controller.quarantine(makeRequest('denied', { operationId: '' }))
    expect(result.outcome).toBe('invalid-request')
  })

  it('is idempotent for same operationId and same inputs', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const r = makeRequest('denied', { operationId: 'op-idem' })
    const first = await controller.quarantine(r)
    const second = await controller.quarantine(r)
    expect(second.outcome).toBe(first.outcome)
  })

  it('fails closed on same operationId with different inputs', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    await controller.quarantine(makeRequest('denied', { operationId: 'op-conflict' }))
    const result = await controller.quarantine(makeRequest('trusted', { operationId: 'op-conflict' }))
    expect(result.outcome).toBe('invalid-request')
  })

  it('manual-containment mode → manual-intervention-required outcome', async () => {
    const storage = new InMemoryArtifactStorage({
      'quarantine-staging/art-1.tgz': { sizeBytes: 100, activatable: true, packageId: 'test-pkg', version: '1.0.0' },
    })
    const { quarantineStorage, lock, eventSink } = makeAdapters()
    const policy = makePolicy({
      allowedModes: ['manual-containment'],
      defaultMode: 'manual-containment',
      allowManualContainment: true,
      allowCopyFallback: true,
      requireDestinationVerification: false,
    })
    const controller = new QuarantineController(storage, quarantineStorage, lock, eventSink)
    const result = await controller.quarantine(makeRequest('denied', { policy, operationId: 'op-manual' }))
    expect(result.outcome).toBe('manual-intervention-required')
  })

  it('result has evidence with lifecycle transitions', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const result = await controller.quarantine(makeRequest('denied', { operationId: 'op-lifecycle' }))
    expect(result.evidence.lifecycleTransitions.length).toBeGreaterThan(0)
  })

  it('quarantine result has quarantineRecord for quarantined outcome', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const result = await controller.quarantine(makeRequest('denied', { operationId: 'op-record', trustDecisionReasonCodes: ['source-denied'] }))
    if (result.outcome === 'quarantined') {
      expect(result.quarantineRecord).toBeDefined()
      expect(result.quarantineRecord?.status).toBe('active')
    }
  })

  it('returns invalid-request when packageId mismatch between subject and artifact', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const subject = makeSubject('pkg-a')
    const artifact = makeArtifactRef('pkg-b')
    const result = await controller.quarantine(makeRequest('denied', { subject, artifact, operationId: 'op-mismatch' }))
    expect(result.outcome).toBe('invalid-request')
  })

  it('uses policy.policyId and policyVersion in result', async () => {
    const { artifactStorage, quarantineStorage, lock, eventSink } = makeAdapters()
    const controller = new QuarantineController(artifactStorage, quarantineStorage, lock, eventSink)
    const policy = makePolicy({ policyId: 'custom-policy', policyVersion: '2' })
    const result = await controller.quarantine(makeRequest('denied', { policy, operationId: 'op-policy' }))
    expect(result.policyId).toBe('custom-policy')
    expect(result.policyVersion).toBe('2')
  })

  it('fails closed when degraded but allowDegradedContainment is false', async () => {
    // A lock whose release() throws causes a non-required step failure → degraded receipt
    const throwingLock: QuarantineLock = {
      async acquire(key: string): Promise<QuarantineLockHandle> {
        return {
          key,
          async release(): Promise<void> { throw new Error('lock-release-failure') },
        }
      },
    }
    const { artifactStorage, quarantineStorage, eventSink } = makeAdapters()
    const policy = makePolicy({ allowDegradedContainment: false, requireDestinationVerification: false })
    const controller = new QuarantineController(artifactStorage, quarantineStorage, throwingLock, eventSink)
    const result = await controller.quarantine(makeRequest('denied', { policy, operationId: 'op-degraded-closed' }))
    expect(result.outcome).toBe('containment-failed')
  })
})
