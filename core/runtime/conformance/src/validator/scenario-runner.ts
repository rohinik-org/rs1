import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'

export type ScenarioRunner = (
  loaded: LoadedFixture,
  expectation: ScenarioExpectation,
) => Promise<Record<string, unknown>>
