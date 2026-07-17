import { describe, it, expect } from 'vitest'
import { ConsolidationEngine } from '../consolidation/consolidation-engine.js'
import { MemoryPolicy } from '../policy/memory-policy.js'
import { NullMemoryStore } from '../store/null-memory-store.js'
import { DEFAULT_MEMORY_POLICY } from '@rohinik-org/compiler'
import type { MemoryCandidateSet, MemoryCandidate } from '@rohinik-org/compiler'

function makeCandidate(kind: MemoryCandidate['kind'], confidence = 1.0): MemoryCandidate {
  return {
    candidateId: `c-${kind}-${confidence}`,
    kind,
    sourceExecutionId: 'exec-1',
    evidence: { test: true },
    confidence,
    producedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeCandidateSet(candidates: MemoryCandidate[]): MemoryCandidateSet {
  return {
    kind: 'MemoryCandidateSet',
    setId: 'set-1',
    executionId: 'exec-1',
    candidates,
    producedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('ConsolidationEngine', () => {
  it('episodic candidate produces EPISODE artifact', async () => {
    const engine = new ConsolidationEngine(new MemoryPolicy(DEFAULT_MEMORY_POLICY), new NullMemoryStore())
    const artifacts = await engine.consolidate(makeCandidateSet([makeCandidate('EPISODIC')]))
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]!.artifactKind).toBe('EPISODE')
  })

  it('semantic candidate rejected when semanticEnabled is false', async () => {
    const engine = new ConsolidationEngine(new MemoryPolicy(DEFAULT_MEMORY_POLICY), new NullMemoryStore())
    const artifacts = await engine.consolidate(makeCandidateSet([makeCandidate('SEMANTIC')]))
    expect(artifacts).toHaveLength(0)
  })

  it('importanceScore assigned from candidate confidence', async () => {
    const engine = new ConsolidationEngine(new MemoryPolicy(DEFAULT_MEMORY_POLICY), new NullMemoryStore())
    const artifacts = await engine.consolidate(makeCandidateSet([makeCandidate('EPISODIC', 0.6)]))
    expect(artifacts[0]!.importanceScore).toBeCloseTo(0.6)
  })

  it('expiresAt set when TTL configured', async () => {
    const policy = new MemoryPolicy({ ...DEFAULT_MEMORY_POLICY, defaultTtlDays: 7 })
    const engine = new ConsolidationEngine(policy, new NullMemoryStore())
    const artifacts = await engine.consolidate(makeCandidateSet([makeCandidate('EPISODIC')]))
    expect(artifacts[0]!.expiresAt).toBeDefined()
  })

  it('empty candidate set produces no artifacts', async () => {
    const engine = new ConsolidationEngine(new MemoryPolicy(DEFAULT_MEMORY_POLICY), new NullMemoryStore())
    const artifacts = await engine.consolidate(makeCandidateSet([]))
    expect(artifacts).toHaveLength(0)
  })
})
