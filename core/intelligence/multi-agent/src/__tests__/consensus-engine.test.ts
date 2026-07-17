import { describe, it, expect } from 'vitest'
import { ConsensusEngine } from '../consensus/consensus-engine.js'
import { ResultMerger } from '../consensus/result-merger.js'
import { MemoryPromotionEngine } from '../promotion/memory-promotion-engine.js'
import { AgentRegistry } from '../registry/agent-registry.js'
import type { AgentResult, AgentDescriptor, AgentCapabilityProfile, AgentTask } from '@rohinik-org/compiler'

function makeResult(id: string, agentId: string, taskId = 't1'): AgentResult {
  return { resultId: id, agentId, taskId, inferenceChainId: `chain-${id}`, completedAt: new Date().toISOString() }
}
function makeAgent(id: string, role: AgentDescriptor['role'] = 'EXECUTOR'): AgentDescriptor {
  return { agentId: id, name: id, role, capabilityProfileId: `${id}-profile`, version: '1.0' }
}
function makeProfile(id: string, confidence: Record<string, number> = {}): AgentCapabilityProfile {
  return { profileId: `${id}-profile`, capabilities: Object.keys(confidence), confidence, preferredDomains: [], forbiddenDomains: [], maxConcurrency: 2, costWeight: 0.2, latencyWeight: 0.1 }
}
function makeTask(id: string): AgentTask {
  return { taskId: id, goalId: 'g1', assignedAgentId: 'a1' }
}

describe('ConsensusEngine', () => {
  const engine = new ConsensusEngine()
  const registry = new AgentRegistry()

  it('empty results → empty selectedResultId', () => {
    const d = engine.decide([], 'MAJORITY', registry)
    expect(d.selectedResultId).toBe('')
  })

  it('MAJORITY selects result with most votes', () => {
    const r1 = makeResult('r1', 'a1')
    const r2 = makeResult('r1', 'a2')  // same resultId = two votes for r1
    const r3 = makeResult('r3', 'a3')
    const d = engine.decide([r1, r2, r3], 'MAJORITY', registry)
    expect(d.selectedResultId).toBe('r1')
  })

  it('WEIGHTED selects highest-confidence agent result', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('high'), makeProfile('high', { typescript: 0.9, test: 0.85 }))
    reg.register(makeAgent('low'), makeProfile('low', { typescript: 0.3 }))
    const d = engine.decide([makeResult('r-high', 'high'), makeResult('r-low', 'low')], 'WEIGHTED', reg)
    expect(d.selectedResultId).toBe('r-high')
  })

  it('SUPERVISOR selects COORDINATOR result', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('coord', 'COORDINATOR'), makeProfile('coord'))
    reg.register(makeAgent('worker', 'EXECUTOR'), makeProfile('worker'))
    const d = engine.decide([makeResult('r-worker', 'worker'), makeResult('r-coord', 'coord')], 'SUPERVISOR', reg)
    expect(d.selectedResultId).toBe('r-coord')
  })

  it('participatingAgentIds includes all agents', () => {
    const d = engine.decide([makeResult('r1', 'a1'), makeResult('r2', 'a2')], 'MAJORITY', registry)
    expect(d.participatingAgentIds).toContain('a1')
    expect(d.participatingAgentIds).toContain('a2')
  })

  it('votingRecord has entry per agent', () => {
    const d = engine.decide([makeResult('r1', 'a1'), makeResult('r2', 'a2')], 'MAJORITY', registry)
    expect(Object.keys(d.votingRecord)).toContain('a1')
    expect(Object.keys(d.votingRecord)).toContain('a2')
  })
})

describe('ResultMerger', () => {
  it('merges inferenceChainIds from all results', () => {
    const merger = new ResultMerger()
    const engine = new ConsensusEngine()
    const registry = new AgentRegistry()
    const results = [makeResult('r1', 'a1'), makeResult('r2', 'a2')]
    const decision = engine.decide(results, 'MAJORITY', registry)
    const composite = merger.merge(results, decision)
    expect(composite.mergedInferenceChainIds).toContain('chain-r1')
    expect(composite.mergedInferenceChainIds).toContain('chain-r2')
  })
})

describe('MemoryPromotionEngine', () => {
  const engine = new MemoryPromotionEngine()

  it('produces one decision per task', () => {
    const decisions = engine.evaluate([makeResult('r1', 'a1', 't1')], [makeTask('t1'), makeTask('t2')])
    expect(decisions).toHaveLength(2)
  })

  it('promotes inferenceChainId for matching task results', () => {
    const decisions = engine.evaluate([makeResult('r1', 'a1', 't1')], [makeTask('t1')])
    expect(decisions[0]?.promotedMemoryIds).toContain('chain-r1')
  })

  it('empty results → empty promoted list', () => {
    const decisions = engine.evaluate([], [makeTask('t1')])
    expect(decisions[0]?.promotedMemoryIds).toHaveLength(0)
  })

  it('rationale is non-empty string array', () => {
    const decisions = engine.evaluate([makeResult('r1', 'a1', 't1')], [makeTask('t1')])
    expect(decisions[0]?.rationale.length).toBeGreaterThan(0)
  })

  it('taskId propagated to decision', () => {
    const decisions = engine.evaluate([], [makeTask('task-xyz')])
    expect(decisions[0]?.taskId).toBe('task-xyz')
  })

  it('discardedMemoryIds is empty (all promoted)', () => {
    const decisions = engine.evaluate([makeResult('r1', 'a1', 't1')], [makeTask('t1')])
    expect(decisions[0]?.discardedMemoryIds).toHaveLength(0)
  })
})
