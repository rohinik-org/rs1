import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'

export async function runPlanningScenario(
  loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const translator = new StaticIntentTranslator([
    { input: 'fetch weather', concepts: ['weather', 'fetch'], preferredSkills: ['weather.fetch'] },
  ])
  const result = await translator.translate({ input: 'fetch weather' })
  const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
  const plan = planner.plan(result.intent, result, [], loaded.fixture.graphRevision, 0)
  return {
    planProduced: plan.kind === 'WorkflowPlan',
    stepsCount: plan.steps.length,
    planStatus: plan.status,
  }
}
