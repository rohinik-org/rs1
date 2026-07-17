import { describe, it, expect } from 'vitest'
import { MemoryPolicy } from '../policy/memory-policy.js'
import { DEFAULT_MEMORY_POLICY } from '@rohinik-org/compiler'
import type { MemoryCandidate } from '@rohinik-org/compiler'

function makeCandidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    candidateId: 'cand-1',
    kind: 'EPISODIC',
    sourceExecutionId: 'exec-1',
    evidence: {},
    confidence: 1.0,
    producedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MemoryPolicy', () => {
  it('episodic candidate always passes when episodicEnabled', () => {
    const policy = new MemoryPolicy(DEFAULT_MEMORY_POLICY)
    const candidate = makeCandidate({ kind: 'EPISODIC' })
    expect(policy.gate(candidate)).toBe(true)
  })

  it('semantic candidate blocked when semanticEnabled is false', () => {
    const policy = new MemoryPolicy({ ...DEFAULT_MEMORY_POLICY, semanticEnabled: false })
    const candidate = makeCandidate({ kind: 'SEMANTIC' })
    expect(policy.gate(candidate)).toBe(false)
  })

  it('procedural candidate blocked below minConfidenceForProcedural', () => {
    const policy = new MemoryPolicy({ ...DEFAULT_MEMORY_POLICY, proceduralEnabled: true, minConfidenceForProcedural: 0.8 })
    const low = makeCandidate({ kind: 'PROCEDURAL', confidence: 0.5 })
    const high = makeCandidate({ kind: 'PROCEDURAL', confidence: 0.9 })
    expect(policy.gate(low)).toBe(false)
    expect(policy.gate(high)).toBe(true)
  })

  it('applyTtl sets expiresAt when defaultTtlDays is set', () => {
    const policy = new MemoryPolicy({ ...DEFAULT_MEMORY_POLICY, defaultTtlDays: 30 })
    const expiry = policy.computeExpiresAt()
    expect(expiry).toBeDefined()
    const days = (new Date(expiry!).getTime() - Date.now()) / 86_400_000
    expect(days).toBeCloseTo(30, 0)
  })

  it('sensitive concept blocks semantic candidate when concept matches pattern', () => {
    const policy = new MemoryPolicy({ ...DEFAULT_MEMORY_POLICY, semanticEnabled: true, minConfidenceForSemantic: 0.5, sensitiveConceptPatterns: ['password'] })
    const candidate = makeCandidate({ kind: 'SEMANTIC', evidence: { concept: 'password-reset' } })
    expect(policy.gate(candidate)).toBe(false)
  })

  it('DEFAULT_MEMORY_POLICY has episodic on, semantic + procedural off', () => {
    expect(DEFAULT_MEMORY_POLICY.episodicEnabled).toBe(true)
    expect(DEFAULT_MEMORY_POLICY.semanticEnabled).toBe(false)
    expect(DEFAULT_MEMORY_POLICY.proceduralEnabled).toBe(false)
  })
})
