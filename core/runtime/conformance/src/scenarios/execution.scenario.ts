import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: `[null output of ${skillId}]`, providerUsed: 'null', latencyMs: 0 }),
  }),
}

export async function runExecutionScenario(
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

  return {
    executionOutcome: result.termination.reason,
    providerCalls: result.stepRecords.length,
  }
}
