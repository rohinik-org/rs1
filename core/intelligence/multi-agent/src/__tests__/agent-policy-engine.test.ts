import { describe, it, expect } from 'vitest'
import { AgentPolicyEngine } from '../policy/agent-policy-engine.js'
import { DEFAULT_AGENT_POLICY } from '@rohinik-org/compiler'
import type { AgentSession, ConsensusDecision } from '@rohinik-org/compiler'

function makeDecision(selectedResultId = 'r1'): ConsensusDecision {
  return { decisionId: 'd1', strategy: 'MAJORITY', selectedResultId, participatingAgentIds: ['a1'], votingRecord: { a1: 'r1' }, decidedAt: new Date().toISOString() }
}
function makeSession(status: AgentSession['status'], taskCount = 1): AgentSession {
  return {
    sessionId: 's1', goalId: 'g1', topology: 'STAR',
    participatingAgentIds: ['a1'],
    tasks: Array.from({ length: taskCount }, (_, i) => ({ taskId: `t${i}`, goalId: 'g1', assignedAgentId: 'a1' })),
    results: [], selectionDecisions: [],
    consensusDecision: makeDecision(),
    promotionDecisions: [],
    status,
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
  }
}

describe('AgentPolicyEngine', () => {
  const engine = new AgentPolicyEngine()

  it('COMPLETED session → APPROVED', () => {
    expect(engine.evaluate(makeSession('COMPLETED'), DEFAULT_AGENT_POLICY)).toBe('APPROVED')
  })

  it('FAILED session → REJECTED', () => {
    expect(engine.evaluate(makeSession('FAILED'), DEFAULT_AGENT_POLICY)).toBe('REJECTED')
  })

  it('PARTIAL session → DEFERRED', () => {
    expect(engine.evaluate(makeSession('PARTIAL'), DEFAULT_AGENT_POLICY)).toBe('DEFERRED')
  })

  it('task count exceeds delegation budget → REJECTED', () => {
    const session = makeSession('COMPLETED', 200)
    expect(engine.evaluate(session, DEFAULT_AGENT_POLICY)).toBe('REJECTED')
  })

  it('UNANIMOUS strategy with empty selectedResultId → DEFERRED', () => {
    const session = {
      ...makeSession('COMPLETED'),
      consensusDecision: makeDecision(''),
    }
    const policy = { ...DEFAULT_AGENT_POLICY, consensusStrategy: 'UNANIMOUS' as const }
    expect(engine.evaluate(session, policy)).toBe('DEFERRED')
  })

  it('APPROVED with many agents under budget', () => {
    const session = makeSession('COMPLETED', 3)
    expect(engine.evaluate(session, DEFAULT_AGENT_POLICY)).toBe('APPROVED')
  })
})
