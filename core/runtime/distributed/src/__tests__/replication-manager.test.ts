import { describe, it, expect } from 'vitest'
import { ReplicationManager } from '../replication/replication-manager.js'
import { ClusterJournal } from '../journal/cluster-journal.js'
import { DEFAULT_CLUSTER_POLICY } from '@rohinik-org/compiler'

describe('ReplicationManager', () => {
  it('produces ReplicationRecord for MEMORY artifact', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('source-1', journal)
    const record = mgr.replicate('MEMORY', 'mem-1', ['node-2'], DEFAULT_CLUSTER_POLICY)
    expect(record).not.toBeNull()
    expect(record!.artifactType).toBe('MEMORY')
    expect(record!.artifactId).toBe('mem-1')
    expect(record!.replicatedToNodeIds).toContain('node-2')
  })
  it('journals REPLICATION_STARTED + REPLICATION_COMPLETED', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('source-1', journal)
    mgr.replicate('INFERENCE_CHAIN', 'ic-1', ['node-2'], DEFAULT_CLUSTER_POLICY)
    const types = journal.getAll().map(e => e.eventType)
    expect(types).toContain('REPLICATION_STARTED')
    expect(types).toContain('REPLICATION_COMPLETED')
  })
  it('returns null and journals POLICY_REJECTED when allowReplication=false', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('source-1', journal)
    const record = mgr.replicate('MEMORY', 'mem-1', ['node-2'], { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })
    expect(record).toBeNull()
    expect(journal.getByEventType('POLICY_REJECTED').length).toBe(1)
  })
  it('sourceNodeId appears in record', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('source-1', journal)
    const record = mgr.replicate('REFLECTION', 'ref-1', ['node-3'], DEFAULT_CLUSTER_POLICY)
    expect(record!.sourceNodeId).toBe('source-1')
  })
  it('supports all artifact types', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('s', journal)
    const types = ['MEMORY', 'REFLECTION', 'OBSERVATION', 'INFERENCE_CHAIN', 'REASONING_REPORT'] as const
    for (const t of types) {
      const r = mgr.replicate(t, `a-${t}`, ['n2'], DEFAULT_CLUSTER_POLICY)
      expect(r!.artifactType).toBe(t)
    }
  })
  it('record has replicatedAt timestamp', () => {
    const journal = new ClusterJournal()
    const mgr = new ReplicationManager('source-1', journal)
    const record = mgr.replicate('MEMORY', 'mem-1', ['n2'], DEFAULT_CLUSTER_POLICY)
    expect(() => new Date(record!.replicatedAt)).not.toThrow()
  })
})
