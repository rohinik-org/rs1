import { describe, it, expect } from 'vitest'
import { ExecutionEvidenceController } from '../controller.js'
import { MemoryEvidenceRepository } from '@rohinik-org/execution-evidence-store-memory'
import {
  intelligentExecutionId,
  executionSessionId,
  makeContextAdmissionRef,
  EvidenceOutcome,
  EvidenceEventType,
} from '@rohinik-org/execution-evidence-ir'

function makeController(onEmit?: (event: string, data: unknown) => void) {
  let seq = 0
  const repo = new MemoryEvidenceRepository()
  const emitted: Array<{ event: string; data: unknown }> = []
  const eventBus = {
    emit: (event: string, data?: unknown) => {
      emitted.push({ event, data })
      onEmit?.(event, data)
    },
  }
  const ctrl = new ExecutionEvidenceController(
    repo,
    { now: () => new Date('2025-01-01T00:00:00.000Z') },
    { generate: () => `id-${++seq}` },
    { hash: (s: string) => 'h:' + s.slice(0, 8) },
    eventBus,
  )
  return { ctrl, repo, emitted, eventBus }
}

const BASE_PARAMS = {
  intelligentExecutionId: intelligentExecutionId('exec-1'),
  executionSessionId:     executionSessionId('sess-1'),
  operationKind:          'llm.invoke',
}

// ── event emission ────────────────────────────────────────────────────────────

describe('EventBus telemetry — event emission', () => {
  it('emits EVIDENCE_OPENED on open()', () => {
    const { ctrl, emitted } = makeController()
    ctrl.open(BASE_PARAMS)
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_OPENED)
    expect(found).toBeDefined()
  })

  it('emits EVIDENCE_SEALED on sealAndStore()', async () => {
    const { ctrl, emitted } = makeController()
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_SEALED)
    expect(found).toBeDefined()
  })

  it('emits EVIDENCE_REPOSITORY_ACCEPTED after successful store', async () => {
    const { ctrl, emitted } = makeController()
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_REPOSITORY_ACCEPTED)
    expect(found).toBeDefined()
  })

  it('emits EVIDENCE_PERSISTENCE_FAILED on repo failure', async () => {
    let seq = 0
    const failRepo = {
      async store() { throw new Error('disk full') },
      async findById() { return undefined },
      async verifyIntegrity() { return { evidenceId: 'x' as any, status: 'not_found' as any, checkedAt: new Date() } },
    }
    const emitted: Array<{ event: string }> = []
    const ctrl = new ExecutionEvidenceController(
      failRepo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
      { emit: (e: string, _d?: unknown) => emitted.push({ event: e }) },
    )
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    await expect(ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))).rejects.toThrow()
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_PERSISTENCE_FAILED)
    expect(found).toBeDefined()
  })

  it('integrity verification failure emits EVIDENCE_INTEGRITY_VERIFICATION_FAILED', async () => {
    const { ctrl, repo, emitted } = makeController()
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    // Corrupt the stored record
    repo.forceCorrupt(record.evidenceId, 'tampered')
    await ctrl.verifyIntegrity(record.evidenceId)
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_INTEGRITY_VERIFICATION_FAILED)
    expect(found).toBeDefined()
  })
})

// ── event payload safety ──────────────────────────────────────────────────────

describe('EventBus telemetry — payload safety', () => {
  it('EVIDENCE_OPENED payload contains evidenceId and schemaVersion', () => {
    const { ctrl, emitted } = makeController()
    ctrl.open(BASE_PARAMS)
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_OPENED)
    const payload = found?.data as Record<string, unknown>
    expect(payload?.evidenceId).toBeDefined()
    expect(payload?.schemaVersion).toBeDefined()
  })

  it('EVIDENCE_OPENED payload does not include raw operationKind content', () => {
    // operationKind is safe metadata (kind string), not raw content
    // but we verify no 'input' or 'output' or 'context' leaks
    const { ctrl, emitted } = makeController()
    ctrl.open(BASE_PARAMS)
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_OPENED)
    const payload = found?.data as Record<string, unknown>
    expect(payload?.input).toBeUndefined()
    expect(payload?.output).toBeUndefined()
    expect(payload?.context).toBeUndefined()
  })

  it('EVIDENCE_SEALED payload contains evidenceHash', async () => {
    const { ctrl, emitted } = makeController()
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    const found = emitted.find(e => e.event === EvidenceEventType.EVIDENCE_SEALED)
    const payload = found?.data as Record<string, unknown>
    expect(typeof payload?.evidenceHash).toBe('string')
  })
})

// ── event bus failure isolation ───────────────────────────────────────────────

describe('EventBus telemetry — isolation', () => {
  it('eventBus emit failure does not convert unpersisted record into success', async () => {
    let seq = 0
    const repo = new MemoryEvidenceRepository()
    const ctrl = new ExecutionEvidenceController(
      repo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
      {
        emit: (event: string) => {
          if (event === EvidenceEventType.EVIDENCE_REPOSITORY_ACCEPTED) throw new Error('bus down')
        },
      },
    )
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    // sealAndStore should still succeed (bus failure is non-fatal after successful store)
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    // Record was persisted
    const found = await repo.findById(record.evidenceId)
    expect(found).toBeDefined()
  })

  it('controller works correctly without eventBus (no-op)', async () => {
    let seq = 0
    const repo = new MemoryEvidenceRepository()
    const ctrl = new ExecutionEvidenceController(
      repo,
      { now: () => new Date('2025-01-01T00:00:00.000Z') },
      { generate: () => `id-${++seq}` },
      { hash: (s: string) => 'h:' + s.slice(0, 8) },
      // no eventBus
    )
    const id = ctrl.open(BASE_PARAMS)
    ctrl.recordContextAdmission(id, makeContextAdmissionRef('c', 'h', false))
    const record = await ctrl.sealAndStore(id, EvidenceOutcome.SUCCESS, new Date('2025-01-01T00:00:01.000Z'))
    expect(record.evidenceId).toBeDefined()
  })
})
