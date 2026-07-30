import { describe, it, expect } from 'vitest'
import { QuarantineExecutor } from '../quarantine-executor.js'
import { buildContainmentPlan } from '../containment-plan-builder.js'
import { InMemoryArtifactStorage } from '../adapters/in-memory/in-memory-artifact-storage.js'
import { InMemoryQuarantineStorage } from '../adapters/in-memory/in-memory-quarantine-storage.js'
import { InMemoryQuarantineLock } from '../adapters/in-memory/in-memory-quarantine-lock.js'
import { InMemoryQuarantineEventSink } from '../adapters/in-memory/in-memory-quarantine-event-sink.js'
import { makeRequest, makeSubject, makeAdapters } from './fixtures.js'

function makePlan(mode = 'isolate' as const) {
  return buildContainmentPlan({
    operationId: 'op-exec-1',
    subject: makeSubject(),
    trustDecisionId: 'td-1',
    mode,
    sourceLocation: 'staging/art.tgz',
    destinationLocation: 'quarantine/test-pkg/1.0.0/op-exec-1',
    plannedAt: '2026-07-30T00:00:00.000Z',
  })
}

describe('QuarantineExecutor', () => {
  it('executes isolate plan successfully', async () => {
    const storage = new InMemoryArtifactStorage({
      'staging/art.tgz': { sizeBytes: 512, activatable: true, packageId: 'test-pkg', version: '1.0.0' },
    })
    const { quarantineStorage, lock, eventSink } = makeAdapters()
    const executor = new QuarantineExecutor(storage, quarantineStorage, lock, eventSink)
    const request = makeRequest('denied', {
      operationId: 'op-exec-1',
      artifact: { artifactId: 'a1', packageId: 'test-pkg', version: '1.0.0', sourceLocation: 'staging/art.tgz' },
    })
    const result = await executor.execute(makePlan('isolate'), request)
    expect(result.success).toBe(true)
    expect(result.receipts.length).toBeGreaterThan(0)
  })

  it('fails when source artifact not found', async () => {
    const storage = new InMemoryArtifactStorage({})
    const { quarantineStorage, lock, eventSink } = makeAdapters()
    const executor = new QuarantineExecutor(storage, quarantineStorage, lock, eventSink)
    const request = makeRequest('denied', {
      operationId: 'op-exec-2',
      artifact: { artifactId: 'a1', packageId: 'test-pkg', version: '1.0.0', sourceLocation: 'staging/art.tgz' },
    })
    const result = await executor.execute(makePlan('isolate'), request)
    expect(result.success).toBe(false)
    expect(result.failureReason).toContain('not found')
  })

  it('releases lock after successful execution', async () => {
    const storage = new InMemoryArtifactStorage({
      'staging/art.tgz': { sizeBytes: 512, activatable: true, packageId: 'test-pkg', version: '1.0.0' },
    })
    const lock = new InMemoryQuarantineLock()
    const { quarantineStorage, eventSink } = makeAdapters()
    const executor = new QuarantineExecutor(storage, quarantineStorage, lock, eventSink)
    const request = makeRequest('denied', {
      operationId: 'op-exec-3',
      artifact: { artifactId: 'a1', packageId: 'test-pkg', version: '1.0.0', sourceLocation: 'staging/art.tgz' },
    })
    const plan = buildContainmentPlan({
      operationId: 'op-exec-3',
      subject: makeSubject(),
      trustDecisionId: 'td-1',
      mode: 'isolate',
      sourceLocation: 'staging/art.tgz',
      destinationLocation: 'quarantine/test-pkg/1.0.0/op-exec-3',
      plannedAt: '2026-07-30T00:00:00.000Z',
    })
    await executor.execute(plan, request)
    // Lock should be released after success
    expect(lock.isHeld('op-exec-3')).toBe(false)
  })

  it('emits quarantine-completed event on success', async () => {
    const storage = new InMemoryArtifactStorage({
      'staging/art.tgz': { sizeBytes: 512, activatable: true, packageId: 'test-pkg', version: '1.0.0' },
    })
    const eventSink = new InMemoryQuarantineEventSink()
    const { quarantineStorage, lock } = makeAdapters()
    const executor = new QuarantineExecutor(storage, quarantineStorage, lock, eventSink)
    const request = makeRequest('denied', {
      operationId: 'op-exec-4',
      artifact: { artifactId: 'a1', packageId: 'test-pkg', version: '1.0.0', sourceLocation: 'staging/art.tgz' },
    })
    const plan = buildContainmentPlan({
      operationId: 'op-exec-4',
      subject: makeSubject(),
      trustDecisionId: 'td-1',
      mode: 'isolate',
      sourceLocation: 'staging/art.tgz',
      destinationLocation: 'quarantine/test-pkg/1.0.0/op-exec-4',
      plannedAt: '2026-07-30T00:00:00.000Z',
    })
    await executor.execute(plan, request)
    expect(eventSink.publishedEvents.some(e => e.eventKind === 'quarantine-completed')).toBe(true)
  })

  it('executes deny-activation plan', async () => {
    const storage = new InMemoryArtifactStorage({
      'staging/art.tgz': { sizeBytes: 512, activatable: true, packageId: 'test-pkg', version: '1.0.0' },
    })
    const { quarantineStorage, lock, eventSink } = makeAdapters()
    const executor = new QuarantineExecutor(storage, quarantineStorage, lock, eventSink)
    const plan = buildContainmentPlan({
      operationId: 'op-exec-5',
      subject: makeSubject(),
      trustDecisionId: 'td-1',
      mode: 'deny-activation',
      sourceLocation: 'staging/art.tgz',
      plannedAt: '2026-07-30T00:00:00.000Z',
    })
    const request = makeRequest('denied', {
      operationId: 'op-exec-5',
      artifact: { artifactId: 'a1', packageId: 'test-pkg', version: '1.0.0', sourceLocation: 'staging/art.tgz' },
    })
    const result = await executor.execute(plan, request)
    expect(result.success).toBe(true)
    const entry = storage.getEntry('staging/art.tgz')
    expect(entry?.activatable).toBe(false)
  })
})
