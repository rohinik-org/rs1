import { describe, it, expect } from 'vitest'
import { ClusterJournal } from '../journal/cluster-journal.js'
import type { ClusterJournalEntry } from '@rohinik-org/compiler'

function makeEntry(id: string, eventType: ClusterJournalEntry['eventType'], clusterId = 'c1', nodeId?: string): ClusterJournalEntry {
  const base = { entryId: id, clusterId, eventType, payload: {}, timestamp: new Date().toISOString() }
  return nodeId !== undefined ? { ...base, nodeId } : base
}

describe('ClusterJournal', () => {
  it('append and getAll', () => {
    const j = new ClusterJournal()
    j.append(makeEntry('e1', 'NODE_JOINED'))
    j.append(makeEntry('e2', 'NODE_LEFT'))
    expect(j.getAll().length).toBe(2)
  })
  it('getByCluster filters by clusterId', () => {
    const j = new ClusterJournal()
    j.append(makeEntry('e1', 'NODE_JOINED', 'c1'))
    j.append(makeEntry('e2', 'NODE_JOINED', 'c2'))
    expect(j.getByCluster('c1').length).toBe(1)
  })
  it('getByEventType filters', () => {
    const j = new ClusterJournal()
    j.append(makeEntry('e1', 'NODE_JOINED'))
    j.append(makeEntry('e2', 'REMOTE_COMPLETED'))
    j.append(makeEntry('e3', 'NODE_JOINED'))
    expect(j.getByEventType('NODE_JOINED').length).toBe(2)
  })
  it('getByNode filters', () => {
    const j = new ClusterJournal()
    j.append(makeEntry('e1', 'NODE_JOINED', 'c1', 'node-1'))
    j.append(makeEntry('e2', 'NODE_JOINED', 'c1', 'node-2'))
    expect(j.getByNode('node-1').length).toBe(1)
  })
  it('getAll returns copy not reference', () => {
    const j = new ClusterJournal()
    j.append(makeEntry('e1', 'NODE_JOINED'))
    const first = j.getAll()
    j.append(makeEntry('e2', 'NODE_LEFT'))
    expect(first.length).toBe(1)
  })
  it('empty journal returns empty arrays', () => {
    const j = new ClusterJournal()
    expect(j.getAll().length).toBe(0)
    expect(j.getByCluster('c1').length).toBe(0)
    expect(j.getByEventType('FAILOVER').length).toBe(0)
  })
})
