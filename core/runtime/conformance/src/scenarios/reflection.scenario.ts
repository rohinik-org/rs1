import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'
import { EpisodicRecorder } from '@rohinik-org/memory'
import {
  LoopEngine, GoalQueue, TriggerRouter, ApprovalManager,
  ObservationPlanner, SystemStrategy, LoopJournal, InMemoryLoopStore,
} from '@rohinik-org/autonomy'
import type { ObservationEnginePort } from '@rohinik-org/autonomy'
import { ReflectionEngine } from '@rohinik-org/reflection'
import { NullReflectionStore } from '@rohinik-org/reflection'

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

class LocalMemoryStore {
  readonly artifacts: import('@rohinik-org/compiler').MemoryArtifact[] = []
  async saveArtifact(a: import('@rohinik-org/compiler').MemoryArtifact) { this.artifacts.push(a) }
  async findRelevant() { return [] }
  async getAll() { return this.artifacts }
  async removeById() { return false }
}

const nullObsEngine: ObservationEnginePort = {
  observe: async () => ({ triggers: [] }),
}

export async function runReflectionScenario(
  loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const loopStore = new InMemoryLoopStore()
  const journal = new LoopJournal('loop-ref', loopStore)
  const queue = new GoalQueue()

  const translator = new StaticIntentTranslator([
    { input: 'fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
  ])
  const translation = await translator.translate({ input: 'fetch weather' })
  const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
  const executor = new ExecutionEngine(nullResolver, new SequentialExecutionScheduler(), new NullExecutionStore())
  const memStore = new LocalMemoryStore()
  const recorder = new EpisodicRecorder(memStore)

  const engine = new LoopEngine(
    nullObsEngine,
    new ObservationPlanner([new SystemStrategy()]),
    new TriggerRouter(),
    new ApprovalManager(),
    { plan: () => planner.plan(translation.intent, translation, [], loaded.fixture.graphRevision, 0) },
    { execute: (plan) => executor.execute(plan) },
    { record: (r) => recorder.record(r) },
    queue,
    journal,
    DEFAULT_AUTONOMY_POLICY,
  )

  queue.enqueue({
    kind: 'Goal', schemaVersion: '1.0', goalId: 'g-ref-1', origin: 'USER', priority: 80,
    intent: translation.intent,
    status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })

  engine.start()
  await engine.tick()
  engine.stop()

  // Reflect on execution results
  const reflectionStore = new NullReflectionStore()
  const reflectionEngine = new ReflectionEngine(reflectionStore)

  const episodes = memStore.artifacts.filter(a => a.artifactKind === 'EPISODE')
  let reportStatus: string = 'SKIPPED'

  if (episodes.length > 0) {
    // Build a synthetic ExecutionResult from the episode for reflection
    const report = await reflectionEngine.reflect({
      kind: 'ExecutionResult', schemaVersion: '1.0',
      executionId: 'exec-ref-1', executionRevision: 1, planId: 'plan-ref-1',
      metadata: { planId: 'plan-ref-1' },
      termination: { reason: 'SUCCESS' },
      stepRecords: [{ stepId: 's1', position: 0, skillId: 'weather.fetch', state: 'COMPLETED', attempts: 1 }],
      journal: [],
      metrics: { totalDurationMs: 500, stepDurations: {}, retryCount: 0, providerLatencyMs: {}, estimatedCostUsd: 0, tokensUsed: 0 },
      outputs: {},
      producedAt: new Date().toISOString(),
    })
    reportStatus = report.status
  }

  const loopReport = engine['_report']()

  return {
    goalsCompleted: loopReport.goalsCompleted,
    episodeRecorded: episodes.length > 0,
    reflectionReportStatus: reportStatus,
    reportPersisted: (await reflectionStore.list()).length > 0,
  }
}
