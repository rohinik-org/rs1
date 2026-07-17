import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'
import { EpisodicRecorder } from '@rohinik-org/memory'

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

// ponytail: in-memory store local to this scenario; MemoryStore not exported from @rohinik-org/memory as null variant
class LocalMemoryStore {
  readonly artifacts: import('@rohinik-org/compiler').MemoryArtifact[] = []
  async saveArtifact(a: import('@rohinik-org/compiler').MemoryArtifact) { this.artifacts.push(a) }
  async findRelevant() { return [] }
  async getAll() { return this.artifacts }
  async removeById() { return false }
}

export async function runMemoryScenario(
  loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const translator = new StaticIntentTranslator([
    { input: 'fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
  ])
  const translation = await translator.translate({ input: 'fetch weather' })
  const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
  const plan = planner.plan(translation.intent, translation, [], loaded.fixture.graphRevision, 0)

  const store = new NullExecutionStore()
  const engine = new ExecutionEngine(nullResolver, new SequentialExecutionScheduler(), store)
  const handle = await engine.execute(plan)
  const result = await handle.wait()

  const memStore = new LocalMemoryStore()
  const recorder = new EpisodicRecorder(memStore)
  await recorder.record(result)

  const episodes = memStore.artifacts.filter(a => a.artifactKind === 'EPISODE')
  return { episodeRecorded: episodes.length > 0 }
}
