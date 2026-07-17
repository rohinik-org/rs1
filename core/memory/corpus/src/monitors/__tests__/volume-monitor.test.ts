import { describe, it, expect } from 'vitest'
import { VolumeMonitor } from '../volume-monitor.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'
import { randomUUID } from 'node:crypto'

function record(skillId = 'csv.parse'): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0', recordId: randomUUID(),
    runtimeId: 'r', timestamp: '2026-07-08T12:00:00Z',
    requestId: randomUUID(), requestHash: 'h', contentType: 'TEXT',
    requestSizeBytes: 10, outcome: 'SUCCESS', allCandidates: [],
    reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: 't', runtimeVersion: '0.1.0', winnerSkillId: skillId,
  }
}

describe('VolumeMonitor', () => {
  it('returns null before threshold is reached', () => {
    const monitor = new VolumeMonitor({ minVolume: 100 })
    for (let i = 0; i < 99; i++) {
      expect(monitor.observe(record())).toBeNull()
    }
  })

  it('emits LearningTrigger exactly at threshold', () => {
    const monitor = new VolumeMonitor({ minVolume: 10 })
    for (let i = 0; i < 9; i++) monitor.observe(record())
    const trigger = monitor.observe(record('csv.parse'))
    expect(trigger).not.toBeNull()
    expect(trigger?.kind).toBe('LearningTrigger')
    expect(trigger?.triggerKind).toBe('VOLUME_THRESHOLD')
    expect(trigger?.affectedSkillId).toBe('csv.parse')
    expect(trigger?.evidence.sampleSize).toBe(10)
  })

  it('does not emit again after threshold until reset', () => {
    const monitor = new VolumeMonitor({ minVolume: 5 })
    for (let i = 0; i < 5; i++) monitor.observe(record())
    expect(monitor.observe(record())).toBeNull()
  })

  it('emits again after reset', () => {
    const monitor = new VolumeMonitor({ minVolume: 5 })
    for (let i = 0; i < 5; i++) monitor.observe(record())
    monitor.reset()
    let trigger = null
    for (let i = 0; i < 5; i++) trigger = monitor.observe(record())
    expect(trigger).not.toBeNull()
  })

  it('confidenceMethod is WELFORD', () => {
    const monitor = new VolumeMonitor({ minVolume: 3 })
    for (let i = 0; i < 2; i++) monitor.observe(record())
    const trigger = monitor.observe(record())
    expect(trigger?.evidence.confidenceMethod).toBe('WELFORD')
  })
})
