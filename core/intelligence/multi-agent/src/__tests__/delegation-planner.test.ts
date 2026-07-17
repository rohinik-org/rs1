import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../registry/agent-registry.js'
import { DelegationPlanner, AgentCoordinator } from '../coordinator/delegation-planner.js'
import type { AgentDescriptor, AgentCapabilityProfile, AgentGoal } from '@rohinik-org/compiler'

function makeAgent(id: string, role: AgentDescriptor['role'] = 'EXECUTOR'): AgentDescriptor {
  return { agentId: id, name: id, role, capabilityProfileId: `${id}-profile`, version: '1.0' }
}
function makeProfile(id: string, caps: string[], confidence: Record<string, number> = {}): AgentCapabilityProfile {
  return { profileId: `${id}-profile`, capabilities: caps, confidence, preferredDomains: [], forbiddenDomains: [], maxConcurrency: 2, costWeight: 0.2, latencyWeight: 0.1 }
}
function makeGoal(id: string, constraints: string[] = []): AgentGoal {
  return { goalId: id, description: 'test goal', constraints, priority: 1 }
}

describe('DelegationPlanner', () => {
  let registry: AgentRegistry
  let planner: DelegationPlanner

  beforeEach(() => {
    registry = new AgentRegistry()
    planner = new DelegationPlanner(registry)
  })

  it('empty agents → empty plan', () => {
    const plan = planner.plan(makeGoal('g1'), [], 'STAR')
    expect(plan.tasks).toHaveLength(0)
    expect(plan.selectionDecisions).toHaveLength(0)
  })

  it('single agent produces one task', () => {
    const a = makeAgent('a1')
    registry.register(a, makeProfile('a1', ['run']))
    const plan = planner.plan(makeGoal('g1'), [a], 'STAR')
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0]?.assignedAgentId).toBe('a1')
  })

  it('COORDINATOR excluded from worker pool', () => {
    const coord = makeAgent('coord', 'COORDINATOR')
    const worker = makeAgent('worker', 'EXECUTOR')
    registry.register(coord, makeProfile('coord', ['manage']))
    registry.register(worker, makeProfile('worker', ['run'], { run: 0.9 }))
    const plan = planner.plan(makeGoal('g1'), [coord, worker], 'STAR')
    expect(plan.tasks.every(t => t.assignedAgentId === 'worker')).toBe(true)
  })

  it('selectionDecision tracks rejected agents', () => {
    const a = makeAgent('a1')
    const b = makeAgent('b1')
    registry.register(a, makeProfile('a1', ['typescript'], { typescript: 0.9 }))
    registry.register(b, makeProfile('b1', ['typescript'], { typescript: 0.4 }))
    const plan = planner.plan(makeGoal('g1', ['typescript']), [a, b], 'STAR')
    const dec = plan.selectionDecisions[0]
    expect(dec?.selectedAgentId).toBe('a1')
    expect(dec?.rejectedAgentIds).toContain('b1')
  })

  it('PIPELINE topology caps at 3 slots', () => {
    const agents = ['a', 'b', 'c', 'd'].map(id => makeAgent(id))
    agents.forEach(a => registry.register(a, makeProfile(a.agentId, [])))
    const plan = planner.plan(makeGoal('g1'), agents, 'PIPELINE')
    expect(plan.tasks.length).toBeLessThanOrEqual(3)
  })

  it('goalId propagated to tasks', () => {
    const a = makeAgent('a1')
    registry.register(a, makeProfile('a1', []))
    const plan = planner.plan(makeGoal('goal-xyz'), [a], 'STAR')
    expect(plan.tasks[0]?.goalId).toBe('goal-xyz')
  })
})

describe('AgentCoordinator', () => {
  it('coordinate delegates to planner', () => {
    const registry = new AgentRegistry()
    const a = makeAgent('a1')
    registry.register(a, makeProfile('a1', []))
    const coordinator = new AgentCoordinator(registry)
    const plan = coordinator.coordinate(makeGoal('g1'), [a], 'STAR')
    expect(plan.tasks).toHaveLength(1)
  })

  it('selection decisions produced per task', () => {
    const registry = new AgentRegistry()
    const a = makeAgent('a1')
    registry.register(a, makeProfile('a1', []))
    const coordinator = new AgentCoordinator(registry)
    const plan = coordinator.coordinate(makeGoal('g1'), [a], 'MESH')
    expect(plan.selectionDecisions).toHaveLength(plan.tasks.length)
  })
})
