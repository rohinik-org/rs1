import { describe, it, expect } from 'vitest'
import { LoopEngine } from '../engine/loop-engine.js'
import type { ObservationEnginePort, WorkflowPlannerPort, ExecutionEnginePort, EpisodicRecorderPort } from '../engine/loop-engine.js'
import { GoalQueue } from '../queue/goal-queue.js'
import { TriggerRouter } from '../router/trigger-router.js'
import { ApprovalManager } from '../approval/approval-manager.js'
import { ObservationPlanner, SystemStrategy } from '../observation/observation-planner.js'
import { LoopJournal } from '../journal/loop-journal.js'
import { InMemoryLoopStore } from '../store/loop-store.js'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'

const nullObsEngine: ObservationEnginePort = {
  observe: async () => ({ triggers: [] }),
}

const nullPlanner: WorkflowPlannerPort = {
  plan: () => ({
    kind: 'WorkflowPlan', schemaVersion: '1.0', planId: 'p-1',
    planRevision: 0, status: 'EXECUTABLE', producedAt: new Date().toISOString(),
    graphRevision: 0, workflowRevision: 0, plannerVersion: '0.1.0',
    intent: {} as never, translationResult: {} as never,
    selectedCandidate: {} as never, alternatives: [],
    steps: [], planningDecision: {} as never, simulation: {} as never,
  }),
}

const nullExecEngine: ExecutionEnginePort = {
  execute: async () => ({
    wait: async (): Promise<import('@rohinik-org/compiler').ExecutionResult> => ({
      kind: 'ExecutionResult', schemaVersion: '1.0',
      executionId: 'exec-1', planId: 'p-1', executionRevision: 0,
      metadata: { planId: 'p-1' },
      termination: { reason: 'SUCCESS' },
      stepRecords: [], metrics: { totalDurationMs: 0, retryCount: 0, estimatedCostUsd: 0, stepDurations: {}, providerLatencyMs: {}, tokensUsed: 0 },
      journal: [], outputs: {},
      producedAt: new Date().toISOString(),
    }),
  }),
}

const nullRecorder: EpisodicRecorderPort = {
  record: async () => {},
}

const makeEngine = () => {
  const store = new InMemoryLoopStore()
  const journal = new LoopJournal('loop-1', store)
  const queue = new GoalQueue()
  return new LoopEngine(
    nullObsEngine,
    new ObservationPlanner([new SystemStrategy()]),
    new TriggerRouter(),
    new ApprovalManager(),
    nullPlanner,
    nullExecEngine,
    nullRecorder,
    queue,
    journal,
    DEFAULT_AUTONOMY_POLICY,
  )
}

describe('LoopEngine', () => {
  it('start() returns handle with RUNNING state', () => {
    const engine = makeEngine()
    const handle = engine.start()
    expect(handle.state).toBe('RUNNING')
    handle.stop()
  })

  it('stop() transitions to STOPPED', () => {
    const engine = makeEngine()
    const handle = engine.start()
    handle.stop()
    expect(handle.state).toBe('STOPPED')
  })

  it('tick() on empty queue is no-op (no crash)', async () => {
    const engine = makeEngine()
    engine.start()
    await expect(engine.tick()).resolves.toBeUndefined()
    engine.stop()
  })

  it('tick() does nothing when STOPPED', async () => {
    const engine = makeEngine()
    const handle = engine.start()
    handle.stop()
    await expect(engine.tick()).resolves.toBeUndefined()
  })
})
