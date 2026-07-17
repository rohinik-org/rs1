import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { FallbackEngine, NullProvider } from '@rohinik-org/orchestrator'
import type { Provider } from '@rohinik-org/orchestrator'

class FailingProvider implements Provider {
  readonly providerId = 'failing'
  readonly available = false
  async invoke(): Promise<never> { throw new Error('provider unavailable') }
}

export async function runOrchestrationFallbackScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const engine = new FallbackEngine()
  const primary = new FailingProvider()
  const fallback = new NullProvider()

  const result = await engine.invoke([primary, fallback], { skillId: 'weather.fetch', input: 'London' })

  return {
    fallbackUsed: result.usedProviderId === 'null',
    fallbackHistory: result.fallbackHistory,
    resultProduced: result.result.output !== null,
  }
}
