import { describe, it, expect, afterEach } from 'vitest'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { TriggerStore } from '../trigger-store.js'
import type { LearningTrigger } from '@rohinik-org/compiler'

const roots: string[] = []

async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `trigger-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}

function makeTrigger(overrides: Partial<LearningTrigger> = {}): LearningTrigger {
  return {
    kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: randomUUID(),
    detectedAt: new Date().toISOString(), triggerKind: 'VOLUME_THRESHOLD',
    affectedSkillId: 'csv.parse',
    evidence: { metric: 'execution_count', observedValue: 100, confidence: 0.99, confidenceMethod: 'WELFORD', sampleSize: 100 },
    suggestedCommand: 'rhk learn csv.parse',
    corpusWindowStart: '2026-07-01T00:00:00Z', corpusWindowEnd: '2026-07-08T00:00:00Z',
    recordCount: 100, ...overrides,
  }
}

afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('TriggerStore', () => {
  it('writes and reads back a trigger', async () => {
    const root = await tmpRoot()
    const store = new TriggerStore(root)
    const trigger = makeTrigger()
    await store.write(trigger)
    const all = await store.readAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.triggerId).toBe(trigger.triggerId)
  })

  it('readAll returns empty array when no triggers', async () => {
    const root = await tmpRoot()
    const store = new TriggerStore(root)
    expect(await store.readAll()).toHaveLength(0)
  })

  it('readAll returns multiple triggers', async () => {
    const root = await tmpRoot()
    const store = new TriggerStore(root)
    await store.write(makeTrigger())
    await store.write(makeTrigger())
    await store.write(makeTrigger())
    expect(await store.readAll()).toHaveLength(3)
  })

  it('delete removes a trigger', async () => {
    const root = await tmpRoot()
    const store = new TriggerStore(root)
    const trigger = makeTrigger()
    await store.write(trigger)
    await store.delete(trigger.triggerId)
    expect(await store.readAll()).toHaveLength(0)
  })
})
