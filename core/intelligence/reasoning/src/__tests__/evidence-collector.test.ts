import { describe, it, expect } from 'vitest'
import { EvidenceCollector, EvidenceNormalizer, EvidenceGraphBuilder } from '../evidence/evidence-collector.js'

describe('EvidenceCollector', () => {
  it('collects observations into EvidenceSet', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({ observations: [{ id: 'obs-1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 4500 } }] })
    expect(set.items.length).toBe(1)
    expect(set.items[0]?.artifactType).toBe('OBSERVATION')
    expect(set.items[0]?.signals['latencyMs']).toBe(4500)
  })

  it('collects executions', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({ executions: [{ id: 'exec-1', success: false, durationMs: 5000 }] })
    expect(set.items[0]?.artifactType).toBe('EXECUTION')
    expect(set.items[0]?.signals['success']).toBe(0)
  })

  it('collects capabilities', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({ capabilities: [{ id: 'cap-1', successRate: 0.3 }] })
    expect(set.items[0]?.artifactType).toBe('CAPABILITY')
    expect(set.items[0]?.signals['successRate']).toBe(0.3)
  })

  it('collects mixed inputs and counts all items', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({
      observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: {} }],
      reflections: [{ id: 'r1', status: 'APPROVED', confidence: 0.7 }],
      executions: [{ id: 'e1', success: true, durationMs: 200 }],
    })
    expect(set.items.length).toBe(3)
  })

  it('empty input produces empty set', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({})
    expect(set.items.length).toBe(0)
    expect(set.setId).toBeTruthy()
  })
})

describe('EvidenceGraphBuilder', () => {
  it('groups items by artifactType', () => {
    const collector = new EvidenceCollector()
    const set = collector.collect({
      observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 100 } }, { id: 'o2', timestamp: '2026-01-01T00:00:00Z', signals: {} }],
      executions: [{ id: 'e1', success: false, durationMs: 0 }],
    })
    const graph = new EvidenceGraphBuilder().build(set)
    expect(graph.get('OBSERVATION')?.length).toBe(2)
    expect(graph.get('EXECUTION')?.length).toBe(1)
  })
})
