import { describe, it, expect } from 'vitest'
import { GoalQueue } from '../queue/goal-queue.js'
import { TriggerRouter } from '../router/trigger-router.js'
import { ObservationPlanner, SystemStrategy, GoalStrategy, PolicyStrategy } from '../observation/observation-planner.js'
import type { Goal, LearningTrigger, RuntimeState, AutonomyPolicy } from '@rohinik-org/compiler'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'

const makeGoal = (goalId: string, priority: number): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId, origin: 'USER', priority,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'test',
    concepts: ['weather', 'fetch'], preferredSkills: [],
    constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

const makeTrigger = (): LearningTrigger => ({
  kind: 'LearningTrigger', schemaVersion: '1.0', triggerId: 'trig-001',
  detectedAt: new Date().toISOString(), triggerKind: 'DEPRECATION_SIGNAL',
  evidence: { metric: 'deprecated', observedValue: 1, confidence: 0.9, confidenceMethod: 'DIRECT_OBSERVATION', sampleSize: 1 },
  suggestedCommand: 'rhk acquire left-pad',
  corpusWindowStart: '', corpusWindowEnd: '', recordCount: 1,
})

const makeState = (): RuntimeState => ({
  loopId: 'loop-1', loopState: 'RUNNING', cycleCount: 1, activeGoals: 0, queueDepth: 0, uptimeMs: 1000,
})

describe('GoalQueue', () => {
  it('dequeues in priority order', () => {
    const queue = new GoalQueue()
    queue.enqueue(makeGoal('low', 10))
    queue.enqueue(makeGoal('high', 90))
    queue.enqueue(makeGoal('mid', 50))
    expect(queue.dequeue()?.goalId).toBe('high')
    expect(queue.dequeue()?.goalId).toBe('mid')
    expect(queue.dequeue()?.goalId).toBe('low')
  })

  it('peek does not remove', () => {
    const queue = new GoalQueue()
    queue.enqueue(makeGoal('g-1', 50))
    expect(queue.peek()?.goalId).toBe('g-1')
    expect(queue.size()).toBe(1)
  })

  it('cancel removes goal', () => {
    const queue = new GoalQueue()
    queue.enqueue(makeGoal('g-1', 50))
    queue.enqueue(makeGoal('g-2', 50))
    expect(queue.cancel('g-1')).toBe(true)
    expect(queue.size()).toBe(1)
    expect(queue.cancel('nonexistent')).toBe(false)
  })
})

describe('TriggerRouter', () => {
  it('routes trigger to Goal with OBSERVATION origin', () => {
    const router = new TriggerRouter()
    const trigger = makeTrigger()
    const goal = router.route(trigger)
    expect(goal.origin).toBe('OBSERVATION')
    expect(goal.triggerRef).toBe(trigger.triggerId)
    expect(goal.status).toBe('PENDING')
    expect(goal.intent.rawInput).toBe(trigger.suggestedCommand)
  })
})

describe('ObservationPlanner', () => {
  it('SystemStrategy always returns provider health query', () => {
    const strategy = new SystemStrategy()
    const queries = strategy.plan(makeState(), DEFAULT_AUTONOMY_POLICY)
    expect(queries.length).toBeGreaterThan(0)
    expect(queries[0]!.categories).toContain('PROVIDER')
  })

  it('GoalStrategy uses goal intent concepts', () => {
    const goal = makeGoal('g-1', 50)
    const strategy = new GoalStrategy([goal])
    const queries = strategy.plan(makeState(), DEFAULT_AUTONOMY_POLICY)
    expect(queries[0]!.terms).toContain('weather')
    expect(queries[0]!.terms).toContain('fetch')
  })

  it('PolicyStrategy uses observationTerms from policy', () => {
    const policy: AutonomyPolicy = { ...DEFAULT_AUTONOMY_POLICY, observationTerms: ['tensorflow', 'pytorch'] }
    const strategy = new PolicyStrategy()
    const queries = strategy.plan(makeState(), policy)
    expect(queries[0]!.terms).toContain('tensorflow')
  })

  it('planner merges and deduplicates strategies', () => {
    const goal = makeGoal('g-1', 50)
    const planner = new ObservationPlanner([new SystemStrategy(), new GoalStrategy([goal])])
    const queries = planner.plan(makeState(), DEFAULT_AUTONOMY_POLICY)
    expect(queries.length).toBeGreaterThanOrEqual(2)
    // No duplicate keys
    const keys = queries.map(q => q.categories.join(',') + ':' + q.terms.join(','))
    expect(new Set(keys).size).toBe(keys.length)
  })
})
