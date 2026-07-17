import { describe, it, expect } from 'vitest'
import { LoopEngine } from '../engine/loop-engine.js'
import type { ObservationEnginePort } from '../engine/loop-engine.js'
import { GoalQueue } from '../queue/goal-queue.js'
import { TriggerRouter } from '../router/trigger-router.js'
import { ApprovalManager } from '../approval/approval-manager.js'
import { ObservationPlanner, SystemStrategy } from '../observation/observation-planner.js'
import { LoopJournal } from '../journal/loop-journal.js'
import { InMemoryLoopStore } from '../store/loop-store.js'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'
import type { Goal } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'
import { EpisodicRecorder } from '@rohinik-org/memory'

class LocalMemoryStore {
  readonly artifacts: import('@rohinik-org/compiler').MemoryArtifact[] = []
  async saveArtifact(a: import('@rohinik-org/compiler').MemoryArtifact) { this.artifacts.push(a) }
  async findRelevant() { return [] }
  async getAll() { return this.artifacts }
  async removeById() { return false }
}

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

const nullObsEngine: ObservationEnginePort = {
  observe: async () => ({ triggers: [] }),
}

const makeUserGoal = (): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId: 'g-user-1', origin: 'USER', priority: 80,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'fetch weather',
    concepts: ['weather'], preferredSkills: ['weather.fetch'],
    constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

describe('LoopEngine full cycle', () => {
  it('executes pre-seeded USER goal and records episode', async () => {
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-1', store)
    const queue = new GoalQueue()

    const translator = new StaticIntentTranslator([
      { input: 'fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
    ])
    const translation = await translator.translate({ input: 'fetch weather' })
    const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')

    const execStore = new NullExecutionStore()
    const executor = new ExecutionEngine(nullResolver, new SequentialExecutionScheduler(), execStore)

    const memStore = new LocalMemoryStore()
    const recorder = new EpisodicRecorder(memStore)

    const wrapPlanner = {
      plan: () => planner.plan(translation.intent, translation, [], 0, 0),
    }
    const wrapExec = { execute: (plan: import('@rohinik-org/compiler').WorkflowPlan) => executor.execute(plan) }
    const wrapRecorder = { record: (r: import('@rohinik-org/compiler').ExecutionResult) => recorder.record(r) }

    const engine = new LoopEngine(
      nullObsEngine,
      new ObservationPlanner([new SystemStrategy()]),
      new TriggerRouter(),
      new ApprovalManager(),
      wrapPlanner,
      wrapExec,
      wrapRecorder,
      queue,
      journal,
      DEFAULT_AUTONOMY_POLICY,
    )

    // Pre-seed USER goal (bypasses requireApprovalFor which only lists OBSERVATION/MEMORY/REFLECTION)
    queue.enqueue(makeUserGoal())

    engine.start()
    await engine.tick()
    engine.stop()

    const report = engine['_report']()
    expect(report.goalsCompleted).toBe(1)
    expect(memStore.artifacts.filter(a => a.artifactKind === 'EPISODE')).toHaveLength(1)
  })

  it('AutonomyReport reflects cycle count after tick', async () => {
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-2', store)
    const queue = new GoalQueue()

    const engine = new LoopEngine(
      nullObsEngine,
      new ObservationPlanner([new SystemStrategy()]),
      new TriggerRouter(),
      new ApprovalManager(),
      { plan: () => { throw new Error('no planner needed') } },
      { execute: async () => { throw new Error('no executor needed') } },
      { record: async () => {} },
      queue,
      journal,
      DEFAULT_AUTONOMY_POLICY,
    )

    engine.start()
    await engine.tick()
    await engine.tick()
    engine.stop()

    const report = engine['_report']()
    expect(report.cycleCount).toBe(2)
  })

  it('deferred OBSERVATION goal does not execute', async () => {
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-3', store)
    const queue = new GoalQueue()
    let executedCount = 0

    const countingPlanner = { plan: () => { executedCount++; throw new Error('should not plan') } }
    const engine = new LoopEngine(
      nullObsEngine,
      new ObservationPlanner([new SystemStrategy()]),
      new TriggerRouter(),
      new ApprovalManager(),
      countingPlanner,
      { execute: async () => { throw new Error('should not execute') } },
      { record: async () => {} },
      queue,
      journal,
      DEFAULT_AUTONOMY_POLICY,
    )

    // OBSERVATION origin → DEFERRED by default policy
    const obsGoal: Goal = { ...makeUserGoal(), goalId: 'g-obs', origin: 'OBSERVATION' }
    queue.enqueue(obsGoal)

    engine.start()
    await engine.tick()
    engine.stop()

    const report = engine['_report']()
    expect(report.goalsDeferred).toBe(1)
    expect(report.goalsCompleted).toBe(0)
    expect(executedCount).toBe(0)
  })
})
