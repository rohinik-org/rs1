import { describe, it, expect } from 'vitest'
import { RequestIdChainResolver } from '../chain/request-id-chain-resolver.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function rec(id: string, requestId: string, skillId: string, ts: string): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: id, runtimeId: 'rt1', timestamp: ts,
    requestId, requestHash: 'h', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerSkillId: skillId, winnerTierId: 'tier1',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: requestId, runtimeVersion: '1.0.0',
  }
}

describe('RequestIdChainResolver', () => {
  it('returns empty array for empty input', () => {
    const resolver = new RequestIdChainResolver()
    expect(resolver.resolve([])).toHaveLength(0)
  })

  it('groups records by requestId prefix into chains', () => {
    const records = [
      rec('r1', 'sess-1-step1', 'skill-a', '2026-01-01T00:00:01Z'),
      rec('r2', 'sess-1-step2', 'skill-b', '2026-01-01T00:00:02Z'),
      rec('r3', 'sess-2-step1', 'skill-c', '2026-01-01T00:00:03Z'),
    ]
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains).toHaveLength(2)
    const chain1 = chains.find(c => c.chainId === 'sess-1')!
    expect(chain1).toBeDefined()
    expect(chain1.records).toHaveLength(2)
    expect(chain1.records[0]!.winnerSkillId).toBe('skill-a')
    expect(chain1.records[1]!.winnerSkillId).toBe('skill-b')
  })

  it('orders records by step number ascending', () => {
    const records = [
      rec('r2', 'sess-1-step2', 'skill-b', '2026-01-01T00:00:02Z'),
      rec('r1', 'sess-1-step1', 'skill-a', '2026-01-01T00:00:01Z'),
    ]
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains[0]!.records[0]!.winnerSkillId).toBe('skill-a')
    expect(chains[0]!.records[1]!.winnerSkillId).toBe('skill-b')
  })

  it('excludes records without winnerSkillId', () => {
    const records = [
      rec('r1', 'sess-1-step1', 'skill-a', '2026-01-01T00:00:01Z'),
      { ...rec('r2', 'sess-1-step2', 'skill-b', '2026-01-01T00:00:02Z'), winnerSkillId: undefined },
    ] as ExecutionRecord[]
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains[0]!.records).toHaveLength(1)
  })

  it('excludes records not matching step pattern', () => {
    const records = [
      rec('r1', 'sess-1-step1', 'skill-a', '2026-01-01T00:00:01Z'),
      rec('r2', 'plain-request', 'skill-b', '2026-01-01T00:00:02Z'),
    ]
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains).toHaveLength(1)
    expect(chains[0]!.chainId).toBe('sess-1')
  })

  it('attaches startedAt and completedAt from first and last records', () => {
    const records = [
      rec('r1', 'sess-1-step1', 'skill-a', '2026-01-01T00:00:01Z'),
      rec('r2', 'sess-1-step2', 'skill-b', '2026-01-01T00:00:05Z'),
    ]
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains[0]!.startedAt).toBe('2026-01-01T00:00:01Z')
    expect(chains[0]!.completedAt).toBe('2026-01-01T00:00:05Z')
  })
})
