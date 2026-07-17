import { describe, it, expect } from 'vitest'
import { ClusterPolicyEngine } from '../policy/cluster-policy-engine.js'
import { DEFAULT_CLUSTER_POLICY } from '@rohinik-org/compiler'

describe('ClusterPolicyEngine', () => {
  it('REMOTE_EXECUTE allowed by default policy', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('REMOTE_EXECUTE', DEFAULT_CLUSTER_POLICY)).toBe('ALLOWED')
  })
  it('REMOTE_EXECUTE rejected when allowRemoteExecution=false', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('REMOTE_EXECUTE', { ...DEFAULT_CLUSTER_POLICY, allowRemoteExecution: false })).toBe('REJECTED')
  })
  it('REPLICATE allowed by default policy', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('REPLICATE', DEFAULT_CLUSTER_POLICY)).toBe('ALLOWED')
  })
  it('REPLICATE rejected when allowReplication=false', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('REPLICATE', { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })).toBe('REJECTED')
  })
  it('MEMORY_ACCESS rejected when allowReplication=false', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('MEMORY_ACCESS', { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })).toBe('REJECTED')
  })
  it('MEMORY_ACCESS allowed when allowReplication=true', () => {
    const engine = new ClusterPolicyEngine()
    expect(engine.evaluate('MEMORY_ACCESS', DEFAULT_CLUSTER_POLICY)).toBe('ALLOWED')
  })
})
