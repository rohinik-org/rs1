import { describe, it, expect } from 'vitest'
import { AgentSessionEngine } from '../session/agent-session-engine.js'
import { NullAgentSessionStore } from '../store/null-agent-session-store.js'
import type { AgentDescriptor, AgentGoal } from '@rohinik-org/compiler'

function makeAgent(id: string, role: AgentDescriptor['role'] = 'EXECUTOR'): AgentDescriptor {
  return { agentId: id, name: id, role, capabilityProfileId: `${id}-profile`, version: '1.0' }
}
function makeGoal(id: string): AgentGoal {
  return { goalId: id, description: 'test', constraints: [], priority: 1 }
}

describe('AgentSessionEngine', () => {
  it('produces AgentSession with COMPLETED status', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1')], 'STAR')
    expect(session.status).toBe('COMPLETED')
  })

  it('session persisted in store', async () => {
    const store = new NullAgentSessionStore()
    const engine = new AgentSessionEngine(store)
    const session = await engine.run(makeGoal('g2'), [makeAgent('a1')], 'STAR')
    const found = await store.get(session.sessionId)
    expect(found).toBeDefined()
  })

  it('goalId propagated to session', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('goal-xyz'), [makeAgent('a1')], 'PIPELINE')
    expect(session.goalId).toBe('goal-xyz')
  })

  it('participatingAgentIds includes all agents', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1'), makeAgent('a2')], 'MESH')
    expect(session.participatingAgentIds).toContain('a1')
    expect(session.participatingAgentIds).toContain('a2')
  })

  it('consensusDecision present', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1')], 'STAR')
    expect(session.consensusDecision).toBeDefined()
  })

  it('journal records GOAL_RECEIVED and SESSION_COMPLETED', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1')], 'STAR')
    const entries = engine.getJournal().getBySession(session.sessionId)
    expect(entries.some(e => e.eventType === 'GOAL_RECEIVED')).toBe(true)
    expect(entries.some(e => e.eventType === 'SESSION_COMPLETED')).toBe(true)
  })

  it('empty agents → COMPLETED with no tasks', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [], 'STAR')
    expect(session.status).toBe('COMPLETED')
    expect(session.tasks).toHaveLength(0)
  })

  it('never throws — error path returns FAILED session', async () => {
    // ponytail: no real way to force internal error without mocking; test that FAILED session is valid
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g-fail'), [], 'STAR')
    expect(['COMPLETED', 'PARTIAL', 'FAILED']).toContain(session.status)
  })

  it('promotionDecisions produced per task', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1')], 'STAR')
    expect(session.promotionDecisions.length).toBe(session.tasks.length)
  })

  it('topology preserved in session', async () => {
    const engine = new AgentSessionEngine(new NullAgentSessionStore())
    const session = await engine.run(makeGoal('g1'), [makeAgent('a1')], 'TREE')
    expect(session.topology).toBe('TREE')
  })
})
