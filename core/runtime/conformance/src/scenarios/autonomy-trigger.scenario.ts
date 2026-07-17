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
import type { LearningTrigger } from '@rohinik-org/compiler'

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

export async function runAutonomyTriggerScenario(
  loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new InMemoryLoopStore()
  const journal = new LoopJournal('loop-at', store)
  const queue = new GoalQueue()

  const trigger: LearningTrigger = {
    kind: 'LearningTrigger', schemaVersion: '1.0',
    triggerId: 'trigger-at-1', detectedAt: new Date().toISOString(),
    triggerKind: 'DEPRECATION_SIGNAL',
    evidence: { metric: 'deprecated', observedValue: 1, confidence: 1, confidenceMethod: 'DIRECT_OBSERVATION', sampleSize: 1 },
    suggestedCommand: 'rhk fetch weather', corpusWindowStart: '', corpusWindowEnd: '', recordCount: 1,
  }

  // ObservationEngine that emits our trigger exactly once
  let emitted = false
  const triggerObsEngine: ObservationEnginePort = {
    observe: async () => {
      if (!emitted) { emitted = true; return { triggers: [trigger] } }
      return { triggers: [] }
    },
  }

  const translator = new StaticIntentTranslator([
    { input: 'fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
    { input: 'rhk fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
  ])
  const translation = await translator.translate({ input: 'fetch weather' })
  const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')

  const executor = new ExecutionEngine(nullResolver, new SequentialExecutionScheduler(), new NullExecutionStore())
  const memStore = new LocalMemoryStore()
  const recorder = new EpisodicRecorder(memStore)

  const router = new TriggerRouter()
  const triggerPlannerPolicy = { ...DEFAULT_AUTONOMY_POLICY, requireApprovalFor: [] as const }

  const engine = new LoopEngine(
    triggerObsEngine,
    new ObservationPlanner([new SystemStrategy()]),
    router,
    new ApprovalManager(),
    { plan: () => planner.plan(translation.intent, translation, [], loaded.fixture.graphRevision, 0) },
    { execute: (plan) => executor.execute(plan) },
    { record: (r) => recorder.record(r) },
    queue,
    journal,
    triggerPlannerPolicy,
  )

  engine.start()
  await engine.tick()
  engine.stop()

  const report = engine['_report']()
  const episodes = memStore.artifacts.filter(a => a.artifactKind === 'EPISODE')

  return {
    triggerRouted: report.goalsCreated >= 1,
    goalsCompleted: report.goalsCompleted,
    episodeRecorded: episodes.length > 0,
  }
}
