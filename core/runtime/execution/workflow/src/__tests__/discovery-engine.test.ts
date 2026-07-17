import { describe, it, expect } from 'vitest'
import { WorkflowDiscoveryEngine } from '../discovery/workflow-discovery-engine.js'
import { SlidingWindowExtractor } from '../discovery/sliding-window-extractor.js'
import { DefaultWorkflowConfidenceStrategy } from '../scoring/default-confidence-strategy.js'
import type { ExecutionChain, ExecutionRecord } from '@rohinik-org/compiler'
import { createHash } from 'node:crypto'

function makeChain(chainId: string, skillIds: string[]): ExecutionChain {
  const records: ExecutionRecord[] = skillIds.map((skillId, i) => ({
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: `${chainId}-r${i}`, runtimeId: 'rt', timestamp: `2026-01-01T00:00:0${i}Z`,
    requestId: `${chainId}-step${i}`, requestHash: 'h', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerSkillId: skillId, winnerTierId: 'tier1',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: `${chainId}-step${i}`, runtimeVersion: '1.0.0',
  }))
  return { chainId, records, corpusRevision: 0, startedAt: records[0]!.timestamp, completedAt: records[records.length - 1]!.timestamp }
}

function makeEngine() {
  return new WorkflowDiscoveryEngine(new SlidingWindowExtractor(), new DefaultWorkflowConfidenceStrategy())
}

function candidateId(skillIds: string[]): string {
  const steps = skillIds.map((skillId, position) => ({ skillId, position }))
  return createHash('sha256').update(JSON.stringify(steps)).digest('hex')
}

describe('WorkflowDiscoveryEngine', () => {
  it('returns empty candidates for empty chain list', async () => {
    const result = await makeEngine().discover([], {})
    expect(result.candidates).toHaveLength(0)
    expect(result.recordsScanned).toBe(0)
    expect(result.chainsGenerated).toBe(0)
  })

  it('returns no candidates when support below minSupport', async () => {
    const chains = [makeChain('c1', ['a', 'b'])]
    const result = await makeEngine().discover(chains, { minSupport: 3 })
    expect(result.candidates).toHaveLength(0)
  })

  it('returns candidate when support meets minSupport', async () => {
    const chains = Array.from({ length: 3 }, (_, i) => makeChain(`c${i}`, ['a', 'b']))
    const result = await makeEngine().discover(chains, { minSupport: 3 })
    expect(result.candidates.length).toBeGreaterThan(0)
    const c = result.candidates[0]!
    expect(c.definition.candidateId).toBe(candidateId(['a', 'b']))
    expect(c.evidence.uniqueSessions).toBe(3)
  })

  it('candidateId is SHA-256 of skillId+position only', async () => {
    const chains = Array.from({ length: 5 }, (_, i) => makeChain(`c${i}`, ['x', 'y']))
    const result = await makeEngine().discover(chains, { minSupport: 3 })
    const c = result.candidates.find(c => c.definition.steps.length === 2)!
    expect(c.definition.candidateId).toBe(candidateId(['x', 'y']))
  })

  it('excludes sequences longer than maxChainLength', async () => {
    const chains = Array.from({ length: 5 }, (_, i) => makeChain(`c${i}`, ['a', 'b', 'c', 'd', 'e']))
    const result = await makeEngine().discover(chains, { minSupport: 3, maxChainLength: 2 })
    for (const c of result.candidates) {
      expect(c.definition.steps.length).toBeLessThanOrEqual(2)
    }
  })

  it('records recordsScanned and chainsGenerated', async () => {
    const chains = [makeChain('c1', ['a', 'b']), makeChain('c2', ['c', 'd'])]
    const result = await makeEngine().discover(chains, {})
    expect(result.recordsScanned).toBe(4)
    expect(result.chainsGenerated).toBe(2)
  })

  it('filters by minConfidence', async () => {
    // With only 3 successes, default strategy yields low confidence (~0.545 < 0.8)
    const chains = Array.from({ length: 3 }, (_, i) => makeChain(`c${i}`, ['a', 'b']))
    const result = await makeEngine().discover(chains, { minSupport: 3, minConfidence: 0.8 })
    expect(result.candidates).toHaveLength(0)
  })

  it('result has kind and schemaVersion', async () => {
    const result = await makeEngine().discover([], {})
    expect(result.kind).toBe('WorkflowCandidateSet')
    expect(result.schemaVersion).toBe('1.0')
  })
})
