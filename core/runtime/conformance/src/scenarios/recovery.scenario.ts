import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

export async function runRecoveryScenario(
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

  // First execution — checkpoint saved per step
  const handle = await engine.execute(plan)
  const firstResult = await handle.wait()

  const checkpoint = await store.loadCheckpoint(firstResult.executionId)
  if (!checkpoint) {
    // ponytail: no steps = no checkpoint; resume not applicable for empty plans
    return { resumeAttempted: false, reason: 'no checkpoint (empty plan)' }
  }

  // Resume from checkpoint
  const resumeHandle = await engine.resume(checkpoint)
  const resumeResult = await resumeHandle.wait()

  return {
    resumeAttempted: true,
    firstCompleted: firstResult.termination.reason === 'SUCCESS',
    resumeCompleted: resumeResult.termination.reason === 'SUCCESS',
  }
}
