import { describe, it, expect } from 'vitest'
import { RemoteMemoryBridge } from '../memory/remote-memory-bridge.js'
import { DEFAULT_CLUSTER_POLICY } from '@rohinik-org/compiler'

describe('RemoteMemoryBridge', () => {
  it('query returns entries for matching node and scope', () => {
    const bridge = new RemoteMemoryBridge()
    bridge.write({ entryId: 'e1', nodeId: 'n1', scope: 'TASK', key: 'k', value: 'v' })
    const results = bridge.query('n1', 'TASK', DEFAULT_CLUSTER_POLICY)
    expect(results.length).toBe(1)
  })
  it('query returns [] when allowReplication=false', () => {
    const bridge = new RemoteMemoryBridge()
    bridge.write({ entryId: 'e1', nodeId: 'n1', scope: 'TASK', key: 'k', value: 'v' })
    const results = bridge.query('n1', 'TASK', { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })
    expect(results.length).toBe(0)
  })
  it('queryAll CLUSTER_GLOBAL returns only CLUSTER_GLOBAL entries', () => {
    const bridge = new RemoteMemoryBridge()
    bridge.write({ entryId: 'e1', nodeId: 'n1', scope: 'CLUSTER_GLOBAL', key: 'k', value: 'v' })
    bridge.write({ entryId: 'e2', nodeId: 'n1', scope: 'TASK', key: 'k2', value: 'v2' })
    const results = bridge.queryAll('CLUSTER_GLOBAL', DEFAULT_CLUSTER_POLICY)
    expect(results.length).toBe(1)
    expect(results[0]!.scope).toBe('CLUSTER_GLOBAL')
  })
  it('queryAll returns [] when allowReplication=false', () => {
    const bridge = new RemoteMemoryBridge()
    bridge.write({ entryId: 'e1', nodeId: 'n1', scope: 'CLUSTER_GLOBAL', key: 'k', value: 'v' })
    const results = bridge.queryAll('CLUSTER_GLOBAL', { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })
    expect(results.length).toBe(0)
  })
})
