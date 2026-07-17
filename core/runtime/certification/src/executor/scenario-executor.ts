import type { CertificationScenario } from '@rohinik-org/compiler'

export type ScenarioRunner = (scenario: CertificationScenario) => Promise<Record<string, unknown>>

export interface ExecutionOutput {
  readonly actualResult: Record<string, unknown>
  readonly timingMs: number
  readonly memMb: number
}

export class ScenarioExecutor {
  async execute(scenario: CertificationScenario, runner: ScenarioRunner): Promise<ExecutionOutput> {
    const start = Date.now()
    let actualResult: Record<string, unknown> = {}

    try {
      actualResult = await runner(scenario)
    } catch (err) {
      actualResult = { _error: String(err), _threw: true }
    }

    const timingMs = Date.now() - start
    const memMb = Math.round(process.memoryUsage().heapUsed / 1_048_576 * 100) / 100

    return { actualResult, timingMs, memMb }
  }
}
